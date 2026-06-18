import type { PlanModelRow } from "@/lib/rankings";
import { cn } from "@/lib/utils";

interface Props {
  /** byQualityPerBand from the rankings artifact: one row per plan, best-quality model. */
  tiers: Record<"low" | "mid" | "high", PlanModelRow[]>;
}

const TIER_META = [
  { key: "low", label: "Budget", range: "≤ $15/mo" },
  { key: "mid", label: "Standard", range: "$16 – $49/mo" },
  { key: "high", label: "Premium", range: "$50+/mo" },
] as const;

// Same thresholds the ValueScoreBar ring uses, kept in sync for visual cohesion.
function qualityFill(v: number): string {
  if (v >= 75) return "bg-green-600";
  if (v >= 55) return "bg-blue-600";
  if (v >= 35) return "bg-amber-500";
  return "bg-red-500";
}
function qualityText(v: number): string {
  if (v >= 75) return "text-green-600";
  if (v >= 55) return "text-blue-600";
  if (v >= 35) return "text-amber-600";
  return "text-red-600";
}

function priceLabel(usd: number | null): string {
  if (usd === null) return "—";
  return `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;
}

function QualityBar({ row }: { row: PlanModelRow }) {
  const score = row.weightedModelQuality ?? 0;
  return (
    <li
      className="group"
      title={`${row.planName} · best model ${row.modelDisplayName} · Intelligence score ${score} · ${priceLabel(row.monthlyPriceUsd)}/mo · confidence ${row.confidence}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-gray-900 truncate">{row.planName}</span>
        <span className={cn("text-sm font-semibold tabular-nums shrink-0", qualityText(score))}>{score}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", qualityFill(score))}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={cn("confidence-dot", `confidence-${row.confidence}`)} aria-hidden />
        <span className="text-xs text-gray-500 truncate">
          {row.modelDisplayName}
          <span className="text-gray-400"> · {priceLabel(row.monthlyPriceUsd)}/mo</span>
        </span>
      </div>
    </li>
  );
}

function TierPanel({
  label,
  range,
  rows,
}: {
  label: string;
  range: string;
  rows: PlanModelRow[];
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900">{label}</h3>
        <span className="text-xs font-medium text-gray-500 tabular-nums">{range}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          No plan with a rated model in this tier yet.
        </p>
      ) : (
        <ul className="space-y-3.5">
          {rows.map((row) => (
            <QualityBar key={`${row.planId}:${row.modelId}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Quality-per-price-tier bar chart for the home page. Each bar = a plan, height
 * (fill width) = the Intelligence Score of the best model that plan unlocks,
 * grouped into 3 price tiers. Intelligence Score is real AA-observed data — see /methodology.
 */
export function ValueByTierChart({ tiers }: Props) {
  const total = tiers.low.length + tiers.mid.length + tiers.high.length;
  if (total === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Model quality by price tier</h2>
          <p className="text-sm text-gray-500 mt-1">
            The best model each plan unlocks, scored by Intelligence Score (50% agentic, 40% coding,
            10% speed), split into budget, standard, and premium tiers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIER_META.map((t) => (
          <TierPanel key={t.key} label={t.label} range={t.range} rows={tiers[t.key]} />
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Intelligence Score is sourced from Artificial Analysis indices (observed). Bars show the highest-quality model a
        plan offers, not its price-efficiency. See the{" "}
        <a href="/methodology" className="text-brand-600 hover:underline">methodology</a> for the formula.
      </p>
    </section>
  );
}
