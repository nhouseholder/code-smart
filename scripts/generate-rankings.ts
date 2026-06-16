/**
 * generate-rankings.ts
 *
 * Reads provider JSONs + latest AA scores from DB → recomputes per-plan value
 * estimates in-process (via model-value-engine) → aggregates the 10 required
 * rankings (computeAllRankings) → persists one row per ranking type to the
 * `rankings` table and writes public/data/api/rankings.json for static serving.
 *
 * Estimates are recomputed here (not read from model-value-estimates.json) so the
 * ranking set is self-contained and deterministic from DB state — no stale-artifact
 * dependency. computeAllRankings itself is pure/clock-free; `observedAt` is injected.
 *
 * Usage:
 *   npx tsx scripts/generate-rankings.ts
 *   npm run generate:rankings
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { getAllPlans } from "@/lib/data-loader";
import { computePlanValueEstimates } from "@/lib/model-value-engine";
import {
  computeAllRankings,
  RANKINGS_METHODOLOGY_VERSION,
  type RankingSet,
} from "@/lib/rankings";
import { getDb, runMigrations } from "@/db/index";
import { getLatestAAScores, insertRanking } from "@/db/helpers";
import { rankings as rankingsTable } from "@/db/schema";
import type { AAModelScore, ModelValueEstimate } from "@/types";

// ─── Load latest AA scores (one per model) as domain objects ──────────────────

function loadLatestAaScores(db: ReturnType<typeof getDb>): Map<string, AAModelScore> {
  const map = new Map<string, AAModelScore>();
  for (const [modelId, row] of getLatestAAScores(db)) {
    map.set(modelId, {
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
  const db = getDb();
  runMigrations();

  const aaScores = loadLatestAaScores(db);
  console.log(`Loaded ${aaScores.size} latest AA score(s) from DB.`);

  const allPlans = getAllPlans();
  console.log(`Processing ${allPlans.length} active plan(s)...`);

  const estimatesByPlan: Record<string, ModelValueEstimate[]> = {};
  let totalEstimates = 0;
  for (const { provider, plan } of allPlans) {
    const estimates = computePlanValueEstimates(plan, provider, aaScores);
    if (estimates.length > 0) {
      estimatesByPlan[plan.id] = estimates;
      totalEstimates += estimates.length;
    }
  }
  console.log(
    `Computed ${totalEstimates} plan×model estimate(s) across ` +
      `${Object.keys(estimatesByPlan).length} plan(s).`,
  );

  // observedAt is the only clock read; injected so computeAllRankings stays pure.
  const observedAt = new Date().toISOString().slice(0, 10);
  const rankingSet: RankingSet = computeAllRankings({
    plans: allPlans,
    estimatesByPlan,
    aaScores,
    observedAt,
  });

  // ─── Persist: one row per ranking type ──────────────────────────────────────
  const r = rankingSet.rankings;
  const dbRows: Array<{ rankingType: string; priceBand: string | null; payload: unknown }> = [
    { rankingType: "price-band-low", priceBand: "low", payload: r.byPriceBand.low },
    { rankingType: "price-band-mid", priceBand: "mid", payload: r.byPriceBand.mid },
    { rankingType: "price-band-high", priceBand: "high", payload: r.byPriceBand.high },
    { rankingType: "model-intelligence", priceBand: null, payload: r.byIntelligence },
    { rankingType: "model-coding", priceBand: null, payload: r.byCoding },
    { rankingType: "model-agentic", priceBand: null, payload: r.byAgentic },
    { rankingType: "model-wmq", priceBand: null, payload: r.byWeightedQuality },
    { rankingType: "best-plans-per-model", priceBand: null, payload: r.bestPlansPerModel },
    { rankingType: "provider-coding-value", priceBand: null, payload: r.byProviderCodingValue },
    { rankingType: "transparency", priceBand: null, payload: r.byTransparency },
  ];

  // Replace any rows already written for today so re-runs stay idempotent
  // (exactly one current-dated row per ranking type).
  db.delete(rankingsTable).where(eq(rankingsTable.observedAt, observedAt)).run();
  for (const row of dbRows) {
    insertRanking(db, {
      rankingType: row.rankingType,
      priceBand: row.priceBand,
      observedAt,
      payloadJson: JSON.stringify(row.payload),
      methodologyVersion: RANKINGS_METHODOLOGY_VERSION,
    });
  }
  console.log(
    `Persisted ${dbRows.length} ranking row(s) for ${observedAt} ` +
      `(methodology ${RANKINGS_METHODOLOGY_VERSION}).`,
  );

  // ─── Write static API artifact ──────────────────────────────────────────────
  const outDir = path.join(process.cwd(), "public", "data", "api");
  const outFile = path.join(outDir, "rankings.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(rankingSet, null, 2));
  console.log(`Wrote ranking set → ${outFile}`);
}

generate();
