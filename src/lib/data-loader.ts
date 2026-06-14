import { ProviderSchema } from "./schema";
import type { Provider, Plan } from "@/types";

// Static imports of all provider JSON files.
// Adding a new provider = add one import + one entry to PROVIDER_FILES.
import anthropicData from "@/data/providers/anthropic.json";
import openaiData from "@/data/providers/openai.json";
import githubCopilotData from "@/data/providers/github-copilot.json";
import cursorData from "@/data/providers/cursor.json";
import googleData from "@/data/providers/google.json";

const PROVIDER_FILES = [
  anthropicData,
  openaiData,
  githubCopilotData,
  cursorData,
  googleData,
];

let _cachedProviders: Provider[] | null = null;

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
      providers.push(result.data as Provider);
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

/** Effective monthly price (prefer annual if cheaper). */
export function effectiveMonthlyPrice(plan: Plan): number | null {
  const monthly = plan.pricing.monthly_usd;
  const annual = plan.pricing.annual_monthly_usd;

  if (monthly === null && annual === null) return null;
  if (annual !== null && monthly !== null) return Math.min(monthly, annual);
  return monthly ?? annual;
}
