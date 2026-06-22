import type { Metadata } from "next";
import { getRadarProfiles } from "@/lib/radar";
import { getRankings } from "@/lib/data-loader";
import { RadarCompare } from "@/components/RadarCompare";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Model Radar — Code Smart",
  description:
    "Compare AI coding models across Intelligence, Coding, Agentic, Speed, and Affordability on an interactive radar chart.",
};

export default function RadarPage() {
  const profiles = getRadarProfiles();
  const { rankings } = getRankings();

  const defaultIds = rankings.byWeightedQuality
    .slice(0, 5)
    .map((r) => r.modelId)
    .filter((id) => profiles.some((p) => p.modelId === id));

  const fallback = profiles.slice(0, 5).map((p) => p.modelId);
  const ids = defaultIds.length >= 3 ? defaultIds : fallback;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Model radar</h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Compare models across five dimensions simultaneously. Select up to 8 models — overlapping
          polygons reveal trade-offs at a glance.
        </p>
      </header>

      <RadarCompare allProfiles={profiles} defaultIds={ids} />

      {/* Axis methodology */}
      <section className="rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Axes explained</h2>
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {[
            ["Intelligence", "Artificial Analysis Intelligence Index — composite benchmark across MMLU, GPQA, MATH, HumanEval and others. Raw AA 0–100 score."],
            ["Coding", "Artificial Analysis Coding Index — HumanEval, SWE-bench, and related coding benchmarks. Raw AA 0–100 score."],
            ["Agentic", "Artificial Analysis Agentic Index — tool-use, multi-step, and agent benchmark performance. Raw AA 0–100 score."],
            ["Speed", "Output tokens per second (Artificial Analysis median). Percentile rank within this model set — top percentile = fastest."],
            ["Affordability", "Inverted price percentile: cheaper models score higher. Blended price = input × 0.3 + output × 0.7. Top percentile = cheapest."],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-28 shrink-0 font-semibold text-gray-700">{k}</dt>
              <dd className="text-gray-500">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-gray-400 pt-2">
          Intelligence, Coding, and Agentic use raw AA absolute scores (0–100). Speed and
          Affordability are percentile-ranked within this dataset so all axes share a 0–100 scale.
        </p>
      </section>
    </div>
  );
}
