import type { Provenance } from "@/types";
import { confidenceLabel, confidenceDotColor, daysAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  provenance: Provenance;
  showDate?: boolean;
  compact?: boolean;
}

export function ProvenanceBadge({ provenance, showDate = true, compact = false }: Props) {
  const dotColor = confidenceDotColor(provenance.confidence);
  const label = confidenceLabel(provenance.confidence);
  const age = daysAgo(provenance.accessed_date);

  if (compact) {
    return (
      <span
        title={`${label} · Sourced from ${provenance.url} on ${provenance.accessed_date}${provenance.notes ? " · " + provenance.notes : ""}`}
        className="inline-flex items-center gap-1"
      >
        <span className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
        <span className="text-[10px] text-gray-400 leading-none">{label}</span>
      </span>
    );
  }

  return (
    <a
      href={provenance.url}
      target="_blank"
      rel="noopener noreferrer"
      title={provenance.notes ?? `Source: ${provenance.url}`}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium",
        "transition-colors cursor-pointer select-none",
        provenance.confidence === "observed"  && "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
        provenance.confidence === "inferred"  && "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
        provenance.confidence === "assumed"   && "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
        provenance.confidence === "stale"     && "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
        provenance.confidence === "unknown"   && "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100",
      )}
    >
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
      <span>{label}</span>
      {showDate && age >= 0 && (
        <span className="opacity-60">
          {age === 0 ? "today" : `${age}d ago`}
        </span>
      )}
    </a>
  );
}
