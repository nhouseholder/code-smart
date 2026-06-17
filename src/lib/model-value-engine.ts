import type { Plan, Provider, Confidence, AAModelScore, ModelValueEstimate } from "@/types";
import { effectiveMonthlyPrice } from "./data-loader";
import { normalizeLimit } from "./normalization/engine";
import { DEFAULT_CONFIG } from "./normalization/config";
import type { NormalizationConfig, UsageLimitRow, NormalizedEstimate } from "./normalization/types";
import { TARGET_HOURS } from "./normalization/windows";
import { usageLimitToRow } from "./value-scorer";

// ─── Version ──────────────────────────────────────────────────────────────────

export const ENGINE_VERSION = "1.1.0";

// ─── Constants ────────────────────────────────────────────────────────────────

const WMQ_WEIGHTS = { agentic: 0.50, coding: 0.40, speed: 0.10 } as const;

// Speed score fallback when null: neutral midpoint (documented in calculation-methodology.md §4)
const SPEED_FALLBACK = 50;

// Coding tasks: output-heavy blend (30% input / 70% output)
const COST_INPUT_RATIO  = 0.30;
const COST_OUTPUT_RATIO = 0.70;

// Reference: 1M tokens/mo at 80% WMQ quality for $20 = perfect score
const COST_REFERENCE_USD = 20;
const QAMU_REFERENCE = (1_000_000 * 0.8) / COST_REFERENCE_USD; // 40_000

const CONFIDENCE_ORDER: Confidence[] = ["observed", "inferred", "assumed", "stale", "unknown"];

// Bounded efficiency multiplier from AA cost-per-task. Self-calibrating: the median
// cost-per-task across models with data is the reference (par = 1.0). Cheaper → up to
// EFF_MULT_MAX, pricier → down to EFF_MULT_MIN. Bounded so efficiency never dominates
// quality/price. No data → 1.0 (exact no-op).
const EFF_MULT_MIN = 0.85;
const EFF_MULT_MAX = 1.15;
const EFF_MEDIAN_POINTS = 50; // median model maps to eff=50 → mult=1.0

// ─── Internal helpers ─────────────────────────────────────────────────────────

function weakerOf(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b;
}

function getBestNormalizedEstimate(
  plan: Plan,
  config: NormalizationConfig,
): { estimate: NormalizedEstimate | null; limitRow: UsageLimitRow | null } {
  let bestEstimate: NormalizedEstimate | null = null;
  let bestRow: UsageLimitRow | null = null;

  plan.usage_limits.forEach((limit, idx) => {
    if (limit.type === "unknown" && limit.value === null) return;

    const row = usageLimitToRow(limit, plan.id, idx);
    const estimate = normalizeLimit(row, config);

    if (
      estimate.estimatedTokens1mo !== null &&
      (bestEstimate === null || estimate.estimatedTokens1mo > (bestEstimate.estimatedTokens1mo ?? 0))
    ) {
      bestEstimate = estimate;
      bestRow = row;
    }
  });

  return { estimate: bestEstimate, limitRow: bestRow };
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Compute Weighted Model Quality from Artificial Analysis benchmark data.
 * WMQ = 50% agentic + 40% coding + 10% speed (weights redistributed when indices are null).
 * Returns null when neither agentic nor coding index is available.
 */
export function computeWMQ(
  aa: AAModelScore | null,
): { wmq: number | null; confidence: Confidence; notes: string[] } {
  if (aa === null) return { wmq: null, confidence: "unknown", notes: ["No AA data available"] };

  const notes: string[] = [];
  const effectiveSpeed = aa.speedScore ?? SPEED_FALLBACK;
  if (aa.speedScore === null) notes.push("Speed score missing — using 50/100 fallback");

  // 0 is a valid score (model scored 0 on this index); only null means "data absent"
  const components: Array<{ value: number; weight: number }> = [
    ...(aa.agenticIndex !== null ? [{ value: aa.agenticIndex, weight: WMQ_WEIGHTS.agentic }] : []),
    ...(aa.codingIndex  !== null ? [{ value: aa.codingIndex,  weight: WMQ_WEIGHTS.coding  }] : []),
    { value: effectiveSpeed, weight: WMQ_WEIGHTS.speed },
  ];

  const hasSubstantiveIndex = components.some(c => c.weight > WMQ_WEIGHTS.speed);
  if (!hasSubstantiveIndex) {
    return {
      wmq: null,
      confidence: aa.confidence,
      notes: [...notes, "No agentic or coding index — WMQ cannot be computed"],
    };
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const wmq = Math.round(
    (components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight) * 10,
  ) / 10;

  const redistributed = totalWeight < 1.0;
  if (redistributed) {
    const missing = [
      aa.agenticIndex === null ? "agentic" : null,
      aa.codingIndex  === null ? "coding"  : null,
    ].filter(Boolean);
    notes.push(`${missing.join(", ")} index missing — weights redistributed to available indices`);
  }

  const confidence: Confidence = redistributed ? weakerOf(aa.confidence, "inferred") : aa.confidence;
  return { wmq, confidence, notes };
}

/**
 * Apply quality multiplier: quality_adjusted_tokens = tokens × (wmq / 100).
 * Returns null when either input is null.
 */
export function computeQualityAdjusted(tokens: number | null, wmq: number | null): number | null {
  if (tokens === null || wmq === null) return null;
  return Math.round(tokens * (wmq / 100));
}

/**
 * Compute model-cost-adjusted token estimates for credit-based plans.
 * Returns all nulls for token-denominated, message-based, or fair-use limits.
 * Assumption: 1 credit = $0.01 (documented in notes when applied).
 */
export function computeModelCostAdjusted(
  _estimate: NormalizedEstimate | null,
  limitRow: UsageLimitRow | null,
  aa: AAModelScore | null,
): {
  tokens_5h: number | null;
  tokens_24h: number | null;
  tokens_1w: number | null;
  tokens_1mo: number | null;
  notes: string[];
} {
  const NULL_RESULT = {
    tokens_5h: null, tokens_24h: null, tokens_1w: null, tokens_1mo: null, notes: [] as string[],
  };

  if (limitRow?.limitType !== "credits") return NULL_RESULT;
  if (aa === null) return NULL_RESULT;
  if (aa.inputPrice === null || aa.outputPrice === null) return NULL_RESULT;

  const blendedCostPer1M = aa.inputPrice * COST_INPUT_RATIO + aa.outputPrice * COST_OUTPUT_RATIO;
  if (blendedCostPer1M <= 0) {
    return { ...NULL_RESULT, notes: ["Model cost is zero — cannot compute cost-adjusted estimate"] };
  }

  const tokensPerDollar = 1_000_000 / blendedCostPer1M;
  const monthlyCreditsDollars = (limitRow.limitValue ?? 0) * 0.01;
  const tokens_1mo = Math.round(monthlyCreditsDollars * tokensPerDollar);
  const mo = TARGET_HOURS["1mo"];

  return {
    tokens_1mo,
    tokens_1w:  Math.round(tokens_1mo * TARGET_HOURS["1w"]  / mo),
    tokens_24h: Math.round(tokens_1mo * TARGET_HOURS["24h"] / mo),
    tokens_5h:  Math.round(tokens_1mo * TARGET_HOURS["5h"]  / mo),
    notes: [
      `Model cost adjustment: blended $${blendedCostPer1M.toFixed(2)}/1M tokens (30% input, 70% output). 1 credit = $0.01 assumed.`,
    ],
  };
}

/**
 * Median cost-per-task across all models that have a non-null value.
 * This is the self-calibrating reference for the efficiency multiplier.
 * Returns null when no model has data (→ efficiency neutral everywhere).
 */
export function medianCostPerTask(aaScores: Map<string, AAModelScore>): number | null {
  const values = [...aaScores.values()]
    .map(s => s.costPerTask)
    .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

/**
 * Bounded efficiency multiplier from AA cost-per-task.
 *   eff  = clamp(0, 100, (median / costPerTask) × EFF_MEDIAN_POINTS)   // median → 50
 *   mult = EFF_MULT_MIN + (eff / 100) × (EFF_MULT_MAX − EFF_MULT_MIN)  // → [0.85, 1.15], par 1.0 at median
 * Returns mult 1.0 (neutral) when this model's cost-per-task OR the reference median is null.
 */
export function computeEfficiencyMultiplier(
  costPerTask: number | null,
  referenceMedian: number | null,
): { mult: number; note: string | null } {
  if (costPerTask === null || referenceMedian === null || costPerTask <= 0) {
    return { mult: 1.0, note: "No cost-per-task data — efficiency neutral" };
  }
  const eff = Math.min(100, Math.max(0, (referenceMedian / costPerTask) * EFF_MEDIAN_POINTS));
  const mult = EFF_MULT_MIN + (eff / 100) * (EFF_MULT_MAX - EFF_MULT_MIN);
  return {
    mult,
    note: `Efficiency multiplier ${mult.toFixed(3)}× (cost-per-task $${costPerTask} vs median $${referenceMedian})`,
  };
}

/**
 * Compute value score: quality_adjusted_monthly × effMult / price, normalized 0–100.
 * Returns null for free plans (price = 0) or missing inputs.
 * effMult defaults to 1.0 (neutral) — back-compatible with all existing callers/tests.
 */
export function computeValueScore(
  qualityAdjustedMonthly: number | null,
  price: number | null,
  effMult: number = 1.0,
): number | null {
  if (qualityAdjustedMonthly === null || price === null) return null;
  if (price === 0) return null;
  const raw = (qualityAdjustedMonthly * effMult / price / QAMU_REFERENCE) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Compute a ModelValueEstimate for a single model+plan pair.
 * The caller provides pre-computed NormalizedEstimate and UsageLimitRow
 * (from getBestNormalizedEstimate) and AA score for this model.
 */
export function computeModelValueEstimate(
  planId: string,
  modelId: string,
  estimate: NormalizedEstimate | null,
  limitRow: UsageLimitRow | null,
  aaScore: AAModelScore | null,
  price: number | null,
  costPerTaskReference: number | null = null,
): ModelValueEstimate {
  const { wmq, confidence: wmqConf, notes: wmqNotes } = computeWMQ(aaScore);

  const costPerTask = aaScore?.costPerTask ?? null;
  const { mult: effMult, note: effNote } = computeEfficiencyMultiplier(costPerTask, costPerTaskReference);

  // NormalizedEstimate uses camelCase; ModelValueEstimate uses snake_case
  const est5h  = estimate?.estimatedTokens5h  ?? null;
  const est24h = estimate?.estimatedTokens24h ?? null;
  const est1w  = estimate?.estimatedTokens1w  ?? null;
  const est1mo = estimate?.estimatedTokens1mo ?? null;

  const qa5h  = computeQualityAdjusted(est5h,  wmq);
  const qa24h = computeQualityAdjusted(est24h, wmq);
  const qa1w  = computeQualityAdjusted(est1w,  wmq);
  const qa1mo = computeQualityAdjusted(est1mo, wmq);

  const { tokens_5h, tokens_24h, tokens_1w, tokens_1mo, notes: costNotes } =
    computeModelCostAdjusted(estimate, limitRow, aaScore);

  const confidence = weakerOf(estimate?.confidence ?? "unknown", wmqConf);

  return {
    modelId,
    planId,
    weighted_model_quality: wmq,
    estimated_tokens_5h:  est5h,
    estimated_tokens_24h: est24h,
    estimated_tokens_1w:  est1w,
    estimated_tokens_1mo: est1mo,
    quality_adjusted_tokens_5h:  qa5h,
    quality_adjusted_tokens_24h: qa24h,
    quality_adjusted_tokens_1w:  qa1w,
    quality_adjusted_tokens_1mo: qa1mo,
    model_adjusted_tokens_5h:  tokens_5h,
    model_adjusted_tokens_24h: tokens_24h,
    model_adjusted_tokens_1w:  tokens_1w,
    model_adjusted_tokens_1mo: tokens_1mo,
    value_score: computeValueScore(qa1mo, price, effMult),
    efficiency_multiplier: effMult,
    cost_per_task_usd: costPerTask,
    confidence,
    calculation_methodology_version: ENGINE_VERSION,
    notes: [...wmqNotes, ...costNotes, ...(effNote ? [effNote] : [])],
  };
}

/**
 * Compute ModelValueEstimate for every active (non-legacy) model in a plan.
 * Results sorted by weighted_model_quality desc (nulls last).
 * Usage limits are normalized once per plan (shared across all models in the plan).
 */
export function computePlanValueEstimates(
  plan: Plan,
  provider: Provider,
  aaScores: Map<string, AAModelScore>,
  config?: NormalizationConfig,
): ModelValueEstimate[] {
  const cfg = config ?? DEFAULT_CONFIG;
  const { estimate, limitRow } = getBestNormalizedEstimate(plan, cfg);
  const price = effectiveMonthlyPrice(plan);
  const costPerTaskReference = medianCostPerTask(aaScores);

  const validModelIds = new Set(provider.models.map(m => m.id));
  const activeRefs = plan.models.filter(
    m => m.access_type !== "legacy" && validModelIds.has(m.model_id),
  );

  return activeRefs
    .map(ref => {
      const aaScore = aaScores.get(ref.model_id) ?? null;
      return computeModelValueEstimate(plan.id, ref.model_id, estimate, limitRow, aaScore, price, costPerTaskReference);
    })
    .sort((a, b) => {
      const aw = a.weighted_model_quality;
      const bw = b.weighted_model_quality;
      if (aw === null && bw === null) return 0;
      if (aw === null) return 1;
      if (bw === null) return -1;
      return bw - aw;
    });
}
