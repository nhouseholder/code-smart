"use client";

import type { ComparisonFilter } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  filter: ComparisonFilter;
  onChange: (f: ComparisonFilter) => void;
  totalPlans: number;
  shownPlans: number;
}

const TIERS = [
  { value: "all",        label: "All Plans" },
  { value: "free",       label: "Free" },
  { value: "individual", label: "Individual" },
  { value: "pro",        label: "Pro" },
  { value: "team",       label: "Team" },
  { value: "enterprise", label: "Enterprise" },
] as const;

const SORT_OPTIONS = [
  { value: "value_score", label: "Best Value" },
  { value: "price",       label: "Price ↑" },
  { value: "benchmark",   label: "Benchmark" },
  { value: "provider",    label: "Provider" },
] as const;

const MAX_PRICE_OPTIONS = [
  { value: null,  label: "Any price" },
  { value: 0,     label: "Free only" },
  { value: 20,    label: "≤ $20/mo" },
  { value: 40,    label: "≤ $40/mo" },
  { value: 100,   label: "≤ $100/mo" },
] as const;

export function FilterBar({ filter, onChange, totalPlans, shownPlans }: Props) {
  return (
    <div className="bg-white border-b border-gray-100 sticky top-14 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-4 flex-wrap">

          {/* Tier pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {TIERS.map((tier) => (
              <button
                key={tier.value}
                onClick={() => onChange({ ...filter, tier: tier.value as ComparisonFilter["tier"] })}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150",
                  filter.tier === tier.value
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900",
                )}
              >
                {tier.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          {/* Max price select */}
          <select
            value={filter.max_price_monthly ?? "null"}
            onChange={(e) => {
              const val = e.target.value === "null" ? null : Number(e.target.value);
              onChange({ ...filter, max_price_monthly: val });
            }}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-brand-400 cursor-pointer"
          >
            {MAX_PRICE_OPTIONS.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={filter.sort_by}
            onChange={(e) => onChange({ ...filter, sort_by: e.target.value as ComparisonFilter["sort_by"] })}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-brand-400 cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Count */}
          <span className="text-xs text-gray-400 ml-auto">
            {shownPlans === totalPlans
              ? `${totalPlans} plans`
              : `${shownPlans} of ${totalPlans} plans`}
          </span>
        </div>
      </div>
    </div>
  );
}
