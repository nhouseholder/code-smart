import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, desc, and, gte, ne, sql } from "drizzle-orm";
import {
  sourceSnapshots,
  planSnapshots,
  artificialAnalysisModelScores,
  providers,
  plans,
  rankings,
  scrapeRuns,
  providerSourcePages,
  insertRankingSchema,
} from "./schema";

// ── Type helpers ───────────────────────────────────────────────────

type SourceSnapshot = typeof sourceSnapshots.$inferSelect;
type PlanSnapshot = typeof planSnapshots.$inferSelect;
type AAScore = typeof artificialAnalysisModelScores.$inferSelect;
type Ranking = typeof rankings.$inferSelect;
type Provider = typeof providers.$inferSelect;
type Plan = typeof plans.$inferSelect;

export interface ProviderWithPlans extends Provider {
  plans: Plan[];
}

// ── Source Snapshots ───────────────────────────────────────────────

/**
 * Get the most recent source snapshot for a provider.
 */
export function getLatestSourceSnapshot(
  db: BetterSQLite3Database<any>,
  providerId: string,
): SourceSnapshot | null {
  const result = db
    .select()
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.providerId, providerId))
    .orderBy(desc(sourceSnapshots.observedAt))
    .limit(1)
    .all();

  return result[0] ?? null;
}

/**
 * Get all source snapshots for a provider older than `since`, ordered newest-first.
 */
export function getSourceSnapshotsSince(
  db: BetterSQLite3Database<any>,
  providerId: string,
  since: string,
): SourceSnapshot[] {
  return db
    .select()
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.providerId, providerId),
        gte(sourceSnapshots.observedAt, since),
      ),
    )
    .orderBy(desc(sourceSnapshots.observedAt))
    .all();
}

// ── Plan Snapshots ─────────────────────────────────────────────────

/**
 * Get the most recent plan snapshot for a plan.
 */
export function getLatestPlanSnapshot(
  db: BetterSQLite3Database<any>,
  planId: string,
): PlanSnapshot | null {
  const result = db
    .select()
    .from(planSnapshots)
    .where(eq(planSnapshots.planId, planId))
    .orderBy(desc(planSnapshots.observedAt))
    .limit(1)
    .all();

  return result[0] ?? null;
}

/**
 * Get all plan snapshots for a plan within a date range (for sparklines).
 */
export function getPlanSnapshotHistory(
  db: BetterSQLite3Database<any>,
  planId: string,
  since: string,
): PlanSnapshot[] {
  return db
    .select()
    .from(planSnapshots)
    .where(
      and(
        eq(planSnapshots.planId, planId),
        gte(planSnapshots.observedAt, since),
      ),
    )
    .orderBy(desc(planSnapshots.observedAt))
    .all();
}

// ── AA Model Scores ────────────────────────────────────────────────

/**
 * Get the most recent AA scores for all models that have them.
 * Returns a Map keyed by modelId.
 *
 * Uses a single subquery join (ROW_NUMBER / MAX per model_id) — no N+1.
 */
export function getLatestAAScores(
  db: BetterSQLite3Database<any>,
): Map<string, AAScore> {
  // Single query: find latest observed_at per model_id via tuple comparison
  const results = db
    .select()
    .from(artificialAnalysisModelScores)
    .where(
      sql`(${artificialAnalysisModelScores.modelId}, ${artificialAnalysisModelScores.observedAt}) IN (
        SELECT model_id, MAX(observed_at)
        FROM artificial_analysis_model_scores
        GROUP BY model_id
      )`,
    )
    .all();

  const map = new Map<string, AAScore>();
  for (const row of results) {
    map.set(row.modelId, row);
  }
  return map;
}

// ── Providers & Plans ──────────────────────────────────────────────

/**
 * Get all active providers with their active plans.
 *
 * Uses a single LEFT JOIN query (no N+1), then groups in JS.
 * Callers should wrap in try/catch for safety.
 */
export function getActiveProvidersWithPlans(
  db: BetterSQLite3Database<any>,
): ProviderWithPlans[] {
  const rows = db
    .select()
    .from(providers)
    .leftJoin(plans, and(eq(providers.id, plans.providerId), eq(plans.status, "active")))
    .where(eq(providers.status, "active"))
    .all();

  const providerMap = new Map<string, ProviderWithPlans>();

  for (const row of rows) {
    const p = row.providers as Provider;
    if (!providerMap.has(p.id)) {
      providerMap.set(p.id, { ...p, plans: [] });
    }
    const plan = row.plans as Plan | null;
    if (plan) {
      providerMap.get(p.id)!.plans.push(plan);
    }
  }

  return Array.from(providerMap.values());
}

// ── Rankings ───────────────────────────────────────────────────────

/**
 * Get the latest ranking by type.
 */
export function getLatestRanking(
  db: BetterSQLite3Database<any>,
  rankingType: string,
): Ranking | null {
  const result = db
    .select()
    .from(rankings)
    .where(eq(rankings.rankingType, rankingType))
    .orderBy(desc(rankings.observedAt))
    .limit(1)
    .all();

  return result[0] ?? null;
}

/**
 * Get the latest ranking row for every ranking type.
 * Returns a Map keyed by rankingType.
 *
 * Single query via tuple comparison (latest observed_at per ranking_type) — no N+1.
 * Satisfies the "frontend APIs retrieve the latest rankings" acceptance at the DB layer.
 */
export function getAllLatestRankings(
  db: BetterSQLite3Database<any>,
): Map<string, Ranking> {
  const results = db
    .select()
    .from(rankings)
    .where(
      sql`(${rankings.rankingType}, ${rankings.observedAt}) IN (
        SELECT ranking_type, MAX(observed_at)
        FROM rankings
        GROUP BY ranking_type
      )`,
    )
    .all();

  const map = new Map<string, Ranking>();
  for (const row of results) {
    map.set(row.rankingType, row);
  }
  return map;
}

/**
 * Insert a ranking row and return its auto-increment ID.
 */
export function insertRanking(
  db: BetterSQLite3Database<any>,
  data: {
    rankingType: string;
    priceBand?: string | null;
    observedAt: string;
    payloadJson: string;
    methodologyVersion?: string | null;
  },
): number {
  // Runtime guard: reject malformed/typo'd keys and rankingType > 50 chars
  // (.strict() rejects unknown keys) before touching the DB.
  insertRankingSchema.parse(data);

  const result = db
    .insert(rankings)
    .values(data)
    .returning({ id: rankings.id })
    .get();

  return result!.id;
}

// ── Content Change Detection ───────────────────────────────────────

/**
 * Check if a content_hash has changed since the last scrape.
 * Returns true if the hash differs or no previous scrape exists.
 */
export function hasContentChanged(
  db: BetterSQLite3Database<any>,
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

  if (!lastSnapshot[0]) return true; // no previous snapshot → changed
  return lastSnapshot[0].contentHash !== newHash;
}

/**
 * Get the latest completed scrape run for a provider.
 */
export function getLatestScrapeRun(
  db: BetterSQLite3Database<any>,
  providerId: string,
) {
  const result = db
    .select()
    .from(scrapeRuns)
    .where(
      and(
        eq(scrapeRuns.providerId, providerId),
        ne(scrapeRuns.status, "running"),
      ),
    )
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1)
    .all();

  return result[0] ?? null;
}

// ── Scraper Pipeline ────────────────────────────────────────────────

interface SourcePageWithProvider {
  id: number;
  providerId: string;
  url: string;
  pageType: string;
  scrapeStrategy: string;
  enabled: boolean;
  providerName: string;
  websiteUrl: string;
}

/**
 * Get all enabled provider source pages with provider metadata.
 */
export function getEnabledSourcePages(
  db: BetterSQLite3Database<any>,
): SourcePageWithProvider[] {
  const rows = db
    .select({
      id: providerSourcePages.id,
      providerId: providerSourcePages.providerId,
      url: providerSourcePages.url,
      pageType: providerSourcePages.pageType,
      scrapeStrategy: providerSourcePages.scrapeStrategy,
      enabled: providerSourcePages.enabled,
      providerName: providers.name,
      websiteUrl: providers.websiteUrl,
    })
    .from(providerSourcePages)
    .innerJoin(providers, eq(providerSourcePages.providerId, providers.id))
    .where(eq(providerSourcePages.enabled, true))
    .all();

  return rows as SourcePageWithProvider[];
}

/**
 * Get the last completed (non-running) scrape run for a source page.
 */
export function getLastCompletedScrapeRun(
  db: BetterSQLite3Database<any>,
  sourcePageId: number,
) {
  const result = db
    .select()
    .from(scrapeRuns)
    .where(
      and(
        eq(scrapeRuns.sourcePageId, sourcePageId),
        ne(scrapeRuns.status, "running"),
      ),
    )
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(1)
    .all();

  return result[0] ?? null;
}

/**
 * Create a new scrape run and return its auto-increment ID.
 */
export function createScrapeRun(
  db: BetterSQLite3Database<any>,
  data: {
    providerId: string;
    sourcePageId?: number | null;
    startedAt: string;
    status: string;
  },
): number {
  const result = db
    .insert(scrapeRuns)
    .values(data)
    .returning({ id: scrapeRuns.id })
    .get();

  return result!.id;
}

/**
 * Update a scrape run with completion data.
 */
export function completeScrapeRun(
  db: BetterSQLite3Database<any>,
  id: number,
  data: {
    finishedAt: string;
    status: string;
    contentHash?: string | null;
    changeDetected?: boolean | null;
    errorMessage?: string | null;
  },
): void {
  db.update(scrapeRuns)
    .set(data)
    .where(eq(scrapeRuns.id, id))
    .run();
}

/**
 * Insert a source snapshot row and return its ID.
 */
export function insertSourceSnapshot(
  db: BetterSQLite3Database<any>,
  data: {
    providerId: string;
    sourceUrl: string;
    observedAt: string;
    rawHtmlOrTextReference?: string | null;
    contentHash?: string | null;
    extractedText?: string | null;
    parserVersion?: string | null;
    notes?: string | null;
  },
): number {
  const result = db
    .insert(sourceSnapshots)
    .values(data)
    .returning({ id: sourceSnapshots.id })
    .get();

  return result!.id;
}
