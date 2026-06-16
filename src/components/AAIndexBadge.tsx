import { cn } from "@/lib/utils";

/** Color band for an Artificial Analysis index value (0–100 scale). */
export function aaIndexColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-gray-400";
  if (value >= 70) return "text-green-600";
  if (value >= 50) return "text-amber-600";
  return "text-red-500";
}

interface Props {
  value: number | null | undefined;
  /** Always carries the "AA" provenance prefix per domain rule. */
  showPrefix?: boolean;
  suffix?: string;
  className?: string;
}

/** AA-sourced index value. null → "—" (never "0"). Always AA-prefixed. */
export function AAIndexBadge({ value, showPrefix = true, suffix, className }: Props) {
  const isNull = value === null || value === undefined;
  return (
    <span className={cn("inline-flex items-baseline gap-1 tabular-nums font-semibold", aaIndexColor(value), className)}>
      {showPrefix && <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">AA</span>}
      <span>{isNull ? "—" : value}{!isNull && suffix}</span>
    </span>
  );
}
