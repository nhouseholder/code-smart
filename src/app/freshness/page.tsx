import type { Metadata } from "next";
import Link from "next/link";
import { getAllProviders, getAllPlans, getMethodologyMeta, getRankings } from "@/lib/data-loader";
import { daysAgo, isStale } from "@/lib/utils";
import { FreshnessBadge, ConfidenceBadge, SourceLink } from "@/components/ProvenanceBadge";
import type { PlanModelRow } from "@/lib/rankings";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Data freshness — Code Smart",
  description: "When each data source was last verified, which sources are stale, and which figures rest on assumptions that need review.",
};

const AA_STALE_DAYS = 14;
const PROVIDER_STALE_DAYS = 90;

export default function FreshnessPage() {
  const meta = getMethodologyMeta();
  const providers = getAllProviders();
  const { rankings } = getRankings();

  // Provider verification, oldest first.
  const providerRows = providers
    .map((p) => ({ id: p.id, name: p.name, date: p.last_verified, stale: isStale(p.last_verified) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const staleProviders = providerRows.filter((r) => r.stale);

  // AA snapshot freshness: oldest aa source date carried by any ranking row.
  const aaDates = (["low", "mid", "high"] as const)
    .flatMap((b) => rankings.byPriceBand[b] as PlanModelRow[])
    .map((r) => r.sourceDates?.aa)
    .filter((d): d is string => Boolean(d));
  const oldestAa = aaDates.length ? aaDates.reduce((a, b) => (a < b ? a : b)) : null;
  const newestAa = aaDates.length ? aaDates.reduce((a, b) => (a > b ? a : b)) : null;
  const aaStale = oldestAa != null && daysAgo(oldestAa) > AA_STALE_DAYS;

  // Assumptions to review: disclosed limits / pricing resting on assumed-or-stale confidence.
  const assumptions = getAllPlans().flatMap(({ provider, plan }) => {
    const rows: Array<{ key: string; provider: string; plan: string; field: string; confidence: "assumed" | "stale"; url: string; date: string }> = [];
    const flag = (c: string): c is "assumed" | "stale" => c === "assumed" || c === "stale";
    if (flag(plan.pricing.provenance.confidence)) {
      rows.push({ key: `${plan.id}-pricing`, provider: provider.name, plan: plan.name, field: "Pricing", confidence: plan.pricing.provenance.confidence, url: plan.pricing.provenance.url, date: plan.pricing.provenance.accessed_date });
    }
    for (const l of plan.usage_limits) {
      if (flag(l.provenance.confidence)) {
        rows.push({ key: `${plan.id}-${l.type}`, provider: provider.name, plan: plan.name, field: l.type.replace(/_/g, " "), confidence: l.provenance.confidence, url: l.provenance.url, date: l.provenance.accessed_date });
      }
    }
    return rows;
  });
  const assumptionsShown = assumptions.slice(0, 25);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Data freshness</h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Code Smart is forthright about data age. Below: when the rankings were last computed, when each
          provider was last verified, the age of the AA benchmark snapshots, and the figures that currently
          rest on assumptions worth re-checking.
        </p>
      </header>

      {/* Headline dates */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Scores computed</div>
          <div className="text-lg font-bold text-gray-900">{meta.generated_at || "—"}</div>
          <FreshnessBadge date={meta.generated_at} className="mt-2" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">AA snapshots</div>
          <div className="text-lg font-bold text-gray-900">{newestAa ?? "—"}</div>
          <div className="mt-2">
            {oldestAa ? (
              <span className={aaStale ? "text-xs font-medium text-red-600" : "text-xs text-gray-400"}>
                {aaStale ? `⚠ oldest ${daysAgo(oldestAa)}d (>${AA_STALE_DAYS}d)` : `oldest ${oldestAa}`}
              </span>
            ) : (
              <span className="text-xs text-gray-400">no AA dates in dataset</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Stale providers</div>
          <div className={`text-lg font-bold ${staleProviders.length ? "text-red-600" : "text-gray-900"}`}>
            {staleProviders.length} / {providerRows.length}
          </div>
          <div className="mt-2 text-xs text-gray-400">verified &gt;{PROVIDER_STALE_DAYS}d ago</div>
        </div>
      </section>

      {/* Provider verification */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Provider verification dates</h2>
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="py-2.5 px-3 text-left">Provider</th>
                <th className="py-2.5 px-3 text-left">Last verified</th>
                <th className="py-2.5 px-3 text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              {providerRows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 even:bg-gray-50/40">
                  <td className="py-2.5 px-3">
                    <Link href={`/providers/${r.id}`} className="font-medium text-gray-900 hover:text-brand-700 transition-colors">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 tabular-nums">{r.date}</td>
                  <td className="py-2.5 px-3 text-right"><FreshnessBadge date={r.date} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Assumptions to review */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Assumptions worth re-checking</h2>
        <p className="text-sm text-gray-500 mb-4 max-w-2xl">
          Figures whose source confidence is <strong>estimated</strong> or <strong>stale</strong> — these
          carry the most uncertainty and are the first candidates for re-verification.
          {assumptions.length > assumptionsShown.length && (
            <span className="text-gray-400"> Showing {assumptionsShown.length} of {assumptions.length}.</span>
          )}
        </p>
        {assumptionsShown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-green-200 bg-green-50 p-6 text-center text-sm text-green-700">
            No pricing or usage figures currently rest on assumed or stale data.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2.5 px-3 text-left">Plan</th>
                  <th className="py-2.5 px-3 text-left">Field</th>
                  <th className="py-2.5 px-3 text-left">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Source</th>
                </tr>
              </thead>
              <tbody>
                {assumptionsShown.map((a) => (
                  <tr key={a.key} className="border-t border-gray-100 even:bg-gray-50/40">
                    <td className="py-2.5 px-3">
                      <span className="font-medium text-gray-900">{a.plan}</span>
                      <span className="block text-[11px] text-gray-400">{a.provider}</span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 capitalize">{a.field}</td>
                    <td className="py-2.5 px-3"><ConfidenceBadge confidence={a.confidence} /></td>
                    <td className="py-2.5 px-3 text-right"><SourceLink url={a.url} date={a.date} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm text-gray-500">
        How these figures are derived: see the <Link href="/methodology" className="text-brand-600 hover:text-brand-700 font-medium">methodology</Link>.
      </p>
    </div>
  );
}
