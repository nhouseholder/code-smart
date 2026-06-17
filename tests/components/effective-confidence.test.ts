import { describe, it, expect } from "vitest";
import { weakenForStaleness, effectiveConfidence } from "@/lib/utils";
import type { Provenance } from "@/types";

/** ISO date string `days` days before now. */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const FRESH = daysAgoIso(10); // well within 90d
const STALE = daysAgoIso(200); // well past 90d

describe("weakenForStaleness", () => {
  it("downgrades a fresh-declared confidence to 'stale' when >90d old", () => {
    expect(weakenForStaleness("observed", STALE)).toBe("stale");
    expect(weakenForStaleness("inferred", STALE)).toBe("stale");
    expect(weakenForStaleness("assumed", STALE)).toBe("stale");
  });

  it("is a no-op when the source is <90d old", () => {
    expect(weakenForStaleness("observed", FRESH)).toBe("observed");
    expect(weakenForStaleness("inferred", FRESH)).toBe("inferred");
    expect(weakenForStaleness("assumed", FRESH)).toBe("assumed");
  });

  it("never upgrades — a weaker-than-stale value is preserved even when old", () => {
    expect(weakenForStaleness("stale", STALE)).toBe("stale");
    expect(weakenForStaleness("unknown", STALE)).toBe("unknown");
    expect(weakenForStaleness("unknown", FRESH)).toBe("unknown");
  });

  it("preserves a manually-set 'stale' regardless of date", () => {
    expect(weakenForStaleness("stale", FRESH)).toBe("stale");
  });
});

describe("effectiveConfidence", () => {
  const base: Omit<Provenance, "confidence" | "accessed_date"> = {
    url: "https://example.com",
    method: "manual",
  };

  it("derives 'stale' from an old provenance with a strong declared confidence", () => {
    const p: Provenance = { ...base, confidence: "observed", accessed_date: STALE };
    expect(effectiveConfidence(p)).toBe("stale");
  });

  it("returns the declared confidence for a fresh provenance", () => {
    const p: Provenance = { ...base, confidence: "assumed", accessed_date: FRESH };
    expect(effectiveConfidence(p)).toBe("assumed");
  });
});
