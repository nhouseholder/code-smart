import { describe, it, expect } from "vitest";
import { getAllProviders, getAllPlans, getProvider, getFreePlans, effectiveMonthlyPrice, isInScopePlan, isCurrentModel, MODEL_RECENCY_MONTHS } from "../src/lib/data-loader";
import type { Model } from "@/types";

function modelFixture(released_date?: string): Model {
  return {
    id: "m",
    provider_id: "p",
    display_name: "M",
    context_length_k: null,
    strengths: ["coding"],
    ...(released_date ? { released_date } : {}),
    benchmarks: [],
    provenance: {
      url: "https://example.com",
      accessed_date: "2026-06-17",
      method: "automated",
      confidence: "observed",
    },
  } as Model;
}

describe("data-loader", () => {
  it("getAllProviders() returns at least 5 providers", () => {
    const providers = getAllProviders();
    expect(providers.length).toBeGreaterThanOrEqual(5);
  });

  it("every returned plan is in-scope (paid individual/pro); providers may have zero", () => {
    for (const p of getAllProviders()) {
      for (const plan of p.plans) {
        expect(isInScopePlan(plan)).toBe(true);
      }
    }
  });

  it("getAllPlans() returns exactly the 11 paid individual/pro survivors", () => {
    const plans = getAllPlans().map(({ plan }) => plan);
    expect(plans).toHaveLength(11);
    for (const plan of plans) {
      expect(["individual", "pro"]).toContain(plan.tier);
      expect(typeof plan.pricing.monthly_usd).toBe("number");
      expect(plan.pricing.monthly_usd as number).toBeGreaterThan(0);
    }
    // No excluded tier survives the loader filter.
    const tiers = new Set<string>(plans.map((p) => p.tier));
    for (const banned of ["free", "api", "team", "enterprise"]) {
      expect(tiers.has(banned)).toBe(false);
    }
  });

  it("all plans have a valid id and provider_id", () => {
    for (const { provider, plan } of getAllPlans()) {
      expect(typeof plan.id).toBe("string");
      expect(plan.id.length).toBeGreaterThan(0);
      expect(plan.provider_id).toBe(provider.id);
    }
  });

  it("getProvider() returns correct provider", () => {
    const p = getProvider("anthropic");
    expect(p).not.toBeNull();
    expect(p?.name).toBe("Anthropic");
  });

  it("getProvider() returns null for unknown id", () => {
    expect(getProvider("does-not-exist-xyz")).toBeNull();
  });

  it("getFreePlans() returns only plans priced at 0", () => {
    for (const { plan } of getFreePlans()) {
      expect(effectiveMonthlyPrice(plan)).toBe(0);
    }
  });

  it("effectiveMonthlyPrice() prefers annual when cheaper", () => {
    const plan: Parameters<typeof effectiveMonthlyPrice>[0] = {
      id: "x",
      provider_id: "x",
      name: "X",
      tier: "pro",
      pricing: {
        monthly_usd: 20,
        annual_monthly_usd: 16,
        is_per_seat: false,
        currency: "USD",
        provenance: {
          url: "https://example.com",
          accessed_date: "2026-06-14",
          method: "manual",
          confidence: "assumed",
        },
      },
      models: [],
      usage_limits: [],
      features: {
        agent_capabilities: false,
        web_search: false,
        code_context_length_k: null,
        file_uploads: false,
        voice_input: false,
        ide_integrations: [],
        cli_access: false,
        api_access: false,
        priority_access: false,
        custom_instructions: false,
        team_features: false,
        sso: false,
      },
      target_personas: [],
      is_active: true,
      last_verified: "2026-06-14",
      source_url: "https://example.com",
    };
    expect(effectiveMonthlyPrice(plan)).toBe(16);
  });

  it("all providers pass Zod schema validation (no throwing)", () => {
    expect(() => getAllProviders()).not.toThrow();
  });

  describe("isCurrentModel (recency prune)", () => {
    const NOW = new Date("2026-06-17T00:00:00Z");

    it("returns true for a model released within the recency window", () => {
      expect(isCurrentModel(modelFixture("2026-04-01"), NOW)).toBe(true);
    });

    it("returns true for a model released exactly on the cutoff", () => {
      // cutoff = NOW - 6 months = 2025-12-17
      expect(isCurrentModel(modelFixture("2025-12-17"), NOW)).toBe(true);
    });

    it("returns false for a model older than the recency window", () => {
      expect(isCurrentModel(modelFixture("2025-07-01"), NOW)).toBe(false);
    });

    it("returns false for a model with no release date", () => {
      expect(isCurrentModel(modelFixture(undefined), NOW)).toBe(false);
    });

    it("exposes a 6-month window", () => {
      expect(MODEL_RECENCY_MONTHS).toBe(6);
    });
  });

  it("surfaces a refreshed catalog of >30 current models, all within the window", () => {
    const now = new Date();
    const models = getAllProviders().flatMap((p) => p.models);
    expect(models.length).toBeGreaterThan(30);
    for (const m of models) {
      expect(isCurrentModel(m, now)).toBe(true);
    }
  });
});
