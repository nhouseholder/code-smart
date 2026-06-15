import { describe, it, expect } from "vitest";
import { scorePlan, scoreAllPlans } from "../src/lib/value-scorer";
import type { Provider, Plan, Model } from "../src/types";

const FAKE_PROV = {
  url: "https://example.com",
  accessed_date: "2026-06-14",
  method: "manual" as const,
  confidence: "assumed" as const,
};

const mockModel: Model = {
  id: "test-model-1",
  provider_id: "test",
  display_name: "Test Model",
  context_length_k: 128,
  strengths: ["coding"],
  benchmarks: [
    { name: "SWE-bench-verified", score: 50, unit: "percent", higher_is_better: true, provenance: FAKE_PROV },
    { name: "HumanEval", score: 80, unit: "percent", higher_is_better: true, provenance: FAKE_PROV },
  ],
  provenance: FAKE_PROV,
};

const mockPlan = (overrides: Partial<Plan> = {}): Plan => ({
  id: "test-plan",
  provider_id: "test",
  name: "Test Plan",
  tier: "pro",
  pricing: {
    monthly_usd: 20,
    annual_monthly_usd: null,
    is_per_seat: false,
    currency: "USD",
    provenance: FAKE_PROV,
  },
  models: [{ model_id: "test-model-1", access_type: "full", is_default: true }],
  usage_limits: [],
  features: {
    agent_capabilities: true,
    web_search: false,
    code_context_length_k: 128,
    file_uploads: true,
    voice_input: false,
    ide_integrations: ["VS Code"],
    cli_access: false,
    api_access: false,
    priority_access: true,
    custom_instructions: true,
    team_features: false,
    sso: false,
  },
  target_personas: [],
  is_active: true,
  last_verified: "2026-06-14",
  source_url: "https://example.com",
  ...overrides,
});

const mockProvider = (planOverride?: Partial<Plan>): Provider => ({
  id: "test",
  name: "Test",
  display_name: "Test Provider",
  website: "https://example.com",
  pricing_url: "https://example.com/pricing",
  description: "A test provider",
  logo_slug: "test",
  category: "ai_lab",
  headquarters_country: "US",
  plans: [mockPlan(planOverride)],
  models: [mockModel],
  last_verified: "2026-06-14",
  provenance: FAKE_PROV,
});

describe("scorePlan", () => {
  it("returns a score between 0 and 100", () => {
    const provider = mockProvider();
    const score = scorePlan(provider.plans[0], provider);
    expect(score.overall_value_score).toBeGreaterThanOrEqual(0);
    expect(score.overall_value_score).toBeLessThanOrEqual(100);
  });

  it("free plans score higher in cost dimension than paid plans", () => {
    const freePlan = mockPlan({ id: "free-plan", tier: "free", pricing: { ...mockPlan().pricing, monthly_usd: 0, annual_monthly_usd: 0 } });
    const paidPlan = mockPlan({ id: "paid-plan", pricing: { ...mockPlan().pricing, monthly_usd: 20 } });
    const provider: Provider = { ...mockProvider(), plans: [freePlan, paidPlan] };

    const freeScore = scorePlan(freePlan, provider);
    const paidScore = scorePlan(paidPlan, provider);

    expect(freeScore.score_breakdown.cost_score).toBeGreaterThan(paidScore.score_breakdown.cost_score);
  });

  it("plan with benchmarks scores higher benchmark_quality_index than one without", () => {
    const withBench = mockProvider();
    const noBenchModel: Model = { ...mockModel, id: "no-bench", benchmarks: [] };
    const noBenchProvider: Provider = {
      ...mockProvider(),
      models: [noBenchModel],
      plans: [mockPlan({ models: [{ model_id: "no-bench", access_type: "full" }] })],
    };

    const scoreWith = scorePlan(withBench.plans[0], withBench);
    const scoreWithout = scorePlan(noBenchProvider.plans[0], noBenchProvider);

    expect(scoreWith.benchmark_quality_index).not.toBeNull();
    expect(scoreWithout.benchmark_quality_index).toBeNull();
    // Benchmark-less plan uses 0 as default for overall score
    expect(scoreWith.score_breakdown.benchmark_score).toBeGreaterThan(scoreWithout.score_breakdown.benchmark_score);
  });

  it("feature-rich plan scores higher in feature dimension", () => {
    const richPlan = mockPlan({ features: { ...mockPlan().features, agent_capabilities: true, api_access: true, cli_access: true, sso: true, team_features: true } });
    const poorPlan = mockPlan({ features: { ...mockPlan().features, agent_capabilities: false, api_access: false, cli_access: false, sso: false, team_features: false, ide_integrations: [] } });
    const provider: Provider = { ...mockProvider(), plans: [richPlan, poorPlan] };

    const richScore = scorePlan(richPlan, provider);
    const poorScore = scorePlan(poorPlan, provider);

    expect(richScore.score_breakdown.feature_score).toBeGreaterThan(poorScore.score_breakdown.feature_score);
  });

  it("scoreAllPlans returns results sorted descending by overall_value_score", () => {
    const provider = mockProvider();
    const entries = [{ provider, plan: provider.plans[0] }];
    const scored = scoreAllPlans(entries);

    expect(scored.length).toBe(1);
    expect(scored[0].score.overall_value_score).toBeGreaterThanOrEqual(0);

    // Test sort order with two entries
    const cheapProvider = mockProvider({ pricing: { ...mockPlan().pricing, monthly_usd: 0 } });
    const scored2 = scoreAllPlans([
      { provider, plan: provider.plans[0] },
      { provider: cheapProvider, plan: cheapProvider.plans[0] },
    ]);
    for (let i = 1; i < scored2.length; i++) {
      expect(scored2[i - 1].score.overall_value_score).toBeGreaterThanOrEqual(scored2[i].score.overall_value_score);
    }
  });

  it("produces score_breakdown weights summing to ~1.0", () => {
    const provider = mockProvider();
    const score = scorePlan(provider.plans[0], provider);
    const { cost, benchmark, feature } = score.score_breakdown.weights;
    expect(cost + benchmark + feature).toBeCloseTo(1.0, 5);
  });
});

describe("scorePlan — QAMU path", () => {
  it("plan with token limits scores higher than plan with no limits (same price, same benchmarks)", () => {
    const withTokens = mockPlan({
      id: "has-tokens",
      usage_limits: [{
        type: "tokens_per_month",
        value: 5_000_000,
        unit: "tokens",
        provenance: FAKE_PROV,
      }],
    });
    const noLimits = mockPlan({ id: "no-limits", usage_limits: [] });
    const provider: Provider = { ...mockProvider(), plans: [withTokens, noLimits] };

    expect(scorePlan(withTokens, provider).overall_value_score)
      .toBeGreaterThan(scorePlan(noLimits, provider).overall_value_score);
  });

  it("unlimited plan produces a score in [0, 100]", () => {
    const plan = mockPlan({
      id: "unlimited",
      usage_limits: [{ type: "unlimited", value: null, provenance: FAKE_PROV }],
    });
    const provider: Provider = { ...mockProvider(), plans: [plan] };
    const score = scorePlan(plan, provider);

    expect(score.overall_value_score).toBeGreaterThanOrEqual(0);
    expect(score.overall_value_score).toBeLessThanOrEqual(100);
  });

  it("score_breakdown exposes qamu_estimated_tokens_1mo for plans with known limits", () => {
    const plan = mockPlan({
      id: "tokens-breakdown",
      usage_limits: [{
        type: "tokens_per_month",
        value: 2_000_000,
        unit: "tokens",
        provenance: FAKE_PROV,
      }],
    });
    const provider: Provider = { ...mockProvider(), plans: [plan] };
    const score = scorePlan(plan, provider);

    expect(score.score_breakdown).toHaveProperty("qamu_estimated_tokens_1mo");
    expect(score.score_breakdown.qamu_estimated_tokens_1mo).toBeGreaterThan(0);
  });
});
