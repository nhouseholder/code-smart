import type { Metadata } from "next";
import Link from "next/link";
import { getRankings, getMethodologyMeta, getAllApiPlans } from "@/lib/data-loader";
import type { PlanModelRow, TransparencyRow } from "@/lib/rankings";
import { RankingCard } from "@/components/RankingCard";
import { CalculationExplainer } from "@/components/CalculationExplainer";
import { UncertaintyScore } from "@/components/UncertaintyScore";
import { FadeIn } from "@/components/motion/FadeIn";
import aaScoresJson from "@/data/aa-scores.json";

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

// Build a model-id → AA scores lookup (used for the API Providers section)
const AA_SCORE_MAP = new Map(
  aaScoresJson.scores.map((s) => [s.modelId, s])
);

export default function RankingsPage() {
  const { rankings } = getRankings();
  const meta = getMethodologyMeta();

  // API-tier providers (pay-per-token) — deduped to one entry per provider
  const apiEntries = getAllApiPlans();
  const seenProviders = new Set<string>();
  const apiProviders = apiEntries
    .filter(({ provider }) => {
      if (seenProviders.has(provider.id)) return false;
      seenProviders.add(provider.id);
      return true;
    })
    .map(({ provider, plan }) => {
      // Look across all provider models for best AA score (plan model list may reference older IDs)
      const allModelIds = provider.models.map((m) => m.id);
      const planModelIds = plan.models.map((m) => m.model_id);
      const candidateIds = [...new Set([...planModelIds, ...allModelIds])];
      const scored = candidateIds
        .map((id) => ({ id, score: AA_SCORE_MAP.get(id) }))
        .filter((x): x is { id: string; score: typeof aaScoresJson.scores[0] } => x.score !== undefined)
        .sort((a, b) => (b.score.intelligenceIndex ?? 0) - (a.score.intelligenceIndex ?? 0));
      const best = scored[0];
      return { provider, plan, bestModelId: best?.id ?? null, bestScore: best?.score ?? null };
    });

  // A representative row to power the worked example in the explainer (first non-null value per intelligence per task).
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

      {/* Value per Intelligence per Task explanation */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">How Value per Intelligence per Task works</h2>
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

      {/* API Providers — pay-per-token, no subscription */}
      {apiProviders.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">API providers</h2>
          <p className="text-sm text-gray-500 mb-4 max-w-2xl">
            Pay-per-token access — no monthly subscription. Cost depends on usage; shown as input/output
            price per million tokens. Intelligence score from Artificial Analysis where available.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="py-2.5 px-3 text-left">Provider</th>
                  <th className="py-2.5 px-3 text-left">Top model</th>
                  <th className="py-2.5 px-3 text-center">HQ</th>
                  <th className="py-2.5 px-3 text-right">Intelligence</th>
                  <th className="py-2.5 px-3 text-right">In $/MTok</th>
                  <th className="py-2.5 px-3 text-right">Out $/MTok</th>
                  <th className="py-2.5 px-3 text-left">Pricing</th>
                </tr>
              </thead>
              <tbody>
                {apiProviders.map(({ provider, bestModelId, bestScore }) => (
                  <tr key={provider.id} className="border-t border-gray-100 even:bg-gray-50/40">
                    <td className="py-2.5 px-3 font-medium text-gray-900">{provider.display_name}</td>
                    <td className="py-2.5 px-3 text-gray-600 text-xs font-mono">{bestModelId ?? "—"}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        provider.headquarters_country === "US" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
                      }`}>
                        {provider.headquarters_country}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                      {bestScore?.intelligenceIndex != null ? bestScore.intelligenceIndex : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                      {bestScore?.inputPrice != null ? `$${bestScore.inputPrice}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">
                      {bestScore?.outputPrice != null ? `$${bestScore.outputPrice}` : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <a
                        href={provider.pricing_url ?? provider.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-600 hover:text-brand-700 transition-colors"
                      >
                        Pricing →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Intelligence = AA Intelligence Index (0–100). Prices per million tokens at API list rate.
            <span className="ml-1 text-blue-700 font-semibold">US</span> = US lab,{" "}
            <span className="text-red-700 font-semibold">CN</span> = Chinese lab.
          </p>
        </section>
      )}
    </div>
  );
}
