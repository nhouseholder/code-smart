import type { Confidence } from "@/lib/scraper/types";

// ── Config Types ───────────────────────────────────────────────────────

export interface AssumptionRange {
  low: number;
  base: number;
  high: number;
}

export interface UsdCreditRateMapping {
  outputRatePerMtokConservative: number;
  outputRatePerMtokBase: number;
  outputRatePerMtokOptimistic: number;
  source: string;
}

export interface NormalizationConfig {
  tokensPerCodingMessage: AssumptionRange;
  tokensPerAgenticRequest: AssumptionRange;
  tokensPerAutocomplete: AssumptionRange;
  tokensPerCredit: { base: number };
  tokensPerComputeUnit: { base: number };
  sessionsPerMonth: number;
  workingDaysPerMonth: number;
  weeksPerMonth: number;
  hoursPerSession: number;
  modelMultipliers: Record<string, AssumptionRange>;
  creditMappings: Record<string, { tokensPerCredit: number; source: string }>;
  computeUnitMappings: Record<string, { tokensPerComputeUnit: number; source: string }>;
  defaultUsdCreditRate: UsdCreditRateMapping;
  usdCreditRates: Record<string, UsdCreditRateMapping>;
}

// ── Conversion Types ───────────────────────────────────────────────────

export type ConversionLayer =
  | "direct_tokens"
  | "time_window"
  | "messages"
  | "requests"
  | "credits"
  | "usd_credits"
  | "compute_units"
  | "unknown";

export interface ConversionStep {
  layer: ConversionLayer;
  description: string;
  inputValue: number | null;
  inputUnit: string | null;
  outputTokens: number | null;
  targetWindow: string;
}

// ── Window Types ───────────────────────────────────────────────────────

export type ResetWindow = "1h" | "3h" | "5h" | "1d" | "1w" | "1mo" | "1y";

export type TargetWindow = "5h" | "24h" | "1w" | "1mo";

export interface WindowConversionResult {
  value: number;
  confidence: Confidence;
  notes: string[];
}

// ── Engine Input / Output ──────────────────────────────────────────────

export interface UsageLimitRow {
  id: number;
  planId: string;
  modelId: string | null;
  observedAt: string;
  rawLimitText: string;
  limitType: string;
  limitValue: number | null;
  limitUnit: string | null;
  resetWindow: string | null;
  confidence: string;
  notes: string | null;
}

export interface NormalizedEstimate {
  methodologyVersion: string;
  sourceLimitId: number;
  planId: string;
  modelId: string | null;
  observedAt: string;
  limitType: string;
  originalRawText: string;
  conversionChain: ConversionStep[];
  estimatedTokens5h: number | null;
  estimatedTokens24h: number | null;
  estimatedTokens1w: number | null;
  estimatedTokens1mo: number | null;
  uncertaintyLow5h: number | null;
  uncertaintyHigh5h: number | null;
  uncertaintyLow24h: number | null;
  uncertaintyHigh24h: number | null;
  uncertaintyLow1w: number | null;
  uncertaintyHigh1w: number | null;
  uncertaintyLow1mo: number | null;
  uncertaintyHigh1mo: number | null;
  confidence: Confidence;
  assumptions: string[];
  notes: string;
}

export interface NormalizationSummary {
  limitsProcessed: number;
  estimatesWritten: number;
  skipped: number;
  unknown: number;
  errors: number;
}
