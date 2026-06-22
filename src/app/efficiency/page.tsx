import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Model Efficiency — Code Smart",
  description:
    "AI models ranked by Intel·t/s per $100 tasks — a composite of intelligence, throughput, and cost from Artificial Analysis and OpenRouter pricing.",
};

type Model = {
  name: string;
  lab: "US" | "CN";
  intel: number;
  tps: number;
  tokPerTask: number;
  tokApprox: boolean;
  inPer1M: number;
  cachePer1M: number | null;
  outPer1M: number;
};

const MODELS: Model[] = [
  { name: "GPT-OSS 120B",  lab: "US", intel: 24, tps: 344, tokPerTask: 36000,  tokApprox: false, inPer1M: 0.039, cachePer1M: null,  outPer1M: 0.180 },
  { name: "Mimo V2.5",     lab: "CN", intel: 40, tps: 82,  tokPerTask: 20000,  tokApprox: true,  inPer1M: 0.140, cachePer1M: 0.003, outPer1M: 0.280 },
  { name: "DS V4 Flash",   lab: "CN", intel: 40, tps: 108, tokPerTask: 45000,  tokApprox: false, inPer1M: 0.090, cachePer1M: 0.020, outPer1M: 0.180 },
  { name: "MiniMax M2.5",  lab: "CN", intel: 34, tps: 209, tokPerTask: 16000,  tokApprox: true,  inPer1M: 0.150, cachePer1M: 0.050, outPer1M: 0.900 },
  { name: "Gemma 4 31B",   lab: "US", intel: 29, tps: 35,  tokPerTask: 12000,  tokApprox: false, inPer1M: 0.120, cachePer1M: 0.090, outPer1M: 0.350 },
  { name: "Grok 4.3",      lab: "US", intel: 38, tps: 135, tokPerTask: 14000,  tokApprox: false, inPer1M: 1.250, cachePer1M: 0.200, outPer1M: 2.500 },
  { name: "DS V4 Pro",     lab: "CN", intel: 44, tps: 91,  tokPerTask: 37000,  tokApprox: false, inPer1M: 0.435, cachePer1M: 0.004, outPer1M: 0.870 },
  { name: "MiMo-V2.5-Pro", lab: "CN", intel: 42, tps: 53,  tokPerTask: 20000,  tokApprox: false, inPer1M: 0.435, cachePer1M: 0.004, outPer1M: 0.870 },
  { name: "MiniMax-M2.7",  lab: "CN", intel: 38, tps: 49,  tokPerTask: 18000,  tokApprox: false, inPer1M: 0.250, cachePer1M: 0.050, outPer1M: 1.000 },
  { name: "MiniMax-M3",    lab: "CN", intel: 44, tps: 57,  tokPerTask: 24000,  tokApprox: false, inPer1M: 0.300, cachePer1M: 0.060, outPer1M: 1.200 },
  { name: "GPT-5.4 Nano",  lab: "US", intel: 38, tps: 162, tokPerTask: 71000,  tokApprox: false, inPer1M: 0.200, cachePer1M: 0.020, outPer1M: 1.250 },
  { name: "GLM-5",         lab: "CN", intel: 40, tps: 77,  tokPerTask: 26000,  tokApprox: true,  inPer1M: 0.600, cachePer1M: 0.120, outPer1M: 1.920 },
  { name: "GLM-5.1",       lab: "CN", intel: 40, tps: 90,  tokPerTask: 26000,  tokApprox: false, inPer1M: 0.980, cachePer1M: 0.490, outPer1M: 3.080 },
  { name: "Haiku 4.5",     lab: "US", intel: 24, tps: 89,  tokPerTask: 10000,  tokApprox: true,  inPer1M: 1.000, cachePer1M: 0.100, outPer1M: 5.000 },
  { name: "Kimi K2.5",     lab: "CN", intel: 38, tps: 55,  tokPerTask: 30000,  tokApprox: true,  inPer1M: 0.375, cachePer1M: null,  outPer1M: 2.025 },
  { name: "Kimi K2.6",     lab: "CN", intel: 43, tps: 45,  tokPerTask: 35000,  tokApprox: false, inPer1M: 0.660, cachePer1M: 0.330, outPer1M: 3.500 },
];

// 10k input tokens: 7k fresh + 3k cache
function costPerTask(m: Model): number {
  const freshCost = (7000 * m.inPer1M) / 1_000_000;
  const cacheCost = (3000 * (m.cachePer1M ?? m.inPer1M)) / 1_000_000;
  const outCost = (m.tokPerTask * m.outPer1M) / 1_000_000;
  return freshCost + cacheCost + outCost;
}

type Row = Model & { cost100: number; intelPerCost: number; composite: number };

const ROWS: Row[] = MODELS.map((m) => {
  const cost100 = costPerTask(m) * 100;
  const intelPerCost = m.intel / cost100;
  const composite = (m.intel * m.tps) / cost100;
  return { ...m, cost100, intelPerCost, composite };
}).sort((a, b) => b.composite - a.composite);

const MAX_COMPOSITE = ROWS[0].composite;

function fmt(n: number, digits = 1) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

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
                <th className="py-2.5 px-3 text-left w-40">Efficiency bar</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const pct = (r.composite / MAX_COMPOSITE) * 100;
                return (
                  <tr key={r.name} className="border-t border-gray-100 even:bg-gray-50/40">
                    <td className="py-2.5 px-3 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-900">
                      {r.name}
                      {r.tokApprox && (
                        <span className="ml-1 text-[10px] text-amber-500" title="Tok/Task estimated">~</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        r.lab === "US"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-red-50 text-red-700"
                      }`}>
                        {r.lab}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.intel}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.tps.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">${fmt(r.cost100, 3)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{fmt(r.intelPerCost)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">
                      {Math.round(r.composite).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-brand-500 h-2 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          ~ = Tok/Task estimated (Artificial Analysis shows &ldquo;Verbosity N/A&rdquo;); cost is approximate.
          Lab badges: <span className="text-blue-700 font-semibold">US</span> = US-headquartered lab,{" "}
          <span className="text-red-700 font-semibold">CN</span> = Chinese-headquartered lab.
        </p>
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
