import { describe, it, expect } from "vitest";
import { extractModelMentions } from "../../src/lib/scraper/model-extractor";
import type { ExtractedModelMention } from "../../src/lib/scraper/model-extractor";

// ── Helpers ────────────────────────────────────────────────────────

function makeKnownModels(entries: Array<[string, string]>): Map<string, string> {
  return new Map(entries);
}

// ── Tests ──────────────────────────────────────────────────────────

describe("extractModelMentions", () => {
  const knownModels = makeKnownModels([
    ["claude-sonnet-4-6", "Claude Sonnet 4.6"],
    ["claude-opus-4-8", "Claude Opus 4.8"],
    ["gpt-4o", "GPT-4o"],
    ["gpt-4o-mini", "GPT-4o-mini"],
    ["gemini-2-5-pro", "Gemini 2.5 Pro"],
    ["gemini-2-5-flash", "Gemini 2.5 Flash"],
  ]);

  it("finds a single known model mention in text", () => {
    const text = "Our most capable model is Claude Sonnet 4.6, available to all users.";
    const result = extractModelMentions(text, knownModels);

    expect(result.length).toBe(1);
    expect(result[0].modelId).toBe("claude-sonnet-4-6");
    expect(result[0].displayName).toBe("Claude Sonnet 4.6");
    expect(result[0].confidence).toBe("observed");
  });

  it("finds multiple distinct model mentions in the same text", () => {
    const text =
      "We support GPT-4o for speed and Claude Sonnet 4.6 for deep reasoning.";
    const result = extractModelMentions(text, knownModels);

    expect(result.length).toBe(2);
    const ids = result.map((m) => m.modelId).sort();
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("gpt-4o");
  });

  it("returns empty array when no known models are present", () => {
    const text = "This page has no model references at all.";
    const result = extractModelMentions(text, knownModels);

    expect(result.length).toBe(0);
  });

  it("prefers longer display name over shorter partial match", () => {
    // "GPT-4o-mini" is longer than "GPT-4o" — the smaller name should
    // NOT match "GPT-4o-mini" due to word boundaries
    const text = "Use GPT-4o-mini for cost-effective tasks.";
    const result = extractModelMentions(text, knownModels);

    expect(result.length).toBe(1);
    expect(result[0].modelId).toBe("gpt-4o-mini");
  });

  it("provides context snippet around the match", () => {
    const text =
      "Lorem ipsum dolor sit amet consectetur adipiscing elit GPT-4o is the fastest model available sed do eiusmod tempor incididunt ut labore.";
    const result = extractModelMentions(text, knownModels);

    expect(result.length).toBe(1);
    expect(result[0].contextSnippet.length).toBeGreaterThan(10);
    expect(result[0].contextSnippet).toContain("GPT-4o");
  });

  it("deduplicates same model at same position", () => {
    // Two identical strings at different positions — they are separate occurrences
    const text = "Our best model is Claude Opus 4.8 and Claude Opus 4.8 is also great.";

    // regexes overlap — "Claude Opus 4.8 and" means "Claude Opus 4.8" at index 20 and
    // again at index 44. Both remain since they're separate occurrences.
    const result = extractModelMentions(text, knownModels);

    expect(result.length).toBe(2);
    expect(result[0].modelId).toBe("claude-opus-4-8");
    expect(result[1].modelId).toBe("claude-opus-4-8");
  });

  it("includes all fields in ExtractedModelMention", () => {
    const text = "Try Gemini 2.5 Pro for research.";
    const result = extractModelMentions(text, knownModels);

    expect(result.length).toBe(1);
    const mention = result[0];
    expect(mention).toHaveProperty("modelId");
    expect(mention).toHaveProperty("rawText");
    expect(mention).toHaveProperty("displayName");
    expect(mention).toHaveProperty("confidence");
    expect(mention).toHaveProperty("contextSnippet");
    expect(typeof mention.contextSnippet).toBe("string");
  });
});
