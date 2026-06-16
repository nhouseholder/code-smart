import type { Plan, Provider } from "@/types";
import { getAllPlans, effectiveMonthlyPrice } from "./data-loader";
import { scorePlan } from "./value-scorer";

export type PriceBand = "free" | "under-20" | "under-40" | "40-plus";

export interface RankedPlan {
  rank: number;
  plan: Plan;
  providerId: string;
  providerName: string;
  effectiveMonthlyUsd: number | null;
  priceBand: PriceBand;
  overallScore: number;
}

export interface Rankings {
  all: RankedPlan[];
  byBand: Record<PriceBand, RankedPlan[]>;
}

export function getPriceBand(monthlyUsd: number | null): PriceBand {
  if (monthlyUsd === null || monthlyUsd === 0) return "free";
  if (monthlyUsd < 20) return "under-20";
  if (monthlyUsd < 40) return "under-40";
  return "40-plus";
}

export function computeRankings(
  plans?: Array<{ provider: Provider; plan: Plan }>,
): Rankings {
  const entries = plans ?? getAllPlans();

  const scored = entries.map(({ provider, plan }) => {
    const score = scorePlan(plan, provider);
    const price = effectiveMonthlyPrice(plan);
    return {
      plan,
      providerId: provider.id,
      providerName: provider.name,
      effectiveMonthlyUsd: price,
      priceBand: getPriceBand(price),
      overallScore: score.overall_value_score,
    };
  });

  // Sort by score desc, break ties by price asc (null price last)
  scored.sort((a, b) => {
    if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
    const ap = a.effectiveMonthlyUsd ?? Infinity;
    const bp = b.effectiveMonthlyUsd ?? Infinity;
    return ap - bp;
  });

  const all: RankedPlan[] = scored.map((entry, i) => ({ rank: i + 1, ...entry }));

  const bands: PriceBand[] = ["free", "under-20", "under-40", "40-plus"];
  const byBand: Record<PriceBand, RankedPlan[]> = {
    "free": [],
    "under-20": [],
    "under-40": [],
    "40-plus": [],
  };

  for (const band of bands) {
    let bandRank = 1;
    for (const entry of all) {
      if (entry.priceBand === band) {
        byBand[band].push({ ...entry, rank: bandRank++ });
      }
    }
  }

  return { all, byBand };
}
