import { cn } from "@/lib/utils";
import { uncertaintyTier } from "@/lib/utils";
import { AlertTriangle, AlertCircle } from "lucide-react";

interface Props {
  score: number | null | undefined;
  className?: string;
}

/**
 * §9 uncertainty indicator. Renders ONLY when score > 50 (lower scores aren't
 * worth surfacing). Orange for 50–74, red ⚠ for 75–100.
 */
export function UncertaintyScore({ score, className }: Props) {
  const tier = uncertaintyTier(score);
  if (tier !== "elevated" && tier !== "high") return null;

  const high = tier === "high";
  const Icon = high ? AlertTriangle : AlertCircle;
  return (
    <span
      title={`Uncertainty ${score}/100 — figures rely on estimates or undisclosed data`}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium tabular-nums",
        high ? "border-red-200 bg-red-50 text-red-700" : "border-orange-200 bg-orange-50 text-orange-700",
        className,
      )}
    >
      <Icon size={11} className="flex-shrink-0" />
      Uncertainty {score}
    </span>
  );
}
