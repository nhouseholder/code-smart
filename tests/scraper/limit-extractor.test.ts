import { describe, it, expect } from "vitest";
import { extractUsageLimits } from "../../src/lib/scraper/limit-extractor";

describe("extractUsageLimits", () => {
  it("hard numeric: 50 messages per day → observed", () => {
    const result = extractUsageLimits("Plan includes 50 messages per day.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("hard_numeric");
    expect(result[0].limitValue).toBe(50);
    expect(result[0].limitUnit).toBe("messages");
    expect(result[0].resetWindow).toBe("1d");
    expect(result[0].confidence).toBe("observed");
  });

  it("hard numeric: 1000 requests/hour → observed", () => {
    const result = extractUsageLimits("You get 1,000 requests per hour.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("hard_numeric");
    expect(result[0].limitValue).toBe(1000);
    expect(result[0].resetWindow).toBe("1h");
  });

  it("relative: 5x more usage → inferred with needsNormalization", () => {
    const result = extractUsageLimits("Pro plan gives 5x more usage.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("relative");
    expect(result[0].limitValue).toBe(5);
    expect(result[0].needsNormalization).toBe(true);
    expect(result[0].confidence).toBe("inferred");
  });

  it("credits: 500 credits per month → observed, leaves as credits", () => {
    const result = extractUsageLimits("Each month you receive 500 credits per month.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("credits");
    expect(result[0].limitValue).toBe(500);
    expect(result[0].resetWindow).toBe("1mo");
    // No token conversion — preserve raw
    expect(result[0].rawText).toContain("500");
    expect(result[0].rawText).toContain("credits");
  });

  it("time-windowed: reset every 24 hours", () => {
    const result = extractUsageLimits("Usage limits reset every 24 hours.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("time_windowed");
    expect(result[0].limitValue).toBe(24);
  });

  it("model-specific: varies by model → assumed", () => {
    const result = extractUsageLimits("Pricing varies by model.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("model_specific");
    expect(result[0].confidence).toBe("assumed");
  });

  it("rate limit: rate limited during peak → assumed", () => {
    const result = extractUsageLimits("You may be rate limited during peak hours.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("rate_limit");
    expect(result[0].confidence).toBe("assumed");
  });

  it("fair use: subject to fair use → assumed", () => {
    const result = extractUsageLimits("All plans subject to fair use policy.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("fair_use");
    expect(result[0].confidence).toBe("assumed");
  });

  it('vague: "Limited usage" → unknown, raw text only', () => {
    const result = extractUsageLimits("Limited usage on the free plan.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("vague");
    expect(result[0].limitValue).toBeNull();
    expect(result[0].confidence).toBe("unknown");
    expect(result[0].rawText).toContain("Limited");
  });

  it("multiple patterns extracted from same text", () => {
    const result = extractUsageLimits(
      "Free: 10 messages/day. Pro: 100 messages/hour. Enterprise: 5000 messages/day.",
    );
    // Only 3 unique matches
    expect(result.length).toBeGreaterThanOrEqual(2);
    const numerics = result.filter((r) => r.limitType === "hard_numeric");
    expect(numerics.length).toBeGreaterThanOrEqual(2);
  });

  it("vague-only text produces a vague entry when no structured match overlaps", () => {
    // Vague pattern matched where no structured pattern captured that position
    const result = extractUsageLimits("Usage is capped at a reasonable level.");
    expect(result).toHaveLength(1);
    expect(result[0].limitType).toBe("vague");
    expect(result[0].confidence).toBe("unknown");
    expect(result[0].limitValue).toBeNull();
  });

  it("dedup: identical matches produce one entry", () => {
    const result = extractUsageLimits("10 messages/day ... 10 messages/day ...");
    const matches = result.filter((r) => r.limitType === "hard_numeric");
    expect(matches).toHaveLength(1);
  });
});
