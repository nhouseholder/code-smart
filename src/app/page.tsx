import Link from "next/link";
import { getAllProviders, getAllPlans, getRankings, getMethodologyMeta } from "@/lib/data-loader";
import { getRadarProfiles } from "@/lib/radar";
import { ROWS, MAX_COMPOSITE } from "@/lib/efficiency-models";
import { Hero } from "@/components/Hero";
import { RankingCard } from "@/components/RankingCard";
import { ValueByTierChart } from "@/components/ValueByTierChart";
import { ModelRadarChart } from "@/components/ModelRadarChart";
import { FadeIn } from "@/components/motion/FadeIn";
import type { PlanModelRow } from "@/lib/rankings";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-static";
export const revalidate = 86400;

function fmt(n: number, digits = 1) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function HomePage() {
  const providers = getAllProviders();
  const allPlans = getAllPlans();
  const rankings = getRankings();
  const meta = getMethodologyMeta();
  const allProfiles = getRadarProfiles();

  const topPicks: Array<{ band: string; label: string; row: PlanModelRow | undefined }> = [
    { band: "low",  label: "Best low-cost",  row: rankings.rankings.byPriceBand.low[0]  as PlanModelRow | undefined },
    { band: "mid",  label: "Best mid-tier",  row: rankings.rankings.byPriceBand.mid[0]  as PlanModelRow | undefined },
    { band: "high", label: "Best high-end",  row: rankings.rankings.byPriceBand.high[0] as PlanModelRow | undefined },
  ];

  const top5Ids = new Set(
    rankings.rankings.byWeightedQuality.slice(0, 5).map((r) => r.modelId),
  );
  const radarProfiles = allProfiles.filter((p) => top5Ids.has(p.modelId));
  const displayProfiles = radarProfiles.length >= 3 ? radarProfiles : allProfiles.slice(0, 5);

  return (
    <>
      <Hero providers={providers} totalPlans={allPlans.length} />

      {/* ── Section A: Model Efficiency Index ─────────────────────────────── */}
      <section id="efficiency" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-4">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Model Efficiency Index</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              Models ranked by <strong>Intel · t/s ÷ $/100 tasks</strong> — rewards intelligence,
              throughput, and cost-efficiency simultaneously.
              {meta.generated_at && (
                <span className="text-gray-400"> · Verified {meta.generated_at}</span>
              )}
            </p>
          </div>
          <Link
            href="/efficiency"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors flex-shrink-0"
          >
            Full analysis <ArrowRight size={14} />
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm min-w-[780px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="py-2.5 px-3 text-left w-8">#</th>
                <th className="py-2.5 px-3 text-left">Model</th>
                <th className="py-2.5 px-3 text-center">Lab</th>
                <th className="py-2.5 px-3 text-right">Intel</th>
                <th className="py-2.5 px-3 text-right">t/s</th>
                <th className="py-2.5 px-3 text-right">$/100T</th>
                <th className="py-2.5 px-3 text-right">Intel/$100T</th>
                <th className="py-2.5 px-3 text-right">Intel·t/s/$100T</th>
                <th className="py-2.5 px-3 text-left w-36">Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const pct = (r.composite / MAX_COMPOSITE) * 100;
                const isTop3 = i < 3;
                return (
                  <tr
                    key={r.name}
                    className={`border-t border-gray-100 ${isTop3 ? "bg-brand-50/30" : "even:bg-gray-50/40"}`}
                  >
                    <td className={`py-2.5 px-3 tabular-nums font-medium ${isTop3 ? "text-brand-600" : "text-gray-400"}`}>
                      {i + 1}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-gray-900">
                      {r.name}
                      {r.tokApprox && (
                        <span className="ml-1 text-[10px] text-amber-500" title="Tok/Task estimated">~</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        r.lab === "US" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
                      }`}>
                        {r.lab}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.intel}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.tps.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">${fmt(r.cost100, 3)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{fmt(r.intelPerCost)}</td>
                    <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${isTop3 ? "text-brand-700" : "text-gray-900"}`}>
                      {Math.round(r.composite).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          ~ = Tok/Task estimated; cost approximate.{" "}
          <span className="text-blue-700 font-semibold">US</span> = US lab,{" "}
          <span className="text-red-700 font-semibold">CN</span> = Chinese lab.
          Cost model: 7k fresh + 3k cached input, plus output at Tok/Task rate (OpenRouter pricing).
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          <div className="rounded-2xl border border-gray-200 p-4 space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm">Cost model — $/Task</h3>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700 leading-relaxed">
{`$/Task =
  ( 7,000 × OR_In$/1M
  + 3,000 × OR_CH$/1M
  + Tok/Task × OR_Out$/1M
  ) ÷ 1,000,000`}
            </pre>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4 space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm">Composite score</h3>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-700 leading-relaxed">
{`(Intel × t/s) ÷ $/100T

Rewards models that are smart,
fast, and cheap simultaneously.
Doubling speed doubles the score.`}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Section B: Five-Dimension Model Radar ─────────────────────────── */}
      <section
        id="radar"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-4 border-t border-gray-100 mt-10"
      >
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Five-Dimension Model Radar</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              Top 5 models by Intelligence Score across Intelligence, Coding, Agentic, Speed, and Affordability.
            </p>
          </div>
          <Link
            href="/compare#models"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors flex-shrink-0"
          >
            Interactive comparison <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
          <ModelRadarChart profiles={displayProfiles} size={340} />

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-gray-700">Axes explained</h3>
            <dl className="space-y-3">
              {[
                ["Intelligence", "AA Intelligence Index — composite benchmark (MMLU, GPQA, MATH, HumanEval). Raw AA 0–100 score."],
                ["Coding",       "AA Coding Index — HumanEval, SWE-bench, coding benchmarks. Raw AA 0–100 score."],
                ["Agentic",      "AA Agentic Index — tool-use, multi-step, and agent benchmark performance. Raw AA 0–100."],
                ["Speed",        "Output tokens/sec (AA median). Percentile-ranked within this set — top = fastest."],
                ["Affordability","Inverted price percentile: cheaper = higher. Blended = input × 0.3 + output × 0.7."],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-28 shrink-0 font-semibold text-gray-700 text-xs pt-0.5">{k}</dt>
                  <dd className="text-gray-500 text-xs leading-relaxed">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-gray-400 pt-1">
              Intelligence, Coding, Agentic use raw AA absolute scores. Speed and Affordability are percentile-ranked within this dataset.
            </p>
            <Link
              href="/compare#models"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              Compare any models interactively <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Section C: Top Value Coding Plans ─────────────────────────────── */}
      <section
        id="picks"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 border-t border-gray-100 mt-10"
      >
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Top Value Coding Plans</h2>
            <p className="text-sm text-gray-500 mt-1">
              Highest quality-adjusted capability per dollar in each price band.
              {meta.generated_at && (
                <span className="text-gray-400"> · Scores computed {meta.generated_at}</span>
              )}
            </p>
          </div>
          <Link
            href="/compare#plans"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors flex-shrink-0"
          >
            Compare all plans <ArrowRight size={14} />
          </Link>
        </div>

        <FadeIn className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topPicks.map(({ band, label, row }) =>
            row ? (
              <div key={band}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  {label}
                </div>
                <RankingCard row={row} />
              </div>
            ) : (
              <div
                key={band}
                className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-400"
              >
                No {band}-band pick available yet.
              </div>
            ),
          )}
        </FadeIn>
      </section>

      <FadeIn>
        <ValueByTierChart tiers={rankings.rankings.byQualityPerBand} />
      </FadeIn>

      {/* Compare CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl bg-brand-600 px-6 py-8 sm:px-10 sm:flex items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-bold text-white">Build your own comparison</h2>
            <p className="text-sm text-brand-100 mt-1">
              Pick 2–6 plans and compare pricing, models, limits, and value side by side.
            </p>
          </div>
          <Link
            href="/compare#plans"
            className="mt-4 sm:mt-0 inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors flex-shrink-0"
          >
            Compare plans <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </>
  );
}
