import type { Provider, Plan, Model, ValueScore, UsageLimit } from "@/types";
import { effectiveMonthlyPrice } from "./data-loader";
import { normalizeLimit } from "./normalization/engine";
import { DEFAULT_CONFIG } from "./normalization/config";
import type { UsageLimitRow } from "./normalization/types";

// ─── Weights ─────────────────────────────────────────────────────────────────
// Adjustable without changing scoring logic.
const WEIGHTS = {
  cost: 0.35,      // lower price = higher score
  benchmark: 0.40, // coding benchmark quality
  feature: 0.25,   // feature completeness for developers
} as const;

// ─── Benchmark Quality Index ──────────────────────────────────────────────────

// Canonical reference scores for normalization.
// Updated manually when state-of-the-art changes.
const BENCHMARK_REFERENCE: Record<string, { max: number; unit: string }> = {
  "SWE-bench-verified": { max: 100, unit: "percent" },
  "HumanEval":          { max: 100, unit: "percent" },
  "Aider-polyglot":     { max: 100, unit: "percent" },
  "LiveCodeBench":      { max: 100, unit: "percent" },
  "MBPP":               { max: 100, unit: "percent" },
};

// Weights for each benchmark in the composite index.
// SWE-bench reflects real-world agentic coding more than HumanEval.
const BENCHMARK_WEIGHTS: Record<string, number> = {
  "SWE-bench-verified": 0.45,
  "HumanEval":          0.25,
  "Aider-polyglot":     0.20,
  "LiveCodeBench":      0.10,
};

/** Compute a 0–100 composite benchmark index for a model. */
function modelBenchmarkIndex(model: Model): number | null {
  const scored: { normalized: number; weight: number }[] = [];

  for (const b of model.benchmarks) {
    const ref = BENCHMARK_REFERENCE[b.name];
    const weight = BENCHMARK_WEIGHTS[b.name];
    if (!ref || weight === undefined || b.score === null) continue;

    const normalized = Math.min(100, (b.score / ref.max) * 100);
    scored.push({ normalized: b.higher_is_better ? normalized : 100 - normalized, weight });
  }

  if (scored.length === 0) return null;

  const totalWeight = scored.reduce((s, x) => s + x.weight, 0);
  const weighted = scored.reduce((s, x) => s + x.normalized * x.weight, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

/** Best benchmark index across all models in a plan (uses provider model list). */
function planBenchmarkIndex(plan: Plan, models: Model[]): number | null {
  const planModelIds = new Set(plan.models.map((m) => m.model_id));
  const relevant = models.filter((m) => planModelIds.has(m.id) &&
    plan.models.find((pm) => pm.model_id === m.id)?.access_type !== "legacy"
  );

  const scores = relevant.map(modelBenchmarkIndex).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;

  return Math.max(...scores);
}

// ─── Feature Completeness Score ───────────────────────────────────────────────

interface FeatureWeight { key: keyof Plan["features"] | "_ide_count"; weight: number }

const FEATURE_WEIGHTS: FeatureWeight[] = [
  { key: "agent_capabilities",  weight: 20 },
  { key: "code_context_length_k", weight: 15 },  // presence/absence treated as boolean
  { key: "file_uploads",        weight: 10 },
  { key: "api_access",          weight: 10 },
  { key: "cli_access",          weight: 10 },
  { key: "custom_instructions", weight: 8  },
  { key: "web_search",          weight: 7  },
  { key: "priority_access",     weight: 7  },
  { key: "team_features",       weight: 7  },
  { key: "sso",                 weight: 4  },
  { key: "_ide_count",          weight: 2  },  // bonus for IDE coverage
];

function featureCompletenessScore(plan: Plan): number {
  let score = 0;
  const totalWeight = FEATURE_WEIGHTS.reduce((s, f) => s + f.weight, 0);

  for (const fw of FEATURE_WEIGHTS) {
    if (fw.key === "_ide_count") {
      const ideCoverage = Math.min(1, plan.features.ide_integrations.length / 3);
      score += ideCoverage * fw.weight;
    } else {
      const val = plan.features[fw.key as keyof Plan["features"]];
      if (typeof val === "boolean" && val) {
        score += fw.weight;
      } else if (typeof val === "number" && val > 0) {
        score += fw.weight;
      }
    }
  }

  return Math.round((score / totalWeight) * 100);
}

// ─── Cost Score ───────────────────────────────────────────────────────────────

// Reference: what's a "fair" monthly price for a professional coding assistant.
const COST_REFERENCE_USD = 20;
// Reference QAMU for a "perfect score": 1M tokens/mo at 80% WMQ quality for $20.
const QAMU_REFERENCE = (1_000_000 * 0.8) / COST_REFERENCE_USD; // 40_000

/**
 * Maps monthly price → cost score 0–100.
 * Free = 100, ~$20 = 80, ~$40 = 60, ~$100+ = 30, unknown = 50.
 */
function costScore(plan: Plan): number {
  const price = effectiveMonthlyPrice(plan);
  if (price === null) return 50;
  if (price === 0) return 100;
  // Logarithmic decay: score falls as price rises above reference
  const ratio = price / COST_REFERENCE_USD;
  return Math.max(10, Math.round(100 - 30 * Math.log2(ratio + 0.5)));
}

/**
 * Estimate effective cost per message.
 * Returns null when limits are unknown (limits = "unlimited" or "unknown" without a count).
 */
function estimateCostPerMessage(plan: Plan): number | null {
  const price = effectiveMonthlyPrice(plan);
  if (price === null) return null;

  const msgLimit = plan.usage_limits.find(
    (l) => l.type === "messages_per_month" || l.type === "messages_per_day"
  );

  if (!msgLimit || msgLimit.value === null) return null;

  const monthly = msgLimit.type === "messages_per_day"
    ? msgLimit.value * 30
    : msgLimit.value;

  if (monthly === 0) return null;
  return Math.round((price / monthly) * 10000) / 10000; // 4 decimal places
}

// ─── JSON → Engine Adapter ────────────────────────────────────────────────────

const RESET_WINDOW: Partial<Record<string, string>> = {
  "_per_minute": "1h",
  "_per_day":    "1d",
  "_per_week":   "1w",
  "_per_month":  "1mo",
};

export function usageLimitToRow(limit: UsageLimit, planId: string, idx: number): UsageLimitRow {
  const resetWindow =
    Object.entries(RESET_WINDOW).find(([k]) => limit.type.endsWith(k))?.[1] ?? null;

  let limitUnit: string | null = null;
  if (limit.type.startsWith("tokens_"))        limitUnit = "tokens";
  else if (limit.type.startsWith("messages_")) limitUnit = "messages";
  else if (limit.type.startsWith("requests_")) limitUnit = "requests";
  else if (limit.type.startsWith("completions_")) limitUnit = limit.unit ?? null;

  let limitType = limit.type as string;
  if (limit.type === "credits_per_month")            limitType = "credits";
  else if (limit.type === "compute_units_per_month") limitType = "compute_units";
  else if (limit.type === "unlimited")               limitType = "fair_use";

  return {
    id: idx,
    planId,
    modelId: null,
    observedAt: new Date().toISOString(),
    rawLimitText: limit.notes ?? limit.type,
    limitType,
    limitValue: limit.value,
    limitUnit,
    resetWindow,
    confidence: limit.provenance.confidence,
    notes: null,
  };
}

/**
 * Run the normalization engine over every usage_limit on the plan.
 * Returns the highest estimatedTokens1mo across all limits (most generous non-null).
 * Returns null when all limits produce null (all "unknown" with no value).
 */
function getBestEstimatedTokens1mo(plan: Plan): number | null {
  let best: number | null = null;

  plan.usage_limits.forEach((limit, idx) => {
    if (limit.type === "unknown" && limit.value === null) return;

    const row = usageLimitToRow(limit, plan.id, idx);
    const { estimatedTokens1mo } = normalizeLimit(row, DEFAULT_CONFIG);

    if (estimatedTokens1mo !== null && (best === null || estimatedTokens1mo > best)) {
      best = estimatedTokens1mo;
    }
  });

  return best;
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

export function scorePlan(plan: Plan, provider: Provider): ValueScore {
  const benchmarkScore      = planBenchmarkIndex(plan, provider.models) ?? 0;
  const featureScore        = featureCompletenessScore(plan);
  const cScore              = costScore(plan);
  const price               = effectiveMonthlyPrice(plan);
  const estimatedTokens1mo  = getBestEstimatedTokens1mo(plan);

  // WMQ: use benchmark composite as proxy until AA indices are integrated.
  const wmq  = benchmarkScore; // 0–100
  const qamu = estimatedTokens1mo !== null ? estimatedTokens1mo * (wmq / 100) : null;

  let overall: number;
  if (qamu !== null && price !== null && price > 0) {
    // QAMU formula: normalize against reference point (capped at 100)
    overall = Math.min(100, Math.round((qamu / price / QAMU_REFERENCE) * 100));
  } else if (price === 0 && qamu !== null) {
    // Free plans with QAMU: score on quality + features (no price to divide by)
    overall = Math.min(100, Math.round(wmq * 0.6 + featureScore * 0.4));
  } else {
    // Fallback: legacy 3-weight formula when QAMU cannot be computed
    overall = Math.round(
      cScore * WEIGHTS.cost +
      benchmarkScore * WEIGHTS.benchmark +
      featureScore * WEIGHTS.feature
    );
  }

  const notes: string[] = [];
  if (planBenchmarkIndex(plan, provider.models) === null) {
    notes.push("Benchmark index defaulted to 0 — no coding benchmark data available for included models.");
  }
  if (price === null) {
    notes.push("Pricing unknown — QAMU requires a price; fell back to legacy score.");
  }
  if (estimatedTokens1mo === null) {
    notes.push("Usage limits unknown — QAMU cannot be computed; fell back to legacy score.");
  }

  return {
    plan_id: plan.id,
    effective_cost_per_message_usd: estimateCostPerMessage(plan),
    benchmark_quality_index: planBenchmarkIndex(plan, provider.models),
    feature_completeness_score: featureScore,
    overall_value_score: overall,
    score_breakdown: {
      cost_score: cScore,
      benchmark_score: benchmarkScore,
      feature_score: featureScore,
      weights: { ...WEIGHTS },
      qamu_estimated_tokens_1mo: estimatedTokens1mo,
    },
    notes,
    computed_at: new Date().toISOString(),
  };
}

/** Score all plans across all providers. Returns sorted by overall score desc. */
export function scoreAllPlans(
  plans: Array<{ provider: Provider; plan: Plan }>
): Array<{ provider: Provider; plan: Plan; score: ValueScore }> {
  return plans
    .map(({ provider, plan }) => ({ provider, plan, score: scorePlan(plan, provider) }))
    .sort((a, b) => b.score.overall_value_score - a.score.overall_value_score);
}
