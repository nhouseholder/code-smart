"use client";

import { useState, useMemo } from "react";
import type { Confidence } from "@/types";
import { cn, effectiveMonthlyPrice } from "@/lib/utils";
import { type Entry, COMPARISON_ROWS } from "./ComparisonTable";
import type { PriceBand } from "./PriceBandBadge";
import { ProviderBadge } from "./ProviderBadge";
import { PriceBandBadge } from "./PriceBandBadge";
import { ConfidenceBadge } from "./ProvenanceBadge";
import { Search, X } from "lucide-react";

const MIN_PICK = 2;
const MAX_PICK = 6;

/** Price band from an effective monthly price. Mirrors methodology bands. */
function bandOf(price: number | null): PriceBand {
  if (price === null) return "high"; // contact-sales / undisclosed → treat as high
  if (price === 0) return "free";
  if (price <= 30) return "low";
  if (price <= 80) return "mid";
  return "high";
}

const CONFIDENCE_ORDER: Confidence[] = ["observed", "inferred", "assumed", "stale", "unknown"];

interface Props {
  entries: Entry[];
}

/**
 * Searchable, filterable plan comparison for /compare. The user picks 2–6 plans
 * from a filtered list; selected plans render in a side-by-side feature matrix
 * (reused from ComparisonTable). Null values render "—", never 0.
 */
export function PlanComparisonTable({ entries }: Props) {
  const [search, setSearch] = useState("");
  const [providerId, setProviderId] = useState<string>("all");
  const [band, setBand] = useState<PriceBand | "all">("all");
  const [confidence, setConfidence] = useState<Confidence | "all">("all");

  // Default selection: top entries by overall value score, capped at MAX_PICK.
  const [selected, setSelected] = useState<string[]>(() =>
    [...entries]
      .sort((a, b) => b.score.overall_value_score - a.score.overall_value_score)
      .slice(0, Math.min(3, entries.length))
      .map((e) => e.plan.id),
  );

  const providers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) seen.set(e.provider.id, e.provider.name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (q && !`${e.plan.name} ${e.provider.name}`.toLowerCase().includes(q)) return false;
      if (providerId !== "all" && e.provider.id !== providerId) return false;
      if (band !== "all" && bandOf(effectiveMonthlyPrice(e.plan)) !== band) return false;
      if (confidence !== "all" && (e.engineBest?.confidence ?? "unknown") !== confidence) return false;
      return true;
    });
  }, [entries, search, providerId, band, confidence]);

  const selectedEntries = useMemo(
    () => selected.map((id) => entries.find((e) => e.plan.id === id)).filter((e): e is Entry => !!e),
    [selected, entries],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= MIN_PICK) return prev; // keep at least MIN_PICK
        return prev.filter((p) => p !== id);
      }
      if (prev.length >= MAX_PICK) return prev; // cap at MAX_PICK
      return [...prev, id];
    });
  }

  const atMax = selected.length >= MAX_PICK;

  return (
    <div className="space-y-6">
      {/* Picker controls */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plans or providers…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-200"
            />
          </div>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-all duration-200"
          >
            <option value="all">All providers</option>
            {providers.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <select
            value={band}
            onChange={(e) => setBand(e.target.value as PriceBand | "all")}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-all duration-200"
          >
            <option value="all">All prices</option>
            <option value="free">Free</option>
            <option value="low">Low ($0–30)</option>
            <option value="mid">Mid ($30–80)</option>
            <option value="high">High ($80+)</option>
          </select>
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as Confidence | "all")}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-all duration-200"
          >
            <option value="all">Any confidence</option>
            {CONFIDENCE_ORDER.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {filtered.length} plan{filtered.length === 1 ? "" : "s"} ·{" "}
            <span className={cn("font-medium", atMax && "text-amber-600")}>
              {selected.length}/{MAX_PICK} selected
            </span>
            {atMax && " (max — deselect one to add another)"}
          </span>
          {selected.length > MIN_PICK && (
            <button
              onClick={() => setSelected((p) => p.slice(0, MIN_PICK))}
              className="text-brand-600 hover:text-brand-700 cursor-pointer transition-colors"
            >
              Reset to {MIN_PICK}
            </button>
          )}
        </div>

        {/* Selectable list */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
            No plans match these filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
            {filtered.map((e) => {
              const isSel = selected.includes(e.plan.id);
              const disabled = !isSel && atMax;
              return (
                <button
                  key={e.plan.id}
                  onClick={() => toggle(e.plan.id)}
                  disabled={disabled}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all duration-200",
                    isSel
                      ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30"
                      : "border-gray-200 bg-white hover:border-gray-300",
                    disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "flex-shrink-0 h-4 w-4 rounded border flex items-center justify-center",
                      isSel ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300",
                    )}
                  >
                    {isSel && <span className="text-[10px] leading-none">✓</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 truncate">{e.plan.name}</span>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      <ProviderBadge providerId={e.provider.id} name={e.provider.name} size="sm" />
                      <PriceBandBadge band={bandOf(effectiveMonthlyPrice(e.plan))} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Comparison matrix */}
      {selectedEntries.length < MIN_PICK ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
          Select at least {MIN_PICK} plans above to compare them side by side.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40 sticky left-0 bg-gray-50 z-10">
                  Feature
                </th>
                {selectedEntries.map((e) => (
                  <th key={e.plan.id} className="py-3 px-3 text-center min-w-[130px]">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-semibold text-gray-900 text-xs leading-tight">{e.plan.name}</span>
                      <button
                        onClick={() => toggle(e.plan.id)}
                        disabled={selected.length <= MIN_PICK}
                        title="Remove from comparison"
                        className="text-gray-300 hover:text-red-500 disabled:opacity-0 cursor-pointer transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-400 font-normal mt-0.5">{e.provider.name}</div>
                    <div className="mt-1 flex justify-center">
                      <ConfidenceBadge
                        confidence={e.engineBest?.confidence ?? "unknown"}
                        className="scale-[0.8] origin-top"
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => {
                if (row.kind === "section") {
                  return (
                    <tr key={`section-${i}`} className="bg-gray-50/50">
                      <td
                        colSpan={selectedEntries.length + 1}
                        className="py-2 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-t border-gray-100 sticky left-0"
                      >
                        {row.label}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={row.label} className="border-t border-gray-100 even:bg-gray-50/30">
                    <td className="py-2.5 px-4 text-xs text-gray-600 font-medium sticky left-0 bg-inherit">
                      {row.label}
                    </td>
                    {selectedEntries.map((entry) => (
                      <td key={entry.plan.id} className="py-2.5 px-3 text-center">
                        {row.render(entry)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
