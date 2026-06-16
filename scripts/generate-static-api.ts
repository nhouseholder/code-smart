/**
 * generate-static-api.ts
 *
 * Generates pre-built JSON payloads for all public data endpoints.
 * Writes to public/data/api/ using an atomic staging→rename pattern
 * so a partial run never leaves corrupt files in the production path.
 *
 * Usage:
 *   npx tsx scripts/generate-static-api.ts
 *   pnpm generate:static-api
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAllProviders, getAllPlans, effectiveMonthlyPrice } from "@/lib/data-loader";
import { computeRankings } from "@/lib/rankings";

const OUT_DIR     = path.join(process.cwd(), "public", "data", "api");
const STAGING_DIR = path.join(OUT_DIR, ".staging");

function writeStaging(name: string, data: unknown): void {
  const file = path.join(STAGING_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  staged  ${name}`);
}

function commitStaging(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const entry of fs.readdirSync(STAGING_DIR, { recursive: true })) {
    const rel  = entry as string;
    const src  = path.join(STAGING_DIR, rel);
    const dest = path.join(OUT_DIR, rel);
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
    }
  }
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}

function cleanStaging(): void {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}

function generate(): void {
  cleanStaging();
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  const providers = getAllProviders();
  const allPlans  = getAllPlans();

  // providers.json
  writeStaging("providers.json", providers);

  // plans.json — flattened array + slug-keyed map
  const planList = allPlans.map(({ provider, plan }) => ({
    ...plan,
    providerId: provider.id,
    providerName: provider.name,
    effectiveMonthlyUsd: effectiveMonthlyPrice(plan),
  }));
  const bySlug: Record<string, typeof planList[0]> = {};
  for (const p of planList) bySlug[p.id] = p;
  writeStaging("plans.json", { plans: planList, bySlug });

  // models.json — all models across all providers
  const models = providers.flatMap((p) =>
    p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name })),
  );
  writeStaging("models.json", models);

  // rankings.json
  const rankings = computeRankings(allPlans);
  writeStaging("rankings.json", rankings);

  // methodology.json — formula constants
  writeStaging("methodology.json", {
    version: "3.0",
    formula: "QAMU = estimatedTokens1mo × (WMQ / 100); score = QAMU / price → 0–100",
    weights: {
      cost: 0.35,
      benchmark: 0.40,
      feature: 0.25,
    },
    wmq: {
      agentic: 0.50,
      coding: 0.40,
      speed: 0.10,
    },
    priceBands: {
      free:      "$0/mo",
      "under-20": "$1–$19.99/mo",
      "under-40": "$20–$39.99/mo",
      "40-plus":  "$40+/mo",
    },
    reference: "docs/calculation-methodology.md",
    generated_at: new Date().toISOString().slice(0, 10),
  });

  // Commit all staged files atomically
  commitStaging();

  const fileCount = 5;
  console.log(`\nGenerated ${fileCount} API JSON files → ${OUT_DIR}`);
  console.log("Endpoints (served by Next.js from /public):");
  console.log("  GET /data/api/providers.json");
  console.log("  GET /data/api/plans.json");
  console.log("  GET /data/api/models.json");
  console.log("  GET /data/api/rankings.json");
  console.log("  GET /data/api/methodology.json");
  console.log("  GET /data/api/pipeline-status.json  (written by pipeline:daily)");
}

try {
  generate();
} catch (err) {
  cleanStaging();
  console.error("generate-static-api failed:", err);
  process.exit(1);
}
