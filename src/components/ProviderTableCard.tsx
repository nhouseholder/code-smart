import Link from "next/link";
import { ProviderLogo } from "./ProviderLogo";
import { AAIndexBadge } from "./AAIndexBadge";
import type { Provider, PlanTier } from "@/types";

function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1f1e6))
    .join("");
}

function formatPrice(monthly: number | null): string {
  if (monthly === null) return "Custom";
  if (monthly === 0) return "Free";
  return `$${monthly}/mo`;
}

function getBestCodingIndex(provider: Provider): number | null {
  let best: number | null = null;
  for (const model of provider.models) {
    for (const b of model.benchmarks) {
      if (b.name === "AA Coding Index" && typeof b.score === "number") {
        if (best === null || b.score > best) best = b.score;
      }
    }
  }
  return best;
}

interface Props {
  provider: Provider;
  globalTiers: PlanTier[];
}

export function ProviderTableCard({ provider, globalTiers }: Props) {
  const plansByTier = Object.fromEntries(provider.plans.map((p) => [p.tier, p]));
  const codingIndex = getBestCodingIndex(provider);
  const desc =
    provider.description.length > 80
      ? provider.description.slice(0, 80) + "…"
      : provider.description;
  const flag = countryFlag(provider.headquarters_country);

  return (
    <Link
      href={`/providers/${provider.id}`}
      className="block bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-gray-300 hover:shadow-md transition-all duration-200"
    >
      {/* Header */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ProviderLogo providerId={provider.id} name={provider.display_name} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">{provider.display_name}</span>
              <span className="text-base leading-none">{flag}</span>
              {codingIndex !== null && <AAIndexBadge value={codingIndex} suffix="" />}
              {provider.models.length > 0 && (
                <span className="text-xs text-gray-400">{provider.models.length} models</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
          </div>
        </div>
        <span className="text-xs text-brand-600 whitespace-nowrap font-medium flex-shrink-0 pt-0.5">
          View →
        </span>
      </div>

      {/* Tier table */}
      {provider.plans.length === 0 ? (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-400 italic">
            No subscription plans — API/open-weight only
          </p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block border-t border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {globalTiers.map((tier) => (
                    <th
                      key={tier}
                      className="px-3 py-2 text-left font-medium text-gray-500 capitalize"
                    >
                      {tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {globalTiers.map((tier) => {
                    const plan = plansByTier[tier];
                    if (!plan) {
                      return (
                        <td key={tier} className="px-3 py-2 text-gray-300">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={tier} className="px-3 py-2 align-top">
                        <div className="font-medium text-gray-700">
                          {formatPrice(plan.pricing.monthly_usd)}
                        </div>
                        <div className="text-gray-400 mt-0.5 space-y-0.5">
                          {plan.models.slice(0, 2).map((m) => (
                            <div key={m.model_id} className="truncate max-w-[120px]">
                              {m.model_id}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile stacked */}
          <div className="md:hidden px-4 pb-3 border-t border-gray-100 pt-2 space-y-1">
            {provider.plans.map((plan) => (
              <div key={plan.id} className="flex items-center gap-2 text-xs">
                <span className="capitalize text-gray-500 w-20 flex-shrink-0">{plan.tier}</span>
                <span className="text-gray-700 font-medium">
                  {formatPrice(plan.pricing.monthly_usd)}
                </span>
                {plan.models[0] && (
                  <span className="text-gray-400 truncate">{plan.models[0].model_id}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Link>
  );
}
