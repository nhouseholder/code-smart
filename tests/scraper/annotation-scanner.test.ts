import { describe, it, expect } from "vitest";
import { scanFootnotes, recordAssumptions } from "../../src/lib/scraper/annotation-scanner";

// ── scanFootnotes ──────────────────────────────────────────────────

describe("scanFootnotes", () => {
  it("captures asterisk disclaimer footnotes", () => {
    const text = `Price listed is for annual plans.
* Limited to 100 requests per day.
* Additional terms may apply.`;
    const result = scanFootnotes(text);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((f) => f.includes("Limited to 100"))).toBe(true);
  });

  it("captures 'terms apply' boilerplate", () => {
    const text = "Some restrictions apply. Additional terms apply for enterprise customers.";
    const result = scanFootnotes(text);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((f) => f.toLowerCase().includes("terms apply"))).toBe(true);
  });

  it("captures 'as of' date markers", () => {
    const text = "Pricing effective as of June 2026. Last updated Q2 2026.";
    const result = scanFootnotes(text);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((f) => f.includes("as of"))).toBe(true);
  });

  it("captures 'limited to' / 'capped at' caveats", () => {
    const text = "Free tier is limited to 50 messages per month. Capped at 10 RPM.";
    const result = scanFootnotes(text);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((f) => f.toLowerCase().includes("limited to"))).toBe(true);
  });

  it("returns empty array when no footnote patterns match", () => {
    const text = "Plain pricing text with no disclaimers or caveats.";
    const result = scanFootnotes(text);

    expect(result.length).toBe(0);
  });

  it("deduplicates identical footnote strings", () => {
    const text = `* Limited to 100 requests per day.
* Limited to 100 requests per day.`;
    const result = scanFootnotes(text);

    // Identical strings collapse via Set dedup
    expect(result.length).toBe(1);
  });
});

// ── recordAssumptions ──────────────────────────────────────────────

describe("recordAssumptions", () => {
  it("records price count and billing interval gaps", () => {
    const result = recordAssumptions(
      "Sample text",
      [
        {
          rawText: "$20/mo",
          amount: 20,
          currency: "USD",
          billingInterval: "monthly",
          confidence: "observed" as const,
          contextSnippet: "...$20/mo...",
        },
        {
          rawText: "$200",
          amount: 200,
          currency: "USD",
          billingInterval: null,
          confidence: "inferred" as const,
          contextSnippet: "...$200...",
        },
      ],
      [],
      [],
    );

    expect(result.some((a) => a.includes("2 price(s)"))).toBe(true);
    expect(result.some((a) => a.includes("without billing interval"))).toBe(true);
  });

  it("notes 'no free tier detected' when no $0 price exists", () => {
    const result = recordAssumptions("Text", [], [], []);

    expect(result.some((a) => a.includes("No free tier"))).toBe(true);
  });

  it("records limit count and normalization needs", () => {
    const result = recordAssumptions(
      "Text",
      [],
      [
        {
          rawText: "5x more usage",
          limitType: "relative",
          limitValue: 5,
          limitUnit: "x",
          resetWindow: null,
          confidence: "inferred" as const,
          needsNormalization: true,
          contextSnippet: "...",
        },
      ],
      [],
    );

    expect(result.some((a) => a.includes("1 usage limit(s)"))).toBe(true);
    expect(result.some((a) => a.includes("normalization"))).toBe(true);
  });

  it("records model mention count", () => {
    const result = recordAssumptions(
      "Text",
      [],
      [],
      [
        {
          modelId: "gpt-4o",
          rawText: "GPT-4o",
          displayName: "GPT-4o",
          confidence: "observed" as const,
          contextSnippet: "...",
        },
      ],
    );

    expect(result.some((a) => a.includes("1 model mention(s)"))).toBe(true);
  });
});
