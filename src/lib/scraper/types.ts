import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

// ── Confidence Scoring ──────────────────────────────────────────────

export type Confidence = "observed" | "inferred" | "assumed" | "stale" | "unknown";

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  observed: 4,
  inferred: 3,
  assumed: 2,
  stale: 1,
  unknown: 0,
};

/**
 * Score confidence based on match specificity and context quality.
 *
 * - `patternType` of "exact" with a clear billing context → observed
 * - `patternType` of "exact" without billing context → inferred
 * - Fuzzy/approximate matches → assumed
 * - Everything else → unknown
 */
export function scoreConfidence(
  matches: number,
  context: string,
  patternType: "exact" | "fuzzy" | "relative" | "vague",
): Confidence {
  if (matches === 0) return "unknown";
  if (patternType === "vague") return "unknown";
  if (patternType === "relative") return "inferred";

  // Check context for billing signals
  const billingSignals = /\b(per\s*month|monthly|\/mo|per\s*year|annually|\/yr|per\s*seat|per\s*user)\b/i;
  const hasBillingContext = billingSignals.test(context);

  if (patternType === "exact" && hasBillingContext) return "observed";
  if (patternType === "exact") return "inferred";
  return "assumed";
}

// ── Pipeline Types ─────────────────────────────────────────────────

export interface FetchResult {
  url: string;
  httpStatus: number;
  contentType: string;
  rawBody: string;
  contentHash: string;
  fetchMethod: "static" | "playwright";
  fetchDurationMs: number;
  extractedText?: string;
  error?: string;
}

export interface ExtractedPrice {
  rawText: string;
  amount: number;
  currency: string;
  billingInterval: "monthly" | "annual" | "one-time" | null;
  confidence: Confidence;
  contextSnippet: string;
}

export interface ExtractedLimit {
  rawText: string;
  limitType:
    | "hard_numeric"
    | "relative"
    | "credits"
    | "time_windowed"
    | "model_specific"
    | "rate_limit"
    | "vague";
  limitValue: number | null;
  limitUnit: string | null;
  resetWindow: string | null;
  confidence: Confidence;
  needsNormalization: boolean;
  contextSnippet: string;
}

export interface ExtractionResult {
  sourcePageId: number;
  prices: ExtractedPrice[];
  limits: ExtractedLimit[];
  modelMentions: string[];
  creditMentions: string[];
  assumptions: string[];
}

export interface PipelineOptions {
  provider?: string;
  dryRun?: boolean;
  force?: boolean;
}

export type DB = BetterSQLite3Database<any>;
