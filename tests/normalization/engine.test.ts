import { describe, it, expect } from "vitest";
import { normalizeLimit } from "@/lib/normalization/engine";
import { DEFAULT_CONFIG } from "@/lib/normalization/config";
import type { UsageLimitRow } from "@/lib/normalization/types";

/**
 * Helper to create a minimal UsageLimitRow for testing.
 */
function makeLimit(overrides: Partial<UsageLimitRow> = {}): UsageLimitRow {
  return {
    id: overrides.id ?? 1,
    planId: overrides.planId ?? "test-plan",
    modelId: overrides.modelId ?? null,
    observedAt: overrides.observedAt ?? "2026-06-15T00:00:00Z",
    rawLimitText: overrides.rawLimitText ?? "test limit",
    limitType: overrides.limitType ?? "rate",
    limitValue: overrides.limitValue ?? null,
    limitUnit: overrides.limitUnit ?? null,
    resetWindow: overrides.resetWindow ?? null,
    confidence: overrides.confidence ?? "observed",
    notes: overrides.notes ?? null,
  };
}

describe("normalizeLimit — direct tokens", () => {
  it("returns observed confidence for direct token limits", () => {
    const limit = makeLimit({
      limitType: "rate",
      limitValue: 200_000,
      limitUnit: "tokens",
      resetWindow: "1mo",
      rawLimitText: "200K tokens per month",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.estimatedTokens1mo).toBe(200_000);
    expect(result.confidence).toBe("observed");
    expect(result.conversionChain[0].layer).toBe("direct_tokens");
  });

  it("produces per-window estimates from monthly tokens", () => {
    const limit = makeLimit({
      limitValue: 1_000_000,
      limitUnit: "tokens",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.estimatedTokens1mo).toBe(1_000_000);
    expect(result.estimatedTokens1w!).toBeLessThan(1_000_000);
    expect(result.estimatedTokens24h!).toBeLessThan(result.estimatedTokens1w!);
    expect(result.estimatedTokens5h!).toBeLessThan(result.estimatedTokens24h!);
  });
});

describe("normalizeLimit — time-window limits", () => {
  it("processes daily message limits", () => {
    const limit = makeLimit({
      limitValue: 50,
      limitUnit: "messages",
      resetWindow: "1d",
      rawLimitText: "50 messages per day",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // 50 msg/day × 20 days × 2000 tokens = 2,000,000 tokens/month
    expect(result.estimatedTokens1mo).toBe(2_000_000);
    expect(result.conversionChain[0].layer).toBe("messages");
  });

  it("processes monthly message limits", () => {
    const limit = makeLimit({
      limitValue: 500,
      limitUnit: "messages",
      resetWindow: "1mo",
      rawLimitText: "500 messages per month",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // 500 × 2000 = 1,000,000
    expect(result.estimatedTokens1mo).toBe(1_000_000);
  });

  it("processes hourly message limits", () => {
    const limit = makeLimit({
      limitValue: 10,
      limitUnit: "messages",
      resetWindow: "1h",
      rawLimitText: "10 messages per hour",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // 10 msg/h × 5h/session × 80 sessions/month × 2000 tokens = 8,000,000
    expect(result.estimatedTokens1mo).toBe(8_000_000);
  });

  it("processes weekly request limits", () => {
    const limit = makeLimit({
      limitValue: 100,
      limitUnit: "requests",
      resetWindow: "1w",
      rawLimitText: "100 requests per week",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // 100 req/w × 4 weeks × 5000 tokens = 2,000,000
    expect(result.estimatedTokens1mo).toBe(2_000_000);
    expect(result.conversionChain[0].layer).toBe("requests");
  });

  it("applies model multiplier when configured", () => {
    const config = {
      ...DEFAULT_CONFIG,
      modelMultipliers: {
        "claude-4": { low: 1.0, base: 2.5, high: 4.0 },
      },
    };
    const limit = makeLimit({
      modelId: "claude-sonnet-4-6",
      limitValue: 100_000,
      limitUnit: "tokens",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, config);

    expect(result.estimatedTokens1mo).toBe(250_000); // 100_000 × 2.5
  });
});

describe("normalizeLimit — credit limits", () => {
  it("estimates from credits with default mapping", () => {
    const limit = makeLimit({
      limitType: "credits_per_month",
      limitValue: 500,
      limitUnit: "credits",
      resetWindow: "1mo",
      rawLimitText: "500 credits per month",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // 500 × 500 = 250,000
    expect(result.estimatedTokens1mo).toBe(250_000);
    expect(result.confidence).toBe("assumed");
  });

  it("uses provider-specific mapping when available", () => {
    const config = {
      ...DEFAULT_CONFIG,
      creditMappings: {
        "openai": { tokensPerCredit: 1000, source: "openai docs" },
      },
    };
    const limit = makeLimit({
      planId: "openai-pro",
      limitType: "credits_per_month",
      limitValue: 500,
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, config);

    // 500 × 1000 = 500,000
    expect(result.estimatedTokens1mo).toBe(500_000);
    expect(result.confidence).toBe("inferred");
  });
});

describe("normalizeLimit — compute units", () => {
  it("estimates from compute units with default mapping", () => {
    const limit = makeLimit({
      limitType: "compute_units_per_month",
      limitValue: 1000,
      limitUnit: "compute_units",
      resetWindow: "1mo",
      rawLimitText: "1000 compute units per month",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // 1000 × 1000 = 1,000,000
    expect(result.estimatedTokens1mo).toBe(1_000_000);
  });

  it("uses provider-specific compute unit mapping", () => {
    const config = {
      ...DEFAULT_CONFIG,
      computeUnitMappings: {
        "google": { tokensPerComputeUnit: 2000, source: "google docs" },
      },
    };
    const limit = makeLimit({
      planId: "google-pro",
      limitType: "compute_units_per_month",
      limitValue: 500,
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, config);

    // 500 × 2000 = 1,000,000
    expect(result.estimatedTokens1mo).toBe(1_000_000);
    expect(result.confidence).toBe("inferred");
  });
});

describe("normalizeLimit — unlimited / fair use", () => {
  it("fair use yields NO synthetic estimate — null, never the old 400K manufacture", () => {
    const limit = makeLimit({
      limitType: "fair_use",
      rawLimitText: "fair use policy applies",
      limitValue: null,
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // "Unlimited"/fair-use is banned as a coding limit — falls through to unknown.
    expect(result.estimatedTokens1mo).toBeNull();
    expect(result.confidence).toBe("unknown");
    expect(result.conversionChain[0].layer).toBe("unknown");
  });

  it("'unlimited' raw text yields NO synthetic estimate — null", () => {
    const limit = makeLimit({
      limitType: "rate",
      rawLimitText: "unlimited usage",
      limitValue: null,
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.estimatedTokens1mo).toBeNull();
  });
});

describe("normalizeLimit — unknown limits", () => {
  it("returns null estimates for unknown type", () => {
    const limit = makeLimit({
      limitType: "vague",
      rawLimitText: "some usage restrictions may apply",
      limitValue: null,
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.estimatedTokens1mo).toBeNull();
    expect(result.estimatedTokens1w).toBeNull();
    expect(result.estimatedTokens24h).toBeNull();
    expect(result.estimatedTokens5h).toBeNull();
    expect(result.confidence).toBe("unknown");
    expect(result.conversionChain[0].layer).toBe("unknown");
  });
});

describe("normalizeLimit — conversion chain", () => {
  it("chains multiple steps for message limits", () => {
    const limit = makeLimit({
      limitValue: 50,
      limitUnit: "messages",
      resetWindow: "1d",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.conversionChain.length).toBeGreaterThanOrEqual(1);
    expect(result.conversionChain[0].layer).toBe("messages");
    expect(result.assumptions.length).toBeGreaterThanOrEqual(1);
  });

  it("includes assumptions in the result", () => {
    const limit = makeLimit({
      limitValue: 200_000,
      limitUnit: "tokens",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.assumptions).toBeDefined();
  });
});

describe("normalizeLimit — edge cases", () => {
  it("handles sentinel planId", () => {
    const limit = makeLimit({
      planId: "",
      limitValue: 1000,
      limitUnit: "tokens",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.planId).toBe("");
    expect(result.estimatedTokens1mo).toBe(1000);
  });

  it("handles sentinel modelId", () => {
    const limit = makeLimit({
      modelId: "unknown",
      limitValue: 1000,
      limitUnit: "tokens",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.modelId).toBe("unknown");
    expect(result.estimatedTokens1mo).toBe(1000);
  });

  it("handles null limitValue gracefully", () => {
    const limit = makeLimit({
      limitType: "rate",
      limitValue: null,
      limitUnit: "tokens",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // Falls through to unknown since limitValue is null
    expect(result.estimatedTokens1mo).toBeNull();
    expect(result.confidence).toBe("unknown");
  });

  it("produces per-window uncertainty ranges for message limits", () => {
    const limit = makeLimit({
      limitValue: 500,
      limitUnit: "messages",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    // Low: 500 × 1000 = 500,000, High: 500 × 5000 = 2,500,000
    // Base: 500 × 2000 = 1,000,000
    expect(result.estimatedTokens1mo).toBe(1_000_000);
    // Uncertainty ranges should diverge from the base
    expect(result.uncertaintyLow1mo).toBeLessThanOrEqual(result.estimatedTokens1mo!);
    expect(result.uncertaintyHigh1mo).toBeGreaterThanOrEqual(result.estimatedTokens1mo!);
  });
});

describe("normalizeLimit — methodology version", () => {
  it("includes methodology version in output", () => {
    const limit = makeLimit({
      limitValue: 100_000,
      limitUnit: "tokens",
      resetWindow: "1mo",
    });

    const result = normalizeLimit(limit, DEFAULT_CONFIG);

    expect(result.methodologyVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
