import { getAllProviders, getAllPlans } from "@/lib/data-loader";
import { scoreAllPlans } from "@/lib/value-scorer";
import { Hero } from "@/components/Hero";
import { PlansGrid } from "@/components/PlansGrid";
import { ComparisonTable } from "@/components/ComparisonTable";

export const dynamic = "force-static";   // data is built at compile time
export const revalidate = 86400;         // revalidate daily on ISR

export default function HomePage() {
  // Load + validate all provider data at build time
  const providers = getAllProviders();
  const allPlans = getAllPlans();
  const scoredPlans = scoreAllPlans(allPlans);

  return (
    <>
      <Hero providers={providers} totalPlans={allPlans.length} />

      <div id="plans" className="scroll-mt-28">
        <PlansGrid entries={scoredPlans} />
      </div>

      <ComparisonTable entries={scoredPlans} />

      {/* Methodology callout */}
      <section id="value" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-100">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">How Value Score Works</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Value Score is a weighted composite of three dimensions:
              cost efficiency (35%), coding benchmark quality (40%), and
              feature completeness for developers (25%).
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
            <h3 className="font-semibold text-gray-900 mb-2">Benchmark Sources</h3>
            <ul className="text-sm text-gray-500 space-y-1">
              <li><strong>SWE-bench verified</strong> — real GitHub issues solved autonomously (weight: 45%)</li>
              <li><strong>HumanEval</strong> — Python function synthesis (weight: 25%)</li>
              <li><strong>Aider polyglot</strong> — multi-language real-world edits (weight: 20%)</li>
              <li><strong>LiveCodeBench</strong> — competitive programming (weight: 10%)</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
