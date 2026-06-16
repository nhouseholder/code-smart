import type { Provider, Plan } from "@/types";
import type { ValueScore } from "@/types";
import { formatPrice, cn, effectiveMonthlyPrice } from "@/lib/utils";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { ProviderBadge } from "./ProviderBadge";
import { ModelBadge } from "./ModelBadge";
import { ValueScoreBar } from "./ValueScoreBar";
import { Check, X, Minus, ExternalLink, Zap } from "lucide-react";

interface Props {
  provider: Provider;
  plan: Plan;
  score: ValueScore;
  featured?: boolean;
  compact?: boolean;
}

const TIER_COLORS: Record<Plan["tier"], string> = {
  free:       "bg-gray-100 text-gray-600",
  individual: "bg-blue-50 text-blue-700",
  pro:        "bg-violet-50 text-violet-700",
  team:       "bg-emerald-50 text-emerald-700",
  enterprise: "bg-amber-50 text-amber-700",
  api:        "bg-orange-50 text-orange-700",
};

function FeatureChip({ enabled, label }: { enabled: boolean | null; label: string }) {
  if (enabled === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
        <Minus size={10} />
        {label}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]",
      enabled ? "text-gray-700" : "text-gray-300 line-through")}>
      {enabled
        ? <Check size={10} className="text-green-600 flex-shrink-0" />
        : <X size={10} className="text-gray-300 flex-shrink-0" />}
      {label}
    </span>
  );
}

export function PlanCard({ provider, plan, score, featured = false, compact = false }: Props) {
  const price = effectiveMonthlyPrice(plan);
  const isFree = price === 0;

  const topModels = plan.models
    .filter((m) => m.access_type !== "legacy")
    .slice(0, 2);

  const primaryLimit = plan.usage_limits.find(
    (l) => l.type !== "unknown" && l.type !== "unlimited"
  ) ?? plan.usage_limits[0];

  return (
    <article
      className={cn(
        "relative rounded-2xl border bg-white flex flex-col transition-all duration-200",
        featured
          ? "border-brand-500 shadow-[0_0_0_1px_#4f6ef7,0_4px_24px_rgba(79,110,247,0.12)] hover:shadow-[0_0_0_1px_#4f6ef7,0_8px_32px_rgba(79,110,247,0.18)]"
          : "border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300",
        compact ? "p-4" : "p-6",
      )}
    >
      {featured && (
        <div className="absolute -top-px left-6 flex items-center gap-1 px-2.5 py-0.5 bg-brand-600 rounded-b-md text-white text-[10px] font-semibold tracking-wide uppercase">
          <Zap size={9} className="fill-white" />
          Best Value
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <ProviderBadge providerId={provider.id} name={provider.name} href={`/providers/${provider.id}`} />
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", TIER_COLORS[plan.tier])}>
              {plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 text-[15px] leading-snug">{plan.name}</h3>
        </div>
        <ValueScoreBar score={score} showBreakdown={false} />
      </div>

      {/* Price */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "font-bold tabular-nums leading-none",
            isFree ? "text-2xl text-green-600" : "text-2xl text-gray-900"
          )}>
            {formatPrice(price)}
          </span>
          {plan.pricing.is_per_seat && (
            <span className="text-xs text-gray-400">per seat</span>
          )}
          {plan.pricing.annual_monthly_usd !== null &&
           plan.pricing.monthly_usd !== null &&
           plan.pricing.annual_monthly_usd < plan.pricing.monthly_usd && (
            <span className="text-[11px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">
              or ${plan.pricing.annual_monthly_usd}/mo annual
            </span>
          )}
        </div>
        <ProvenanceBadge provenance={plan.pricing.provenance} showDate compact />
      </div>

      {/* Usage limit */}
      {primaryLimit && (
        <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-[11px] text-gray-500 mb-0.5 font-medium uppercase tracking-wide">Usage</p>
          <p className="text-xs text-gray-700">
            {primaryLimit.type === "unlimited"
              ? "Unlimited"
              : primaryLimit.type === "unknown"
              ? "Not publicly stated"
              : primaryLimit.value !== null
              ? `${primaryLimit.value.toLocaleString()} ${primaryLimit.unit ?? primaryLimit.type.replace(/_/g, " ")}`
              : "Varies"}
          </p>
          {primaryLimit.notes && (
            <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{primaryLimit.notes}</p>
          )}
          <ProvenanceBadge provenance={primaryLimit.provenance} compact />
        </div>
      )}

      {/* Models */}
      {topModels.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Models included</p>
          <div className="flex flex-wrap gap-1.5">
            {topModels.map((mRef) => {
              const model = provider.models.find((m) => m.id === mRef.model_id);
              return (
                <ModelBadge
                  key={mRef.model_id}
                  modelId={mRef.model_id}
                  displayName={model?.display_name ?? mRef.model_id}
                  isDefault={mRef.is_default}
                  accessNote={mRef.access_type === "limited" ? "limited" : undefined}
                  href={`/models/${mRef.model_id}`}
                />
              );
            })}
            {plan.models.length > 2 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] border bg-gray-50 border-gray-200 text-gray-400">
                +{plan.models.length - 2} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Key features */}
      {!compact && (
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1">
          <FeatureChip enabled={plan.features.agent_capabilities} label="Agent / Agentic" />
          <FeatureChip enabled={plan.features.api_access} label="API Access" />
          <FeatureChip enabled={plan.features.cli_access} label="CLI" />
          <FeatureChip enabled={plan.features.web_search} label="Web Search" />
          <FeatureChip enabled={plan.features.file_uploads} label="File Uploads" />
          <FeatureChip enabled={plan.features.priority_access} label="Priority Queue" />
          {plan.features.ide_integrations.length > 0 && (
            <span className="col-span-2 text-[11px] text-gray-500">
              IDEs: {plan.features.ide_integrations.slice(0, 3).join(", ")}
              {plan.features.ide_integrations.length > 3 && ` +${plan.features.ide_integrations.length - 3}`}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          Verified {plan.last_verified}
        </span>
        <a
          href={plan.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium transition-colors"
        >
          View plan
          <ExternalLink size={10} />
        </a>
      </div>
    </article>
  );
}
