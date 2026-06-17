import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import {
  ProviderSchema,
  RankingSetSchema,
  MethodologyMetaSchema,
  ModelsApiSchema,
  PlansApiSchema,
  type RankingSetArtifact,
  type MethodologyMeta,
  type ModelsApi,
  type PlansApi,
} from "./schema";
import type { Provider, Plan, Model } from "@/types";

// Static imports of all provider JSON files.
// Adding a new provider = add one import + one entry to PROVIDER_FILES.
import anthropicData from "@/data/providers/anthropic.json";
import openaiData from "@/data/providers/openai.json";
import githubCopilotData from "@/data/providers/github-copilot.json";
import cursorData from "@/data/providers/cursor.json";
import googleData from "@/data/providers/google.json";
import kimiData from "@/data/providers/kimi.json";
import qwenData from "@/data/providers/qwen.json";
import copilotXcodeData from "@/data/providers/copilot-xcode.json";
import opencodeData from "@/data/providers/opencode.json";
import mimoData from "@/data/providers/mimo.json";
import minimaxData from "@/data/providers/minimax.json";
import xaiData from "@/data/providers/xai.json";
import deepseekData from "@/data/providers/deepseek.json";

const PROVIDER_FILES = [
  anthropicData,
  openaiData,
  githubCopilotData,
  cursorData,
  googleData,
  kimiData,
  qwenData,
  copilotXcodeData,
  opencodeData,
  mimoData,
  minimaxData,
  xaiData,
  deepseekData,
];

let _cachedProviders: Provider[] | null = null;

/**
 * In-scope predicate — the single source of truth for which plans the product
 * compares. This is a *coding subscription* comparison, so we keep only paid
 * individual/pro plans. Excluded: free ($0), API/pay-per-token (`api` tier),
 * and business/team/enterprise (different buyer). Applied once at the loader
 * chokepoint so every downstream surface inherits it.
 */
export function isInScopePlan(plan: Plan): boolean {
  return (
    (plan.tier === "individual" || plan.tier === "pro") &&
    typeof plan.pricing.monthly_usd === "number" &&
    plan.pricing.monthly_usd > 0
  );
}

/** Number of months a model's release date may age before it's pruned. */
export const MODEL_RECENCY_MONTHS = 6;

/**
 * Recency predicate — the single source of truth for which models the catalog
 * surfaces. A model is "current" iff it has a `released_date` AND that date is
 * within the last {@link MODEL_RECENCY_MONTHS} months. Models with no release
 * date (undated legacy/proxy entries) are treated as not current. Applied once
 * at the loader chokepoint (mirrors {@link isInScopePlan}); pruning is a filter,
 * not a deletion — raw provider JSON is retained and the cutoff is reversible.
 * `now` is injectable for deterministic tests.
 */
export function isCurrentModel(model: Model, now: Date = new Date()): boolean {
  if (!model.released_date) return false;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - MODEL_RECENCY_MONTHS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return model.released_date >= cutoffIso;
}

/** Load and Zod-validate all provider data. Throws on schema violation. */
export function getAllProviders(): Provider[] {
  if (_cachedProviders) return _cachedProviders;

  const providers: Provider[] = [];
  const errors: string[] = [];

  for (const raw of PROVIDER_FILES) {
    const result = ProviderSchema.safeParse(raw);
    if (!result.success) {
      errors.push(`Provider "${(raw as { id?: string }).id ?? "unknown"}": ${result.error.message}`);
    } else {
      const provider = result.data as Provider;
      // Filter at the chokepoint — every consumer of getAllProviders()/
      // getAllPlans() sees only paid individual/pro plans and only models
      // released within the recency window.
      providers.push({
        ...provider,
        plans: provider.plans.filter(isInScopePlan),
        models: provider.models.filter((m) => isCurrentModel(m)),
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(`Data validation failed:\n${errors.join("\n")}`);
  }

  _cachedProviders = providers;
  return providers;
}

/** Get a single provider by id. Returns null if not found. */
export function getProvider(id: string): Provider | null {
  return getAllProviders().find((p) => p.id === id) ?? null;
}

/** Flatten all plans from all active providers. */
export function getAllPlans(): Array<{ provider: Provider; plan: Plan }> {
  return getAllProviders().flatMap((provider) =>
    provider.plans
      .filter((plan) => plan.is_active)
      .map((plan) => ({ provider, plan }))
  );
}

/** Get all plans for a specific tier. */
export function getPlansByTier(tier: Plan["tier"]): Array<{ provider: Provider; plan: Plan }> {
  return getAllPlans().filter(({ plan }) => plan.tier === tier);
}

/** Get all free plans. */
export function getFreePlans() {
  return getAllPlans().filter(({ plan }) => plan.pricing.monthly_usd === 0);
}

/** Lowest non-zero price plan for a provider. */
export function getCheapestPaidPlan(providerId: string): Plan | null {
  const provider = getProvider(providerId);
  if (!provider) return null;

  const paid = provider.plans
    .filter((p) => p.is_active && p.pricing.monthly_usd !== null && (p.pricing.monthly_usd ?? 0) > 0)
    .sort((a, b) => (a.pricing.monthly_usd ?? Infinity) - (b.pricing.monthly_usd ?? Infinity));

  return paid[0] ?? null;
}

// effectiveMonthlyPrice now lives in client-safe utils.ts (this module is
// server-only via `fs`). Re-exported here for back-compat with server callers.
export { effectiveMonthlyPrice } from "./utils";

// ─── Built API artifact readers (public/data/api/*.json) ──────────────────────
// Server-only (uses `fs`). NEVER import these from a "use client" file.
// Build-integrity policy (DeepSeek council): a required artifact that is missing,
// empty, or schema-invalid FAILS the production build — an empty/garbage site can
// never deploy. In dev (NODE_ENV !== "production") a missing/empty artifact yields
// a typed empty fallback for convenience; a schema-invalid artifact still throws.

const API_DIR = path.join(process.cwd(), "public", "data", "api");
const isProd = () => process.env.NODE_ENV === "production";

/** Read + JSON-parse an artifact. Returns null if missing or empty. */
function readArtifactRaw(filename: string): unknown | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(API_DIR, filename), "utf8");
  } catch {
    return null; // missing / unreadable
  }
  const trimmed = text.trim();
  if (!trimmed) return null; // empty file
  return JSON.parse(trimmed) as unknown;
}

function validateOrThrow<T>(filename: string, raw: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Artifact "${filename}" failed schema validation:\n${result.error.message}`);
  }
  return result.data;
}

function missingRequired(filename: string): never {
  throw new Error(
    `Required artifact ${filename} is missing or empty — refusing to build an empty site. ` +
      `Run \`pnpm generate:rankings && pnpm generate:static-api\` first.`,
  );
}

const EMPTY_RANKINGS: RankingSetArtifact = {
  generatedAt: "1970-01-01",
  methodologyVersion: "0.0.0-dev",
  rankings: {
    byPriceBand: { low: [], mid: [], high: [] },
    byIntelligence: [],
    byCoding: [],
    byAgentic: [],
    byWeightedQuality: [],
    bestPlansPerModel: [],
    byProviderCodingValue: [],
    byTransparency: [],
  },
};

const EMPTY_METHODOLOGY: MethodologyMeta = {
  version: "0.0.0-dev",
  generated_at: "1970-01-01",
};

let _rankings: RankingSetArtifact | null = null;
/** Full 8-view RankingSet from rankings.json. */
export function getRankings(): RankingSetArtifact {
  if (_rankings) return _rankings;
  const raw = readArtifactRaw("rankings.json");
  if (raw === null) {
    if (isProd()) missingRequired("rankings.json");
    return EMPTY_RANKINGS;
  }
  _rankings = validateOrThrow("rankings.json", raw, RankingSetSchema);
  return _rankings;
}

let _methodology: MethodologyMeta | null = null;
/** Methodology metadata (formula, weights, bands, generated_at) from methodology.json. */
export function getMethodologyMeta(): MethodologyMeta {
  if (_methodology) return _methodology;
  const raw = readArtifactRaw("methodology.json");
  if (raw === null) {
    if (isProd()) missingRequired("methodology.json");
    return EMPTY_METHODOLOGY;
  }
  _methodology = validateOrThrow("methodology.json", raw, MethodologyMetaSchema);
  return _methodology;
}

let _modelsApi: ModelsApi | null = null;
/** Flat array of all models (with appended providerId/providerName) from models.json. */
export function getModelsApi(): ModelsApi {
  if (_modelsApi) return _modelsApi;
  const raw = readArtifactRaw("models.json");
  if (raw === null) {
    if (isProd()) missingRequired("models.json");
    return [];
  }
  _modelsApi = validateOrThrow("models.json", raw, ModelsApiSchema);
  return _modelsApi;
}

let _plansApi: PlansApi | null = null;
/** { plans, bySlug } envelope (plans carry appended providerId/providerName) from plans.json. */
export function getPlansApi(): PlansApi {
  if (_plansApi) return _plansApi;
  const raw = readArtifactRaw("plans.json");
  if (raw === null) {
    if (isProd()) missingRequired("plans.json");
    return { plans: [], bySlug: {} };
  }
  _plansApi = validateOrThrow("plans.json", raw, PlansApiSchema);
  return _plansApi;
}
