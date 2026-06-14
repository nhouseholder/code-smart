import type { Provider, Plan } from "@/types";
import type { ValueScore } from "@/types";
import { formatPrice, cn } from "@/lib/utils";
import { effectiveMonthlyPrice } from "@/lib/data-loader";
import { Check, X, Minus } from "lucide-react";

interface Entry {
  provider: Provider;
  plan: Plan;
  score: ValueScore;
}

interface Props {
  entries: Entry[];
}

type FeatureRow =
  | { kind: "section"; label: string }
  | { kind: "feature"; label: string; render: (entry: Entry) => React.ReactNode };

function Bool({ value }: { value: boolean }) {
  return value
    ? <Check size={14} className="text-green-600 mx-auto" />
    : <X size={14} className="text-gray-200 mx-auto" />;
}

function Maybe({ value }: { value: boolean | null | undefined }) {
  if (value === null || value === undefined) return <Minus size={14} className="text-gray-300 mx-auto" />;
  return <Bool value={value} />;
}

const ROWS: FeatureRow[] = [
  { kind: "section", label: "Pricing" },
  {
    kind: "feature", label: "Monthly price",
    render: ({ plan }) => (
      <span className={cn("font-semibold tabular-nums text-sm",
        effectiveMonthlyPrice(plan) === 0 ? "text-green-600" : "text-gray-900")}>
        {formatPrice(effectiveMonthlyPrice(plan))}
      </span>
    ),
  },
  {
    kind: "feature", label: "Annual price",
    render: ({ plan }) => plan.pricing.annual_monthly_usd
      ? <span className="text-sm tabular-nums text-gray-700">${plan.pricing.annual_monthly_usd}/mo</span>
      : <Minus size={14} className="text-gray-300 mx-auto" />,
  },
  {
    kind: "feature", label: "Per seat",
    render: ({ plan }) => <Bool value={plan.pricing.is_per_seat} />,
  },
  { kind: "section", label: "Value Score" },
  {
    kind: "feature", label: "Overall score",
    render: ({ score }) => (
      <span className={cn("font-bold text-sm tabular-nums",
        score.overall_value_score >= 75 ? "text-green-600" :
        score.overall_value_score >= 55 ? "text-blue-600" :
        score.overall_value_score >= 35 ? "text-amber-600" : "text-red-500")}>
        {score.overall_value_score}/100
      </span>
    ),
  },
  {
    kind: "feature", label: "Benchmark index",
    render: ({ score }) => score.benchmark_quality_index !== null
      ? <span className="text-sm tabular-nums text-gray-700">{score.benchmark_quality_index}/100</span>
      : <Minus size={14} className="text-gray-300 mx-auto" />,
  },
  { kind: "section", label: "Usage Limits" },
  {
    kind: "feature", label: "Usage type",
    render: ({ plan }) => {
      const limit = plan.usage_limits[0];
      if (!limit) return <Minus size={14} className="text-gray-300 mx-auto" />;
      if (limit.type === "unlimited") return <span className="text-xs text-green-600 font-medium">Unlimited</span>;
      if (limit.type === "unknown") return <span className="text-xs text-gray-400 italic">Not disclosed</span>;
      return <span className="text-xs text-gray-600">{limit.type.replace(/_/g, " ")}</span>;
    },
  },
  { kind: "section", label: "Features" },
  {
    kind: "feature", label: "Agent / Agentic",
    render: ({ plan }) => <Bool value={plan.features.agent_capabilities} />,
  },
  {
    kind: "feature", label: "Web search",
    render: ({ plan }) => <Bool value={plan.features.web_search} />,
  },
  {
    kind: "feature", label: "File uploads",
    render: ({ plan }) => <Bool value={plan.features.file_uploads} />,
  },
  {
    kind: "feature", label: "CLI access",
    render: ({ plan }) => <Bool value={plan.features.cli_access} />,
  },
  {
    kind: "feature", label: "API access",
    render: ({ plan }) => <Bool value={plan.features.api_access} />,
  },
  {
    kind: "feature", label: "Priority queue",
    render: ({ plan }) => <Bool value={plan.features.priority_access} />,
  },
  {
    kind: "feature", label: "Custom instructions",
    render: ({ plan }) => <Bool value={plan.features.custom_instructions} />,
  },
  {
    kind: "feature", label: "Team features",
    render: ({ plan }) => <Bool value={plan.features.team_features} />,
  },
  {
    kind: "feature", label: "SSO",
    render: ({ plan }) => <Bool value={plan.features.sso} />,
  },
  {
    kind: "feature", label: "IDE integrations",
    render: ({ plan }) => plan.features.ide_integrations.length > 0
      ? <span className="text-xs text-gray-600 text-center block">{plan.features.ide_integrations.length} IDEs</span>
      : <Minus size={14} className="text-gray-300 mx-auto" />,
  },
  {
    kind: "feature", label: "Context length",
    render: ({ plan }) => plan.features.code_context_length_k
      ? <span className="text-xs tabular-nums text-gray-600">{plan.features.code_context_length_k}K</span>
      : <Minus size={14} className="text-gray-300 mx-auto" />,
  },
];

export function ComparisonTable({ entries }: Props) {
  if (entries.length === 0) return null;

  // Limit to 6 plans max for readability
  const displayed = entries.slice(0, 6);

  return (
    <section id="compare" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Side-by-Side Comparison</h2>
      <p className="text-sm text-gray-500 mb-6">
        Showing top {displayed.length} plans by value score.{" "}
        {entries.length > 6 && `Filter above to narrow to specific tiers.`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40 sticky left-0 bg-gray-50 z-10">
                Feature
              </th>
              {displayed.map(({ provider, plan }) => (
                <th key={plan.id} className="py-3 px-3 text-center min-w-[120px]">
                  <div className="font-semibold text-gray-900 text-xs leading-tight">{plan.name}</div>
                  <div className="text-[10px] text-gray-400 font-normal mt-0.5">{provider.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => {
              if (row.kind === "section") {
                return (
                  <tr key={`section-${i}`} className="bg-gray-50/50">
                    <td
                      colSpan={displayed.length + 1}
                      className="py-2 px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-t border-gray-100 sticky left-0"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={row.label}
                  className="border-t border-gray-100 even:bg-gray-50/30 hover:bg-blue-50/20 transition-colors"
                >
                  <td className="py-2.5 px-4 text-xs text-gray-600 font-medium sticky left-0 bg-inherit">
                    {row.label}
                  </td>
                  {displayed.map((entry) => (
                    <td key={entry.plan.id} className="py-2.5 px-3 text-center">
                      {row.render(entry)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
