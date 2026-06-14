import { describe, it, expect } from "vitest";
import { getAllProviders, getAllPlans, getProvider, getFreePlans, effectiveMonthlyPrice } from "../src/lib/data-loader";

describe("data-loader", () => {
  it("getAllProviders() returns at least 5 providers", () => {
    const providers = getAllProviders();
    expect(providers.length).toBeGreaterThanOrEqual(5);
  });

  it("all providers have at least one plan", () => {
    for (const p of getAllProviders()) {
      expect(p.plans.length).toBeGreaterThan(0);
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
});
