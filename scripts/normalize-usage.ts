#!/usr/bin/env tsx
/**
 * Usage normalization CLI.
 *
 * Reads usage_limits from SQLite, runs the normalization engine,
 * writes normalized estimates to usage_estimates.
 *
 * Usage:
 *   pnpm normalize:usage [--provider <id>] [--dry-run] [--force] [--help]
 *
 * Exit codes: 0=success, 1=fatal, 2=usage error
 */
import { getDb, runMigrations, closeDb } from "../src/db/index";
import { usageLimits, usageEstimates } from "../src/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { normalizeLimit } from "../src/lib/normalization/engine";
import { DEFAULT_CONFIG, validateConfig } from "../src/lib/normalization/config";
import type { NormalizationSummary } from "../src/lib/normalization/types";

interface CliArgs {
  provider?: string;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, force: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--provider":
        if (i + 1 >= argv.length) {
          console.error("Error: --provider requires an argument");
          process.exit(2);
        }
        args.provider = argv[++i];
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--help":
      case "-h":
        console.log(`
Usage: pnpm normalize:usage [options]

Options:
  --provider <id>   Only normalize limits for the specified provider
  --dry-run         Show estimates without writing to DB
  --force           Re-normalize limits that already have estimates
  --help, -h        Show this help message
        `.trim());
        process.exit(0);
      default:
        console.error(`Error: Unknown argument: ${arg}`);
        console.error("Usage: pnpm normalize:usage [--provider <id>] [--dry-run] [--force]");
        process.exit(2);
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log("=".repeat(60));
  console.log("  Usage Normalization Engine");
  console.log("=".repeat(60));

  if (args.dryRun) console.log("  DRY RUN — no database writes");
  if (args.provider) console.log(`  Filtered to provider: ${args.provider}`);
  if (args.force) console.log("  Force mode — re-normalize existing estimates");
  console.log();

  // Validate config
  const errors = validateConfig(DEFAULT_CONFIG);
  if (errors.length > 0) {
    console.error("Config validation errors:");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  // Initialize DB
  const db = getDb();
  runMigrations();

  // Build query
  const conditions = [sql`1 = 1`];
  if (args.provider) {
    // Filter via plan → provider relationship
    // usage_limits.planId references plans.id, providers have a plan relationship
    // For now, filter by planId prefix matching provider ID
    conditions.push(sql`plan_id LIKE ${args.provider + "%"}`);
  }

  const limits = db
    .select()
    .from(usageLimits)
    .where(and(...conditions))
    .all();

  console.log(`  Found ${limits.length} usage limit(s) to process.\n`);

  // Process each limit
  const summary: NormalizationSummary = {
    limitsProcessed: 0,
    estimatesWritten: 0,
    skipped: 0,
    unknown: 0,
    errors: 0,
  };

  for (const limit of limits) {
    summary.limitsProcessed++;

    // Check if estimate already exists (unless --force)
    if (!args.force) {
      const existing = db
        .select({ id: usageEstimates.id })
        .from(usageEstimates)
        .where(
          and(
            eq(usageEstimates.planId, limit.planId),
            eq(usageEstimates.modelId, limit.modelId ?? "unknown"),
            eq(usageEstimates.estimateType, "normalized"),
          ),
        )
        .get();
      if (existing) {
        summary.skipped++;
        continue;
      }
    }

    try {
      const estimate = normalizeLimit(
        {
          id: limit.id,
          planId: limit.planId,
          modelId: limit.modelId,
          observedAt: limit.observedAt,
          rawLimitText: limit.rawLimitText,
          limitType: limit.limitType,
          limitValue: limit.limitValue,
          limitUnit: limit.limitUnit,
          resetWindow: limit.resetWindow,
          confidence: limit.confidence ?? "unknown",
          notes: limit.notes,
        },
        DEFAULT_CONFIG,
      );

      const maxUncertaintyLow = Math.min(
        estimate.uncertaintyLow5h ?? Infinity,
        estimate.uncertaintyLow24h ?? Infinity,
        estimate.uncertaintyLow1w ?? Infinity,
        estimate.uncertaintyLow1mo ?? Infinity,
      );
      const maxUncertaintyHigh = Math.max(
        estimate.uncertaintyHigh5h ?? -Infinity,
        estimate.uncertaintyHigh24h ?? -Infinity,
        estimate.uncertaintyHigh1w ?? -Infinity,
        estimate.uncertaintyHigh1mo ?? -Infinity,
      );

      if (estimate.confidence === "unknown") {
        summary.unknown++;
      }

      if (!args.dryRun) {
        // Delete old estimate if --force
        if (args.force) {
          db.delete(usageEstimates)
            .where(
              and(
                eq(usageEstimates.planId, limit.planId),
                eq(usageEstimates.modelId, limit.modelId ?? "unknown"),
                eq(usageEstimates.estimateType, "normalized"),
              ),
            )
            .run();
        }

        // usability_estimates.modelId is NOT NULL — use "unknown" sentinel when null
        db.insert(usageEstimates)
          .values({
            planId: estimate.planId,
            modelId: estimate.modelId ?? "unknown",
            observedAt: estimate.observedAt,
            estimateType: "normalized",
            estimatedTokens5h: estimate.estimatedTokens5h,
            estimatedTokens24h: estimate.estimatedTokens24h,
            estimatedTokens1w: estimate.estimatedTokens1w,
            estimatedTokens1mo: estimate.estimatedTokens1mo,
            estimationMethod: estimate.conversionChain[0]?.layer ?? "unknown",
            uncertaintyLow:
              maxUncertaintyLow === Infinity ? null : maxUncertaintyLow,
            uncertaintyHigh:
              maxUncertaintyHigh === -Infinity ? null : maxUncertaintyHigh,
            confidence: estimate.confidence,
            notes: JSON.stringify({
              methodologyVersion: estimate.methodologyVersion,
              conversionChain: estimate.conversionChain,
              assumptions: estimate.assumptions,
              perWindowDetail: estimate.notes,
              sourceLimitId: estimate.sourceLimitId,
            }),
          })
          .run();

        summary.estimatesWritten++;
      } else {
        summary.estimatesWritten++;
      }
    } catch (err) {
      console.error(
        `  ✗ Error normalizing limit #${limit.id} (${limit.planId}):`,
        err instanceof Error ? err.message : err,
      );
      summary.errors++;
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("  Normalization Summary");
  console.log("=".repeat(60));
  console.log(`  Limits processed:  ${summary.limitsProcessed}`);
  console.log(`  Estimates written: ${summary.estimatesWritten}`);
  console.log(`  Skipped (exists):  ${summary.skipped}`);
  console.log(`  Unknown type:      ${summary.unknown}`);
  console.log(`  Errors:            ${summary.errors}`);
  console.log("=".repeat(60));

  if (args.dryRun && summary.limitsProcessed > 0) {
    console.log("\n  [DRY RUN] No data written to database.");
  }

  closeDb();
  process.exit(summary.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
