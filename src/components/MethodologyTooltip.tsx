import Link from "next/link";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Tooltip body text. */
  text: string;
  /** Anchor on /methodology to deep-link to (e.g. "intelligence-score", "token-estimation"). */
  anchor?: string;
  className?: string;
}

/**
 * Pure-CSS hover/focus tooltip (no radix). The `ⓘ` trigger links to the
 * methodology section so the explanation is reachable on touch devices too.
 */
export function MethodologyTooltip({ text, anchor, className }: Props) {
  const href = anchor ? `/methodology#${anchor}` : "/methodology";
  return (
    <span className={cn("relative inline-flex group align-middle", className)}>
      <Link
        href={href}
        aria-label={text}
        className="text-gray-400 hover:text-brand-600 focus:text-brand-600 focus:outline-none cursor-pointer transition-colors"
      >
        <Info size={13} />
      </Link>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 bottom-full z-20 mb-1.5 w-56 -translate-x-1/2",
          "rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        {text}
        <span className="block mt-1 text-[10px] text-brand-300">Read methodology →</span>
      </span>
    </span>
  );
}
