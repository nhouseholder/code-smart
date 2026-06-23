import * as fs from "node:fs";
import * as path from "node:path";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getAllPlans, getRankings } from "@/lib/data-loader";
import { getRadarProfiles } from "@/lib/radar";
import { scoreAllPlans } from "@/lib/value-scorer";
import { PlanComparisonTable } from "@/components/PlanComparisonTable";
import { RadarCompare } from "@/components/RadarCompare";
import type { ModelValueEstimate } from "@/types";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Compare — Code Smart",
  description: "Compare AI coding models on 5 benchmark axes, and build a side-by-side comparison of coding plans: pricing, models, usage limits, and quality-adjusted value.",
};

function bestEstimate(estimates: Record<string, ModelValueEstimate[]>, planId: string): ModelValueEstimate | null {
  const rows = estimates[planId];
  return rows && rows.length > 0 ? rows[0] : null;
}

export default function ComparePage() {
  // ── Model radar data ────────────────────────────────────────────────────
  const allProfiles = getRadarProfiles();
  const { rankings } = getRankings();

  const defaultIds = rankings.byWeightedQuality
    .slice(0, 5)
    .map((r) => r.modelId)
    .filter((id) => allProfiles.some((p) => p.modelId === id));
  const fallback = allProfiles.slice(0, 5).map((p) => p.modelId);
  const radarDefaultIds = defaultIds.length >= 3 ? defaultIds : fallback;

  // ── Plan comparison data ────────────────────────────────────────────────
  const scored = scoreAllPlans(getAllPlans());

  let engineEstimates: Record<string, ModelValueEstimate[]> = {};
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public", "data", "model-value-estimates.json"),
      "utf8",
    );
    engineEstimates = (JSON.parse(raw) as { estimates: typeof engineEstimates }).estimates;
  } catch {
    // Absent pre-build — comparison renders without Intelligence score-derived rows.
  }

  const entries = scored.map((entry) => ({
    ...entry,
    engineBest: bestEstimate(engineEstimates, entry.plan.id),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-0">

      {/* ── Model Comparison ─────────────────────────────────────────────── */}
      <section id="models" className="scroll-mt-20 space-y-5">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">Compare Models</h1>
          <p className="text-gray-500 mt-2 max-w-2xl">
            Select up to 8 models to overlay across Intelligence, Coding, Agentic, Speed, and
            Affordability. Overlapping polygons reveal trade-offs at a glance.
          </p>
        </header>

        <RadarCompare allProfiles={allProfiles} defaultIds={radarDefaultIds} />
      </section>

      {/* ── Plan Comparison ──────────────────────────────────────────────── */}
      <section id="plans" className="scroll-mt-20 pt-14 border-t border-gray-100 mt-14 space-y-5">
        <header>
          <h2 className="text-2xl font-bold text-gray-900">Compare Coding Plans</h2>
          <p className="text-gray-500 mt-2 max-w-2xl">
            Search and filter by provider, price band, model, or confidence — then pick 2–6 plans
            to compare side by side. Usage figures are <em>estimates, not guarantees</em>; each
            cell shows its source confidence, and a <code className="text-xs">—</code> means the
            value isn&apos;t disclosed.
          </p>
        </header>

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
            No plans available to compare yet.
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
                Loading comparison…
              </div>
            }
          >
            <PlanComparisonTable entries={entries} />
          </Suspense>
        )}
      </section>
    </div>
  );
}
