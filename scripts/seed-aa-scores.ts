/**
 * seed-aa-scores.ts — Seeds artificial_analysis_model_scores from the
 * generated artifact src/data/aa-scores.json (produced by
 * scripts/fetch-aa-current-models.ts off the Artificial Analysis API).
 *
 * Each row carries the real AA intelligence + coding indices, so confidence is
 * "observed". Remaining proxies/limitations:
 *  - agenticIndex: AA does not expose a standalone agentic index in the v2 API,
 *    so it is proxied from the real codingIndex (closest published signal).
 *  - speedScore: normalized from median_output_tokens_per_second using a
 *    300-TPS ceiling. Rows where AA reports no TPS (0) normalize to 0.
 *
 * To refresh: re-run `pnpm exec tsx scripts/fetch-aa-current-models.ts`, then
 * re-seed. Source of truth is the JSON artifact — never hand-edit rows here.
 *
 * Usage:
 *   npx tsx scripts/seed-aa-scores.ts
 *   npm run db:seed-aa
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getDb, runMigrations } from "../src/db/index";
import { artificialAnalysisModelScores } from "../src/db/schema";
import { sql } from "drizzle-orm";

const SOURCE = "https://artificialanalysis.ai";
const SPEED_TPS_CEILING = 300;

function normalizeTps(tps: number): number {
  return Math.min(100, Math.round((tps / SPEED_TPS_CEILING) * 100));
}

interface AaEntry {
  modelId: string;
  aaSlug: string | null;
  intelligenceIndex: number;
  codingIndex: number | null;
  speedTps: number;
  inputPrice: number | null;
  outputPrice: number | null;
  // AA cost-per-task (USD) — not exposed by the v2 API; null until sourced.
  costPerTaskUsd?: number | null;
}

interface AaScoresArtifact {
  observed_at: string;
  source: string;
  speed_tps_ceiling: number;
  note?: string;
  scores: AaEntry[];
}

// Load the generated AA artifact (real indices, observed via the AA API).
const AA_SCORES_PATH = path.join(__dirname, "..", "src", "data", "aa-scores.json");
const _artifact = JSON.parse(fs.readFileSync(AA_SCORES_PATH, "utf8")) as AaScoresArtifact;
const OBSERVED_AT = _artifact.observed_at;
const AA_DATA: AaEntry[] = _artifact.scores;

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

      // Real AA coding index where present; fall back to intelligence only if absent.
      const codingIndex = entry.codingIndex ?? entry.intelligenceIndex;
      const rawNote =
        `From AA API via ${SOURCE}/models/${entry.aaSlug ?? entry.modelId}. ` +
        `intelligenceIndex + codingIndex observed; agenticIndex proxied from codingIndex (no AA agentic index in v2 API). ` +
        `speedScore = round(${entry.speedTps} TPS / ${SPEED_TPS_CEILING}) = ${speedScore}.`;

      tx.insert(artificialAnalysisModelScores).values({
        modelId: entry.modelId,
        observedAt: OBSERVED_AT,
        intelligenceIndex: entry.intelligenceIndex,
        codingIndex,                              // real AA coding index
        agenticIndex: codingIndex,                // proxy — AA v2 has no agentic index
        speedScore,
        inputPrice: entry.inputPrice,
        outputPrice: entry.outputPrice,
        source: SOURCE,
        confidence: "observed",
        priceEfficiencyMetricsJson: JSON.stringify({
          costPerTaskUsd: entry.costPerTaskUsd ?? null,
          accessedDate: entry.costPerTaskUsd != null ? OBSERVED_AT : null,
        }),
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

  console.log(`\nSeed complete: ${row?.count ?? 0} AA score rows inserted (observed ${OBSERVED_AT}).`);
  console.log("NOTE: intelligenceIndex + codingIndex are real AA values; agenticIndex proxied from codingIndex.");
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
