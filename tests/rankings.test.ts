import { describe, it, expect } from "vitest";
import { computeRankings, getPriceBand } from "../src/lib/rankings";
import type { Provider, Plan } from "../src/types";

const FAKE_PROV = {
  url: "https://example.com",
  accessed_date: "2026-06-15",
  method: "manual" as const,
  confidence: "assumed" as const,
};

function makePlan(id: string, monthly: number | null, score = 50): Plan {
  return {
    id,
    provider_id: "test-provider",
    name: id,
    tier: "pro" as const,
    is_active: true,
    pricing: {
      monthly_usd: monthly,
      annual_monthly_usd: null,
      is_per_seat: false,
      currency: "USD",
      provenance: FAKE_PROV,
    },
    models: [],
    usage_limits: [],
    features: {
      agent_capabilities: score > 60,
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
      provenance: FAKE_PROV,
    },
    provenance: FAKE_PROV,
  };
}

function makeProvider(plans: Plan[]): Provider {
  return {
    id: "test-provider",
    name: "Test Provider",
    slug: "test-provider",
    website: "https://example.com",
    models: [],
    plans,
    provenance: FAKE_PROV,
  };
}

describe("getPriceBand", () => {
  it("free for null price", () => expect(getPriceBand(null)).toBe("free"));
  it("free for $0", () => expect(getPriceBand(0)).toBe("free"));
  it("under-20 for $10", () => expect(getPriceBand(10)).toBe("under-20"));
  it("under-20 for $19.99", () => expect(getPriceBand(19.99)).toBe("under-20"));
  it("under-40 for $20", () => expect(getPriceBand(20)).toBe("under-40"));
  it("under-40 for $39.99", () => expect(getPriceBand(39.99)).toBe("under-40"));
  it("40-plus for $40", () => expect(getPriceBand(40)).toBe("40-plus"));
  it("40-plus for $100", () => expect(getPriceBand(100)).toBe("40-plus"));
});

describe("computeRankings", () => {
  const planA = makePlan("plan-free",   0);
  const planB = makePlan("plan-cheap",  10);
  const planC = makePlan("plan-mid",    25);
  const planD = makePlan("plan-premium", 50);
  const provider = makeProvider([planA, planB, planC, planD]);
  const entries = [
    { provider, plan: planA },
    { provider, plan: planB },
    { provider, plan: planC },
    { provider, plan: planD },
  ];

  it("returns all plans in the all array", () => {
    const { all } = computeRankings(entries);
    expect(all).toHaveLength(4);
  });

  it("all plans have sequential ranks starting at 1", () => {
    const { all } = computeRankings(entries);
    const ranks = all.map((r) => r.rank);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it("all 4 price bands exist in byBand", () => {
    const { byBand } = computeRankings(entries);
    expect(Object.keys(byBand)).toEqual(
      expect.arrayContaining(["free", "under-20", "under-40", "40-plus"]),
    );
  });

  it("each plan lands in the correct band", () => {
    const { byBand } = computeRankings(entries);
    expect(byBand["free"].map((r) => r.plan.id)).toContain("plan-free");
    expect(byBand["under-20"].map((r) => r.plan.id)).toContain("plan-cheap");
    expect(byBand["under-40"].map((r) => r.plan.id)).toContain("plan-mid");
    expect(byBand["40-plus"].map((r) => r.plan.id)).toContain("plan-premium");
  });

  it("each band has independent sequential ranks starting at 1", () => {
    const { byBand } = computeRankings(entries);
    for (const band of Object.values(byBand)) {
      if (band.length === 0) continue;
      expect(band[0].rank).toBe(1);
    }
  });

  it("higher scoring plan ranks higher (lower rank number)", () => {
    const highScore = makePlan("high", 20);
    highScore.features.agent_capabilities = true;
    highScore.features.api_access = true;
    highScore.features.cli_access = true;
    const lowScore  = makePlan("low",  20);
    const prov = makeProvider([highScore, lowScore]);
    const { all } = computeRankings([
      { provider: prov, plan: highScore },
      { provider: prov, plan: lowScore },
    ]);
    const highRank = all.find((r) => r.plan.id === "high")!.rank;
    const lowRank  = all.find((r) => r.plan.id === "low")!.rank;
    expect(highRank).toBeLessThan(lowRank);
  });
});
