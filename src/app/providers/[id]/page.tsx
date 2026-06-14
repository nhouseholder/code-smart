import { notFound } from "next/navigation";
import { getAllProviders, getProvider } from "@/lib/data-loader";
import { scorePlan } from "@/lib/value-scorer";
import { PlanCard } from "@/components/PlanCard";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { formatPrice } from "@/lib/utils";
import { ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return getAllProviders().map((p) => ({ id: p.id }));
}

export default async function ProviderPage({ params }: Props) {
  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) notFound();

  const scoredPlans = provider.plans
    .filter((p) => p.is_active)
    .map((plan) => ({ plan, score: scorePlan(plan, provider) }))
    .sort((a, b) => b.score.overall_value_score - a.score.overall_value_score);

  const cheapestPaid = provider.plans
    .filter((p) => p.is_active && (p.pricing.monthly_usd ?? 0) > 0)
    .sort((a, b) => (a.pricing.monthly_usd ?? Infinity) - (b.pricing.monthly_usd ?? Infinity))[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-8"
      >
        <ArrowLeft size={14} />
        All providers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">
              {provider.category.replace("_", " ")}
            </span>
            <span className="text-xs text-gray-400">{provider.headquarters_country}</span>
            {provider.founded_year && (
              <span className="text-xs text-gray-400">est. {provider.founded_year}</span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{provider.display_name}</h1>
          <p className="text-gray-500 mt-2 max-w-2xl text-sm leading-relaxed">{provider.description}</p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          <a
            href={provider.pricing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            Official pricing
            <ExternalLink size={12} />
          </a>
          <ProvenanceBadge provenance={provider.provenance} showDate />
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <Stat label="Plans" value={String(provider.plans.filter((p) => p.is_active).length)} />
        <Stat label="Models" value={String(provider.models.length)} />
        <Stat
          label="Starting at"
          value={cheapestPaid ? formatPrice(cheapestPaid.pricing.monthly_usd) : "Free only"}
        />
        <Stat label="Last verified" value={provider.last_verified} />
      </div>

      {/* Models section */}
      {provider.models.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Models</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {provider.models.map((model) => (
              <div key={model.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                <div className="font-semibold text-gray-900 text-sm mb-1">{model.display_name}</div>
                {model.context_length_k && (
                  <div className="text-xs text-gray-500 mb-2">
                    {model.context_length_k}K context
                  </div>
                )}
                {model.strengths.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {model.strengths.map((s) => (
                      <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {model.benchmarks.length > 0 && (
                  <div className="space-y-1">
                    {model.benchmarks.slice(0, 2).map((b) => (
                      <div key={b.name} className="flex justify-between text-xs">
                        <span className="text-gray-500">{b.name}</span>
                        <span className="font-medium text-gray-800 tabular-nums">
                          {b.score !== null ? `${b.score}%` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <ProvenanceBadge provenance={model.provenance} compact showDate={false} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Plans section */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Plans</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scoredPlans.map(({ plan, score }, idx) => (
            <PlanCard
              key={plan.id}
              provider={provider}
              plan={plan}
              score={score}
              featured={idx === 0}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="font-bold text-gray-900 tabular-nums">{value}</div>
    </div>
  );
}
