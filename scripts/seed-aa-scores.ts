/**
 * seed-aa-scores.ts — Seeds artificial_analysis_model_scores with data
 * scraped from artificialanalysis.ai on 2026-06-15.
 *
 * LIMITATIONS (document before replacing with real data):
 *  - codingIndex / agenticIndex: premium-gated on AA; proxied from
 *    intelligenceIndex until real values are available.
 *  - speedScore: pre-normalized from raw TPS using a 300-TPS ceiling
 *    (fastest frontier model in the leaderboard ≈ 220 TPS as of 2026-06-15).
 *  - confidence: "assumed" throughout — replace with "observed" once real
 *    Coding/Agentic indices are sourced.
 *  - cursor-* models are not direct AA models; data proxied from the
 *    underlying model (claude-sonnet-4-6 / gpt-4o).
 *
 * Usage:
 *   npx tsx scripts/seed-aa-scores.ts
 *   npm run db:seed-aa
 */

import { getDb, runMigrations } from "../src/db/index";
import { artificialAnalysisModelScores } from "../src/db/schema";
import { sql } from "drizzle-orm";

const OBSERVED_AT = "2026-06-15";
const SOURCE = "https://artificialanalysis.ai";
const SPEED_TPS_CEILING = 300;

function normalizeTps(tps: number): number {
  return Math.min(100, Math.round((tps / SPEED_TPS_CEILING) * 100));
}

interface AaEntry {
  modelId: string;
  aaSlug: string | null;
  intelligenceIndex: number;
  speedTps: number;
  inputPrice: number | null;
  outputPrice: number | null;
}

// Data sourced from artificialanalysis.ai individual model pages.
// Intelligence index values from the public AA leaderboard (2026-06-15).
// Prices from the model detail pages (USD per 1M tokens).
// codingIndex and agenticIndex are set equal to intelligenceIndex (see file header).
const AA_DATA: AaEntry[] = [
  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    modelId: "claude-haiku-4-5",
    aaSlug: "claude-4-5-haiku",
    intelligenceIndex: 31,
    speedTps: 95.1,
    inputPrice: 1.00,
    outputPrice: 5.00,
  },
  {
    modelId: "claude-sonnet-4-6",
    aaSlug: "claude-sonnet-4-6",
    intelligenceIndex: 44,
    speedTps: 44.2,
    inputPrice: 3.00,
    outputPrice: 15.00,
  },
  {
    modelId: "claude-opus-4-8",
    aaSlug: "claude-opus-4-8",
    intelligenceIndex: 61,
    speedTps: 60.4,
    inputPrice: 5.00,
    outputPrice: 25.00,
  },
  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    modelId: "gpt-4o",
    aaSlug: "gpt-4o",
    intelligenceIndex: 17,
    speedTps: 190.8,
    inputPrice: 2.50,
    outputPrice: 10.00,
  },
  {
    modelId: "o3",
    aaSlug: "o3",
    intelligenceIndex: 38,
    speedTps: 138.2,
    inputPrice: 2.00,
    outputPrice: 8.00,
  },
  {
    modelId: "o4-mini",
    aaSlug: "o4-mini",
    intelligenceIndex: 33,
    speedTps: 186.5,
    inputPrice: 1.10,
    outputPrice: 4.40,
  },
  // ── Google ────────────────────────────────────────────────────────────────
  {
    modelId: "gemini-2-5-pro",
    aaSlug: "gemini-2-5-pro",
    intelligenceIndex: 35,
    speedTps: 139.9,
    inputPrice: 1.25,
    outputPrice: 10.00,
  },
  {
    modelId: "gemini-2-5-flash",
    aaSlug: "gemini-2-5-flash",
    intelligenceIndex: 21,
    speedTps: 220.3,
    inputPrice: 0.30,
    outputPrice: 2.50,
  },
  // ── Cursor (proxy — not direct AA models) ─────────────────────────────────
  {
    modelId: "cursor-claude-sonnet",
    aaSlug: null,           // proxied from claude-sonnet-4-6
    intelligenceIndex: 44,
    speedTps: 44.2,
    inputPrice: null,       // cursor uses credit-based pricing; no per-token API price
    outputPrice: null,
  },
  {
    modelId: "cursor-gpt-4o",
    aaSlug: null,           // proxied from gpt-4o
    intelligenceIndex: 17,
    speedTps: 190.8,
    inputPrice: null,
    outputPrice: null,
  },
];

export function seedAaScores(): void {
  const db = getDb();

  const existing = db
    .select({ count: sql<number>`count(*)` })
    .from(artificialAnalysisModelScores)
    .get();

  if (existing && existing.count > 0) {
    console.log(
      `AA scores table already has ${existing.count} rows — skipping.\n` +
      `To re-seed: DELETE FROM artificial_analysis_model_scores; then re-run.`,
    );
    return;
  }

  console.log(`Seeding AA scores for ${AA_DATA.length} models...`);

  db.transaction((tx) => {
    for (const entry of AA_DATA) {
      const speedScore = normalizeTps(entry.speedTps);

      const rawNote = entry.aaSlug
        ? `Scraped from ${SOURCE}/models/${entry.aaSlug}. codingIndex+agenticIndex proxied from intelligenceIndex (AA premium gate). speedScore = round(${entry.speedTps} TPS / ${SPEED_TPS_CEILING}) = ${speedScore}.`
        : `Proxy model: not on AA directly; data from underlying model. speedScore = round(${entry.speedTps} TPS / ${SPEED_TPS_CEILING}) = ${speedScore}. inputPrice/outputPrice null — cursor credit-based pricing.`;

      tx.insert(artificialAnalysisModelScores).values({
        modelId: entry.modelId,
        observedAt: OBSERVED_AT,
        intelligenceIndex: entry.intelligenceIndex,
        codingIndex: entry.intelligenceIndex,    // proxy — replace when real data available
        agenticIndex: entry.intelligenceIndex,   // proxy — replace when real data available
        speedScore,
        inputPrice: entry.inputPrice,
        outputPrice: entry.outputPrice,
        source: SOURCE,
        confidence: "assumed",
        priceEfficiencyMetricsJson: null,
        rawPayloadJson: JSON.stringify({
          aaSlug: entry.aaSlug,
          speedRawTps: entry.speedTps,
          speedNormCeiling: SPEED_TPS_CEILING,
          note: rawNote,
        }),
      }).run();

      console.log(
        `  ✓ ${entry.modelId.padEnd(22)} ` +
        `intel=${entry.intelligenceIndex} ` +
        `speed=${speedScore} (${entry.speedTps} TPS) ` +
        `price=$${entry.inputPrice ?? "n/a"}/$${entry.outputPrice ?? "n/a"}`,
      );
    }
  });

  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(artificialAnalysisModelScores)
    .get();

  console.log(`\nSeed complete: ${row?.count ?? 0} AA score rows inserted.`);
  console.log("NOTE: codingIndex and agenticIndex are proxied from intelligenceIndex.");
  console.log("      Replace with real AA values when available.");
}

if (
  process.argv[1]?.endsWith("seed-aa-scores.ts") ||
  process.argv[1]?.endsWith("seed-aa-scores")
) {
  getDb();
  runMigrations();
  seedAaScores();
  process.exit(0);
}
