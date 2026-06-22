import type { RadarProfile } from "@/lib/radar";

const COLORS = [
  "#3b5af5", // brand blue
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

const AXES = ["Intelligence", "Coding", "Agentic", "Speed", "Affordability"];
const N = AXES.length;
const RINGS = [25, 50, 75, 100];

function polar(cx: number, cy: number, r: number, i: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / N;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function profileToPoints(cx: number, cy: number, maxR: number, profile: RadarProfile): string {
  return profile.axes
    .map((axis, i) => {
      const [x, y] = polar(cx, cy, maxR * (axis.value / 100), i);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

interface Props {
  profiles: RadarProfile[];
  size?: number;
}

export function ModelRadarChart({ profiles, size = 380 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const labelR = maxR + 22;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="mx-auto block max-w-full"
        role="img"
        aria-label="Radar chart comparing AI model benchmarks"
      >
        {/* Concentric rings */}
        {RINGS.map((pct) => (
          <polygon
            key={pct}
            points={Array.from({ length: N }, (_, i) => {
              const [x, y] = polar(cx, cy, maxR * (pct / 100), i);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(" ")}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* Ring labels (50, 100) */}
        {[50, 100].map((pct) => {
          const [x, y] = polar(cx, cy, maxR * (pct / 100), 0);
          return (
            <text
              key={pct}
              x={x + 4}
              y={y - 3}
              fontSize="9"
              fill="#9ca3af"
              textAnchor="start"
            >
              {pct}
            </text>
          );
        })}

        {/* Spokes */}
        {Array.from({ length: N }, (_, i) => {
          const [x, y] = polar(cx, cy, maxR, i);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="1" />;
        })}

        {/* Axis labels */}
        {AXES.map((label, i) => {
          const [x, y] = polar(cx, cy, labelR, i);
          const anchor = x < cx - 4 ? "end" : x > cx + 4 ? "start" : "middle";
          return (
            <text
              key={label}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              fontSize="11"
              fontWeight="600"
              fill="#374151"
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {label}
            </text>
          );
        })}

        {/* Model polygons */}
        {profiles.map((profile, idx) => {
          const color = COLORS[idx % COLORS.length];
          return (
            <polygon
              key={profile.modelId}
              points={profileToPoints(cx, cy, maxR, profile)}
              fill={color}
              fillOpacity={0.12}
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
            >
              <title>{profile.name}: {profile.axes.map(a => `${a.label} ${a.value}`).join(", ")}</title>
            </polygon>
          );
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill="#d1d5db" />
      </svg>

      {/* Legend */}
      {profiles.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3">
          {profiles.map((profile, idx) => (
            <div key={profile.modelId} className="flex items-center gap-1.5 text-xs text-gray-700">
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
              />
              {profile.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
