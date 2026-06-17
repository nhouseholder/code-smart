import type { Metadata } from "next";
import Link from "next/link";
import { getMethodologyMeta } from "@/lib/data-loader";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Methodology — Code Smart",
  description: "How Code Smart derives token estimates, weights model quality, and computes the quality-adjusted Value Score — with explicit confidence levels for every figure.",
};

const ESTIMATION_LAYERS: Array<{ n: number; trigger: string; method: string; confidence: string }> = [
  { n: 1, trigger: "Limit unit is tokens", method: "Use the value directly; apply model multiplier if configured.", confidence: "observed" },
  { n: 2, trigger: "Message limits", method: "Monthly messages × tokens per coding message (low/base/high).", confidence: "inferred" },
  { n: 3, trigger: "Request / call limits", method: "Monthly requests × tokens per agentic request (low/base/high).", confidence: "inferred" },
  { n: 4, trigger: "Credit limits", method: "Credits × provider-specific or default credit-to-token mapping.", confidence: "inferred / assumed" },
  { n: 5, trigger: "Compute units", method: "Units × provider-specific or default compute-unit-to-token mapping.", confidence: "inferred / assumed" },
  { n: 6, trigger: "Time-window catch-all", method: "Extrapolate proportionally across the reset window; apply model multiplier.", confidence: "window-dependent" },
  { n: 7, trigger: "Unknown / vague", method: "All estimates null — rendered as “—”, never 0. “Unlimited”/fair-use coding claims are treated as unknown — never a synthetic estimate.", confidence: "unknown" },
];

const CONFIDENCE_DEFS: Array<{ key: string; dot: string; def: string }> = [
  { key: "observed", dot: "bg-green-500", def: "Read directly from the provider's official page or API." },
  { key: "inferred", dot: "bg-blue-500", def: "Mathematically derived from observed figures (e.g. annual ÷ 12)." },
  { key: "assumed", dot: "bg-amber-500", def: "A reasonable assumption, not yet verified from an official source." },
  { key: "stale", dot: "bg-red-500", def: "Was observed, but the source is now more than 90 days old." },
  { key: "unknown", dot: "bg-gray-400", def: "Could not be determined; the value is null and displays as “—”." },
];

export default function MethodologyPage() {
  const meta = getMethodologyMeta();
  const wmq = meta.wmq ?? {};
  const bands = (meta.priceBands ?? {}) as Record<string, string>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Methodology</h1>
        <p className="text-gray-500 mt-2">
          Every number on this site is derived from independently published data — Artificial Analysis
          benchmarks, provider pricing pages, and disclosed usage limits. Code Smart computes none of the
          source inputs; it normalizes and combines them, and labels every estimate with a confidence level.
          {meta.generated_at && <span className="text-gray-400"> Last regenerated {meta.generated_at} (methodology v{meta.version}).</span>}
        </p>
      </header>

      {/* WMQ */}
      <section id="wmq" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Weighted Model Quality (WMQ)</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Each model's quality is a weighted blend of three Artificial Analysis indices, all on a 0–100 scale:
        </p>
        <ul className="text-sm text-gray-700 space-y-1.5">
          <li><strong>{pct(wmq.agentic, 0.5)} Agentic Index</strong> — multi-step autonomous task completion (the highest-value capability).</li>
          <li><strong>{pct(wmq.coding, 0.4)} Coding Index</strong> — code generation, debugging and refactoring quality.</li>
          <li><strong>{pct(wmq.speed, 0.1)} Speed Score</strong> — normalized output tokens/second; secondary to quality.</li>
        </ul>
        <pre className="rounded-lg bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto">
{`WMQ = ${fmt(wmq.agentic, 0.5)} × Agentic
    + ${fmt(wmq.coding, 0.4)} × Coding
    + ${fmt(wmq.speed, 0.1)} × Speed`}
        </pre>
        <p className="text-[12px] text-gray-400">
          AA Speed is not exported as a standalone column in the static dataset; it is folded into WMQ at the
          weight above. Where AA has no profile for a model, WMQ cannot be computed and the Value Score shows “—”.
        </p>
      </section>

      {/* Value Score formula */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">The Value Score</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          The Value Score answers one question: <em>how much high-quality coding capability does this plan
          provide per dollar per month?</em>
        </p>
        <pre className="rounded-lg bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto">
{meta.formula ?? `QAMU = Estimated Monthly Tokens × (WMQ / 100)
Value Score (raw) = QAMU / Effective Monthly Price
Value Score = normalized within price tier to 0–100`}
        </pre>
        <p className="text-[12px] text-gray-400">
          Normalized against a reference of 1M quality-adjusted tokens at $20/mo. A free plan has no
          price denominator, so it carries no normalized Value Score.
        </p>
      </section>

      {/* Efficiency multiplier */}
      <section id="efficiency" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Efficiency multiplier</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Two models can post the same quality score yet differ sharply in how much compute they burn to
          finish real work. Artificial Analysis publishes a <strong>cost-per-task</strong> figure — the dollar
          cost to run its standardized agentic task — and Code Smart folds it into the Value Score as a
          bounded multiplier. Cheaper-per-task nudges value up; pricier nudges it down. It rides on top of
          quality and price rather than replacing either, so it can never dominate them.
        </p>
        <pre className="rounded-lg bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto">
{`reference   = median cost-per-task across models with data
eff         = clamp(0, 100, reference / costPerTask × 50)   // median model → 50
multiplier  = 0.85 + (eff / 100) × 0.30                     // bounded [0.85, 1.15]
Value Score = QAMU × multiplier / price → normalized 0–100`}
        </pre>
        <p className="text-[12px] text-gray-400">
          The reference is self-calibrating: the median model sits at a neutral 1.0×, cheaper models reach up
          to 1.15×, pricier ones down to 0.85×. When a model has no published cost-per-task — the current
          state for every model — the multiplier is exactly 1.0 and the Value Score is unchanged. Cost-per-task
          and the active multiplier surface on each ranking card (“—” until a value is sourced).
        </p>
      </section>

      {/* Token estimation */}
      <section id="token-estimation" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Token estimation</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Providers disclose limits in many units — messages, requests, credits, compute units, or raw
          tokens. The normalization engine converts each into per-window token estimates using an 8-layer
          priority dispatch; the first matching layer wins. <strong>These are estimates, not guarantees.</strong>
        </p>
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="py-2.5 px-3 text-left w-8">#</th>
                <th className="py-2.5 px-3 text-left">Trigger</th>
                <th className="py-2.5 px-3 text-left">Method</th>
                <th className="py-2.5 px-3 text-left">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {ESTIMATION_LAYERS.map((l) => (
                <tr key={l.n} className="border-t border-gray-100 even:bg-gray-50/40 align-top">
                  <td className="py-2.5 px-3 text-gray-400 tabular-nums">{l.n}</td>
                  <td className="py-2.5 px-3 text-gray-700">{l.trigger}</td>
                  <td className="py-2.5 px-3 text-gray-600">{l.method}</td>
                  <td className="py-2.5 px-3 text-gray-500">{l.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-gray-400">
          Per-window estimates (5h / 24h / 1w / 1mo) are extrapolated proportionally with confidence decay.
          A vague or undisclosed limit yields null — shown as “—”, never a misleading 0.
        </p>
      </section>

      {/* Confidence */}
      <section id="confidence" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Confidence levels</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Every figure carries one of five confidence levels. Confidence is <strong>never upgraded</strong> —
          a derived value can be no more certain than its weakest input.
        </p>
        <dl className="space-y-2.5">
          {CONFIDENCE_DEFS.map((c) => (
            <div key={c.key} className="flex items-start gap-3">
              <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
              <div>
                <dt className="text-sm font-semibold text-gray-900 capitalize">{c.key}</dt>
                <dd className="text-sm text-gray-500">{c.def}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {/* Price bands */}
      {Object.keys(bands).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-gray-900">Price bands</h2>
          <ul className="text-sm text-gray-700 space-y-1">
            {Object.entries(bands).map(([k, v]) => (
              <li key={k}><strong className="capitalize">{k}</strong> — {String(v)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Limitations */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Limitations</h2>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc pl-5">
          <li>Usage limits are <strong>estimates</strong> derived from disclosed plan terms — not guaranteed allowances. Real-world usage varies with prompt size and task type.</li>
          <li>AA benchmark snapshots are fetched weekly; a snapshot older than 14 days is flagged on the model card.</li>
          <li>Models without an AA profile have no WMQ and no Value Score (shown as “—”).</li>
          <li>Pricing is manually verified per provider; see each plan's source link and verification date.</li>
        </ul>
        <p className="text-sm text-gray-500 pt-2">
          See the <Link href="/freshness" className="text-brand-600 hover:text-brand-700 font-medium">data freshness</Link> page
          for source dates and stale-data warnings.
        </p>
      </section>
    </div>
  );
}

/** "50%" from a weight fraction, falling back to the documented default. */
function pct(value: number | undefined, fallback: number): string {
  const v = value ?? fallback;
  return `${Math.round(v * 100)}%`;
}

/** "0.50" coefficient string for the formula block. */
function fmt(value: number | undefined, fallback: number): string {
  return (value ?? fallback).toFixed(2);
}
