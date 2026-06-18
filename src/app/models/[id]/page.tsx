import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getModelsApi, getRankings, getAllPlans } from "@/lib/data-loader";
import type { ModelRow, PlanModelRow, BestPlansForModel } from "@/lib/rankings";
import { MetricCard } from "@/components/MetricCard";
import { BenchmarkSparkline } from "@/components/BenchmarkSparkline";
import { RankingCard } from "@/components/RankingCard";
import { ProviderBadge } from "@/components/ProviderBadge";
import { CaveatCallout } from "@/components/CaveatCallout";
import { MethodologyTooltip } from "@/components/MethodologyTooltip";

export const dynamic = "force-static";

/** Every model id that has a page: canonical models + any id referenced by the rankings. */
export function generateStaticParams() {
  const ids = new Set<string>();
  for (const m of getModelsApi()) ids.add(m.id);
  const { rankings } = getRankings();
  for (const arr of [rankings.byIntelligence, rankings.byCoding, rankings.byAgentic, rankings.byWeightedQuality]) {
    for (const r of arr as ModelRow[]) ids.add(r.modelId);
  }
  for (const b of rankings.bestPlansPerModel as BestPlansForModel[]) ids.add(b.modelId);
  return [...ids].map((id) => ({ id }));
}

function resolve(id: string) {
  const model = getModelsApi().find((m) => m.id === id) ?? null;
  const { rankings } = getRankings();
  const find = (arr: ModelRow[]) => arr.find((r) => r.modelId === id) ?? null;
  const metrics = {
    intelligence: find(rankings.byIntelligence as ModelRow[]),
    coding: find(rankings.byCoding as ModelRow[]),
    agentic: find(rankings.byAgentic as ModelRow[]),
    wmq: find(rankings.byWeightedQuality as ModelRow[]),
  };
  const best = (rankings.bestPlansPerModel as BestPlansForModel[]).find((b) => b.modelId === id) ?? null;
  // Any ranking row gives us a display name / provider fallback when not in models.json.
  const anyRow = metrics.wmq ?? metrics.intelligence ?? metrics.coding ?? metrics.agentic;
  return { model, metrics, best, anyRow };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { model, anyRow } = resolve(id);
  const name = model?.display_name ?? anyRow?.modelDisplayName ?? id;
  return { title: `${name} — Code Smart`, description: `AA benchmark indices and best-value plans for ${name}.` };
}

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { model, metrics, best, anyRow } = resolve(id);
  if (!model && !anyRow && !best) notFound();

  const displayName = model?.display_name ?? anyRow?.modelDisplayName ?? id;
  const providerId = model?.provider_id ?? anyRow?.providerId ?? "";
  const providerName = model?.providerName ?? anyRow?.providerName ?? providerId;
  const confidence = metrics.wmq?.confidence ?? metrics.intelligence?.confidence ?? "unknown";

  // Plans that offer this model (canonical id match).
  const offering = getAllPlans().filter((e) => e.plan.models.some((m) => m.model_id === id));

  const bestOptions: Array<{ label: string; row: PlanModelRow | null }> = [
    { label: "Best low-cost", row: best?.bestLowCost ?? null },
    { label: "Best mid-tier", row: best?.bestMidCost ?? null },
    { label: "Best high-end", row: best?.bestHighCost ?? null },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <header className="space-y-3">
        <Link href="/models" className="text-sm text-brand-600 hover:text-brand-700 transition-colors">← All models</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
          {providerId && <ProviderBadge providerId={providerId} name={providerName} href={`/providers/${providerId}`} />}
        </div>
        {(() => {
          const m = model as { family?: string; context_length_k?: number | null } | null;
          if (!m?.family) return null;
          return <p className="text-sm text-gray-500">Family: {m.family}{m.context_length_k ? ` · ${m.context_length_k}K context` : ""}</p>;
        })()}
      </header>

      {/* AA metrics */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          AA benchmark indices
          <MethodologyTooltip text="Indices from Artificial Analysis. Intelligence score = 50% agentic + 40% coding + 10% speed." anchor="intelligence-score" />
        </h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Intelligence score" value={metrics.wmq?.metricValue ?? null} confidence={confidence} hint="Intelligence score composite" />
          <MetricCard label="Intelligence" value={metrics.intelligence?.metricValue ?? null} confidence={metrics.intelligence?.confidence} />
          <MetricCard label="Coding" value={metrics.coding?.metricValue ?? null} confidence={metrics.coding?.confidence} />
          <MetricCard label="Agentic" value={metrics.agentic?.metricValue ?? null} confidence={metrics.agentic?.confidence} />
        </div>
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AA quality trend</div>
          <BenchmarkSparkline points={null} label="Single snapshot — history accrues over time" />
        </div>
      </section>

      {/* Best plan options */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Best-value plans for this model</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bestOptions.map(({ label, row }) => (
            <div key={label}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</div>
              {row ? (
                <RankingCard row={row} />
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-400 h-full flex items-center">
                  No plan offers this model in this band.
                </div>
              )}
            </div>
          ))}
        </div>
        {best?.caveats && best.caveats.length > 0 && <CaveatCallout caveats={best.caveats} className="mt-4" />}
      </section>

      {/* Available plans */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Plans offering {displayName}</h2>
        {offering.length === 0 ? (
          <p className="text-sm text-gray-500">No plan in the dataset lists this exact model id.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {offering.map(({ provider, plan }) => {
              const ref = plan.models.find((m) => m.model_id === id);
              return (
                <li key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/plans/${plan.id}`} className="font-medium text-gray-900 hover:text-brand-700 transition-colors">
                      {plan.name}
                    </Link>
                    <span className="block text-[11px] text-gray-400">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ref?.is_default && <span className="text-[10px] font-medium text-brand-700 bg-brand-50 rounded px-1.5 py-0.5">default</span>}
                    {ref?.access_type && <span className="text-xs text-gray-500">{ref.access_type}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
