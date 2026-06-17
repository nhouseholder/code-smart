#!/usr/bin/env tsx
/**
 * data-quality-check.ts
 *
 * Runs 9 data quality checks against provider JSON files, the DB,
 * and API artifacts. Prints results and exits 0/1.
 *
 * Usage:
 *   pnpm quality-check
 *   pnpm quality-check --verbose   # include passing checks in output
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getDb } from "@/db";
import { artificialAnalysisModelScores, models as dbModels } from "@/db/schema";
import { eq, isNull, and, count, sql } from "drizzle-orm";

// ── types ────────────────────────────────────────────────────────────

export interface DataQualityIssue {
  checkId: string;
  severity: "error" | "warning";
  providerId: string;
  planId?: string;
  modelId?: string;
  field?: string;
  message: string;
  value?: unknown;
}

export interface ProviderJson {
  id: string;
  name: string;
  last_verified: string;
  pricing_url?: string;
  provenance: { confidence: string };
  models?: Array<{
    id: string;
    provenance?: { confidence: string };
    context_length_k?: number | null;
  }>;
  plans?: Array<{
    id: string;
    pricing: {
      monthly_usd: number | null;
      currency?: string;
    };
    usage_limits?: Array<{
      type: string;
      model_id?: string;
      limit_value?: number | null;
    }>;
    models?: Array<{ model_id: string }>;
  }>;
  founded_year?: number;
  headquarters_country?: string;
  pricing?: { currency?: string };
}

// ── paths ────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const PROVIDERS_DIR = path.join(ROOT, "src", "data", "providers");
const API_DIR = path.join(ROOT, "public", "data", "api");
const BASELINE_FILE = path.join(ROOT, "data", "plan-snapshot-baseline.json");
const RANKINGS_FILE = path.join(API_DIR, "rankings.json");
const PLANS_FILE = path.join(API_DIR, "plans.json");
const VALUE_ESTIMATES_FILE = path.join(API_DIR, "model-value-estimates.json");

// ── check functions ─────────────────────────────────────────────────

/**
 * Check 1: provider last_verified > 30 days old.
 */
export function checkProviderHasNoRecentSourceSnapshot(
  providers: ProviderJson[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const now = new Date();
  const threshold = 30; // days

  for (const p of providers) {
    const verified = new Date(p.last_verified);
    const ageDays = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > threshold) {
      issues.push({
        checkId: "provider-stale-source",
        severity: "warning",
        providerId: p.id,
        field: "last_verified",
        message: `Provider "${p.id}" last verified ${Math.round(ageDays)} days ago (threshold: ${threshold} days)`,
        value: p.last_verified,
      });
    }
  }
  return issues;
}

/**
 * Check 2: plan has no price (monthly_usd is null).
 * Error if plan has a pricing_url (price exists on the page but was not extracted),
 * warning otherwise.
 * Skips pay-per-token plans where monthly_usd is legitimately null
 * (usage-based billing with no monthly flat fee).
 */
export function checkPlanHasNoPrice(
  providers: ProviderJson[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const p of providers) {
    if (!p.plans) continue;
    for (const plan of p.plans) {
      if (plan.pricing.monthly_usd === null || plan.pricing.monthly_usd === undefined) {
        // Pay-per-token plans (usage_limits includes "unlimited" type) have
        // no monthly flat fee — null is semantically correct here.
        const usageTypes = plan.usage_limits?.map((l) => l.type) ?? [];
        if (usageTypes.includes("unlimited")) continue;

        // Determine severity: if provider has pricing_url, treat as error
        const severity = p.pricing_url ? "error" : "warning";
        issues.push({
          checkId: "plan-no-price",
          severity,
          providerId: p.id,
          planId: plan.id,
          field: "pricing.monthly_usd",
          message: `Plan "${plan.id}" has no monthly price (null)`,
        });
      }
    }
  }
  return issues;
}

/**
 * Check 3: plan has no usage estimate.
 * Checks if usage_limits is empty, missing, or all "unknown".
 * Cross-references against model-value-estimates.json.
 */
export function checkPlanHasNoUsageEstimate(
  providers: ProviderJson[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Load value estimates for cross-reference
  let modelEstimates: Record<string, unknown> = {};
  try {
    if (fs.existsSync(VALUE_ESTIMATES_FILE)) {
      modelEstimates = JSON.parse(fs.readFileSync(VALUE_ESTIMATES_FILE, "utf8"));
    }
  } catch {
    // ignore — cross-ref is best-effort
  }

  for (const p of providers) {
    if (!p.plans) continue;
    for (const plan of p.plans) {
      const limits = plan.usage_limits;
      const hasEstimates = plan.models?.some(
        (m) => modelEstimates[m.model_id] !== undefined,
      );

      if (!limits || limits.length === 0) {
        // Check cross-ref as fallback
        if (!hasEstimates) {
          issues.push({
            checkId: "plan-no-usage-estimate",
            severity: "warning",
            providerId: p.id,
            planId: plan.id,
            message: `Plan "${plan.id}" has no usage limits defined`,
          });
        }
      } else if (limits.every((l) => l.type === "unknown")) {
        issues.push({
          checkId: "plan-no-usage-estimate",
          severity: "warning",
          providerId: p.id,
          planId: plan.id,
          message: `Plan "${plan.id}" usage limits are all "unknown" type`,
          value: limits,
        });
      }
    }
  }
  return issues;
}

/**
 * Check 4: model has no AA mapping in the DB.
 */
export function checkModelHasNoAAMapping(): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  try {
    const db = getDb();
    const unmappedModels = db
      .select({
        modelId: dbModels.id,
      })
      .from(dbModels)
      .leftJoin(
        artificialAnalysisModelScores,
        eq(dbModels.id, artificialAnalysisModelScores.modelId),
      )
      .where(
        and(
          eq(dbModels.status, "active"),
          isNull(artificialAnalysisModelScores.modelId),
        ),
      )
      .all();

    for (const m of unmappedModels) {
      issues.push({
        checkId: "model-no-aa-mapping",
        severity: "warning",
        providerId: "unknown",
        modelId: m.modelId,
        message: `Model "${m.modelId}" has no AA score mapping in DB`,
      });
    }
  } catch (err) {
    issues.push({
      checkId: "model-no-aa-mapping",
      severity: "warning",
      providerId: "system",
      message: `Could not query DB for AA mappings: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return issues;
}

/**
 * Check 5: rankings use stale data (source dates > 30 days old).
 */
export function checkRankingUsesStaleData(
  providers: ProviderJson[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const now = new Date();
  const threshold = 30; // days

  // If rankings.json doesn't exist yet, flag as info
  if (!fs.existsSync(RANKINGS_FILE)) {
    issues.push({
      checkId: "ranking-stale-data",
      severity: "warning",
      providerId: "system",
      message: "rankings.json not found — rankings not yet generated",
    });
    return issues;
  }

  // Check provider last_verified dates used in rankings
  for (const p of providers) {
    const verified = new Date(p.last_verified);
    const ageDays = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > threshold) {
      issues.push({
        checkId: "ranking-stale-data",
        severity: "warning",
        providerId: p.id,
        field: "last_verified",
        message: `Rankings may include stale data from "${p.id}" (last verified ${Math.round(ageDays)} days ago)`,
        value: p.last_verified,
      });
    }
  }

  return issues;
}

/**
 * Check 6: confidence below threshold.
 * "unknown" → error, "assumed"/"stale" → warning.
 */
export function checkConfidenceBelowThreshold(
  providers: ProviderJson[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const p of providers) {
    const pConf = p.provenance?.confidence;
    if (pConf === "unknown") {
      issues.push({
        checkId: "confidence-below-threshold",
        severity: "error",
        providerId: p.id,
        field: "provenance.confidence",
        message: `Provider "${p.id}" has confidence "unknown"`,
        value: pConf,
      });
    } else if (pConf === "assumed" || pConf === "stale") {
      issues.push({
        checkId: "confidence-below-threshold",
        severity: "warning",
        providerId: p.id,
        field: "provenance.confidence",
        message: `Provider "${p.id}" has low confidence: "${pConf}"`,
        value: pConf,
      });
    }

    // Check per-model confidence
    if (p.models) {
      for (const model of p.models) {
        const mConf = model.provenance?.confidence;
        if (mConf === "unknown") {
          issues.push({
            checkId: "confidence-below-threshold",
            severity: "error",
            providerId: p.id,
            modelId: model.id,
            field: "models[].provenance.confidence",
            message: `Model "${model.id}" has confidence "unknown"`,
            value: mConf,
          });
        } else if (mConf === "assumed" || mConf === "stale") {
          issues.push({
            checkId: "confidence-below-threshold",
            severity: "warning",
            providerId: p.id,
            modelId: model.id,
            field: "models[].provenance.confidence",
            message: `Model "${model.id}" has low confidence: "${mConf}"`,
            value: mConf,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Check 7: impossible values.
 */
export function checkImpossibleValues(
  providers: ProviderJson[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const currentYear = 2026;

  for (const p of providers) {
    // Check founded_year
    if (p.founded_year !== undefined && p.founded_year !== null) {
      if (p.founded_year < 1900 || p.founded_year > currentYear) {
        issues.push({
          checkId: "impossible-values",
          severity: "error",
          providerId: p.id,
          field: "founded_year",
          message: `Provider "${p.id}" has impossible founded_year: ${p.founded_year}`,
          value: p.founded_year,
        });
      }
    }

    // Check headquarters_country (should be 2 letters)
    if (p.headquarters_country && !/^[A-Z]{2}$/.test(p.headquarters_country)) {
      issues.push({
        checkId: "impossible-values",
        severity: "warning",
        providerId: p.id,
        field: "headquarters_country",
        message: `Provider "${p.id}" has non-standard country code: "${p.headquarters_country}"`,
        value: p.headquarters_country,
      });
    }

    // Check plan pricing
    if (p.plans) {
      for (const plan of p.plans) {
        const price = plan.pricing.monthly_usd;
        if (price !== null && price !== undefined && price < 0) {
          issues.push({
            checkId: "impossible-values",
            severity: "error",
            providerId: p.id,
            planId: plan.id,
            field: "pricing.monthly_usd",
            message: `Plan "${plan.id}" has negative price: $${price}`,
            value: price,
          });
        }

        // Check currency
        const currency = plan.pricing.currency;
        if (currency && !/^[A-Z]{3}$/.test(currency)) {
          issues.push({
            checkId: "impossible-values",
            severity: "warning",
            providerId: p.id,
            planId: plan.id,
            field: "pricing.currency",
            message: `Plan "${plan.id}" has non-standard currency: "${currency}"`,
            value: currency,
          });
        }
      }
    }

    // Check model context_length_k (should be > 0 when specified).
    // null = unknown/not-applicable (BYOK, undisclosed models) — not an error.
    if (p.models) {
      for (const model of p.models) {
        const modelFull = model as { id: string; context_length_k?: number | null };
        if (modelFull.context_length_k != null && modelFull.context_length_k <= 0) {
          issues.push({
            checkId: "impossible-values",
            severity: "error",
            providerId: p.id,
            modelId: model.id,
            field: "context_length_k",
            message: `Model "${model.id}" has context_length_k <= 0: ${modelFull.context_length_k}`,
            value: modelFull.context_length_k,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check 8: large day-over-day price changes.
 * Compares current plans.json against baseline file in data/.
 */
export function checkLargeDayOverDayChanges(
  providers: ProviderJson[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const CHANGE_THRESHOLD = 0.2; // 20%

  // Read current plans from the static API
  let currentPlans: Array<{ id: string; pricing: { monthly_usd: number | null } }> = [];
  try {
    if (fs.existsSync(PLANS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PLANS_FILE, "utf8"));
      currentPlans = raw.plans ?? [];
    } else {
      // Fall back to extracting from provider JSONs
      for (const p of providers) {
        if (p.plans) {
          for (const plan of p.plans) {
            currentPlans.push({
              id: plan.id,
              pricing: { monthly_usd: plan.pricing.monthly_usd },
            });
          }
        }
      }
    }
  } catch {
    issues.push({
      checkId: "day-over-day-change",
      severity: "warning",
      providerId: "system",
      message: "Could not read plans.json for day-over-day comparison",
    });
    return issues;
  }

  // Check if baseline exists
  if (!fs.existsSync(BASELINE_FILE)) {
    // First run — create baseline, skip check
    try {
      fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(currentPlans, null, 2));
      issues.push({
        checkId: "day-over-day-change",
        severity: "warning",
        providerId: "system",
        message: "No baseline found — created plan-snapshot-baseline.json for future comparisons",
      });
    } catch (err) {
      issues.push({
        checkId: "day-over-day-change",
        severity: "warning",
        providerId: "system",
        message: `Could not create baseline file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return issues;
  }

  // Compare against baseline
  try {
    const baseline: Array<{ id: string; pricing: { monthly_usd: number | null } }> =
      JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));

    const baselineMap = new Map(baseline.map((p) => [p.id, p.pricing.monthly_usd]));

    for (const plan of currentPlans) {
      const baselinePrice = baselineMap.get(plan.id);
      if (baselinePrice === undefined || baselinePrice === null) continue;
      if (plan.pricing.monthly_usd === null || plan.pricing.monthly_usd === undefined) continue;

      const currentPrice = plan.pricing.monthly_usd;
      if (baselinePrice === 0) continue; // skip free -> free

      const change = Math.abs((currentPrice - baselinePrice) / baselinePrice);
      if (change > CHANGE_THRESHOLD) {
        const pId = plan.id.split("-")[0]; // extract provider prefix
        issues.push({
          checkId: "day-over-day-change",
          severity: "warning",
          providerId: pId,
          planId: plan.id,
          field: "pricing.monthly_usd",
          message: `Plan "${plan.id}" price changed ${(change * 100).toFixed(0)}% ($${baselinePrice} → $${currentPrice})`,
          value: { from: baselinePrice, to: currentPrice, changePct: Math.round(change * 100) },
        });
      }
    }

    // Update baseline
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(currentPlans, null, 2));
  } catch (err) {
    issues.push({
      checkId: "day-over-day-change",
      severity: "warning",
      providerId: "system",
      message: `Error comparing against baseline: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return issues;
}

/**
 * Check 9: source page changed but parser extracted nothing.
 * Queries scrapeRuns + sourceSnapshots from DB.
 */
export function checkSourcePageChangedButParserExtractedNothing(): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  try {
    const db = getDb();
    // Import scrapeRuns and sourceSnapshots tables
    const { scrapeRuns, sourceSnapshots } = require("@/db/schema");

    const rows: Array<{ providerId: string; changeDetected: boolean | null; extractedText: string | null }> = db
      .select({
        providerId: scrapeRuns.providerId,
        changeDetected: scrapeRuns.changeDetected,
        extractedText: sourceSnapshots.extractedText,
      })
      .from(scrapeRuns)
      .leftJoin(
        sourceSnapshots,
        eq(scrapeRuns.sourcePageId, sourceSnapshots.id),
      )
      .where(
        and(
          eq(scrapeRuns.changeDetected, true as unknown as number), // boolean stored as integer
          sql`${sourceSnapshots.extractedText} IS NULL`,
        ),
      )
      .all();

    for (const row of rows) {
      issues.push({
        checkId: "page-changed-no-extraction",
        severity: "warning",
        providerId: row.providerId,
        message: `Source page changed but no extracted text recorded for "${row.providerId}"`,
        value: { providerId: row.providerId, changeDetected: true, extractedText: null },
      });
    }
  } catch (err) {
    issues.push({
      checkId: "page-changed-no-extraction",
      severity: "warning",
      providerId: "system",
      message: `Could not query scrape runs: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return issues;
}

// ── orchestrator ─────────────────────────────────────────────────────

function loadProviders(): ProviderJson[] {
  const files = fs.readdirSync(PROVIDERS_DIR).filter((f) => f.endsWith(".json"));
  const providers: ProviderJson[] = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(PROVIDERS_DIR, file), "utf8"));
      providers.push(data);
    } catch (err) {
      console.error(`Warning: could not parse ${file}: ${err}`);
    }
  }

  return providers;
}

function printResults(issues: DataQualityIssue[], verbose: boolean): void {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  DATA QUALITY CHECKS`);
  console.log(`${"═".repeat(60)}`);

  if (issues.length === 0) {
    console.log("\n  ✅ All checks passed — no issues found.\n");
    return;
  }

  console.log(`\n  ${errors.length} errors, ${warnings.length} warnings\n`);

  // Group by check
  const byCheck: Record<string, DataQualityIssue[]> = {};
  for (const issue of issues) {
    if (!byCheck[issue.checkId]) byCheck[issue.checkId] = [];
    byCheck[issue.checkId].push(issue);
  }

  for (const [checkId, group] of Object.entries(byCheck)) {
    const isErrorGroup = group.some((i) => i.severity === "error");
    const icon = isErrorGroup ? "✗" : "⚠";
    const sevs = [...new Set(group.map((i) => i.severity))].join("/");
    console.log(`  ${icon} ${checkId} (${sevs}): ${group.length} issue(s)`);

    if (verbose || isErrorGroup) {
      for (const issue of group) {
        const loc = issue.providerId !== "system"
          ? `[${issue.providerId}${issue.planId ? ` / ${issue.planId}` : ""}${issue.modelId ? ` / ${issue.modelId}` : ""}]`
          : "";
        console.log(`      ${loc} ${issue.message}`);
      }
    }
  }

  console.log(`\n${"═".repeat(60)}\n`);
}

function main(): void {
  const verbose = process.argv.includes("--verbose");
  const providers = loadProviders();

  console.log(`Loaded ${providers.length} provider(s) from ${PROVIDERS_DIR}`);

  const allIssues: DataQualityIssue[] = [
    ...checkProviderHasNoRecentSourceSnapshot(providers),
    ...checkPlanHasNoPrice(providers),
    ...checkPlanHasNoUsageEstimate(providers),
    ...checkModelHasNoAAMapping(),
    ...checkRankingUsesStaleData(providers),
    ...checkConfidenceBelowThreshold(providers),
    ...checkImpossibleValues(providers),
    ...checkLargeDayOverDayChanges(providers),
    ...checkSourcePageChangedButParserExtractedNothing(),
  ];

  printResults(allIssues, verbose);

  const errors = allIssues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    console.error(`✗ ${errors.length} error(s) found — exiting 1`);
    process.exit(1);
  }

  console.log("✓ Quality checks complete (warnings only, no errors)");
}

// Only run main() when executed directly (not when imported in tests)
if (!process.env.VITEST) {
  main();
}
