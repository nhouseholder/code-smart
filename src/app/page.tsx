import * as fs from "node:fs";
import * as path from "node:path";
import { getAllProviders, getAllPlans } from "@/lib/data-loader";
import { scoreAllPlans } from "@/lib/value-scorer";
import { Hero } from "@/components/Hero";
import { PlansGrid } from "@/components/PlansGrid";
import { ComparisonTable } from "@/components/ComparisonTable";
import type { ModelValueEstimate } from "@/types";

export const dynamic = "force-static";   // data is built at compile time
export const revalidate = 86400;         // revalidate daily on ISR

/** Best estimate by WMQ for a plan (null when plan has no estimates). */
function bestEstimateForPlan(
  estimates: Record<string, ModelValueEstimate[]>,
  planId: string,
): ModelValueEstimate | null {
  const rows = estimates[planId];
  if (!rows || rows.length === 0) return null;
  return rows[0]; // already sorted by WMQ desc by the generator
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
    // File absent (pre-build). Fall back to empty — UI renders without WMQ column.
  }

  // Enrich each scored entry with the best engine estimate for its plan
  const enrichedPlans = scoredPlans.map((entry) => ({
    ...entry,
    engineBest: bestEstimateForPlan(engineEstimates, entry.plan.id),
  }));

  return (
    <>
      <Hero providers={providers} totalPlans={allPlans.length} />

      <div id="plans" className="scroll-mt-28">
        <PlansGrid entries={enrichedPlans} />
      </div>

      <ComparisonTable entries={enrichedPlans} />

      {/* Methodology callout */}
      <section id="value" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-100">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">How Value Score Works</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              The QAMU Value Score measures quality-adjusted tokens per dollar: we take the
              plan&apos;s monthly token budget, multiply by Weighted Model Quality (50% agentic
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
