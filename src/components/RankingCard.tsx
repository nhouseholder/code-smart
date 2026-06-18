import Link from "next/link";
import type { PlanModelRow } from "@/lib/rankings";
import { cn, formatPrice, formatTokens } from "@/lib/utils";
import { ProviderBadge } from "./ProviderBadge";
import { PriceBandBadge } from "./PriceBandBadge";
import { ConfidenceBadge, FreshnessBadge } from "./ProvenanceBadge";
import { CaveatCallout } from "./CaveatCallout";

/** Oldest of the row's source dates → the honest "last updated" for the card. */
export function oldestSourceDate(row: PlanModelRow): string | null {
  const dates = [row.sourceDates.aa, row.sourceDates.pricing, row.sourceDates.usage].filter(
    (d): d is string => !!d,
  );
  if (dates.length === 0) return null;
  return dates.sort()[0]; // ISO strings sort chronologically; earliest = oldest
}

interface Props {
  row: PlanModelRow;
  /** Show the full caveat callout (detail pages) vs hide it (dense grids). */
  showCaveats?: boolean;
  className?: string;
}

/** A single value-ranking entry. Always shows last-updated + confidence + caveats. */
export function RankingCard({ row, showCaveats = true, className }: Props) {
  const updated = oldestSourceDate(row);
  return (
    <article
      className={cn(
        "rounded-2xl border border-gray-200 bg-white p-5 flex flex-col gap-3 transition-all duration-200 hover:shadow-md hover:border-gray-300",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-gray-400 tabular-nums">#{row.rank}</span>
          <ProviderBadge providerId={row.providerId} name={row.providerName} href={`/providers/${row.providerId}`} size="sm" />
          <PriceBandBadge band={row.priceBand} />
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className={cn(
              "text-2xl font-bold tabular-nums leading-none",
              row.valueScore == null
                ? "text-gray-400"
                : row.valueScore >= 75
                  ? "text-green-600"
                  : row.valueScore >= 50
                    ? "text-blue-600"
                    : row.valueScore >= 25
                      ? "text-amber-600"
                      : "text-red-500",
            )}
          >
            {row.valueScore == null ? "—" : row.valueScore}
            {row.valueScore != null && <span className="text-xs font-medium text-gray-400">/100</span>}
          </div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Value</div>
          {row.costPerTaskUsd != null && row.efficiencyMultiplier != null && (
            <div
              className={cn(
                "mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                row.efficiencyMultiplier > 1
                  ? "bg-green-50 text-green-700"
                  : row.efficiencyMultiplier < 1
                    ? "bg-red-50 text-red-600"
                    : "bg-gray-100 text-gray-500",
              )}
              title="Efficiency multiplier applied to value (from AA cost-per-task)"
            >
              ×{row.efficiencyMultiplier.toFixed(2)} eff
            </div>
          )}
        </div>
      </div>

      <div>
        <Link href={`/plans/${row.planId}`} className="font-semibold text-gray-900 hover:text-brand-700 transition-colors">
          {row.planName}
        </Link>
        <div className="text-sm text-gray-500">
          via{" "}
          <Link href={`/models/${row.modelId}`} className="text-brand-600 hover:text-brand-700 transition-colors">
            {row.modelDisplayName}
          </Link>
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div>
          <dt className="text-[10px] text-gray-400 uppercase tracking-wide">Price</dt>
          <dd className="text-sm font-semibold tabular-nums text-gray-900">{formatPrice(row.monthlyPriceUsd)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-gray-400 uppercase tracking-wide">Intel.</dt>
          <dd className="text-sm font-semibold tabular-nums text-gray-900">
            {row.weightedModelQuality == null ? "—" : row.weightedModelQuality}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-gray-400 uppercase tracking-wide">Cost/task</dt>
          <dd className={cn("text-sm font-semibold tabular-nums", row.costPerTaskUsd == null ? "text-gray-400" : "text-gray-900")}>
            {row.costPerTaskUsd == null ? "—" : `$${row.costPerTaskUsd}`}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-gray-400 uppercase tracking-wide">Est. tokens/mo</dt>
          <dd className="text-sm font-semibold tabular-nums text-gray-900">{formatTokens(row.estimatedMonthlyTokens)}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2 pt-1">
        <ConfidenceBadge confidence={row.confidence} className="scale-90 origin-left" />
        <FreshnessBadge date={updated} compact />
      </div>

      {showCaveats && <CaveatCallout caveats={row.caveats} />}
    </article>
  );
}
