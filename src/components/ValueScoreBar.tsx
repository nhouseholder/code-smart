import type { ValueScore } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  score: ValueScore;
  showBreakdown?: boolean;
}

function ScoreRing({ value, size = 48 }: { value: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const color =
    value >= 75 ? "#16a34a" :
    value >= 55 ? "#2563eb" :
    value >= 35 ? "#d97706" :
    "#dc2626";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#e5e7eb" strokeWidth={5}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.26} fontWeight={700}
        fill={color}
      >
        {value}
      </text>
    </svg>
  );
}

export function ValueScoreBar({ score, showBreakdown = false }: Props) {
  return (
    <div className="flex items-start gap-4">
      <ScoreRing value={score.overall_value_score} />
      {showBreakdown && (
        <div className="flex-1 space-y-1.5 text-xs">
          <BreakdownBar label="Cost" value={score.score_breakdown.cost_score} color="bg-green-500" />
          <BreakdownBar label="Benchmarks" value={score.score_breakdown.benchmark_score} color="bg-blue-500" />
          <BreakdownBar label="Features" value={score.score_breakdown.feature_score} color="bg-purple-500" />
          {score.notes.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-1">{score.notes[0]}</p>
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-700 tabular-nums">{value}</span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}
