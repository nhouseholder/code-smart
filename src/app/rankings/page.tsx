import type { Metadata } from "next";
import Link from "next/link";
import { getRankings, getMethodologyMeta } from "@/lib/data-loader";
import type { PlanModelRow, TransparencyRow } from "@/lib/rankings";
import { RankingCard } from "@/components/RankingCard";
import { CalculationExplainer } from "@/components/CalculationExplainer";
import { UncertaintyScore } from "@/components/UncertaintyScore";
import { FadeIn } from "@/components/motion/FadeIn";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Rankings — Code Smart",
  description: "Top AI coding plans by quality-adjusted value per dollar, ranked across low, mid and high price bands, plus a data-transparency leaderboard.",
};

const BANDS: Array<{ key: "low" | "mid" | "high"; title: string; blurb: string }> = [
  { key: "low", title: "Low cost", blurb: "$0.01–$30 / mo" },
  { key: "mid", title: "Mid tier", blurb: "$30.01–$80 / mo" },
  { key: "high", title: "High end", blurb: "$80.01+ / mo" },
];

export default function RankingsPage() {
  const { rankings } = getRankings();
  const meta = getMethodologyMeta();

  // A representative row to power the worked example in the explainer (first non-null value score).
  const example = (["low", "mid", "high"] as const)
    .flatMap((b) => rankings.byPriceBand[b] as PlanModelRow[])
    .find((r) => r.valueScore != null);

  const transparency = (rankings.byTransparency as TransparencyRow[]).slice(0, 15);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Value rankings</h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Plans ranked by <strong>quality-adjusted capability per dollar</strong> — not by price alone.
          Usage figures are <em>estimates, not guarantees</em>; every card shows its confidence and when
          its sources were last updated.
          {meta.generated_at && <span className="text-gray-400"> Scores computed {meta.generated_at}.</span>}
        </p>
      </header>

      {BANDS.map(({ key, title, blurb }) => {
        const rows = (rankings.byPriceBand[key] as PlanModelRow[]) ?? [];
        return (
          <section key={key}>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
              <span className="text-sm text-gray-400">{blurb}</span>
            </div>
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                No plans currently qualify in this band.
              </div>
            ) : (
              <FadeIn className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.slice(0, 10).map((row) => (
                  <RankingCard key={`${row.planId}-${row.modelId}`} row={row} />
                ))}
              </FadeIn>
            )}
          </section>
        );
      })}

      {/* Weighted Value Score explanation */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">How the Value Score works</h2>
        {example ? (
          <CalculationExplainer
            weightedModelQuality={example.weightedModelQuality}
            estimatedMonthlyTokens={example.estimatedMonthlyTokens}
            modelAdjustedMonthlyTokens={example.modelAdjustedMonthlyTokens}
            qualityAdjustedMonthlyUsage={example.qualityAdjustedMonthlyUsage}
            monthlyPriceUsd={example.monthlyPriceUsd}
            valueScoreRaw={example.valueScoreRaw}
            valueScore={example.valueScore}
            defaultOpen
          />
        ) : (
          <p className="text-sm text-gray-500">No scored plan available to illustrate the calculation.</p>
        )}
      </section>

      {/* Transparency leaderboard */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Data transparency</h2>
        <p className="text-sm text-gray-500 mb-4 max-w-2xl">
          How much of a plan&apos;s value rests on disclosed vs. assumed data. Higher transparency means
          fewer estimates. A high uncertainty score flags figures to treat with caution.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="py-2.5 px-3 text-left w-10">#</th>
                <th className="py-2.5 px-3 text-left">Plan</th>
                <th className="py-2.5 px-3 text-right">Transparency</th>
                <th className="py-2.5 px-3 text-right">Uncertainty</th>
              </tr>
            </thead>
            <tbody>
              {transparency.map((r) => (
                <tr key={r.planId} className="border-t border-gray-100 even:bg-gray-50/40">
                  <td className="py-2.5 px-3 text-gray-400 tabular-nums">{r.rank}</td>
                  <td className="py-2.5 px-3">
                    <Link href={`/plans/${r.planId}`} className="font-medium text-gray-900 hover:text-brand-700 transition-colors">
                      {r.planName}
                    </Link>
                    <span className="block text-[11px] text-gray-400">{r.providerName}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-gray-900">
                    {r.transparencyScore}/100
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {r.uncertaintyScore > 50 ? (
                      <UncertaintyScore score={r.uncertaintyScore} />
                    ) : (
                      <span className="text-gray-400 tabular-nums">{r.uncertaintyScore}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
