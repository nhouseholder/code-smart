/**
 * generate-model-value-estimates.ts
 *
 * Reads provider JSONs + AA scores from DB → runs model-value-engine →
 * writes public/data/model-value-estimates.json for static serving.
 *
 * Usage:
 *   npx tsx scripts/generate-model-value-estimates.ts
 *   npm run generate:value-estimates
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAllPlans } from "@/lib/data-loader";
import { computePlanValueEstimates, ENGINE_VERSION } from "@/lib/model-value-engine";
import { getDb, runMigrations } from "@/db/index";
import { artificialAnalysisModelScores } from "@/db/schema";
import type { AAModelScore } from "@/types";

// ─── Load AA scores from DB ───────────────────────────────────────────────────

function loadAaScores(): Map<string, AAModelScore> {
  const db = getDb();
  const rows = db.select().from(artificialAnalysisModelScores).all();

  const map = new Map<string, AAModelScore>();
  for (const row of rows) {
    map.set(row.modelId, {
      modelId: row.modelId,
      observedAt: row.observedAt,
      intelligenceIndex: row.intelligenceIndex,
      codingIndex: row.codingIndex,
      agenticIndex: row.agenticIndex,
      speedScore: row.speedScore,
      inputPrice: row.inputPrice,
      outputPrice: row.outputPrice,
      confidence: row.confidence as AAModelScore["confidence"],
      source: row.source,
    });
  }

  return map;
}

// ─── Generate ─────────────────────────────────────────────────────────────────

function generate(): void {
  getDb();
  runMigrations();

  const aaScores = loadAaScores();
  console.log(`Loaded ${aaScores.size} AA score(s) from DB.`);

  const allPlans = getAllPlans();
  console.log(`Processing ${allPlans.length} active plan(s)...`);

  const estimatesByPlan: Record<string, ReturnType<typeof computePlanValueEstimates>> = {};
  let totalEstimates = 0;

  for (const { provider, plan } of allPlans) {
    const estimates = computePlanValueEstimates(plan, provider, aaScores);
    if (estimates.length > 0) {
      estimatesByPlan[plan.id] = estimates;
      totalEstimates += estimates.length;
    }

    const withWmq   = estimates.filter(e => e.weighted_model_quality !== null).length;
    const withScore = estimates.filter(e => e.value_score !== null).length;
    console.log(
      `  ${plan.id.padEnd(40)} ${estimates.length} model(s)` +
      ` | WMQ: ${withWmq}/${estimates.length}` +
      ` | score: ${withScore}/${estimates.length}`,
    );
  }

  const output = {
    generated_at: new Date().toISOString().slice(0, 10),
    engine_version: ENGINE_VERSION,
    total_estimates: totalEstimates,
    plan_count: Object.keys(estimatesByPlan).length,
    aa_score_count: aaScores.size,
    estimates: estimatesByPlan,
  };

  const outDir  = path.join(process.cwd(), "public", "data");
  const outFile = path.join(outDir, "model-value-estimates.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  console.log(`\nWrote ${totalEstimates} estimate(s) across ${output.plan_count} plan(s) → ${outFile}`);
}

generate();
