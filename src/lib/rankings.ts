import type {
  Plan,
  Provider,
  Confidence,
  AAModelScore,
  ModelValueEstimate,
} from "@/types";
import { effectiveMonthlyPrice } from "./data-loader";
import { computeWMQ } from "./model-value-engine";
import { effectiveConfidence } from "./utils";

// ─── Version ──────────────────────────────────────────────────────────────────
// Independent axis from ENGINE_VERSION: bumps when the *aggregation* rules change
// (band semantics, sort keys, ranking set shape), not when the underlying math does.
export const RANKINGS_METHODOLOGY_VERSION = "1.0.0";

// ─── Price bands (doc §8 Tier Normalization) ──────────────────────────────────
// free $0/null · low $0.01–30 · mid $30.01–80 · high >$80.
// Free plans carry no value score and auto-drop from value-based rankings.
export type PriceBand = "free" | "low" | "mid" | "high";

export function getPriceBand(monthlyUsd: number | null): PriceBand {
  if (monthlyUsd === null || monthlyUsd <= 0) return "free";
  if (monthlyUsd <= 30) return "low";
  if (monthlyUsd <= 80) return "mid";
  return "high";
}

// ─── Confidence helpers ───────────────────────────────────────────────────────
const CONFIDENCE_RANK: Record<Confidence, number> = {
  observed: 4,
  inferred: 3,
  assumed: 2,
  stale: 1,
  unknown: 0,
};

function meetsMin(conf: Confidence, min: Confidence): boolean {
  return CONFIDENCE_RANK[conf] >= CONFIDENCE_RANK[min];
}

function weakestConf(confs: Confidence[]): Confidence {
  return confs.reduce<Confidence>(
    (weak, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[weak] ? c : weak),
    "observed",
  );
}

function confidenceCaveat(conf: Confidence): string[] {
  if (conf === "observed") return [];
  return [
    `Data confidence: ${conf} — not directly observed from the provider source; figures are proxied or assumed.`,
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface RankingSourceDates {
  aa: string | null; // Artificial Analysis snapshot observedAt
  pricing: string | null; // pricing provenance accessed_date
  usage: string | null; // usage-limit provenance accessed_date (else plan.last_verified)
}

interface BaseRow {
  rank: number;
  providerId: string;
  providerName: string;
  confidence: Confidence;
  caveats: string[];
  sourceDates: RankingSourceDates;
}

/** A plan×model combination ranked by value (bands #1–3, best-plans-per-model #8). */
export interface PlanModelRow extends BaseRow {
  planId: string;
  planName: string;
  modelId: string;
  modelDisplayName: string;
  monthlyPriceUsd: number | null;
  priceBand: PriceBand;
  weightedModelQuality: number | null;
  estimatedMonthlyTokens: number | null;
  modelAdjustedMonthlyTokens: number | null;
  qualityAdjustedMonthlyUsage: number | null; // QAMU
  valueScoreRaw: number | null; // QAMU / price, unnormalized
  valueScore: number | null; // normalized 0–100
  costPerTaskUsd: number | null; // AA cost-per-task (USD); null until seeded
  efficiencyMultiplier: number | null; // bounded [0.85,1.15]; 1.0 = neutral (no data)
}

/** A single model ranked by an AA-derived metric (#4–7). One row per model. */
export interface ModelRow extends BaseRow {
  modelId: string;
  modelDisplayName: string;
  metric: "intelligence" | "coding" | "agentic" | "wmq";
  metricValue: number;
}

/** A provider ranked by peak coding-weighted value (#9). */
export interface ProviderRow extends BaseRow {
  codingValuePeak: number;
  bestPlanId: string;
  bestModelId: string;
}

/** A plan ranked by data transparency (#10). */
export interface TransparencyRow extends BaseRow {
  planId: string;
  planName: string;
  uncertaintyScore: number; // §9 additive, cap 100
  transparencyScore: number; // 100 − uncertainty
}

/** Per-model best plan in each band (#8). */
export interface BestPlansForModel {
  modelId: string;
  modelDisplayName: string;
  weightedModelQuality: number | null;
  bestLowCost: PlanModelRow | null;
  bestMidCost: PlanModelRow | null;
  bestHighCost: PlanModelRow | null;
  caveats: string[];
}

export interface RankingSet {
  generatedAt: string;
  methodologyVersion: string;
  rankings: {
    byPriceBand: Record<"low" | "mid" | "high", PlanModelRow[]>;
    byIntelligence: ModelRow[];
    byCoding: ModelRow[];
    byAgentic: ModelRow[];
    byWeightedQuality: ModelRow[];
    bestPlansPerModel: BestPlansForModel[];
    byProviderCodingValue: ProviderRow[];
    byTransparency: TransparencyRow[];
  };
}

export interface RankingConfig {
  /** Minimum confidence a row's metric must meet to be ranked. Default "assumed". */
  minConfidence: Confidence;
  /** Cap per list. Default 10. */
  topN: number;
}

export interface RankingInputs {
  plans: Array<{ provider: Provider; plan: Plan }>;
  estimatesByPlan: Record<string, ModelValueEstimate[]>;
  aaScores: Map<string, AAModelScore>;
  observedAt: string; // ISO date, injected (keeps this fn clock-free)
  config?: Partial<RankingConfig>;
}

// ─── Core (pure, deterministic) ───────────────────────────────────────────────

/**
 * Aggregate all 10 required rankings from pre-computed per-plan value estimates.
 *
 * Pure: no IO, no clock, no randomness. Given identical inputs (including
 * `observedAt`) it returns byte-identical output — every list is fully ordered
 * down to a `modelId`/`planId`/`providerId` tie-break, so Map iteration order
 * cannot affect the result.
 */
export function computeAllRankings(inputs: RankingInputs): RankingSet {
  const { plans, estimatesByPlan, aaScores, observedAt } = inputs;
  const minConfidence: Confidence = inputs.config?.minConfidence ?? "assumed";
  const topN = inputs.config?.topN ?? 10;

  // ── Indexes ──────────────────────────────────────────────────────────────
  const planIndex = new Map<string, { plan: Plan; provider: Provider }>();
  for (const entry of plans) planIndex.set(entry.plan.id, entry);

  // modelId → display name + first provider that offers it
  const modelIndex = new Map<
    string,
    { displayName: string; providerId: string; providerName: string }
  >();
  for (const { provider } of plans) {
    for (const m of provider.models) {
      if (!modelIndex.has(m.id)) {
        modelIndex.set(m.id, {
          displayName: m.display_name,
          providerId: provider.id,
          providerName: provider.name,
        });
      }
    }
  }

  // ── Per-plan source dates / confidence ─────────────────────────────────────
  function usageAccessedDate(plan: Plan): string | null {
    for (const ul of plan.usage_limits) {
      if (ul.provenance?.accessed_date) return ul.provenance.accessed_date;
    }
    return plan.last_verified ?? null;
  }

  function usageConfidence(plan: Plan): Confidence {
    const confs = plan.usage_limits
      .filter((ul) => ul.type !== "unknown" || ul.value !== null)
      .map((ul) => (ul.provenance ? effectiveConfidence(ul.provenance) : "unknown"));
    return confs.length === 0 ? "unknown" : weakestConf(confs);
  }

  // ── Plan×model rows (confidence-filtered) ──────────────────────────────────
  function toPlanModelRow(est: ModelValueEstimate): PlanModelRow | null {
    const entry = planIndex.get(est.planId);
    if (!entry) return null;
    const { plan, provider } = entry;
    const price = effectiveMonthlyPrice(plan);
    const qa1mo = est.quality_adjusted_tokens_1mo;
    const valueScoreRaw =
      qa1mo !== null && price !== null && price > 0 ? round2(qa1mo / price) : null;
    const aa = aaScores.get(est.modelId) ?? null;
    const meta = modelIndex.get(est.modelId);
    return {
      rank: 0,
      providerId: provider.id,
      providerName: provider.name,
      planId: plan.id,
      planName: plan.name,
      modelId: est.modelId,
      modelDisplayName: meta?.displayName ?? est.modelId,
      monthlyPriceUsd: price,
      priceBand: getPriceBand(price),
      weightedModelQuality: est.weighted_model_quality,
      estimatedMonthlyTokens: est.estimated_tokens_1mo,
      modelAdjustedMonthlyTokens: est.model_adjusted_tokens_1mo,
      qualityAdjustedMonthlyUsage: qa1mo,
      valueScoreRaw,
      valueScore: est.value_score,
      costPerTaskUsd: est.cost_per_task_usd,
      efficiencyMultiplier: est.efficiency_multiplier,
      confidence: est.confidence,
      caveats: confidenceCaveat(est.confidence),
      sourceDates: {
        aa: aa?.observedAt ?? null,
        pricing: plan.pricing.provenance?.accessed_date ?? null,
        usage: usageAccessedDate(plan),
      },
    };
  }

  const allRows: PlanModelRow[] = Object.values(estimatesByPlan)
    .flat()
    .map(toPlanModelRow)
    .filter((r): r is PlanModelRow => r !== null)
    .filter((r) => meetsMin(r.confidence, minConfidence));

  // Value desc → price asc (null last) → planId asc → modelId asc.
  function cmpByValue(a: PlanModelRow, b: PlanModelRow): number {
    const av = a.valueScore ?? -Infinity;
    const bv = b.valueScore ?? -Infinity;
    if (bv !== av) return bv - av;
    const ap = a.monthlyPriceUsd ?? Infinity;
    const bp = b.monthlyPriceUsd ?? Infinity;
    if (ap !== bp) return ap - bp;
    if (a.planId !== b.planId) return a.planId < b.planId ? -1 : 1;
    return a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0;
  }

  function assignRanks<T extends { rank: number }>(rows: T[]): T[] {
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // #1–3 — value within a price band
  function bandRanking(band: "low" | "mid" | "high"): PlanModelRow[] {
    const inBand = allRows
      .filter((r) => r.priceBand === band && r.valueScore !== null)
      .sort(cmpByValue);
    return assignRanks(inBand.slice(0, topN));
  }

  // #4–6 — one row per model, ranked by an AA index
  function metricRanking(
    metric: "intelligence" | "coding" | "agentic",
    pick: (aa: AAModelScore) => number | null,
  ): ModelRow[] {
    const rows: ModelRow[] = [];
    for (const [modelId, aa] of aaScores) {
      const meta = modelIndex.get(modelId);
      if (!meta) continue; // model not offered by any tracked provider
      if (!meetsMin(aa.confidence, minConfidence)) continue;
      const value = pick(aa);
      if (value === null) continue;
      rows.push({
        rank: 0,
        providerId: meta.providerId,
        providerName: meta.providerName,
        modelId,
        modelDisplayName: meta.displayName,
        metric,
        metricValue: value,
        confidence: aa.confidence,
        caveats: confidenceCaveat(aa.confidence),
        sourceDates: { aa: aa.observedAt, pricing: null, usage: null },
      });
    }
    rows.sort((a, b) => {
      if (b.metricValue !== a.metricValue) return b.metricValue - a.metricValue;
      return a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0;
    });
    return assignRanks(rows.slice(0, topN));
  }

  // #7 — weighted model quality (uses computeWMQ's possibly-redistributed confidence)
  function wmqRanking(): ModelRow[] {
    const rows: ModelRow[] = [];
    for (const [modelId, aa] of aaScores) {
      const meta = modelIndex.get(modelId);
      if (!meta) continue;
      const { wmq, confidence } = computeWMQ(aa);
      if (wmq === null) continue;
      if (!meetsMin(confidence, minConfidence)) continue;
      rows.push({
        rank: 0,
        providerId: meta.providerId,
        providerName: meta.providerName,
        modelId,
        modelDisplayName: meta.displayName,
        metric: "wmq",
        metricValue: wmq,
        confidence,
        caveats: confidenceCaveat(confidence),
        sourceDates: { aa: aa.observedAt, pricing: null, usage: null },
      });
    }
    rows.sort((a, b) => {
      if (b.metricValue !== a.metricValue) return b.metricValue - a.metricValue;
      return a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0;
    });
    return assignRanks(rows.slice(0, topN));
  }

  // #8 — best plan per band, for every model with ≥1 (confidence-passing) estimate
  function bestPlansPerModel(): BestPlansForModel[] {
    const byModel = new Map<string, PlanModelRow[]>();
    for (const r of allRows) {
      const list = byModel.get(r.modelId);
      if (list) list.push(r);
      else byModel.set(r.modelId, [r]);
    }
    const out: BestPlansForModel[] = [];
    for (const [modelId, rows] of byModel) {
      const meta = modelIndex.get(modelId);
      const wmq = computeWMQ(aaScores.get(modelId) ?? null).wmq;
      const pickBand = (band: "low" | "mid" | "high"): PlanModelRow | null => {
        const top = rows
          .filter((r) => r.priceBand === band && r.valueScore !== null)
          .sort(cmpByValue)[0];
        return top ? { ...top, rank: 1 } : null;
      };
      const bestLowCost = pickBand("low");
      const bestMidCost = pickBand("mid");
      const bestHighCost = pickBand("high");
      const caveats: string[] = [];
      if (!bestLowCost) caveats.push("No low-cost ($0.01–30) plan offers this model.");
      if (!bestMidCost) caveats.push("No mid-cost ($30.01–80) plan offers this model.");
      if (!bestHighCost) caveats.push("No high-cost (>$80) plan offers this model.");
      out.push({
        modelId,
        modelDisplayName: meta?.displayName ?? modelId,
        weightedModelQuality: wmq,
        bestLowCost,
        bestMidCost,
        bestHighCost,
        caveats,
      });
    }
    out.sort((a, b) => {
      const aw = a.weightedModelQuality;
      const bw = b.weightedModelQuality;
      if (aw === null && bw === null) return a.modelId < b.modelId ? -1 : 1;
      if (aw === null) return 1;
      if (bw === null) return -1;
      if (bw !== aw) return bw - aw;
      return a.modelId < b.modelId ? -1 : 1;
    });
    return out;
  }

  // #9 — provider peak coding-weighted value: max (tokens × codingIndex/100) / price
  function providerCodingValue(): ProviderRow[] {
    type Best = {
      value: number;
      planId: string;
      modelId: string;
      providerName: string;
      confidence: Confidence;
      sourceDates: RankingSourceDates;
    };
    const best = new Map<string, Best>();
    for (const r of allRows) {
      const aa = aaScores.get(r.modelId);
      if (!aa || aa.codingIndex === null) continue;
      const tokens = r.estimatedMonthlyTokens;
      const price = r.monthlyPriceUsd;
      if (tokens === null || price === null || price <= 0) continue;
      const codingValue = (tokens * (aa.codingIndex / 100)) / price;
      const cur = best.get(r.providerId);
      const better =
        !cur ||
        codingValue > cur.value ||
        (codingValue === cur.value && r.planId < cur.planId) ||
        (codingValue === cur.value && r.planId === cur.planId && r.modelId < cur.modelId);
      if (better) {
        best.set(r.providerId, {
          value: codingValue,
          planId: r.planId,
          modelId: r.modelId,
          providerName: r.providerName,
          confidence: r.confidence,
          sourceDates: r.sourceDates,
        });
      }
    }
    const rows: ProviderRow[] = [];
    for (const [providerId, b] of best) {
      rows.push({
        rank: 0,
        providerId,
        providerName: b.providerName,
        codingValuePeak: round2(b.value),
        bestPlanId: b.planId,
        bestModelId: b.modelId,
        confidence: b.confidence,
        caveats: confidenceCaveat(b.confidence),
        sourceDates: b.sourceDates,
      });
    }
    rows.sort((a, b) => {
      if (b.codingValuePeak !== a.codingValuePeak) return b.codingValuePeak - a.codingValuePeak;
      return a.providerId < b.providerId ? -1 : a.providerId > b.providerId ? 1 : 0;
    });
    return assignRanks(rows);
  }

  // #10 — plan data transparency (§9 uncertainty, inverted)
  function transparencyRanking(): TransparencyRow[] {
    const rows: TransparencyRow[] = [];
    for (const { plan, provider } of plans) {
      // Representative model = highest-WMQ estimate (engine sorts WMQ desc).
      const repEst = (estimatesByPlan[plan.id] ?? [])[0];
      const aa = repEst ? aaScores.get(repEst.modelId) ?? null : null;
      const aaConf: Confidence = aa?.confidence ?? "unknown";
      const pricingConf: Confidence = plan.pricing.provenance
        ? effectiveConfidence(plan.pricing.provenance)
        : "unknown";
      const usageConf: Confidence = usageConfidence(plan);

      let u = 0;
      if (aaConf !== "observed") u += 30; // agentic
      if (aaConf !== "observed") u += 25; // coding
      if (aaConf !== "observed") u += 10; // speed
      if (pricingConf !== "observed") u += 25; // pricing
      if (usageConf !== "observed") u += 10; // usage
      const uncertaintyScore = Math.min(100, u);

      const caveats: string[] = [];
      if (aaConf !== "observed") caveats.push(`AA indices (agentic/coding/speed) confidence: ${aaConf}.`);
      if (pricingConf !== "observed") caveats.push(`Pricing confidence: ${pricingConf}.`);
      if (usageConf !== "observed") caveats.push(`Usage-limit confidence: ${usageConf}.`);

      rows.push({
        rank: 0,
        providerId: provider.id,
        providerName: provider.name,
        planId: plan.id,
        planName: plan.name,
        uncertaintyScore,
        transparencyScore: 100 - uncertaintyScore,
        confidence: weakestConf([aaConf, pricingConf, usageConf]),
        caveats,
        sourceDates: {
          aa: aa?.observedAt ?? null,
          pricing: plan.pricing.provenance?.accessed_date ?? null,
          usage: usageAccessedDate(plan),
        },
      });
    }
    rows.sort((a, b) => {
      if (b.transparencyScore !== a.transparencyScore) return b.transparencyScore - a.transparencyScore;
      return a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0;
    });
    return assignRanks(rows);
  }

  return {
    generatedAt: observedAt,
    methodologyVersion: RANKINGS_METHODOLOGY_VERSION,
    rankings: {
      byPriceBand: {
        low: bandRanking("low"),
        mid: bandRanking("mid"),
        high: bandRanking("high"),
      },
      byIntelligence: metricRanking("intelligence", (aa) => aa.intelligenceIndex),
      byCoding: metricRanking("coding", (aa) => aa.codingIndex),
      byAgentic: metricRanking("agentic", (aa) => aa.agenticIndex),
      byWeightedQuality: wmqRanking(),
      bestPlansPerModel: bestPlansPerModel(),
      byProviderCodingValue: providerCodingValue(),
      byTransparency: transparencyRanking(),
    },
  };
}
