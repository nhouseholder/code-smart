import { cn } from "@/lib/utils";

export interface SparkPoint {
  date: string;
  value: number;
}

interface Props {
  points: SparkPoint[] | null | undefined;
  label?: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Native-SVG trend line (no chart lib). Honest about thin history: fewer than
 * 3 points renders "Not enough history" instead of a misleading line.
 */
export function BenchmarkSparkline({ points, label, width = 160, height = 40, className }: Props) {
  const pts = points ?? [];
  if (pts.length < 3) {
    return (
      <div className={cn("text-[11px] text-gray-400 italic", className)} style={{ width }}>
        Not enough history
      </div>
    );
  }

  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const coords = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * w;
    const y = pad + h - ((p.value - min) / range) * h;
    return { x, y };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const rising = values[values.length - 1] >= values[0];
  const stroke = rising ? "#16a34a" : "#dc2626";

  return (
    <div className={className}>
      <svg width={width} height={height} role="img" aria-label={label ?? "AA benchmark trend"} className="overflow-visible">
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
      </svg>
      {label && <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>}
    </div>
  );
}
