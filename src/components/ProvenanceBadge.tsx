import type { Provenance, Confidence } from "@/types";
import { confidenceLabel, confidenceDotColor, daysAgo, isStale, cn } from "@/lib/utils";
import { ExternalLink, Clock } from "lucide-react";

type Variant = "confidence" | "freshness" | "source";

interface Props {
  provenance: Provenance;
  showDate?: boolean;
  compact?: boolean;
  /** "confidence" (default) · "freshness" (date-first) · "source" (link-first). */
  variant?: Variant;
}

const PILL_BY_CONFIDENCE: Record<Confidence, string> = {
  observed: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
  inferred: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  assumed: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  stale: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  unknown: "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100",
};

export function ProvenanceBadge({
  provenance,
  showDate = true,
  compact = false,
  variant = "confidence",
}: Props) {
  if (variant === "freshness") {
    return <FreshnessBadge date={provenance.accessed_date} compact={compact} />;
  }
  if (variant === "source") {
    return <SourceLink url={provenance.url} date={showDate ? provenance.accessed_date : undefined} />;
  }

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
        PILL_BY_CONFIDENCE[provenance.confidence],
      )}
    >
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
      <span>{label}</span>
      {showDate && age >= 0 && <span className="opacity-60">{age === 0 ? "today" : `${age}d ago`}</span>}
    </a>
  );
}

// ─── Thin named exports (one file, council: no thin-wrapper sprawl) ───────────

/** Confidence pill from a bare Confidence value (ranking rows carry no Provenance). */
export function ConfidenceBadge({
  confidence,
  className,
}: {
  confidence: Confidence;
  className?: string;
}) {
  return (
    <span
      title={`Data confidence: ${confidenceLabel(confidence)}`}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium select-none",
        PILL_BY_CONFIDENCE[confidence],
        className,
      )}
    >
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", confidenceDotColor(confidence))} />
      {confidenceLabel(confidence)}
    </span>
  );
}

/** Date-first freshness chip. Turns red + flags when >90d stale. `null` → "—". */
export function FreshnessBadge({
  date,
  compact = false,
  className,
}: {
  date: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!date) {
    return <span className={cn("text-[11px] text-gray-400", className)}>—</span>;
  }
  const age = daysAgo(date);
  const stale = isStale(date);
  const text = age <= 0 ? "today" : age === 1 ? "1 day ago" : `${age} days ago`;

  if (compact) {
    return (
      <span
        title={`Last updated ${date}`}
        className={cn("inline-flex items-center gap-1 text-[10px]", stale ? "text-red-500" : "text-gray-400", className)}
      >
        <Clock size={9} className="flex-shrink-0" />
        {text}
      </span>
    );
  }

  return (
    <span
      title={`Last updated ${date}`}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium",
        stale ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-gray-50 text-gray-500",
        className,
      )}
    >
      <Clock size={11} className="flex-shrink-0" />
      {text}
      {stale && <span className="font-semibold">· stale</span>}
    </span>
  );
}

/** External source link with optional accessed-date. */
export function SourceLink({
  url,
  label = "Source",
  date,
  className,
}: {
  url: string;
  label?: string;
  date?: string;
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium transition-colors cursor-pointer",
        className,
      )}
      title={date ? `${url} · accessed ${date}` : url}
    >
      {label}
      <ExternalLink size={10} className="flex-shrink-0" />
      {date && <span className="text-gray-400 font-normal">· {date}</span>}
    </a>
  );
}
