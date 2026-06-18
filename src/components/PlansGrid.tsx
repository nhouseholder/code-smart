"use client";

import { useState, useMemo } from "react";
import type { Provider, Plan, ComparisonFilter } from "@/types";
import type { ValueScore } from "@/types";
import { PlanCard } from "./PlanCard";
import { FilterBar } from "./FilterBar";
import { effectiveMonthlyPrice } from "@/lib/utils";

interface PlanEntry {
  provider: Provider;
  plan: Plan;
  score: ValueScore;
  engineBest?: import("@/types").ModelValueEstimate | null;
}

interface Props {
  entries: PlanEntry[];
}

const DEFAULT_FILTER: ComparisonFilter = {
  tier: "all",
  max_price_monthly: null,
  show_free_only: false,
  providers: [],
  sort_by: "value_score",
  sort_dir: "desc",
};

export function PlansGrid({ entries }: Props) {
  const [filter, setFilter] = useState<ComparisonFilter>(DEFAULT_FILTER);

  const filtered = useMemo(() => {
    let result = [...entries];

    // Tier filter
    if (filter.tier !== "all") {
      result = result.filter(({ plan }) => plan.tier === filter.tier);
    }

    // Max price filter
    if (filter.max_price_monthly !== null) {
      result = result.filter(({ plan }) => {
        const price = effectiveMonthlyPrice(plan);
        if (price === null) return false;
        return price <= filter.max_price_monthly!;
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (filter.sort_by) {
        case "value_score":
          return b.score.overall_value_score - a.score.overall_value_score;
        case "price": {
          const pa = effectiveMonthlyPrice(a.plan) ?? Infinity;
          const pb = effectiveMonthlyPrice(b.plan) ?? Infinity;
          return pa - pb;
        }
        case "benchmark": {
          const ba = a.score.benchmark_quality_index ?? -1;
          const bb = b.score.benchmark_quality_index ?? -1;
          return bb - ba;
        }
        case "provider":
          return a.provider.name.localeCompare(b.provider.name);
        default:
          return 0;
      }
    });

    return result;
  }, [entries, filter]);

  // The top-scoring plan (by value per intelligence per task) is "featured"
  const topId = filtered[0]?.plan.id;

  if (entries.length === 0) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p className="text-lg font-medium">No plan data available</p>
        <p className="text-sm mt-1">Check that provider JSON files are valid.</p>
      </div>
    );
  }

  return (
    <>
      <FilterBar
        filter={filter}
        onChange={setFilter}
        totalPlans={entries.length}
        shownPlans={filtered.length}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <p className="font-medium">No plans match your filters.</p>
            <button
              onClick={() => setFilter(DEFAULT_FILTER)}
              className="mt-3 text-sm text-brand-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          // Bento grid: first card spans 2 columns when featured, rest fill organically
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(({ provider, plan, score, engineBest }, idx) => (
              <div
                key={plan.id}
                className={
                  // First plan (best value): span 2 columns on lg+
                  idx === 0 && plan.id === topId
                    ? "sm:col-span-2 lg:col-span-2"
                    : ""
                }
              >
                <PlanCard
                  provider={provider}
                  plan={plan}
                  score={score}
                  engineBest={engineBest}
                  featured={idx === 0 && plan.id === topId}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
