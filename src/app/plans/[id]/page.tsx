import * as fs from "node:fs";
import * as path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPlans } from "@/lib/data-loader";
import { effectiveMonthlyPrice, formatPrice, formatTokens, effectiveConfidence } from "@/lib/utils";
import type { ModelValueEstimate, UsageLimit, Plan, Provider } from "@/types";
import { ProviderBadge } from "@/components/ProviderBadge";
import { ModelBadge } from "@/components/ModelBadge";
import { PriceBandBadge, type PriceBand } from "@/components/PriceBandBadge";
import { ConfidenceBadge, SourceLink } from "@/components/ProvenanceBadge";
import { UsageEstimateRow } from "@/components/UsageEstimateRow";
import { CaveatCallout } from "@/components/CaveatCallout";
import { CalculationExplainer } from "@/components/CalculationExplainer";
import { MethodologyTooltip } from "@/components/MethodologyTooltip";

export const dynamic = "force-static";

export function generateStaticParams() {
  return getAllPlans().map(({ plan }) => ({ id: plan.id }));
}

/** Build-time read of the engine's per-plan value estimates. Absent → empty. */
function loadEstimates(): Record<string, ModelValueEstimate[]> {
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public", "data", "model-value-estimates.json"),
      "utf8",
    );
    return (JSON.parse(raw) as { estimates: Record<string, ModelValueEstimate[]> }).estimates ?? {};
  } catch {
    return {};
  }
}

function bandOf(price: number | null): PriceBand {
  if (price === null) return "high";
  if (price === 0) return "free";
  if (price <= 30) return "low";
  if (price <= 80) return "mid";
  return "high";
}

/** Human-readable observed limit value. null/unknown → never a bare 0. */
function limitValue(l: UsageLimit): string {
  if (l.type === "unknown" || l.value === null) return "—";
  const unit = l.unit ? ` ${l.unit}` : "";
  return `${l.value.toLocaleString()}${unit}`;
}

function resolve(id: string): { provider: Provider; plan: Plan } | null {
  return getAllPlans().find(({ plan }) => plan.id === id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = resolve(id);
  if (!found) return { title: "Plan — Code Smart" };
  return {
    title: `${found.plan.name} — Code Smart`,
    description: `Pricing, models, observed usage limits and quality-adjusted value estimates for ${found.plan.name}.`,
  };
}

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = resolve(id);
  if (!found) notFound();
  const { provider, plan } = found;

  const monthly = effectiveMonthlyPrice(plan);
  const band = bandOf(monthly);
  const nameById = new Map(provider.models.map((m) => [m.id, m.display_name]));

  const estimates = (loadEstimates()[plan.id] ?? []).slice();
  // Engine sorts by WMQ desc; the top row powers the worked calculation example.
  const topEstimate = estimates[0] ?? null;
  const allNotes = [...new Set(estimates.flatMap((e) => e.notes))];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      {/* Header */}
      <header className="space-y-3">
        <Link href="/compare" className="text-sm text-brand-600 hover:text-brand-700 transition-colors">← Compare plans</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">{plan.name}</h1>
          <ProviderBadge providerId={provider.id} name={provider.name} href={`/providers/${provider.id}`} />
          <PriceBandBadge band={band} />
        </div>
        <p className="text-sm text-gray-500 capitalize">{plan.tier} tier · last verified {plan.last_verified}</p>
      </header>

      {/* Pricing */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Monthly</div>
            <div className="text-2xl font-bold tabular-nums text-gray-900">
              {plan.pricing.monthly_usd === null ? "—" : formatPrice(plan.pricing.monthly_usd)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Annual (per month)</div>
            <div className="text-2xl font-bold tabular-nums text-gray-900">
              {plan.pricing.annual_monthly_usd === null ? "—" : formatPrice(plan.pricing.annual_monthly_usd)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Billing</div>
            <div className="text-sm text-gray-700 pt-1">
              {plan.pricing.is_per_seat ? "Per seat" : "Flat"}
              {plan.pricing.trial_days ? ` · ${plan.pricing.trial_days}-day trial` : ""}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <ConfidenceBadge confidence={effectiveConfidence(plan.pricing.provenance)} />
          <SourceLink url={plan.pricing.provenance.url} date={plan.pricing.provenance.accessed_date} />
        </div>
        {plan.pricing.notes && <p className="text-[12px] text-gray-400 mt-2">{plan.pricing.notes}</p>}
      </section>

      {/* Models */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Models available</h2>
        {plan.models.length === 0 ? (
          <p className="text-sm text-gray-500">No models listed for this plan.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {plan.models.map((m) => (
              <ModelBadge
                key={m.model_id}
                modelId={m.model_id}
                displayName={nameById.get(m.model_id) ?? m.model_id}
                isDefault={m.is_default}
                accessNote={m.access_type === "full" ? undefined : m.access_type}
                href={`/models/${m.model_id}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Observed usage limits */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
          Observed usage limits
          <MethodologyTooltip text="Raw limits as disclosed by the provider. These are the source data — not the estimates below." anchor="confidence" />
        </h2>
        <p className="text-sm text-gray-500 mb-4">As disclosed by the provider, with provenance.</p>
        {plan.usage_limits.length === 0 ? (
          <p className="text-sm text-gray-500">No usage limits disclosed.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2.5 px-3 text-left">Limit</th>
                  <th className="py-2.5 px-3 text-left">Value</th>
                  <th className="py-2.5 px-3 text-left">Applies to</th>
                  <th className="py-2.5 px-3 text-left">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Source</th>
                </tr>
              </thead>
              <tbody>
                {plan.usage_limits.map((l, i) => (
                  <tr key={`${l.type}-${i}`} className="border-t border-gray-100 even:bg-gray-50/40">
                    <td className="py-2.5 px-3 text-gray-700">{l.type.replace(/_/g, " ")}</td>
                    <td className="py-2.5 px-3 font-semibold tabular-nums text-gray-900">
                      {(l.type === "unknown" || l.value === null) ? (
                        <span>
                          <span className="text-gray-400">—</span>
                          {l.notes && (
                            <span className="block text-xs font-normal text-gray-400 mt-0.5 italic">{l.notes}</span>
                          )}
                        </span>
                      ) : limitValue(l)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">{l.applies_to ?? "—"}</td>
                    <td className="py-2.5 px-3"><ConfidenceBadge confidence={effectiveConfidence(l.provenance)} /></td>
                    <td className="py-2.5 px-3 text-right"><SourceLink url={l.provenance.url} date={l.provenance.accessed_date} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Estimated quality-adjusted usage */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
          Estimated value
          <MethodologyTooltip text="Estimates, not guarantees: token budgets derived from the observed limits above, then quality-adjusted." anchor="token-estimation" />
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Per-model monthly estimates. <em>Estimated, not guaranteed</em> — every figure carries a confidence level.
        </p>
        {estimates.length === 0 ? (
          <p className="text-sm text-gray-500">No value estimates available for this plan.</p>
        ) : (
          <div className="space-y-4">
            {estimates.map((e) => (
              <div key={e.modelId} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <ModelBadge
                    modelId={e.modelId}
                    displayName={nameById.get(e.modelId) ?? e.modelId}
                    href={`/models/${e.modelId}`}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">WMQ</span>
                    <span className="text-sm font-semibold tabular-nums text-gray-900">
                      {e.weighted_model_quality == null ? "—" : `${e.weighted_model_quality}/100`}
                    </span>
                    <ConfidenceBadge confidence={e.confidence} className="scale-90 origin-right" />
                  </div>
                </div>
                <UsageEstimateRow label="Estimated tokens / month" tokens={e.estimated_tokens_1mo} confidence={e.confidence} />
                <UsageEstimateRow label="Quality-adjusted / month (QAMU)" tokens={e.quality_adjusted_tokens_1mo} confidence={e.confidence} showHowLink={false} />
                {e.model_adjusted_tokens_1mo != null && (
                  <UsageEstimateRow label="Model-cost-adjusted / month" tokens={e.model_adjusted_tokens_1mo} confidence={e.confidence} showHowLink={false} />
                )}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
                  <span className="text-sm text-gray-600">Value Score</span>
                  <span className="text-sm font-bold tabular-nums text-brand-700">
                    {e.value_score == null ? "—" : `${e.value_score}/100`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {topEstimate && (
          <CalculationExplainer
            className="mt-5"
            weightedModelQuality={topEstimate.weighted_model_quality}
            estimatedMonthlyTokens={topEstimate.estimated_tokens_1mo}
            modelAdjustedMonthlyTokens={topEstimate.model_adjusted_tokens_1mo}
            qualityAdjustedMonthlyUsage={topEstimate.quality_adjusted_tokens_1mo}
            monthlyPriceUsd={monthly}
            valueScoreRaw={null}
            valueScore={topEstimate.value_score}
            defaultOpen
          />
        )}

        {allNotes.length > 0 && <CaveatCallout caveats={allNotes} className="mt-4" />}
      </section>
    </div>
  );
}
