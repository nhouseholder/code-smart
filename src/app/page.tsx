import * as fs from "node:fs";
import * as path from "node:path";
import Link from "next/link";
import { getAllProviders, getAllPlans, getRankings, getMethodologyMeta } from "@/lib/data-loader";
import { scoreAllPlans } from "@/lib/value-scorer";
import { Hero } from "@/components/Hero";
import { PlansGrid } from "@/components/PlansGrid";
import { ComparisonTable } from "@/components/ComparisonTable";
import { RankingCard } from "@/components/RankingCard";
import { ValueByTierChart } from "@/components/ValueByTierChart";
import { FadeIn } from "@/components/motion/FadeIn";
import type { ModelValueEstimate } from "@/types";
import type { PlanModelRow } from "@/lib/rankings";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-static";   // data is built at compile time
export const revalidate = 86400;         // revalidate daily on ISR

/** Best estimate by Intelligence Score for a plan (null when plan has no estimates). */
function bestEstimateForPlan(
  estimates: Record<string, ModelValueEstimate[]>,
  planId: string,
): ModelValueEstimate | null {
  const rows = estimates[planId];
  if (!rows || rows.length === 0) return null;
  return rows[0]; // already sorted by Intelligence Score desc by the generator
}

export default function HomePage() {
  // Load + validate all provider data at build time
  const providers = getAllProviders();
  const allPlans = getAllPlans();
  const scoredPlans = scoreAllPlans(allPlans);

  // Load pre-generated engine estimates (built by `npm run generate:value-estimates`)
  let engineEstimates: Record<string, ModelValueEstimate[]> = {};
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public", "data", "model-value-estimates.json"),
      "utf8",
    );
    engineEstimates = (JSON.parse(raw) as { estimates: typeof engineEstimates }).estimates;
  } catch {
    // File absent (pre-build). Fall back to empty — UI renders without Intelligence score column.
  }

  // Enrich each scored entry with the best engine estimate for its plan
  const enrichedPlans = scoredPlans.map((entry) => ({
    ...entry,
    engineBest: bestEstimateForPlan(engineEstimates, entry.plan.id),
  }));

  // Top value pick per price band (#1 of each), straight from the rankings engine.
  const rankings = getRankings();
  const meta = getMethodologyMeta();
  const topPicks: Array<{ band: string; label: string; row: PlanModelRow | undefined }> = [
    { band: "low", label: "Best low-cost", row: rankings.rankings.byPriceBand.low[0] as PlanModelRow | undefined },
    { band: "mid", label: "Best mid-tier", row: rankings.rankings.byPriceBand.mid[0] as PlanModelRow | undefined },
    { band: "high", label: "Best high-end", row: rankings.rankings.byPriceBand.high[0] as PlanModelRow | undefined },
  ];

  return (
    <>
      <Hero providers={providers} totalPlans={allPlans.length} />

      {/* Top value picks by price band */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Top value picks</h2>
            <p className="text-sm text-gray-500 mt-1">
              Highest quality-adjusted capability per dollar in each price band.
              {meta.generated_at && <span className="text-gray-400"> · Scores computed {meta.generated_at}</span>}
            </p>
          </div>
          <Link href="/rankings" className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors">
            Full rankings <ArrowRight size={14} />
          </Link>
        </div>
        <FadeIn className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topPicks.map(({ band, label, row }) =>
            row ? (
              <div key={band}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</div>
                <RankingCard row={row} />
              </div>
            ) : (
              <div key={band} className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-400">
                No {band}-band pick available yet.
              </div>
            ),
          )}
        </FadeIn>
      </section>

      {/* Model quality by price tier (Intelligence score bar chart) */}
      <FadeIn>
        <ValueByTierChart tiers={rankings.rankings.byQualityPerBand} />
      </FadeIn>

      <div id="plans" className="scroll-mt-28 mt-12">
        <PlansGrid entries={enrichedPlans} />
      </div>

      <ComparisonTable entries={enrichedPlans} />

      {/* Compare CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="rounded-2xl bg-brand-600 px-6 py-8 sm:px-10 sm:flex items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-bold text-white">Build your own comparison</h2>
            <p className="text-sm text-brand-100 mt-1">
              Pick 2–6 plans and compare pricing, models, limits and value side by side.
            </p>
          </div>
          <Link
            href="/compare"
            className="mt-4 sm:mt-0 inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors flex-shrink-0"
          >
            Compare plans <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* Methodology callout */}
      <section id="value" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-100">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">How Value per Intelligence per Task Works</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              The Value per Intelligence per Task measures intelligence-adjusted tokens per dollar: we take the
              plan&apos;s monthly token budget, multiply by Intelligence Score (50% agentic
              index + 40% coding index + 10% speed from Artificial Analysis), then divide by
              price. Score of 100 = 1M quality-adjusted tokens for $20/mo.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Data Confidence Levels</h3>
            <ul className="text-sm text-gray-500 space-y-1">
              <li><span className="text-green-600 font-medium">● Observed</span> — confirmed from official source</li>
              <li><span className="text-blue-600 font-medium">● Inferred</span> — derived from observed data</li>
              <li><span className="text-amber-500 font-medium">● Estimated</span> — reasonable assumption, unverified</li>
              <li><span className="text-red-500 font-medium">● Stale</span> — source is &gt;90 days old</li>
              <li><span className="text-gray-400 font-medium">● Unknown</span> — provider does not disclose</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">AA Benchmark Indices</h3>
            <ul className="text-sm text-gray-500 space-y-1">
              <li><strong>Agentic index</strong> (50%) — multi-step tool-use, coding agents</li>
              <li><strong>Coding index</strong> (40%) — code generation, refactor, debug</li>
              <li><strong>Speed score</strong> (10%) — normalized tokens/second</li>
              <li className="text-[11px] text-gray-400 pt-1">Source: artificialanalysis.ai · confidence: assumed</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
