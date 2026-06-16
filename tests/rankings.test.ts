import { describe, it, expect } from "vitest";
import {
  computeAllRankings,
  getPriceBand,
  RANKINGS_METHODOLOGY_VERSION,
} from "../src/lib/rankings";
import type {
  Provider,
  Plan,
  Model,
  AAModelScore,
  ModelValueEstimate,
  Confidence,
} from "../src/types";

// ─── Fixtures (loose: vitest runs via esbuild with no type-check) ──────────────

const PROV = {
  url: "https://example.com",
  accessed_date: "2026-06-15",
  method: "manual" as const,
  confidence: "assumed" as Confidence,
};

function makeModel(id: string, displayName: string): Model {
  return { id, provider_id: "prov-1", display_name: displayName } as unknown as Model;
}

function makePlan(
  id: string,
  monthly: number | null,
  opts: { pricingConf?: Confidence; usageConf?: Confidence; providerId?: string } = {},
): Plan {
  return {
    id,
    provider_id: opts.providerId ?? "prov-1",
    name: id,
    tier: "pro",
    is_active: true,
    pricing: {
      monthly_usd: monthly,
      annual_monthly_usd: null,
      is_per_seat: false,
      currency: "USD",
      provenance: { ...PROV, confidence: opts.pricingConf ?? "assumed" },
    },
    models: [],
    usage_limits: opts.usageConf
      ? [{ type: "requests", value: 1000, provenance: { ...PROV, confidence: opts.usageConf } }]
      : [],
    features: {},
    last_verified: "2026-06-15",
  } as unknown as Plan;
}

function makeProvider(id: string, name: string, models: Model[]): Provider {
  return {
    id,
    name,
    slug: id,
    website: "https://example.com",
    models,
    plans: [],
    provenance: PROV,
  } as unknown as Provider;
}

function makeAA(
  modelId: string,
  v: {
    intel?: number | null;
    coding?: number | null;
    agentic?: number | null;
    speed?: number | null;
    conf?: Confidence;
  },
): AAModelScore {
  return {
    modelId,
    observedAt: "2026-06-14",
    intelligenceIndex: v.intel ?? null,
    codingIndex: v.coding ?? null,
    agenticIndex: v.agentic ?? null,
    speedScore: v.speed ?? null,
    inputPrice: null,
    outputPrice: null,
    confidence: v.conf ?? "assumed",
    source: "aa-test",
  } as unknown as AAModelScore;
}

function makeEst(
  planId: string,
  modelId: string,
  v: {
    wmq?: number | null;
    tokens1mo?: number | null;
    qa1mo?: number | null;
    value?: number | null;
    conf?: Confidence;
  },
): ModelValueEstimate {
  return {
    modelId,
    planId,
    weighted_model_quality: v.wmq ?? null,
    estimated_tokens_1mo: v.tokens1mo ?? null,
    model_adjusted_tokens_1mo: v.tokens1mo ?? null,
    quality_adjusted_tokens_1mo: v.qa1mo ?? null,
    value_score: v.value ?? null,
    confidence: v.conf ?? "assumed",
    calculation_methodology_version: "1.0.0",
    notes: [],
  } as unknown as ModelValueEstimate;
}

// ─── getPriceBand (doc §8 bands) ───────────────────────────────────────────────

describe("getPriceBand (§8 bands)", () => {
  it("free for null price", () => expect(getPriceBand(null)).toBe("free"));
  it("free for $0", () => expect(getPriceBand(0)).toBe("free"));
  it("free for negative", () => expect(getPriceBand(-5)).toBe("free"));
  it("low for $0.01", () => expect(getPriceBand(0.01)).toBe("low"));
  it("low for $20", () => expect(getPriceBand(20)).toBe("low"));
  it("low for $30 (upper boundary)", () => expect(getPriceBand(30)).toBe("low"));
  it("mid for $30.01", () => expect(getPriceBand(30.01)).toBe("mid"));
  it("mid for $80 (upper boundary)", () => expect(getPriceBand(80)).toBe("mid"));
  it("high for $80.01", () => expect(getPriceBand(80.01)).toBe("high"));
  it("high for $200", () => expect(getPriceBand(200)).toBe("high"));
});

// ─── computeAllRankings — primary scenario ─────────────────────────────────────

function primaryInputs() {
  const mSmart = makeModel("m-smart", "Smart");
  const mFast = makeModel("m-fast", "Fast");
  const mLow = makeModel("m-low", "LowConf");
  const provider = makeProvider("prov-1", "Provider One", [mSmart, mFast, mLow]);

  const pLow = makePlan("p-low20", 20, { pricingConf: "observed", usageConf: "observed" });
  const pMid = makePlan("p-mid50", 50);
  const pHigh = makePlan("p-high120", 120);
  const pFree = makePlan("p-free0", 0);

  const aaScores = new Map<string, AAModelScore>([
    ["m-smart", makeAA("m-smart", { intel: 90, coding: 85, agentic: 88, speed: 60, conf: "assumed" })],
    ["m-fast", makeAA("m-fast", { intel: 70, coding: 65, agentic: 60, speed: 95, conf: "assumed" })],
    ["m-low", makeAA("m-low", { intel: 99, coding: 99, agentic: 99, speed: 99, conf: "unknown" })],
  ]);

  const estimatesByPlan: Record<string, ModelValueEstimate[]> = {
    "p-low20": [
      makeEst("p-low20", "m-smart", { wmq: 86, tokens1mo: 10000, qa1mo: 8000, value: 80 }),
      makeEst("p-low20", "m-fast", { wmq: 64, tokens1mo: 12000, qa1mo: 6000, value: 60 }),
      makeEst("p-low20", "m-low", { wmq: 99, tokens1mo: 9999, qa1mo: 9999, value: 99, conf: "unknown" }),
    ],
    "p-mid50": [
      makeEst("p-mid50", "m-smart", { wmq: 86, tokens1mo: 10000, qa1mo: 7000, value: 70 }),
      makeEst("p-mid50", "m-fast", { wmq: 64, tokens1mo: 8000, qa1mo: 5000, value: 50 }),
    ],
    "p-high120": [
      makeEst("p-high120", "m-smart", { wmq: 86, tokens1mo: 9000, qa1mo: 4000, value: 40 }),
    ],
    "p-free0": [
      makeEst("p-free0", "m-smart", { wmq: null, tokens1mo: null, qa1mo: null, value: null }),
    ],
  };

  return {
    plans: [
      { provider, plan: pLow },
      { provider, plan: pMid },
      { provider, plan: pHigh },
      { provider, plan: pFree },
    ],
    estimatesByPlan,
    aaScores,
    observedAt: "2026-06-15",
  };
}

describe("computeAllRankings — metadata", () => {
  it("stamps generatedAt from injected observedAt and the methodology version", () => {
    const set = computeAllRankings(primaryInputs());
    expect(set.generatedAt).toBe("2026-06-15");
    expect(set.methodologyVersion).toBe(RANKINGS_METHODOLOGY_VERSION);
  });

  it("is deterministic — identical inputs produce deep-equal output", () => {
    const a = computeAllRankings(primaryInputs());
    const b = computeAllRankings(primaryInputs());
    expect(a).toEqual(b);
  });
});

describe("computeAllRankings — price bands (#1–3)", () => {
  it("places plan×model rows in the correct band and caps at top 10", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const low = rankings.byPriceBand.low;
    expect(low.every((r) => r.priceBand === "low")).toBe(true);
    expect(low.length).toBeLessThanOrEqual(10);
    expect(rankings.byPriceBand.mid.every((r) => r.priceBand === "mid")).toBe(true);
    expect(rankings.byPriceBand.high.every((r) => r.priceBand === "high")).toBe(true);
  });

  it("sorts by valueScore desc with sequential ranks", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const low = rankings.byPriceBand.low;
    expect(low[0].planId).toBe("p-low20");
    expect(low[0].modelId).toBe("m-smart");
    expect(low[0].valueScore).toBe(80);
    expect(low[1].valueScore).toBe(60);
    expect(low.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("excludes free / null-price plans from every band", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const all = [
      ...rankings.byPriceBand.low,
      ...rankings.byPriceBand.mid,
      ...rankings.byPriceBand.high,
    ];
    expect(all.some((r) => r.planId === "p-free0")).toBe(false);
  });

  it("excludes unknown-confidence estimates from the band", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    // m-low has value 99 (would top the band) but confidence "unknown" → dropped.
    expect(rankings.byPriceBand.low.some((r) => r.modelId === "m-low")).toBe(false);
  });

  it("exposes both raw and normalized value scores plus caveats", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const row = rankings.byPriceBand.low.find((r) => r.modelId === "m-smart")!;
    expect(typeof row.valueScore).toBe("number");
    expect(row.valueScoreRaw).toBe(400); // qa 8000 / price 20
    expect(row.estimatedMonthlyTokens).toBe(10000);
    expect(row.monthlyPriceUsd).toBe(20);
    expect(row.caveats.length).toBeGreaterThan(0); // confidence "assumed"
    expect(row.sourceDates.pricing).toBe("2026-06-15");
  });
});

describe("computeAllRankings — model metric rankings (#4–7)", () => {
  it("ranks intelligence desc, one row per model, dropping unknown-confidence models", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const ids = rankings.byIntelligence.map((r) => r.modelId);
    expect(ids).toEqual(["m-smart", "m-fast"]); // m-low excluded (unknown)
    expect(new Set(ids).size).toBe(ids.length); // deduped
    expect(rankings.byIntelligence[0].metricValue).toBe(90);
  });

  it("ranks coding and agentic desc", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    expect(rankings.byCoding[0].modelId).toBe("m-smart");
    expect(rankings.byCoding[0].metricValue).toBe(85);
    expect(rankings.byAgentic[0].modelId).toBe("m-smart");
    expect(rankings.byAgentic[0].metricValue).toBe(88);
  });

  it("ranks weighted model quality desc (0.5·agentic + 0.4·coding + 0.1·speed)", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    expect(rankings.byWeightedQuality[0].modelId).toBe("m-smart");
    expect(rankings.byWeightedQuality[0].metricValue).toBe(84); // 0.5·88 + 0.4·85 + 0.1·60
  });
});

describe("computeAllRankings — best plans per model (#8)", () => {
  it("returns the best plan in each band, ordered by WMQ desc", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    expect(rankings.bestPlansPerModel[0].modelId).toBe("m-smart");

    const smart = rankings.bestPlansPerModel.find((e) => e.modelId === "m-smart")!;
    expect(smart.bestLowCost?.planId).toBe("p-low20");
    expect(smart.bestMidCost?.planId).toBe("p-mid50");
    expect(smart.bestHighCost?.planId).toBe("p-high120");
    expect(smart.caveats).toEqual([]);
  });

  it("emits null + an explanation caveat for a band with no plan", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const fast = rankings.bestPlansPerModel.find((e) => e.modelId === "m-fast")!;
    expect(fast.bestLowCost).not.toBeNull();
    expect(fast.bestMidCost).not.toBeNull();
    expect(fast.bestHighCost).toBeNull();
    expect(fast.caveats.some((c) => /high-cost/.test(c))).toBe(true);
  });
});

describe("computeAllRankings — provider coding value (#9)", () => {
  it("scores each provider by its peak (tokens × coding/100) / price combo", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const prov1 = rankings.byProviderCodingValue.find((r) => r.providerId === "prov-1")!;
    expect(prov1.codingValuePeak).toBe(425); // p-low20 × m-smart: 10000·0.85/20
    expect(prov1.bestPlanId).toBe("p-low20");
    expect(prov1.bestModelId).toBe("m-smart");
  });
});

describe("computeAllRankings — transparency (#10)", () => {
  it("ranks all plans by 100 − uncertainty, observed sources first", () => {
    const { rankings } = computeAllRankings(primaryInputs());
    const t = rankings.byTransparency;
    expect(t.map((r) => r.planId)).toContain("p-free0"); // every plan present, incl. free
    expect(t).toHaveLength(4);
    // p-low20 has observed pricing + usage → lowest uncertainty → ranks first.
    expect(t[0].planId).toBe("p-low20");
    const low = t.find((r) => r.planId === "p-low20")!;
    expect(low.uncertaintyScore).toBe(65); // AA assumed (30+25+10); pricing+usage observed
    expect(low.transparencyScore).toBe(35);
    const mid = t.find((r) => r.planId === "p-mid50")!;
    expect(mid.uncertaintyScore).toBe(100); // everything assumed/unknown → cap
    expect(mid.transparencyScore).toBe(0);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────

describe("computeAllRankings — top-N cap", () => {
  it("caps a band at 10 rows with sequential ranks", () => {
    const model = makeModel("m1", "M1");
    const provider = makeProvider("prov-1", "P1", [model]);
    const plans: Array<{ provider: Provider; plan: Plan }> = [];
    const estimatesByPlan: Record<string, ModelValueEstimate[]> = {};
    for (let i = 0; i < 12; i++) {
      const id = `p${String(i).padStart(2, "0")}`;
      plans.push({ provider, plan: makePlan(id, 10 + i) }); // $10–$21 → all "low"
      estimatesByPlan[id] = [makeEst(id, "m1", { wmq: 70, tokens1mo: 1000, qa1mo: 1000, value: 100 - i })];
    }
    const { rankings } = computeAllRankings({
      plans,
      estimatesByPlan,
      aaScores: new Map([["m1", makeAA("m1", { intel: 70, coding: 70, agentic: 70, speed: 70 })]]),
      observedAt: "2026-06-15",
    });
    expect(rankings.byPriceBand.low).toHaveLength(10);
    expect(rankings.byPriceBand.low.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rankings.byPriceBand.low[0].valueScore).toBe(100);
  });
});

describe("computeAllRankings — tie-break", () => {
  it("breaks equal value scores by cheaper price first", () => {
    const model = makeModel("mx", "MX");
    const provider = makeProvider("prov-1", "P1", [model]);
    const { rankings } = computeAllRankings({
      plans: [
        { provider, plan: makePlan("dear", 20) },
        { provider, plan: makePlan("cheap", 10) },
      ],
      estimatesByPlan: {
        dear: [makeEst("dear", "mx", { wmq: 50, tokens1mo: 500, qa1mo: 500, value: 50 })],
        cheap: [makeEst("cheap", "mx", { wmq: 50, tokens1mo: 500, qa1mo: 500, value: 50 })],
      },
      aaScores: new Map([["mx", makeAA("mx", { intel: 50, coding: 50, agentic: 50, speed: 50 })]]),
      observedAt: "2026-06-15",
    });
    expect(rankings.byPriceBand.low.map((r) => r.planId)).toEqual(["cheap", "dear"]);
  });
});

describe("computeAllRankings — observed confidence carries no caveat", () => {
  it("omits the confidence caveat when an estimate is observed", () => {
    const model = makeModel("mo", "MO");
    const provider = makeProvider("prov-1", "P1", [model]);
    const { rankings } = computeAllRankings({
      plans: [{ provider, plan: makePlan("plan-o", 25) }],
      estimatesByPlan: {
        "plan-o": [makeEst("plan-o", "mo", { wmq: 70, tokens1mo: 1000, qa1mo: 1000, value: 50, conf: "observed" })],
      },
      aaScores: new Map([["mo", makeAA("mo", { intel: 70, coding: 70, agentic: 70, speed: 70, conf: "observed" })]]),
      observedAt: "2026-06-15",
    });
    expect(rankings.byPriceBand.low[0].caveats).toEqual([]);
  });
});
