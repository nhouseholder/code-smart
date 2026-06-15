import { describe, it, expect } from "vitest";
import {
  computeWMQ,
  computeQualityAdjusted,
  computeModelCostAdjusted,
  computeValueScore,
  computePlanValueEstimates,
} from "../src/lib/model-value-engine";
import type { AAModelScore, Plan, Provider, Model } from "../src/types";
import type { UsageLimitRow } from "../src/lib/normalization/types";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const FAKE_PROV = {
  url: "https://example.com",
  accessed_date: "2026-06-15",
  method: "manual" as const,
  confidence: "assumed" as const,
};

const mockModel: Model = {
  id: "test-model-1",
  provider_id: "test",
  display_name: "Test Model",
  context_length_k: 128,
  strengths: ["coding"],
  benchmarks: [],
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
  last_verified: "2026-06-15",
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
  last_verified: "2026-06-15",
  provenance: FAKE_PROV,
});

const mockAAScore = (overrides: Partial<AAModelScore> = {}): AAModelScore => ({
  modelId: "test-model-1",
  observedAt: "2026-06-15",
  agenticIndex: 70,
  codingIndex: 80,
  speedScore: 60,
  intelligenceIndex: 75,
  inputPrice: 3.0,    // $3/M input
  outputPrice: 15.0,  // $15/M output
  confidence: "observed",
  source: "test",
  ...overrides,
});

const mockLimitRow = (overrides: Partial<UsageLimitRow> = {}): UsageLimitRow => ({
  id: 0,
  planId: "test-plan",
  modelId: null,
  observedAt: "2026-06-15T00:00:00.000Z",
  rawLimitText: "1000 credits/month",
  limitType: "credits",
  limitValue: 1000,
  limitUnit: null,
  resetWindow: "1mo",
  confidence: "observed",
  notes: null,
  ...overrides,
});

// ─── computeWMQ ───────────────────────────────────────────────────────────────

describe("computeWMQ", () => {
  it("computes correct weighted average when all three indices are present", () => {
    // WMQ = (0.50×70 + 0.40×80 + 0.10×60) / 1.0 = (35 + 32 + 6) / 1.0 = 73.0
    const { wmq, confidence } = computeWMQ(mockAAScore());
    expect(wmq).toBe(73.0);
    expect(confidence).toBe("observed");
  });

  it("returns wmq: null and confidence: 'unknown' when aa is null", () => {
    const { wmq, confidence } = computeWMQ(null);
    expect(wmq).toBeNull();
    expect(confidence).toBe("unknown");
  });

  it("redistributes weights and returns WMQ when agenticIndex is null", () => {
    // components: [coding×0.40, speed×0.10], totalWeight = 0.50
    // WMQ = (80×0.40 + 60×0.10) / 0.50 = 38 / 0.50 = 76.0
    const { wmq, confidence, notes } = computeWMQ(mockAAScore({ agenticIndex: null }));
    expect(wmq).toBe(76.0);
    expect(confidence).toBe("inferred");   // redistributed → inferred
    expect(notes.some(n => n.includes("agentic"))).toBe(true);
  });

  it("redistributes weights and returns WMQ when codingIndex is null", () => {
    // components: [agentic×0.50, speed×0.10], totalWeight = 0.60
    // WMQ = (70×0.50 + 60×0.10) / 0.60 = 41 / 0.60 = 68.3
    const { wmq, confidence, notes } = computeWMQ(mockAAScore({ codingIndex: null }));
    expect(wmq).toBeCloseTo(68.3, 1);
    expect(confidence).toBe("inferred");
    expect(notes.some(n => n.includes("coding"))).toBe(true);
  });

  it("returns wmq: null when both agenticIndex and codingIndex are null (only speed)", () => {
    const { wmq } = computeWMQ(mockAAScore({ agenticIndex: null, codingIndex: null }));
    expect(wmq).toBeNull();
  });

  it("uses speed fallback of 50 and emits note when speedScore is null", () => {
    // components: [agentic×0.50, coding×0.40, 50×0.10], totalWeight = 1.0
    // WMQ = (70×0.50 + 80×0.40 + 50×0.10) / 1.0 = (35 + 32 + 5) / 1.0 = 72.0
    const { wmq, notes } = computeWMQ(mockAAScore({ speedScore: null }));
    expect(wmq).toBe(72.0);
    expect(notes.some(n => n.includes("50/100 fallback"))).toBe(true);
  });
});

// ─── computeQualityAdjusted ────────────────────────────────────────────────────

describe("computeQualityAdjusted", () => {
  it("multiplies tokens by wmq/100", () => {
    expect(computeQualityAdjusted(1_000_000, 80)).toBe(800_000);
  });

  it("returns null when tokens is null", () => {
    expect(computeQualityAdjusted(null, 80)).toBeNull();
  });

  it("returns null when wmq is null", () => {
    expect(computeQualityAdjusted(1_000_000, null)).toBeNull();
  });

  it("returns 0 when wmq is 0 (zero score is valid, not missing)", () => {
    expect(computeQualityAdjusted(1_000_000, 0)).toBe(0);
  });
});

// ─── computeModelCostAdjusted ─────────────────────────────────────────────────

describe("computeModelCostAdjusted", () => {
  it("computes cost-adjusted tokens for credit-based limits with full AA pricing", () => {
    // blended = 3.0×0.30 + 15.0×0.70 = 0.9 + 10.5 = 11.4
    // tokensPerDollar = 1_000_000 / 11.4 ≈ 87,719
    // monthlyCreditsDollars = 1000 × 0.01 = $10
    // tokens_1mo ≈ 877,193
    const result = computeModelCostAdjusted(null, mockLimitRow(), mockAAScore());
    expect(result.tokens_1mo).toBeGreaterThan(0);
    expect(result.tokens_1w).toBeGreaterThan(0);
    expect(result.tokens_24h).toBeGreaterThan(0);
    expect(result.tokens_5h).toBeGreaterThan(0);
    // windows must be proportional: 5h < 24h < 1w < 1mo
    expect(result.tokens_5h!).toBeLessThan(result.tokens_24h!);
    expect(result.tokens_24h!).toBeLessThan(result.tokens_1w!);
    expect(result.tokens_1w!).toBeLessThan(result.tokens_1mo!);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("returns all nulls for direct token-denominated limits", () => {
    const row = mockLimitRow({ limitType: "tokens_per_month" });
    const result = computeModelCostAdjusted(null, row, mockAAScore());
    expect(result.tokens_1mo).toBeNull();
    expect(result.tokens_1w).toBeNull();
    expect(result.tokens_24h).toBeNull();
    expect(result.tokens_5h).toBeNull();
  });

  it("returns all nulls when aa is null", () => {
    const result = computeModelCostAdjusted(null, mockLimitRow(), null);
    expect(result.tokens_1mo).toBeNull();
  });

  it("returns all nulls when inputPrice is null", () => {
    const result = computeModelCostAdjusted(null, mockLimitRow(), mockAAScore({ inputPrice: null }));
    expect(result.tokens_1mo).toBeNull();
  });

  it("returns all nulls when blended cost is zero", () => {
    const result = computeModelCostAdjusted(
      null, mockLimitRow(), mockAAScore({ inputPrice: 0, outputPrice: 0 }),
    );
    expect(result.tokens_1mo).toBeNull();
    expect(result.notes.some(n => n.includes("zero"))).toBe(true);
  });
});

// ─── computeValueScore ────────────────────────────────────────────────────────

describe("computeValueScore", () => {
  it("returns 100 for quality at the reference point (800K tokens/mo, $20)", () => {
    // QAMU_REFERENCE = (1_000_000 × 0.8) / 20 = 40_000
    // raw = 800_000 / 20 / 40_000 × 100 = 100 → capped at 100
    expect(computeValueScore(800_000, 20)).toBe(100);
  });

  it("returns a score in [0, 100] for normal inputs", () => {
    const score = computeValueScore(500_000, 20);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns null when price is 0 (free plans)", () => {
    expect(computeValueScore(500_000, 0)).toBeNull();
  });

  it("returns null when price is null", () => {
    expect(computeValueScore(500_000, null)).toBeNull();
  });

  it("returns null when qualityAdjustedMonthly is null", () => {
    expect(computeValueScore(null, 20)).toBeNull();
  });
});

// ─── computePlanValueEstimates ────────────────────────────────────────────────

describe("computePlanValueEstimates", () => {
  it("quality-adjusted tokens are non-null and model-adjusted are null for token limits", () => {
    const plan = mockPlan({
      usage_limits: [{
        type: "tokens_per_month",
        value: 500_000,
        unit: "tokens",
        provenance: FAKE_PROV,
      }],
    });
    const provider = mockProvider();
    provider.plans = [plan];
    const aaScores = new Map([["test-model-1", mockAAScore()]]);

    const [result] = computePlanValueEstimates(plan, provider, aaScores);
    expect(result.quality_adjusted_tokens_1mo).not.toBeNull();
    expect(result.quality_adjusted_tokens_1mo).toBeGreaterThan(0);
    // token limits: model-adjusted is null (no cost adjustment for token-denominated limits)
    expect(result.model_adjusted_tokens_1mo).toBeNull();
  });

  it("returns all token fields null when plan has no usage_limits", () => {
    const plan = mockPlan({ usage_limits: [] });
    const provider = mockProvider();
    provider.plans = [plan];

    const [result] = computePlanValueEstimates(plan, provider, new Map());
    expect(result.estimated_tokens_1mo).toBeNull();
    expect(result.quality_adjusted_tokens_1mo).toBeNull();
    expect(result.model_adjusted_tokens_1mo).toBeNull();
    expect(result.value_score).toBeNull();
  });

  it("confidence is 'unknown' when no AA data is available", () => {
    const plan = mockPlan({
      usage_limits: [{ type: "tokens_per_month", value: 500_000, unit: "tokens", provenance: FAKE_PROV }],
    });
    const provider = mockProvider();
    provider.plans = [plan];

    // No AA scores passed → aa = null → wmqConf = "unknown" → output confidence = "unknown"
    const [result] = computePlanValueEstimates(plan, provider, new Map());
    expect(result.confidence).toBe("unknown");
    expect(result.weighted_model_quality).toBeNull();
  });

  it("sorts results by weighted_model_quality desc with null AA models last", () => {
    const model2: Model = { ...mockModel, id: "test-model-2", display_name: "Test Model 2" };
    const twoModelPlan = mockPlan({
      models: [
        { model_id: "test-model-1", access_type: "full" },
        { model_id: "test-model-2", access_type: "full" },
      ],
    });
    const provider: Provider = {
      ...mockProvider(),
      models: [mockModel, model2],
      plans: [twoModelPlan],
    };
    // model-1 has AA data; model-2 does not
    const aaScores = new Map([["test-model-1", mockAAScore({ modelId: "test-model-1" })]]);

    const results = computePlanValueEstimates(twoModelPlan, provider, aaScores);
    expect(results).toHaveLength(2);
    expect(results[0].modelId).toBe("test-model-1");   // WMQ = 73.0
    expect(results[1].modelId).toBe("test-model-2");   // WMQ = null → last
    expect(results[1].weighted_model_quality).toBeNull();
  });
});
