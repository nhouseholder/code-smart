import type { Metadata } from "next";
import { ROWS, MAX_COMPOSITE } from "@/lib/efficiency-models";
import { ModelEfficiencyTable } from "@/components/ModelEfficiencyTable";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Model Efficiency — Code Smart",
  description:
    "AI models ranked by Intel·t/s per $100 tasks — a composite of intelligence, throughput, and cost from Artificial Analysis and OpenRouter pricing.",
};

export default function EfficiencyPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Model efficiency index</h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Models ranked by <strong>Intel · t/s ÷ $/100 tasks</strong> — a composite that rewards
          intelligence, throughput, and cost-efficiency simultaneously. Sources: Artificial Analysis
          (intel, speed, verbosity) + OpenRouter API pricing, verified 2026-06-20.
        </p>
      </header>

      {/* Main table */}
      <section>
        <ModelEfficiencyTable rows={ROWS} maxComposite={MAX_COMPOSITE} />
      </section>

      {/* Methodology */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Methodology</h2>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Raw inputs</h3>
            <dl className="space-y-2 text-sm">
              {[
                ["Intel", "Artificial Analysis Intelligence Index — composite benchmark score"],
                ["t/s", "Artificial Analysis median output speed in tokens per second"],
                ["Tok/Task", "AA \"Output Tokens per II Task\" — median output tokens per benchmark task"],
                ["OR In$/1M", "OpenRouter input token price (cache-miss / fresh)"],
                ["OR CH$/1M", "OpenRouter cache-hit input price (— = no discount offered)"],
                ["OR Out$/1M", "OpenRouter output token price"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-24 shrink-0 font-mono text-xs text-gray-500 pt-0.5">{k}</dt>
                  <dd className="text-gray-600">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Cost model — $/Task</h3>
            <p className="text-sm text-gray-600">
              Assumes a representative agentic request of <strong>10,000 input tokens</strong>,
              split 70/30 fresh vs. cached:
            </p>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700">
{`$/Task =
  ( 7,000 × OR_In$/1M
  + 3,000 × OR_CH$/1M   ← OR_In if no cache
  + Tok/Task × OR_Out$/1M
  ) ÷ 1,000,000`}
            </pre>
            <p className="text-sm text-gray-600">
              <strong>$/100T</strong> = $/Task × 100, so dollar amounts are human-readable.
              No model on OpenRouter charges for cache <em>writes</em>.
            </p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-5 space-y-2">
            <h3 className="font-semibold text-gray-900">Intel / $100T</h3>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-700">Intel ÷ $/100T</pre>
            <p className="text-sm text-gray-600">
              Intelligence value per $100 spent. Analogous to miles-per-gallon — higher means
              more intelligence per dollar. Does <em>not</em> account for speed.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 space-y-2">
            <h3 className="font-semibold text-gray-900">Intel · t/s / $100T</h3>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-700">(Intel × t/s) ÷ $/100T</pre>
            <p className="text-sm text-gray-600">
              The composite score. Rewards models that are simultaneously smart, fast, and cheap.
              Doubling speed at constant cost and intelligence doubles the score. Doubling cost
              halves it. Ranking by this metric is the primary sort.
            </p>
          </div>
        </div>
      </section>

      {/* Key findings */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">Key findings</h2>
        <ul className="space-y-3 text-sm text-gray-700 max-w-3xl">
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold shrink-0">→</span>
            <span><strong>GPT-OSS 120B</strong> ranks #1 on the composite by a 2.4× margin, driven entirely by
            its 344 t/s throughput — fastest in the set. Trade-off: lowest intelligence score (24).</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold shrink-0">→</span>
            <span><strong>Mimo V2.5</strong> wins the pure Intel/$100T race and holds #2 on the composite.
            Balanced across all three dimensions: intel 40, 82 t/s, $0.659/100T.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold shrink-0">→</span>
            <span><strong>Gemma 4 31B</strong> is the cheapest model ($0.531/100T) and ranks #2 on Intel/$100T,
            but falls to #5 on the composite — 35 t/s is the anchor.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold shrink-0">→</span>
            <span><strong>Cliff at rank 4→5</strong>: MiniMax M2.5 (rank 4, 4,555) is more than double
            Gemma (rank 5, 1,912). Practical panel candidates live in the top 4.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-500 font-bold shrink-0">→</span>
            <span><strong>Haiku 4.5</strong> is the worst US-lab model on both metrics — premium-priced at
            $5.73/100T with the same intel as GPT-OSS 120B but ¼ the throughput.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
