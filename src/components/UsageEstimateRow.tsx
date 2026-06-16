import type { Confidence } from "@/types";
import { formatTokens, cn } from "@/lib/utils";
import { ConfidenceBadge } from "./ProvenanceBadge";
import { MethodologyTooltip } from "./MethodologyTooltip";

interface Props {
  label: string;
  /** Token estimate; null renders "—" (never "0"). */
  tokens: number | null | undefined;
  confidence?: Confidence;
  /** Show the "How is this estimated?" methodology link. */
  showHowLink?: boolean;
  className?: string;
}

/**
 * One estimated usage window. Forthright-about-uncertainty: estimate is labeled,
 * carries a confidence badge, and links to the token-estimation methodology.
 */
export function UsageEstimateRow({ label, tokens, confidence, showHowLink = true, className }: Props) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0", className)}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm text-gray-600">{label}</span>
        {showHowLink && (
          <MethodologyTooltip text="Estimated, not guaranteed. See how token budgets are derived from observed usage limits." anchor="token-estimation" />
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          {formatTokens(tokens)}
          {tokens != null && <span className="text-gray-400 font-normal"> tok</span>}
        </span>
        {confidence && <ConfidenceBadge confidence={confidence} className="scale-90 origin-right" />}
      </div>
    </div>
  );
}
