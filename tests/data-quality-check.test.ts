import { describe, it, expect, beforeEach } from "vitest";
import type { ProviderJson } from "../scripts/data-quality-check";
import {
  checkProviderHasNoRecentSourceSnapshot,
  checkPlanHasNoPrice,
  checkPlanHasNoUsageEstimate,
  checkImpossibleValues,
  checkConfidenceBelowThreshold,
} from "../scripts/data-quality-check";

// ── helpers ─────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<ProviderJson> = {}): ProviderJson {
  return {
    id: "test-provider",
    name: "Test Provider",
    last_verified: new Date().toISOString().slice(0, 10),
    provenance: { confidence: "observed" },
    pricing_url: "https://example.com/pricing",
    ...overrides,
  };
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-plan",
    pricing: {
      monthly_usd: 20,
      currency: "USD",
    },
    usage_limits: [{ type: "message", model_id: "test-model", limit_value: 100 }],
    models: [{ model_id: "test-model" }],
    ...overrides,
  };
}

// ── checkProviderHasNoRecentSourceSnapshot ─────────────────────────

describe("checkProviderHasNoRecentSourceSnapshot", () => {
  it("returns empty for recently verified providers", () => {
    const providers = [makeProvider()];
    expect(checkProviderHasNoRecentSourceSnapshot(providers)).toHaveLength(0);
  });

  it("flags providers verified >30 days ago", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);
    const providers = [
      makeProvider({ last_verified: oldDate.toISOString().slice(0, 10) }),
    ];
    const issues = checkProviderHasNoRecentSourceSnapshot(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe("provider-stale-source");
    expect(issues[0].severity).toBe("warning");
  });

  it("returns empty for providers verified under the 30-day threshold", () => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    const providers = [
      makeProvider({ last_verified: date.toISOString().slice(0, 10) }),
    ];
    // 29 days is unambiguously under the >30 threshold
    expect(checkProviderHasNoRecentSourceSnapshot(providers)).toHaveLength(0);
  });

  it("handles multiple providers, some stale some not", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const providers = [
      makeProvider({ id: "fresh", last_verified: new Date().toISOString().slice(0, 10) }),
      makeProvider({ id: "stale", last_verified: oldDate.toISOString().slice(0, 10) }),
    ];
    const issues = checkProviderHasNoRecentSourceSnapshot(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].providerId).toBe("stale");
  });
});

// ── checkPlanHasNoPrice ────────────────────────────────────────────

describe("checkPlanHasNoPrice", () => {
  it("returns empty when all plans have prices", () => {
    const providers = [
      makeProvider({
        plans: [
          makePlan({ id: "plan-a", pricing: { monthly_usd: 10 } }),
          makePlan({ id: "plan-b", pricing: { monthly_usd: 20, currency: "USD" } }),
        ],
      }),
    ];
    expect(checkPlanHasNoPrice(providers)).toHaveLength(0);
  });

  it("flags plans with null pricing as error if provider has pricing_url", () => {
    const providers = [
      makeProvider({
        pricing_url: "https://example.com/pricing",
        plans: [makePlan({ pricing: { monthly_usd: null } })],
      }),
    ];
    const issues = checkPlanHasNoPrice(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].planId).toBe("test-plan");
  });

  it("flags plans with null pricing as warning if provider has no pricing_url", () => {
    const providers = [
      makeProvider({
        pricing_url: undefined,
        plans: [makePlan({ pricing: { monthly_usd: null } })],
      }),
    ];
    const issues = checkPlanHasNoPrice(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("skips pay-per-token plans with null monthly_usd (legitimate usage-based billing)", () => {
    const providers = [
      makeProvider({
        pricing_url: "https://example.com/pricing",
        plans: [
          makePlan({
            id: "pay-per-token-plan",
            pricing: { monthly_usd: null, currency: "USD" },
            usage_limits: [{ type: "unlimited", applies_to: "all API calls" }],
          }),
        ],
      }),
    ];
    // pay-per-token plans with "unlimited" usage_limits have no monthly flat fee
    expect(checkPlanHasNoPrice(providers)).toHaveLength(0);
  });

  it("returns empty for providers with no plans array", () => {
    const providers = [makeProvider({ plans: undefined })];
    expect(checkPlanHasNoPrice(providers)).toHaveLength(0);
  });
});

// ── checkPlanHasNoUsageEstimate ────────────────────────────────────

describe("checkPlanHasNoUsageEstimate", () => {
  it("returns empty when plans have usage limits and model estimates", () => {
    const providers = [
      makeProvider({
        plans: [
          makePlan({
            usage_limits: [{ type: "message", model_id: "m1", limit_value: 100 }],
            models: [{ model_id: "m1" }],
          }),
        ],
      }),
    ];
    expect(checkPlanHasNoUsageEstimate(providers)).toHaveLength(0);
  });

  it("flags plans with empty usage_limits", () => {
    const providers = [
      makeProvider({
        plans: [
          makePlan({ usage_limits: [], models: [{ model_id: "unknown-model" }] }),
        ],
      }),
    ];
    const issues = checkPlanHasNoUsageEstimate(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe("plan-no-usage-estimate");
  });

  it("flags plans with all-unknown usage limits", () => {
    const providers = [
      makeProvider({
        plans: [
          makePlan({
            usage_limits: [{ type: "unknown", model_id: "m1", limit_value: null }],
          }),
        ],
      }),
    ];
    const issues = checkPlanHasNoUsageEstimate(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe("plan-no-usage-estimate");
  });

  it("skips checks for providers with no plans", () => {
    const providers = [makeProvider({ plans: undefined })];
    expect(checkPlanHasNoUsageEstimate(providers)).toHaveLength(0);
  });
});

// ── checkImpossibleValues ──────────────────────────────────────────

describe("checkImpossibleValues", () => {
  it("returns empty for typical valid data", () => {
    const providers = [
      makeProvider({
        founded_year: 2021,
        headquarters_country: "US",
        plans: [
          makePlan({ pricing: { monthly_usd: 20, currency: "USD" } }),
        ],
      }),
    ];
    expect(checkImpossibleValues(providers)).toHaveLength(0);
  });

  it("flags negative prices", () => {
    const providers = [
      makeProvider({
        plans: [
          makePlan({ id: "neg-plan", pricing: { monthly_usd: -5, currency: "USD" } }),
        ],
      }),
    ];
    const issues = checkImpossibleValues(providers);
    expect(issues.some((i) => i.planId === "neg-plan" && i.field === "pricing.monthly_usd")).toBe(true);
  });

  it("flags founded_year before 1900", () => {
    const providers = [makeProvider({ founded_year: 1800 })];
    const issues = checkImpossibleValues(providers);
    expect(issues.some((i) => i.field === "founded_year")).toBe(true);
  });

  it("flags founded_year in the future", () => {
    const providers = [makeProvider({ founded_year: 2030 })];
    const issues = checkImpossibleValues(providers);
    expect(issues.some((i) => i.field === "founded_year")).toBe(true);
  });

  it("flags non-standard currency", () => {
    const providers = [
      makeProvider({
        plans: [
          makePlan({ id: "bad-cur", pricing: { monthly_usd: 10, currency: "US" } }),
        ],
      }),
    ];
    const issues = checkImpossibleValues(providers);
    expect(issues.some((i) => i.planId === "bad-cur" && i.field === "pricing.currency")).toBe(true);
  });

  it("flags non-standard country code", () => {
    const providers = [makeProvider({ headquarters_country: "United States" })];
    const issues = checkImpossibleValues(providers);
    expect(issues.some((i) => i.field === "headquarters_country")).toBe(true);
  });

  it("does not flag null context_length_k (unknown/not-applicable)", () => {
    const providers = [
      makeProvider({
        models: [{ id: "byok-model", context_length_k: null }],
      }),
    ];
    const issues = checkImpossibleValues(providers);
    expect(issues.filter((i) => i.field === "context_length_k")).toHaveLength(0);
  });

  it("flags context_length_k = 0 as impossible", () => {
    const providers = [
      makeProvider({
        models: [{ id: "bad-model", context_length_k: 0 }],
      }),
    ];
    const issues = checkImpossibleValues(providers);
    expect(issues.some((i) => i.field === "context_length_k" && i.modelId === "bad-model")).toBe(true);
  });
});

// ── checkConfidenceBelowThreshold ──────────────────────────────────

describe("checkConfidenceBelowThreshold", () => {
  it("returns empty when all confidences are observed", () => {
    const providers = [
      makeProvider(),
      makeProvider({
        id: "other",
        models: [{ id: "m1", provenance: { confidence: "observed" } }],
      }),
    ];
    expect(checkConfidenceBelowThreshold(providers)).toHaveLength(0);
  });

  it("flags unknown as error", () => {
    const providers = [makeProvider({ provenance: { confidence: "unknown" } })];
    const issues = checkConfidenceBelowThreshold(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("flags assumed as warning", () => {
    const providers = [makeProvider({ provenance: { confidence: "assumed" } })];
    const issues = checkConfidenceBelowThreshold(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("flags stale as warning", () => {
    const providers = [makeProvider({ provenance: { confidence: "stale" } })];
    const issues = checkConfidenceBelowThreshold(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("flags per-model low confidence", () => {
    const providers = [
      makeProvider({
        models: [
          { id: "m1", provenance: { confidence: "assumed" } },
          { id: "m2", provenance: { confidence: "observed" } },
        ],
      }),
    ];
    const issues = checkConfidenceBelowThreshold(providers);
    expect(issues).toHaveLength(1);
    expect(issues[0].modelId).toBe("m1");
  });
});
