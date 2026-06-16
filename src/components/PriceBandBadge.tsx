import { cn } from "@/lib/utils";

export type PriceBand = "free" | "low" | "mid" | "high";

const BAND: Record<PriceBand, { label: string; cls: string }> = {
  free: { label: "Free", cls: "border-green-200 bg-green-50 text-green-700" },
  low: { label: "Low $0–30", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  mid: { label: "Mid $30–80", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  high: { label: "High $80+", cls: "border-amber-200 bg-amber-50 text-amber-700" },
};

export function PriceBandBadge({
  band,
  showRange = false,
  className,
}: {
  band: PriceBand;
  /** Show the dollar range; otherwise just the tier name. */
  showRange?: boolean;
  className?: string;
}) {
  const b = BAND[band];
  const label = showRange ? b.label : b.label.split(" ")[0];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium select-none",
        b.cls,
        className,
      )}
    >
      {label}
    </span>
  );
}
