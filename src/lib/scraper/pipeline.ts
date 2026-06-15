import { chromium, Browser } from "playwright";
import { eq, and, desc } from "drizzle-orm";

import type { DB, PipelineOptions, ExtractedPrice } from "./types";
import { fetchStatic, fetchWithPlaywright, fetchWithRetry } from "./fetcher";
import { extractReadableText, computeContentHash } from "./text-extractor";
import { extractPrices } from "./price-extractor";
import { extractUsageLimits } from "./limit-extractor";
import { extractModelMentions } from "./model-extractor";
import type { ExtractedModelMention } from "./model-extractor";
import { scanFootnotes, recordAssumptions } from "./annotation-scanner";

import {
  scrapeRuns,
  sourceSnapshots,
  planSnapshots,
  usageLimits,
  planModelAccess,
  providerSourcePages,
  models,
} from "../../db/schema";

const RATE_LIMIT_MS = 3000;
const PARSER_VERSION = "1.0.0";

interface SourcePageRow {
  id: number;
  providerId: string;
  url: string;
  pageType: string;
  scrapeStrategy: string;
  enabled: boolean;
}

/**
 * Get all enabled source pages with their provider info.
 */
function getEnabledSourcePages(db: DB): SourcePageRow[] {
  return db
    .select()
    .from(providerSourcePages)
    .where(eq(providerSourcePages.enabled, true))
    .all() as SourcePageRow[];
}

/**
 * Check if content has changed since the last snapshot.
 */
function hasContentChanged(
  db: DB,
  providerId: string,
  sourceUrl: string,
  newHash: string,
): boolean {
  const lastSnapshot = db
    .select()
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.providerId, providerId),
        eq(sourceSnapshots.sourceUrl, sourceUrl),
      ),
    )
    .orderBy(desc(sourceSnapshots.observedAt))
    .limit(1)
    .all();

  if (!lastSnapshot[0]) return true;
  return lastSnapshot[0].contentHash !== newHash;
}

/**
 * Compute the effective monthly price from an extracted price.
 * - Annual prices → divide by 12
 * - Monthly/one-time/null → pass through
 */
function computeEffectiveMonthly(price: ExtractedPrice): number | null {
  if (price.amount === 0) return 0;
  if (price.billingInterval === "annual") {
    return Math.round((price.amount / 12) * 100) / 100;
  }
  return price.amount;
}

/**
 * Run the full scrape pipeline.
 *
 * 1. Launches a shared Playwright `Browser` once
 * 2. Iterates enabled source pages
 * 3. Per-page: fetch → hash → change detect → extract → store
 * 4. Closes browser in top-level `finally`
 */
export async function runScrapePipeline(
  db: DB,
  options: PipelineOptions = {},
): Promise<{
  processed: number;
  changed: number;
  errors: number;
  prices: number;
  limits: number;
  modelMentions: number;
}> {
  const pages = getEnabledSourcePages(db);

  // Filter by provider if specified
  const filtered = options.provider
    ? pages.filter((p) => p.providerId === options.provider)
    : pages;

  if (filtered.length === 0) {
    console.log("No enabled source pages to scrape.");
    return { processed: 0, changed: 0, errors: 0, prices: 0, limits: 0, modelMentions: 0 };
  }

  let browser: Browser | null = null;
  let processed = 0;
  let changed = 0;
  let errors = 0;
  let totalPrices = 0;
  let totalLimits = 0;
  let totalModelMentions = 0;

  // Load known models for model mention extraction
  const knownModels = new Map<string, string>();
  const modelRows = db.select().from(models).all() as Array<{ id: string; displayName: string }>;
  for (const m of modelRows) {
    knownModels.set(m.id, m.displayName);
  }

  try {
    // Launch shared browser once for all Playwright pages
    const needsPlaywright = filtered.some((p) => p.scrapeStrategy === "playwright");
    if (needsPlaywright) {
      console.log("Launching Playwright browser...");
      browser = await chromium.launch({ headless: true });
    }

    for (const page of filtered) {
      // Rate limit: sleep between pages (before the fetch, skip on first)
      if (processed > 0 && filtered.length > 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }

      console.log(
        `\n[${processed + 1}/${filtered.length}] ${page.providerId} — ${page.pageType} (${page.url})`,
      );

      try {
        // 1. Create scrape run
        const scrapeRunRow = db
          .insert(scrapeRuns)
          .values({
            providerId: page.providerId,
            sourcePageId: page.id,
            startedAt: new Date().toISOString(),
            status: "running",
          })
          .returning({ id: scrapeRuns.id })
          .get();
        const scrapeRunId = scrapeRunRow!.id;

        // 2. Fetch the page (async — outside any transaction)
        const fetcherFn = page.scrapeStrategy === "playwright" && browser
          ? (url: string) => fetchWithPlaywright(browser!, url)
          : fetchStatic;

        const fetchResult = await fetchWithRetry(fetcherFn, page.url);

        if (fetchResult.error && fetchResult.httpStatus === 0) {
          // Network error → mark as error, continue
          db.update(scrapeRuns)
            .set({
              finishedAt: new Date().toISOString(),
              status: "error",
              errorMessage: fetchResult.error,
            })
            .where(eq(scrapeRuns.id, scrapeRunId))
            .run();
          console.log(`  ⚠ Network error: ${fetchResult.error}`);
          processed++;
          continue;
        }

        const rawBody = fetchResult.rawBody || "";
        const hash = fetchResult.contentHash || computeContentHash(rawBody);

        // 3. Change detection
        const changed_ = options.force
          ? true
          : hasContentChanged(db, page.providerId, page.url, hash);

        if (!changed_) {
          // Store snapshot even if unchanged (for audit trail)
          db.insert(sourceSnapshots)
            .values({
              providerId: page.providerId,
              sourceUrl: page.url,
              observedAt: new Date().toISOString(),
              rawHtmlOrTextReference: null,
              contentHash: hash,
              extractedText: null,
              parserVersion: PARSER_VERSION,
            })
            .run();

          db.update(scrapeRuns)
            .set({
              finishedAt: new Date().toISOString(),
              status: "success",
              contentHash: hash,
              changeDetected: false,
            })
            .where(eq(scrapeRuns.id, scrapeRunId))
            .run();

          console.log(`  🔄 No change (hash: ${hash.slice(0, 12)}...)`);
          processed++;
          continue;
        }

        // 4. Extract readable text
        const extractedText =
          fetchResult.extractedText ??
          extractReadableText(rawBody);

        // 5. Run price extraction
        const prices =
          page.pageType === "pricing"
            ? extractPrices(extractedText, page.url)
            : [];

        // 6. Run limit extraction (pricing + docs pages)
        const limits =
          page.pageType === "pricing" || page.pageType === "docs"
            ? extractUsageLimits(extractedText, page.url)
            : [];

        // 6a. Model mention extraction (pricing + docs pages)
        const modelMentions: ExtractedModelMention[] =
          page.pageType === "pricing" || page.pageType === "docs"
            ? extractModelMentions(extractedText, knownModels, page.url)
            : [];

        // 6b. Footnote scanning
        const footnotes = scanFootnotes(extractedText);

        // 6c. Assumption recording
        const assumptions = recordAssumptions(extractedText, prices, limits, modelMentions);

        const notes = JSON.stringify({ footnotes, assumptions });

        // 7. Store snapshot
        const snapshotRow = db
          .insert(sourceSnapshots)
          .values({
            providerId: page.providerId,
            sourceUrl: page.url,
            observedAt: new Date().toISOString(),
            rawHtmlOrTextReference: null,
            contentHash: hash,
            extractedText: extractedText.slice(0, 500_000),
            parserVersion: PARSER_VERSION,
            notes,
          })
          .returning({ id: sourceSnapshots.id })
          .get();
        const snapshotId = snapshotRow!.id;

        // 8. Store extracted candidates
        for (const price of prices) {
          db.insert(planSnapshots)
            .values({
              planId: "", // candidate — no matching plan yet
              observedAt: new Date().toISOString(),
              price: price.amount,
              effectiveMonthlyPrice: computeEffectiveMonthly(price),
              sourceSnapshotId: snapshotId,
              confidence: price.confidence,
              extractionMethod: "scraper",
              notes: JSON.stringify({
                contextSnippet: price.contextSnippet,
                rawText: price.rawText,
                billingInterval: price.billingInterval,
              }),
            })
            .run();
        }

        for (const limit of limits) {
          db.insert(usageLimits)
            .values({
              planId: "", // candidate — no matching plan yet
              modelId: null,
              observedAt: new Date().toISOString(),
              rawLimitText: limit.rawText,
              limitType: limit.limitType,
              limitValue: limit.limitValue,
              limitUnit: limit.limitUnit,
              resetWindow: limit.resetWindow,
              sourceSnapshotId: snapshotId,
              confidence: limit.confidence,
              notes: JSON.stringify({
                needsNormalization: limit.needsNormalization,
                contextSnippet: limit.contextSnippet,
              }),
            })
            .run();
        }

        // 8c. Write plan_model_access records for model mentions
        for (const mention of modelMentions) {
          db.insert(planModelAccess)
            .values({
              planId: "", // candidate — no matching plan yet
              modelId: mention.modelId ?? "unknown",
              observedAt: new Date().toISOString(),
              accessLevel: "unknown",
              notes: JSON.stringify({
                rawText: mention.rawText,
                contextSnippet: mention.contextSnippet,
              }),
              sourceSnapshotId: snapshotId,
              confidence: mention.confidence,
            })
            .run();
        }

        // 9. Mark scrape run as complete
        db.update(scrapeRuns)
          .set({
            finishedAt: new Date().toISOString(),
            status: "success",
            contentHash: hash,
            changeDetected: true,
          })
          .where(eq(scrapeRuns.id, scrapeRunId))
          .run();

        totalPrices += prices.length;
        totalLimits += limits.length;
        totalModelMentions += modelMentions.length;
        processed++;
        changed++;
        console.log(
          `  ✅ ${prices.length} prices, ${limits.length} limits, ${modelMentions.length} model mentions extracted`,
        );
      } catch (err) {
        console.error(
          `  ❌ Failed: ${err instanceof Error ? err.message : String(err)}`,
        );

        errors++;
      }
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      console.log("Playwright browser closed.");
    }
  }

  console.log(
    `\nDone. ${processed} pages, ${changed} changed, ${errors} errors. ${totalPrices} prices, ${totalLimits} limits, ${totalModelMentions} model mentions.`,
  );

  return { processed, changed, errors, prices: totalPrices, limits: totalLimits, modelMentions: totalModelMentions };
}
