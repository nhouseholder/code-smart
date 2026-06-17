import { describe, it, expect } from "vitest";
import {
  medianCostPerTask,
  computeEfficiencyMultiplier,
  computeValueScore,
} from "../src/lib/model-value-engine";
import type { AAModelScore } from "../src/types";

const mockAA = (modelId: string, costPerTask: number | null): AAModelScore => ({
  modelId,
  observedAt: "2026-06-15",
  agenticIndex: 70,
  codingIndex: 80,
  speedScore: 60,
  intelligenceIndex: 75,
  inputPrice: 3.0,
  outputPrice: 15.0,
  costPerTask,
  costPerTaskAccessedDate: costPerTask === null ? null : "2026-06-15",
  confidence: "observed",
  source: "test",
});

describe("medianCostPerTask", () => {
  it("returns null when no model has cost-per-task data (current seeded state)", () => {
    const m = new Map([["a", mockAA("a", null)], ["b", mockAA("b", null)]]);
    expect(medianCostPerTask(m)).toBeNull();
  });

  it("returns null for an empty map", () => {
    expect(medianCostPerTask(new Map())).toBeNull();
  });

  it("computes the median of odd-count non-null values", () => {
    const m = new Map([
      ["a", mockAA("a", 0.10)],
      ["b", mockAA("b", 0.20)],
      ["c", mockAA("c", 0.60)],
    ]);
    expect(medianCostPerTask(m)).toBe(0.20);
  });

  it("averages the two middle values for even count", () => {
    const m = new Map([
      ["a", mockAA("a", 0.10)],
      ["b", mockAA("b", 0.20)],
      ["c", mockAA("c", 0.40)],
      ["d", mockAA("d", 0.60)],
    ]);
    expect(medianCostPerTask(m)).toBeCloseTo(0.30, 10);
  });

  it("ignores null, zero, and negative values", () => {
    const m = new Map([
      ["a", mockAA("a", null)],
      ["b", mockAA("b", 0)],
      ["c", mockAA("c", -5)],
      ["d", mockAA("d", 0.50)],
    ]);
    expect(medianCostPerTask(m)).toBe(0.50);
  });
});

describe("computeEfficiencyMultiplier", () => {
  it("is neutral (1.0) when this model has no cost-per-task data", () => {
    const { mult, note } = computeEfficiencyMultiplier(null, 0.20);
    expect(mult).toBe(1.0);
    expect(note).toMatch(/neutral/i);
  });

  it("is neutral (1.0) when the reference median is null", () => {
    expect(computeEfficiencyMultiplier(0.20, null).mult).toBe(1.0);
  });

  it("is neutral (1.0) for a non-positive cost-per-task", () => {
    expect(computeEfficiencyMultiplier(0, 0.20).mult).toBe(1.0);
  });

  it("maps the median model to par 1.0", () => {
    expect(computeEfficiencyMultiplier(0.20, 0.20).mult).toBeCloseTo(1.0, 10);
  });

  it("caps a much cheaper model at 1.15 (the ceiling)", () => {
    // half the median → eff = 100 → mult = 1.15
    expect(computeEfficiencyMultiplier(0.10, 0.20).mult).toBeCloseTo(1.15, 10);
    // an extreme outlier still cannot exceed the cap
    expect(computeEfficiencyMultiplier(0.001, 0.20).mult).toBeCloseTo(1.15, 10);
  });

  it("floors a much pricier model at 0.85", () => {
    // 4× the median → eff = 12.5 → mult = 0.85 + 0.125*0.30 = 0.8875
    expect(computeEfficiencyMultiplier(0.80, 0.20).mult).toBeCloseTo(0.8875, 10);
    // extreme → approaches but never drops below the 0.85 floor
    expect(computeEfficiencyMultiplier(1000, 0.20).mult).toBeGreaterThanOrEqual(0.85);
  });

  it("stays within [0.85, 1.15] across a wide range", () => {
    for (const cpt of [0.001, 0.05, 0.2, 0.5, 5, 100]) {
      const { mult } = computeEfficiencyMultiplier(cpt, 0.20);
      expect(mult).toBeGreaterThanOrEqual(0.85);
      expect(mult).toBeLessThanOrEqual(1.15);
    }
  });
});

describe("computeValueScore back-compat + effMult", () => {
  it("is unchanged when effMult is omitted (defaults to 1.0)", () => {
    // qa=40_000, price=20 → raw = 40000/20/40000*100 = 5
    expect(computeValueScore(40_000, 20)).toBe(5);
  });

  it("matches an explicit 1.0 multiplier", () => {
    expect(computeValueScore(40_000, 20, 1.0)).toBe(computeValueScore(40_000, 20));
  });

  it("scales the score by the efficiency multiplier", () => {
    const base = computeValueScore(400_000, 20)!;       // 50
    const boosted = computeValueScore(400_000, 20, 1.15)!;
    expect(boosted).toBe(Math.round(base * 1.15));
  });

  it("still returns null for free plans and missing inputs regardless of effMult", () => {
    expect(computeValueScore(40_000, 0, 1.15)).toBeNull();
    expect(computeValueScore(null, 20, 1.15)).toBeNull();
    expect(computeValueScore(40_000, null, 1.15)).toBeNull();
  });
});
