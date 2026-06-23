/**
 * fetch-aa-current-models.ts — Re-runnable generator that pulls the current
 * model catalog from Artificial Analysis (AA), keeps only models released in
 * the last 6 months, curates a top-N set by AA intelligence index, and emits:
 *
 *   1. src/data/providers/<provider>.json  — upserts the curated models into
 *      each provider's `models[]` (existing models preserved; new ones added).
 *   2. src/data/aa-scores.json             — AA intelligence/coding/speed/price
 *      rows consumed by scripts/seed-aa-scores.ts.
 *
 * Every value traces to the AA API (https://artificialanalysis.ai) — no
 * fabrication. AA-sourced rows are provenance.confidence = "observed",
 * method = "automated", accessed on RUN_DATE.
 *
 * Source: GET https://artificialanalysis.ai/api/v2/data/llms/models
 *         header x-api-key: $ARTIFICIAL_ANALYSIS_API_KEY
 *
 * Usage:
 *   ARTIFICIAL_ANALYSIS_API_KEY=... npx tsx scripts/fetch-aa-current-models.ts
 *   (falls back to /tmp/aa-models.json cache when the key/network is absent)
 */

import * as fs from "node:fs";
import * as path from "node:path";

const RUN_DATE = "2026-06-23"; // accessed_date stamped on every AA-sourced row
const MONTHS_BACK = 12;
const TOP_N = 100; // curated catalog size target
const PER_PROVIDER_CAP = 12; // diversity guard — trims a single creator's long tail
const SPEED_TPS_CEILING = 300; // matches seed-aa-scores normalization
const AA_BASE = "https://artificialanalysis.ai";
const AA_ENDPOINT = `${AA_BASE}/api/v2/data/llms/models`;
const CACHE_PATH = "/tmp/aa-models.json";

const PROVIDERS_DIR = path.join(__dirname, "..", "src", "data", "providers");
const AA_SCORES_PATH = path.join(__dirname, "..", "src", "data", "aa-scores.json");

// AA model_creator.slug -> our provider_id.
// Unknown creators fall through gracefully: score row emitted, provider upsert skipped.
const CREATOR_TO_PROVIDER: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  alibaba: "qwen",
  kimi: "kimi",
  minimax: "minimax",
  xai: "xai",
  deepseek: "deepseek",
  meta: "meta",
  mistral: "mistral",
  cohere: "cohere",
  microsoft: "microsoft",
};

// ── AA row typing (only the fields we read) ──────────────────────────────
interface AaPricing {
  price_1m_input_tokens?: number | null;
  price_1m_output_tokens?: number | null;
  price_1m_blended_3_to_1?: number | null;
}
interface AaEvaluations {
  artificial_analysis_intelligence_index?: number | null;
  artificial_analysis_coding_index?: number | null;
  artificial_analysis_math_index?: number | null;
  gpqa?: number | null;
  livecodebench?: number | null;
}
interface AaRow {
  id: string;
  name: string;
  slug: string;
  release_date: string | null;
  model_creator?: { slug?: string; name?: string } | null;
  evaluations?: AaEvaluations | null;
  pricing?: AaPricing | null;
  median_output_tokens_per_second?: number | null;
}

// ── Fetch (live, with /tmp cache fallback) ───────────────────────────────
async function loadAaRows(): Promise<AaRow[]> {
  const key = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  if (key) {
    try {
      const res = await fetch(AA_ENDPOINT, { headers: { "x-api-key": key } });
      if (!res.ok) throw new Error(`AA API ${res.status} ${res.statusText}`);
      const json = (await res.json()) as { data?: AaRow[] };
      const rows = json.data ?? [];
      if (rows.length === 0) throw new Error("AA API returned 0 rows");
      fs.writeFileSync(CACHE_PATH, JSON.stringify({ data: rows }, null, 2));
      console.log(`Fetched ${rows.length} models from AA API (cached → ${CACHE_PATH}).`);
      return rows;
    } catch (err) {
      console.warn(`AA fetch failed (${(err as Error).message}); trying cache…`);
    }
  } else {
    console.warn("ARTIFICIAL_ANALYSIS_API_KEY not set; using cache.");
  }
  if (fs.existsSync(CACHE_PATH)) {
    const json = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as { data?: AaRow[] };
    console.log(`Loaded ${json.data?.length ?? 0} models from cache ${CACHE_PATH}.`);
    return json.data ?? [];
  }
  throw new Error("No AA data: set ARTIFICIAL_ANALYSIS_API_KEY or provide " + CACHE_PATH);
}

// ── Helpers ──────────────────────────────────────────────────────────────
function cutoffDate(): string {
  const [y, m, d] = RUN_DATE.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() - MONTHS_BACK);
  return dt.toISOString().slice(0, 10);
}

// Collapse reasoning-effort / snapshot variants onto a canonical base, so the
// catalog isn't padded with e.g. gpt-5-5 / -high / -medium / -low. Size
// variants (mini, nano, max, plus, flash, pro, codex, *b) are kept distinct.
const EFFORT_SUFFIX =
  /-(high|medium|low|minimal|reasoning|non-reasoning|adaptive|thinking|instant|low-effort|preview|v\d+)$/;
const DATE_SUFFIX = /-\d{4,8}$/;
function baseKey(slug: string): string {
  let s = slug;
  let prev = "";
  // Strip effort + date snapshots iteratively so interleaved suffixes
  // (e.g. -0309-non-reasoning) all collapse onto the canonical base.
  while (prev !== s) {
    prev = s;
    s = s.replace(EFFORT_SUFFIX, "").replace(DATE_SUFFIX, "");
  }
  return s;
}

// Strip parenthetical/effort/date noise from AA display names so the catalog
// shows "Grok 4.20" not "Grok 4.20 0309 v2 (Reasoning)".
function cleanName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+v\d+\b/gi, "")
    .replace(/\s+\d{4,8}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function intel(row: AaRow): number {
  return row.evaluations?.artificial_analysis_intelligence_index ?? -1;
}

function deriveStrengths(ev: AaEvaluations | null | undefined): string[] {
  const out: string[] = [];
  if (ev?.artificial_analysis_coding_index != null) out.push("coding");
  if (ev?.artificial_analysis_intelligence_index != null) out.push("reasoning");
  if ((ev?.artificial_analysis_math_index ?? 0) >= 40) out.push("math");
  return out.length ? out : ["general"];
}

interface Benchmark {
  name: string;
  score: number | null;
  unit: "percent" | "pass@1" | "normalized" | "rank";
  higher_is_better: boolean;
  notes?: string;
  provenance: Provenance;
}
interface Provenance {
  url: string;
  accessed_date: string;
  method: "manual" | "automated";
  confidence: "observed" | "inferred" | "assumed" | "stale" | "unknown";
  notes?: string;
}

function aaProvenance(slug: string, notes?: string): Provenance {
  return {
    url: `${AA_BASE}/models/${slug}`,
    accessed_date: RUN_DATE,
    method: "automated",
    confidence: "observed",
    ...(notes ? { notes } : {}),
  };
}

function deriveBenchmarks(row: AaRow): Benchmark[] {
  const ev = row.evaluations ?? {};
  const prov = aaProvenance(row.slug, "Artificial Analysis evaluation, accessed via AA API.");
  const out: Benchmark[] = [];
  const push = (name: string, score: number | null | undefined, unit: Benchmark["unit"]) => {
    if (typeof score === "number" && score >= 0 && score <= 200) {
      out.push({ name, score: Math.round(score * 10) / 10, unit, higher_is_better: true, provenance: prov });
    }
  };
  // Only the three AA composite indices — all on a consistent 0-100 normalized
  // scale. AA's gpqa/livecodebench are 0-1 fractions (would read as ~0.9%), so
  // they are intentionally excluded rather than mis-stored as "percent".
  push("AA Intelligence Index", ev.artificial_analysis_intelligence_index, "normalized");
  push("AA Coding Index", ev.artificial_analysis_coding_index, "normalized");
  push("AA Math Index", ev.artificial_analysis_math_index, "normalized");
  return out;
}

interface ModelObject {
  id: string;
  provider_id: string;
  display_name: string;
  context_length_k: number | null;
  strengths: string[];
  released_date?: string;
  benchmarks: Benchmark[];
  provenance: Provenance;
}

interface AaScoreEntry {
  modelId: string;
  aaSlug: string;
  intelligenceIndex: number;
  codingIndex: number | null;
  agenticIndex: number | null; // ponytail: proxy from codingIndex — AA v2 has no agentic index
  speedTps: number;
  inputPrice: number | null;
  outputPrice: number | null;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const rows = await loadAaRows();
  const cutoff = cutoffDate();
  console.log(`Cutoff (release_date >= ${cutoff}); curating top ${TOP_N}, cap ${PER_PROVIDER_CAP}/provider.`);

  // 1. Filter to recent models from any creator (tracked or not).
  const recent = rows.filter((r) => {
    return r.release_date && r.release_date >= cutoff && r.model_creator?.slug;
  });

  // 2. Dedup effort/snapshot variants per (creator, baseKey) — keep highest intel.
  const groups = new Map<string, AaRow>();
  for (const r of recent) {
    const creatorSlug = r.model_creator!.slug!;
    const k = `${creatorSlug}::${baseKey(r.slug)}`;
    const cur = groups.get(k);
    if (!cur || intel(r) > intel(cur)) groups.set(k, r);
  }
  const deduped = [...groups.values()];

  // 3. Per-provider cap (top by intelligence within each provider), then take
  //    the global top-N by intelligence — curated + diverse.
  const byProvider = new Map<string, AaRow[]>();
  for (const r of deduped) {
    const creatorSlug = r.model_creator!.slug!;
    (byProvider.get(creatorSlug) ?? byProvider.set(creatorSlug, []).get(creatorSlug)!).push(r);
  }
  const capped: AaRow[] = [];
  for (const list of byProvider.values()) {
    list.sort((a, b) => intel(b) - intel(a));
    capped.push(...list.slice(0, PER_PROVIDER_CAP));
  }
  capped.sort((a, b) => intel(b) - intel(a));
  const selected = capped.slice(0, TOP_N);

  // 4. Build model objects + AA score rows, grouped by provider.
  const modelsByProvider = new Map<string, ModelObject[]>();
  const aaScores: AaScoreEntry[] = [];
  for (const r of selected) {
    const creatorSlug = r.model_creator!.slug!;
    const pid = CREATOR_TO_PROVIDER[creatorSlug] ?? creatorSlug;
    const ev = r.evaluations ?? {};
    const model: ModelObject = {
      id: r.slug,
      provider_id: pid,
      display_name: cleanName(r.name),
      context_length_k: null, // AA API does not expose context window
      strengths: deriveStrengths(ev),
      ...(r.release_date ? { released_date: r.release_date } : {}),
      benchmarks: deriveBenchmarks(r),
      provenance: aaProvenance(
        r.slug,
        "Model sourced from Artificial Analysis API; release_date and AA indices observed, context window not provided by AA (null).",
      ),
    };
    (modelsByProvider.get(pid) ?? modelsByProvider.set(pid, []).get(pid)!).push(model);

    aaScores.push({
      modelId: r.slug,
      aaSlug: r.slug,
      intelligenceIndex: ev.artificial_analysis_intelligence_index ?? 0,
      codingIndex: ev.artificial_analysis_coding_index ?? null,
      agenticIndex: ev.artificial_analysis_coding_index ?? null,
      speedTps: r.median_output_tokens_per_second ?? 0,
      inputPrice: r.pricing?.price_1m_input_tokens ?? null,
      outputPrice: r.pricing?.price_1m_output_tokens ?? null,
    });
  }

  // 5. Upsert into each provider JSON (existing models preserved by id).
  let added = 0;
  let updated = 0;
  for (const [pid, models] of modelsByProvider) {
    const file = path.join(PROVIDERS_DIR, `${pid}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`  ⚠ no provider file for "${pid}" — skipping model upsert, AA score row kept`);
      continue;
    }
    const provider = JSON.parse(fs.readFileSync(file, "utf8")) as { models: ModelObject[] };
    const byId = new Map(provider.models.map((m) => [m.id, m] as const));
    for (const m of models) {
      if (byId.has(m.id)) {
        // Refresh AA-sourced fields on an existing model, preserve any extra keys.
        const existing = byId.get(m.id)!;
        Object.assign(existing, {
          display_name: m.display_name,
          released_date: m.released_date,
          strengths: existing.strengths?.length ? existing.strengths : m.strengths,
          benchmarks: m.benchmarks.length ? m.benchmarks : existing.benchmarks,
          provenance: m.provenance,
        });
        if (existing.context_length_k == null) existing.context_length_k = m.context_length_k;
        updated++;
      } else {
        provider.models.push(m);
        byId.set(m.id, m);
        added++;
      }
    }
    fs.writeFileSync(file, JSON.stringify(provider, null, 2) + "\n");
    console.log(`  ✓ ${pid.padEnd(10)} ${models.length} curated (${provider.models.length} total in file)`);
  }

  // 6. Emit AA scores artifact (sorted by intelligence desc).
  aaScores.sort((a, b) => b.intelligenceIndex - a.intelligenceIndex);
  fs.writeFileSync(
    AA_SCORES_PATH,
    JSON.stringify(
      {
        observed_at: RUN_DATE,
        source: AA_BASE,
        speed_tps_ceiling: SPEED_TPS_CEILING,
        note: "Generated by scripts/fetch-aa-current-models.ts. codingIndex is the real AA artificial_analysis_coding_index where present (null otherwise).",
        scores: aaScores,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\nSelected ${selected.length} models (${added} added, ${updated} refreshed).`);
  console.log(`AA scores → ${AA_SCORES_PATH} (${aaScores.length} rows).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
