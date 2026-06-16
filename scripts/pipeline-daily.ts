#!/usr/bin/env tsx
/**
 * pipeline-daily.ts
 *
 * Orchestrates the full data update pipeline:
 *   stale-check → scrape → normalize → aa-cache → value-estimates →
 *   static-api → validate → write pipeline-status
 *
 * Usage:
 *   pnpm pipeline:daily                   # full run
 *   pnpm pipeline:daily --dry-run         # report only, no writes
 *   pnpm pipeline:daily --skip-scrape     # skip scrape step
 *   pnpm pipeline:daily --provider cursor # single-provider run
 *   pnpm pipeline:daily --force           # ignore hash cache
 *   pnpm pipeline:daily --refresh-aa      # force re-seed AA scores
 *   pnpm pipeline:status                  # print last run and exit
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { PipelineStatusSchema } from "@/lib/pipeline-schema";
import type { PipelineRun, PipelineStatus, ProviderStatus } from "@/types/pipeline";

// ── paths ──────────────────────────────────────────────────────────────────

const ROOT        = process.cwd();
const DATA_DIR    = path.join(ROOT, "data");
const LOCK_FILE   = path.join(DATA_DIR, ".pipeline.lock");
const AA_DATE_FILE = path.join(DATA_DIR, "aa-cache-date.txt");
const STATUS_FILE = path.join(ROOT, "public", "data", "api", "pipeline-status.json");
const STATUS_TMP  = STATUS_FILE + ".tmp";

const AA_CACHE_DAYS = 7;

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN      = args.includes("--dry-run");
const SKIP_SCRAPE  = args.includes("--skip-scrape");
const FORCE        = args.includes("--force");
const REFRESH_AA   = args.includes("--refresh-aa");
const STATUS_ONLY  = args.includes("--status-only");
const PROVIDER_IDX = args.indexOf("--provider");
const PROVIDER     = PROVIDER_IDX !== -1 ? args[PROVIDER_IDX + 1] : undefined;

// ── status-only mode ───────────────────────────────────────────────────────

if (STATUS_ONLY) {
  printStatus();
  process.exit(0);
}

// ── lock management ────────────────────────────────────────────────────────

function acquireLock(): void {
  if (fs.existsSync(LOCK_FILE)) {
    const existingPid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
    try {
      process.kill(existingPid, 0); // throws if PID not alive
      console.error(`Pipeline already running (PID ${existingPid}). Aborting.`);
      process.exit(1);
    } catch {
      // PID dead — stale lock, remove it
      fs.unlinkSync(LOCK_FILE);
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseLock(): void {
  try { fs.unlinkSync(LOCK_FILE); } catch { /* already gone */ }
}

// ── runner ─────────────────────────────────────────────────────────────────

function run(label: string, cmd: string, extraArgs: string[] = []): boolean {
  const fullArgs = [...extraArgs];
  if (DRY_RUN) fullArgs.push("--dry-run");
  if (PROVIDER) fullArgs.push("--provider", PROVIDER);
  if (FORCE)    fullArgs.push("--force");

  const full = `npx tsx ${cmd} ${fullArgs.join(" ")}`.trim();
  console.log(`\n▶ ${label}`);
  console.log(`  ${full}`);

  if (DRY_RUN && !cmd.includes("stale-check") && !cmd.includes("validate")) {
    console.log("  [dry-run] skipped");
    return true;
  }

  const result = spawnSync("npx", ["tsx", cmd, ...fullArgs], {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env },
  });

  return result.status === 0;
}

// ── AA cache check ─────────────────────────────────────────────────────────

function shouldRefreshAA(): boolean {
  if (REFRESH_AA) return true;
  if (!fs.existsSync(AA_DATE_FILE)) return true;
  const dateStr = fs.readFileSync(AA_DATE_FILE, "utf8").trim();
  const then = new Date(dateStr).getTime();
  const now  = Date.now();
  const ageMs = now - then;
  return ageMs > AA_CACHE_DAYS * 24 * 60 * 60 * 1000;
}

function stampAACache(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AA_DATE_FILE, new Date().toISOString().slice(0, 10));
}

// ── status I/O ─────────────────────────────────────────────────────────────

function loadStatus(): PipelineStatus {
  if (!fs.existsSync(STATUS_FILE)) return { lastRun: null, history: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
    const parsed = PipelineStatusSchema.safeParse(raw);
    return parsed.success ? parsed.data : { lastRun: null, history: [] };
  } catch {
    return { lastRun: null, history: [] };
  }
}

function writeStatus(run: PipelineRun): void {
  if (DRY_RUN) {
    console.log("\n[dry-run] Would write pipeline-status.json");
    return;
  }

  const current = loadStatus();
  const history = [run, ...current.history].slice(0, 5);
  const status: PipelineStatus = { lastRun: run, history };

  const outDir = path.dirname(STATUS_FILE);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(STATUS_TMP, JSON.stringify(status, null, 2));
  fs.renameSync(STATUS_TMP, STATUS_FILE);
  console.log(`\nWrote pipeline status → ${STATUS_FILE}`);
}

function printStatus(): void {
  if (!fs.existsSync(STATUS_FILE)) {
    console.log("No pipeline-status.json found. Run pnpm pipeline:daily first.");
    return;
  }

  const status = loadStatus();
  const last   = status.lastRun;

  if (!last) {
    console.log("No pipeline runs recorded.");
    return;
  }

  const dur = (last.durationMs / 1000).toFixed(1);
  const icon = last.success ? "✅" : "❌";

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  PIPELINE STATUS`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Last run:   ${last.startedAt}`);
  console.log(`  Duration:   ${dur}s`);
  console.log(`  Result:     ${icon} ${last.success ? "SUCCESS" : "FAILED"}`);
  if (last.errorMessage) console.log(`  Error:      ${last.errorMessage}`);
  console.log(`  Steps run:  ${last.stepsRun.join(", ")}`);
  console.log(`  Dry run:    ${last.dryRun}`);
  console.log();

  if (last.providers.length > 0) {
    console.log("  Providers:");
    const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
    console.log(`    ${"ID".padEnd(20)} ${"STATUS".padEnd(10)} ${"PAGES".padEnd(12)} ${"NOTES"}`);
    console.log(`    ${"─".repeat(60)}`);
    for (const p of last.providers) {
      const pages = `${p.pagesChanged}/${p.pagesChecked} changed`;
      const note  = p.errorMessage ?? (p.staleSince ? `stale since ${p.staleSince}` : "");
      console.log(`    ${col(p.providerId, 20)} ${col(p.status, 10)} ${col(pages, 12)} ${note}`);
    }
    console.log();
  }

  if (last.unmappedModels.length > 0) {
    console.log(`  Unmapped models: ${last.unmappedModels.join(", ")}`);
  }
  if (last.lowConfidenceEstimates > 0) {
    console.log(`  Low-confidence estimates: ${last.lowConfidenceEstimates}`);
  }
  if (last.failedProviders.length > 0) {
    console.log(`  Failed providers: ${last.failedProviders.join(", ")}`);
  }

  console.log(`\n  History: ${status.history.length} run(s) recorded`);
  console.log(`${"═".repeat(60)}\n`);
}

// ── main ───────────────────────────────────────────────────────────────────

function main(): void {
  const startedAt = new Date().toISOString();
  const runId     = startedAt;
  const stepsRun: string[] = [];
  let success = true;
  let errorMessage: string | undefined;

  acquireLock();

  try {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  PIPELINE DAILY${DRY_RUN ? " (dry run)" : ""}`);
    console.log(`  Started: ${startedAt}`);
    if (PROVIDER) console.log(`  Provider filter: ${PROVIDER}`);
    console.log(`${"═".repeat(60)}\n`);

    // Step 1: stale-check (warn only)
    const staleOk = run("stale-check", "scripts/stale-check.ts", []);
    stepsRun.push("stale-check");
    if (!staleOk) console.warn("  ⚠ Stale data found — continuing pipeline");

    // Step 2: scrape
    if (!SKIP_SCRAPE) {
      const scrapeOk = run("scrape:providers", "scripts/scrape-providers.ts");
      stepsRun.push("scrape");
      if (!scrapeOk) {
        console.error("  ✗ Scrape failed");
        success = false;
        errorMessage = "scrape step failed";
      }
    } else {
      console.log("\n▶ scrape:providers [skipped via --skip-scrape]");
    }

    // Step 3: normalize
    if (success) {
      const normalizeOk = run("normalize:usage", "scripts/normalize-usage.ts");
      stepsRun.push("normalize");
      if (!normalizeOk) {
        success = false;
        errorMessage = "normalize step failed";
      }
    }

    // Step 4: AA cache
    if (success) {
      if (shouldRefreshAA()) {
        console.log("\n▶ seed-aa-scores (cache expired or --refresh-aa)");
        if (!DRY_RUN) {
          const aaResult = spawnSync("npx", ["tsx", "scripts/seed-aa-scores.ts"], {
            stdio: "inherit", cwd: ROOT, env: { ...process.env },
          });
          if (aaResult.status === 0) {
            stampAACache();
            stepsRun.push("seed-aa");
          } else {
            success = false;
            errorMessage = "seed-aa step failed";
          }
        } else {
          console.log("  [dry-run] would re-seed AA scores");
          stepsRun.push("seed-aa");
        }
      } else {
        console.log("\n▶ seed-aa-scores [skipped — cache < 7 days old]");
        const ageFile = fs.readFileSync(AA_DATE_FILE, "utf8").trim();
        console.log(`  Last seeded: ${ageFile}`);
      }
    }

    // Step 5: generate value estimates
    if (success) {
      const veOk = run("generate:value-estimates", "scripts/generate-model-value-estimates.ts", []);
      stepsRun.push("value-estimates");
      if (!veOk) {
        success = false;
        errorMessage = "generate-value-estimates step failed";
      }
    }

    // Step 6: generate static API
    if (success) {
      console.log("\n▶ generate:static-api");
      if (!DRY_RUN) {
        const apiResult = spawnSync("npx", ["tsx", "scripts/generate-static-api.ts"], {
          stdio: "inherit", cwd: ROOT, env: { ...process.env },
        });
        stepsRun.push("static-api");
        if (apiResult.status !== 0) {
          success = false;
          errorMessage = "generate-static-api step failed";
        }
      } else {
        console.log("  [dry-run] would generate static API files");
        stepsRun.push("static-api");
      }
    }

    // Step 7: validate
    if (success) {
      const validateOk = run("validate-data", "scripts/validate-data.ts", []);
      stepsRun.push("validate");
      if (!validateOk) {
        success = false;
        errorMessage = "validate step failed";
      }
    }

  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Pipeline caught error: ${errorMessage}`);
  } finally {
    releaseLock();
  }

  const completedAt = new Date().toISOString();
  const durationMs  = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  const pipelineRun: PipelineRun = {
    runId,
    startedAt,
    completedAt,
    durationMs,
    dryRun: DRY_RUN,
    stepsRun,
    providers: [],       // populated by individual step reporters in future
    unmappedModels: [],
    lowConfidenceEstimates: 0,
    failedProviders: [],
    success,
    errorMessage,
  };

  writeStatus(pipelineRun);

  const icon = success ? "✅" : "❌";
  console.log(`\n${icon} Pipeline ${success ? "complete" : "failed"} in ${(durationMs / 1000).toFixed(1)}s`);
  if (!success) process.exit(1);
}

main();
