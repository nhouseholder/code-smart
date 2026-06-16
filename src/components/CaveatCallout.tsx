import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface Props {
  caveats: string[] | null | undefined;
  title?: string;
  className?: string;
}

/** Amber warning callout rendering a list of caveats. Renders nothing when empty. */
export function CaveatCallout({ caveats, title = "Caveats", className }: Props) {
  if (!caveats || caveats.length === 0) return null;
  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <AlertTriangle size={13} className="flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      </div>
      <ul className="space-y-1 pl-0.5">
        {caveats.map((c, i) => (
          <li key={i} className="text-[12px] leading-snug flex gap-1.5">
            <span className="text-amber-400 flex-shrink-0">•</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
