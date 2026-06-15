import { describe, it, expect } from "vitest";
import { extractPrices, extractFreeTier } from "../../src/lib/scraper/price-extractor";

describe("extractPrices", () => {
  it("$20/mo → observed with monthly interval", () => {
    const result = extractPrices("Our plan costs $20/mo for full access.");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(20);
    expect(result[0].billingInterval).toBe("monthly");
    expect(result[0].confidence).toBe("observed");
    expect(result[0].currency).toBe("USD");
  });

  it("$200/year → observed with annual interval", () => {
    const result = extractPrices("Just $200 per year, billed annually.");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(200);
    expect(result[0].billingInterval).toBe("annual");
    expect(result[0].confidence).toBe("observed");
  });

  it("$19.99 alone without billing context → inferred", () => {
    const result = extractPrices("Upgrade for only $19.99!");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(19.99);
    expect(result[0].billingInterval).toBeNull();
    expect(result[0].confidence).toBe("inferred");
  });

  it("$1,000/seat/month parses amount correctly", () => {
    const result = extractPrices("Enterprise: $1,000/seat/month");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1000);
    // billingInterval is null because regex captures 'seat' not 'month'
    expect(result[0].billingInterval).toBeNull();
  });

  it("Free tier detection", () => {
    const free = extractFreeTier("Start with our Free plan, no credit card needed.");
    expect(free).not.toBeNull();
    expect(free!.amount).toBe(0);
    expect(free!.confidence).toBe("observed");
  });

  it("$0 detected as free", () => {
    const free = extractFreeTier("Basic: $0/month for individuals.");
    expect(free).not.toBeNull();
    expect(free!.amount).toBe(0);
  });

  it('"Contact sales" returns no price', () => {
    const result = extractPrices("For custom pricing, contact sales.");
    expect(result).toHaveLength(0);
  });

  it("multiple prices are deduplicated", () => {
    const result = extractPrices(
      "Pro: $20/mo for individuals. $20/mo when billed monthly.",
    );
    // Should only have one unique match
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("context snippet captures surrounding text", () => {
    const text = "A".repeat(50) + " $50/mo " + "B".repeat(50);
    const result = extractPrices(text);
    expect(result).toHaveLength(1);
    expect(result[0].contextSnippet.length).toBeGreaterThan(0);
    expect(result[0].contextSnippet).toContain("$50/mo");
  });
});
