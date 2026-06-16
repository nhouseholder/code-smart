import type { Confidence } from "@/types";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./ProvenanceBadge";

/** Color band for an AA metric tile. null → gray "—". */
export function metricColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-gray-400";
  if (value >= 70) return "text-green-600";
  if (value >= 50) return "text-amber-600";
  return "text-red-500";
}

interface Props {
  label: string;
  value: number | null | undefined;
  /** Out-of value suffix, e.g. "/100". */
  outOf?: string;
  /** AA-sourced metrics carry the "AA" prefix per domain rule. */
  aa?: boolean;
  confidence?: Confidence;
  hint?: string;
  className?: string;
}

/** AA metric tile (intelligence/coding/agentic/speed/WMQ). null renders "—". */
export function MetricCard({ label, value, outOf = "/100", aa = true, confidence, hint, className }: Props) {
  const isNull = value === null || value === undefined;
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1 transition-all duration-200 hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          {aa && <span className="text-[9px] font-bold opacity-60 mr-1">AA</span>}
          {label}
        </span>
        {confidence && <ConfidenceBadge confidence={confidence} className="scale-90 origin-right" />}
      </div>
      <div className={cn("text-2xl font-bold tabular-nums leading-none", metricColor(value))}>
        {isNull ? "—" : value}
        {!isNull && <span className="text-sm font-medium text-gray-400">{outOf}</span>}
      </div>
      {hint && <p className="text-[11px] text-gray-400 leading-snug">{hint}</p>}
    </div>
  );
}
