import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, validateConfig, NORMALIZATION_METHODOLOGY_VERSION } from "@/lib/normalization/config";

describe("NormalizationConfig", () => {
  it("has a valid methodology version", () => {
    expect(NORMALIZATION_METHODOLOGY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("DEFAULT_CONFIG has all required keys", () => {
    expect(DEFAULT_CONFIG.tokensPerCodingMessage).toBeDefined();
    expect(DEFAULT_CONFIG.tokensPerAgenticRequest).toBeDefined();
    expect(DEFAULT_CONFIG.tokensPerAutocomplete).toBeDefined();
    expect(DEFAULT_CONFIG.tokensPerCredit).toBeDefined();
    expect(DEFAULT_CONFIG.tokensPerComputeUnit).toBeDefined();
    expect(DEFAULT_CONFIG.sessionsPerMonth).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.workingDaysPerMonth).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.weeksPerMonth).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.hoursPerSession).toBeGreaterThan(0);
  });
});

describe("validateConfig", () => {
  it("returns no errors for the default config", () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
  });

  it("catches low > base in assumption ranges", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      tokensPerCodingMessage: { low: 5000, base: 2000, high: 8000 },
    };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("low") && e.includes("base"))).toBe(true);
  });

  it("catches base > high in assumption ranges", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      tokensPerAgenticRequest: { low: 1000, base: 9999, high: 5000 },
    };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("base") && e.includes("high"))).toBe(true);
  });

  it("catches negative values", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      tokensPerAutocomplete: { low: -1, base: 150, high: 400 },
    };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("low") && e.includes(">= 0"))).toBe(true);
  });

  it("catches sessionsPerMonth <= 0", () => {
    const cfg = { ...DEFAULT_CONFIG, sessionsPerMonth: 0 };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("sessionsPerMonth"))).toBe(true);
  });

  it("catches workingDaysPerMonth > 31", () => {
    const cfg = { ...DEFAULT_CONFIG, workingDaysPerMonth: 32 };
    const errors = validateConfig(cfg);
    expect(errors.some((e) => e.includes("workingDaysPerMonth"))).toBe(true);
  });
});
