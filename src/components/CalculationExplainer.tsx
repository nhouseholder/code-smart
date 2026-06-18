import { formatTokens, formatPrice, cn } from "@/lib/utils";
import { MethodologyTooltip } from "./MethodologyTooltip";

interface Props {
  weightedModelQuality: number | null;
  estimatedMonthlyTokens: number | null;
  modelAdjustedMonthlyTokens: number | null;
  qualityAdjustedMonthlyUsage: number | null; // Quality-adjusted tokens
  monthlyPriceUsd: number | null;
  valueScoreRaw: number | null;
  valueScore: number | null;
  /** Start expanded (detail pages) or collapsed (inline). */
  defaultOpen?: boolean;
  className?: string;
}

function Step({ n, label, value, note }: { n: number; label: string; value: string; note?: string }) {
  return (
    <li className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-700">{label}</span>
          <span className="text-sm font-semibold tabular-nums text-gray-900 flex-shrink-0">{value}</span>
        </div>
        {note && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{note}</p>}
      </div>
    </li>
  );
}

/** Transparent derivation with the row's real numbers. */
export function CalculationExplainer(props: Props) {
  const {
    weightedModelQuality,
    estimatedMonthlyTokens,
    modelAdjustedMonthlyTokens,
    qualityAdjustedMonthlyUsage,
    monthlyPriceUsd,
    valueScoreRaw,
    valueScore,
    defaultOpen = false,
    className,
  } = props;

  return (
    <details open={defaultOpen} className={cn("rounded-xl border border-gray-200 bg-white group", className)}>
      <summary className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none list-none">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          How Value per Intelligence per Task is calculated
          <MethodologyTooltip text="The full formula and constants are documented in the methodology." anchor="intelligence-score" />
        </span>
        <span className="text-xs text-brand-600 group-open:hidden">Show steps</span>
        <span className="text-xs text-brand-600 hidden group-open:inline">Hide</span>
      </summary>

      <ol className="px-4 pb-4">
        <Step
          n={1}
          label="Intelligence Score"
          value={weightedModelQuality == null ? "—" : `${weightedModelQuality}/100`}
          note="50% AA agentic + 40% AA coding + 10% AA speed."
        />
        <Step
          n={2}
          label="Estimated monthly tokens"
          value={formatTokens(estimatedMonthlyTokens)}
          note="Normalized from the plan's observed usage limits — an estimate, not a guarantee."
        />
        <Step
          n={3}
          label="Model-adjusted tokens"
          value={formatTokens(modelAdjustedMonthlyTokens)}
          note="Tokens scaled for the model's relative efficiency."
        />
        <Step
          n={4}
          label="Intelligence-adjusted capacity"
          value={formatTokens(qualityAdjustedMonthlyUsage)}
          note="Tokens × (Intelligence Score / 100)."
        />
        <Step
          n={5}
          label="Per dollar"
          value={monthlyPriceUsd == null ? "—" : formatPrice(monthlyPriceUsd)}
          note="Intelligence-adjusted capacity ÷ monthly price = raw value."
        />
        <Step
          n={6}
          label="Raw value"
          value={valueScoreRaw == null ? "—" : valueScoreRaw.toLocaleString()}
          note="Intelligence-adjusted capacity per dollar before normalization."
        />
        <Step
          n={7}
          label="Normalized Value per Intelligence per Task"
          value={valueScore == null ? "—" : `${valueScore}/100`}
          note="Scaled to 0–100 against a reference of 1M quality-adjusted tokens at $20/mo."
        />
      </ol>
    </details>
  );
}
