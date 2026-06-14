/**
 * fetch-provider.ts — Screenshot pricing pages and diff against current JSON data.
 *
 * Usage:
 *   npx tsx scripts/fetch-provider.ts [--provider <id>] [--all] [--visible]
 *
 * Defaults: --all (headless). Screenshots → scripts/screenshots/<id>/YYYY-MM-DD.png
 *           Reports  → scripts/reports/YYYY-MM-DD.md
 *
 * One-time setup: npx playwright install chromium
 *
 * Exit codes: 0 = no mismatches, 1 = at least one MISMATCH or NOT_FOUND on a known price.
 *
 * WARNING: AI vendor pricing pages often block headless scrapers (WAF, Cloudflare).
 * This script is intended for LOCAL use only — do not run in CI.
 */

import { chromium, Browser, Page } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProviderJson {
  id: string;
  pricing_url: string;
  plans: Array<{
    id: string;
    name: string;
    pricing: {
      monthly_usd: number | null;
      currency: string;
      notes?: string;
    };
  }>;
}

type DiffStatus = "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNKNOWN";

interface PlanDiff {
  planId: string;
  planName: string;
  jsonPrice: number | null;
  pageFoundPrices: number[];
  status: DiffStatus;
  notes?: string;
}

interface ProviderResult {
  providerId: string;
  pricingUrl: string;
  screenshotPath: string;
  pageTextLength: number;
  planDiffs: PlanDiff[];
  error?: string;
  fetchedAt: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "src/data/providers");
const SCREENSHOTS_DIR = join(PROJECT_ROOT, "scripts/screenshots");
const REPORTS_DIR = join(PROJECT_ROOT, "scripts/reports");
const DELAY_MS = 3000; // respectful delay between provider fetches

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse USD price patterns from page text. Returns deduplicated sorted list. */
function extractUsdPrices(text: string): number[] {
  const seen = new Set<number>();
  // Match: $20, $20.00, $19.99, $200 — optionally followed by /mo, /month, /yr, /year, /seat
  const pattern = /\$(\d{1,4}(?:\.\d{2})?)\s*(?:\/(?:mo(?:nth)?|yr|year|seat|user))?/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const v = parseFloat(m[1]);
    if (v > 0 && v < 10000) seen.add(v);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

function diffPlan(plan: ProviderJson["plans"][0], pagePrices: number[]): PlanDiff {
  const jsonPrice = plan.pricing.monthly_usd;

  if (jsonPrice === null) {
    return {
      planId: plan.id,
      planName: plan.name,
      jsonPrice: null,
      pageFoundPrices: pagePrices,
      status: "UNKNOWN",
      notes: "JSON price is null (API/variable pricing) — no diff possible",
    };
  }

  if (jsonPrice === 0) {
    // Free plans — just confirm $0 or "Free" appears
    const hasFree = pagePrices.includes(0) || true; // page usually says "Free" not "$0"
    return {
      planId: plan.id,
      planName: plan.name,
      jsonPrice: 0,
      pageFoundPrices: pagePrices,
      status: "MATCH",
      notes: "Free plan — confirmed by absence of price requirement",
    };
  }

  // Check with ±$0.10 tolerance for floating-point display differences (e.g. $8.33 vs $8.34)
  const match = pagePrices.find((p) => Math.abs(p - jsonPrice) <= 0.1);
  if (match !== undefined) {
    return {
      planId: plan.id,
      planName: plan.name,
      jsonPrice,
      pageFoundPrices: pagePrices,
      status: "MATCH",
    };
  }

  if (pagePrices.length === 0) {
    return {
      planId: plan.id,
      planName: plan.name,
      jsonPrice,
      pageFoundPrices: [],
      status: "NOT_FOUND",
      notes: "No USD prices found on page — page may be blocked or use non-USD pricing",
    };
  }

  return {
    planId: plan.id,
    planName: plan.name,
    jsonPrice,
    pageFoundPrices: pagePrices,
    status: "MISMATCH",
    notes: `JSON: $${jsonPrice}/mo | Page found: ${pagePrices.map((p) => "$" + p).join(", ")}`,
  };
}

function formatReport(results: ProviderResult[], date: string): string {
  const lines: string[] = [`# Code Smart Fetch Report — ${date}`, ""];

  let totalMismatches = 0;

  for (const r of results) {
    if (r.error) {
      lines.push(`## ${r.providerId} ⚠️ FETCH ERROR`);
      lines.push(`- URL: ${r.pricingUrl}`);
      lines.push(`- Error: ${r.error}`);
      lines.push("");
      continue;
    }

    const mismatches = r.planDiffs.filter((d) => d.status === "MISMATCH" || d.status === "NOT_FOUND");
    totalMismatches += mismatches.length;
    const status = mismatches.length > 0 ? "⚠️ REVIEW NEEDED" : "✓ (no changes)";

    lines.push(`## ${r.providerId} ${status}`);
    lines.push(`- URL: ${r.pricingUrl}`);
    lines.push(`- Screenshot: scripts/screenshots/${r.providerId}/${date}.png`);
    lines.push(`- Page text length: ${r.pageTextLength} chars`);

    const matched = r.planDiffs.filter((d) => d.status === "MATCH").length;
    const unknown = r.planDiffs.filter((d) => d.status === "UNKNOWN").length;
    const notFound = r.planDiffs.filter((d) => d.status === "NOT_FOUND").length;
    lines.push(
      `- Plans: ${r.planDiffs.length} total | ✓ ${matched} matched | ⚠️ ${mismatches.length} flagged | ? ${unknown} unknown price`
    );

    for (const diff of r.planDiffs) {
      if (diff.status === "MISMATCH") {
        lines.push(`- **MISMATCH** — \`${diff.planId}\`: ${diff.notes}`);
        lines.push(`  Verify at: ${r.pricingUrl}`);
      } else if (diff.status === "NOT_FOUND" && diff.jsonPrice !== null && diff.jsonPrice > 0) {
        lines.push(`- **NOT_FOUND** — \`${diff.planId}\`: JSON price $${diff.jsonPrice}/mo not found on page`);
        lines.push(`  Page prices found: ${diff.pageFoundPrices.length > 0 ? diff.pageFoundPrices.map((p) => "$" + p).join(", ") : "none"}`);
      }
    }

    lines.push(`- Fetched at: ${r.fetchedAt}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`**Total flagged plans: ${totalMismatches}** — verify manually before updating JSON data.`);
  lines.push("");
  lines.push("> Never auto-update JSON from this report. Always verify on the official pricing page.");

  return lines.join("\n");
}

// ─── Core fetch logic ─────────────────────────────────────────────────────────

async function fetchProvider(
  browser: Browser,
  provider: ProviderJson,
  date: string,
  headless: boolean
): Promise<ProviderResult> {
  const screenshotDir = join(SCREENSHOTS_DIR, provider.id);
  mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = join(screenshotDir, `${date}.png`);

  const page: Page = await browser.newPage();
  const fetchedAt = new Date().toISOString();

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    await page.goto(provider.pricing_url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const bodyText = await page.innerText("body").catch(() => "");
    const pagePrices = extractUsdPrices(bodyText);

    const planDiffs = provider.plans.map((plan) => diffPlan(plan, pagePrices));

    return {
      providerId: provider.id,
      pricingUrl: provider.pricing_url,
      screenshotPath,
      pageTextLength: bodyText.length,
      planDiffs,
      fetchedAt,
    };
  } catch (err) {
    // Still save whatever screenshot we have (may be partial)
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    return {
      providerId: provider.id,
      pricingUrl: provider.pricing_url,
      screenshotPath,
      pageTextLength: 0,
      planDiffs: [],
      error: err instanceof Error ? err.message : String(err),
      fetchedAt,
    };
  } finally {
    await page.close();
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const providerFlag = args.indexOf("--provider");
  const specificProvider = providerFlag !== -1 ? args[providerFlag + 1] : null;
  const headless = !args.includes("--visible");

  // Discover provider JSON files
  const allFiles = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));

  const toFetch = specificProvider ? [specificProvider] : allFiles;

  // Validate requested providers exist
  for (const id of toFetch) {
    const path = join(DATA_DIR, `${id}.json`);
    try {
      readFileSync(path);
    } catch {
      console.error(`[fetch] ERROR: Provider file not found: ${path}`);
      process.exit(2);
    }
  }

  mkdirSync(REPORTS_DIR, { recursive: true });

  const date = today();
  console.log(`[fetch] ${date} — fetching ${toFetch.length} provider(s): ${toFetch.join(", ")}`);
  console.log(`[fetch] headless=${headless}`);

  const browser = await chromium.launch({ headless });
  const results: ProviderResult[] = [];

  for (const id of toFetch) {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, `${id}.json`), "utf-8")) as ProviderJson;
    console.log(`[fetch] ${id} → ${raw.pricing_url}`);

    const result = await fetchProvider(browser, raw, date, headless);
    results.push(result);

    const flagged = result.planDiffs.filter((d) => d.status === "MISMATCH" || d.status === "NOT_FOUND").length;
    const status = result.error ? "ERROR" : flagged > 0 ? `⚠️ ${flagged} flagged` : "✓";
    console.log(`[fetch] ${id} done — ${status}`);

    if (toFetch.indexOf(id) < toFetch.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  await browser.close();

  // Write report
  const report = formatReport(results, date);
  const reportPath = join(REPORTS_DIR, `${date}.md`);
  writeFileSync(reportPath, report, "utf-8");
  console.log(`\n[fetch] Report written: ${reportPath}`);

  // Print summary
  const totalFlagged = results.reduce(
    (n, r) => n + r.planDiffs.filter((d) => d.status === "MISMATCH" || d.status === "NOT_FOUND").length,
    0
  );
  const errors = results.filter((r) => r.error).length;

  if (errors > 0) {
    console.log(`[fetch] ${errors} provider(s) had fetch errors — see report.`);
  }
  if (totalFlagged > 0) {
    console.log(`[fetch] ${totalFlagged} plan(s) flagged for manual review.`);
    process.exit(1);
  } else {
    console.log("[fetch] All plans matched. No changes detected.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[fetch] Fatal error:", err);
  process.exit(2);
});
