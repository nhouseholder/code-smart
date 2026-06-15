import { describe, it, expect } from "vitest";
import {
  extrapolateToAllTargetWindows,
  extrapolateToTargetWindow,
  shouldSkipWindow,
  WINDOW_HOURS,
  TARGET_HOURS,
} from "@/lib/normalization/windows";
import { DEFAULT_CONFIG } from "@/lib/normalization/config";

describe("WINDOW_HOURS", () => {
  it("has canonical hour values", () => {
    expect(WINDOW_HOURS["1h"]).toBe(1);
    expect(WINDOW_HOURS["5h"]).toBe(5);
    expect(WINDOW_HOURS["1d"]).toBe(24);
    expect(WINDOW_HOURS["1w"]).toBe(168);
    expect(WINDOW_HOURS["1mo"]).toBe(730);
    expect(WINDOW_HOURS["1y"]).toBe(8760);
  });
});

describe("TARGET_HOURS", () => {
  it("matches the correct window hours", () => {
    expect(TARGET_HOURS["5h"]).toBe(5);
    expect(TARGET_HOURS["24h"]).toBe(24);
    expect(TARGET_HOURS["1w"]).toBe(168);
    expect(TARGET_HOURS["1mo"]).toBe(730);
  });
});

describe("extrapolateToTargetWindow", () => {
  it("direct match returns same value with observed confidence", () => {
    const result = extrapolateToTargetWindow(1000, "1d", "24h", DEFAULT_CONFIG);
    expect(result.value).toBe(1000);
    expect(result.confidence).toBe("observed");
    expect(result.notes).toContain("Direct window match");
  });

  it("scales up from 1d to 1w (×7)", () => {
    const result = extrapolateToTargetWindow(100, "1d", "1w", DEFAULT_CONFIG);
    expect(result.value).toBe(700);
    // ×7 is in the 5×–50× range → "assumed" per confidence decay rules
    expect(result.confidence).toBe("assumed");
  });

  it("scales up from 1d to 1mo (×30.4)", () => {
    const result = extrapolateToTargetWindow(100, "1d", "1mo", DEFAULT_CONFIG);
    expect(result.value).toBe(3042); // 100 × 730/24 ≈ 3041.67
    // ×30.4 is in the 5×–50× range → "assumed" per confidence decay rules
    expect(result.confidence).toBe("assumed");
  });

  it("scales down from 1mo to 5h", () => {
    const result = extrapolateToTargetWindow(1000, "1mo", "5h", DEFAULT_CONFIG);
    // 730h / 5h = 146, so 1000 / 146 ≈ 6.85
    expect(result.value).toBe(7);
    expect(result.notes.some((n) => n.includes("Scaled down"))).toBe(true);
  });

  it("scales up from 1h to 5h (×5)", () => {
    const result = extrapolateToTargetWindow(100, "1h", "5h", DEFAULT_CONFIG);
    expect(result.value).toBe(500);
    expect(result.confidence).toBe("inferred");
  });

  it("returns unknown confidence for large extrapolation 1h → 1mo", () => {
    const result = extrapolateToTargetWindow(10, "1h", "1mo", DEFAULT_CONFIG);
    // 730h / 1h = 730, so 10 × 730 = 7300
    expect(result.value).toBe(7300);
    expect(result.confidence).toBe("unknown");
  });

  it("zero value returns 0 with inferred confidence", () => {
    const result = extrapolateToTargetWindow(0, "1d", "1w", DEFAULT_CONFIG);
    expect(result.value).toBe(0);
    expect(result.notes.some((n) => n.includes("Zero"))).toBe(true);
  });

  it("scales up from 1w to 1mo", () => {
    const result = extrapolateToTargetWindow(100, "1w", "1mo", DEFAULT_CONFIG);
    // 730h / 168h ≈ 4.345, so 100 × 4.345 ≈ 435
    expect(result.value).toBe(435);
  });
});

describe("extrapolateToAllTargetWindows", () => {
  it("returns all 4 target windows", () => {
    const results = extrapolateToAllTargetWindows(100, "1d", DEFAULT_CONFIG);
    expect(results["5h"]).toBeDefined();
    expect(results["24h"]).toBeDefined();
    expect(results["1w"]).toBeDefined();
    expect(results["1mo"]).toBeDefined();
  });

  it("daily value matches at 24h, scales for others", () => {
    const results = extrapolateToAllTargetWindows(240, "1d", DEFAULT_CONFIG);
    expect(results["24h"].value).toBe(240);
    expect(results["24h"].confidence).toBe("observed");
    expect(results["5h"].value).toBe(50); // 240 / (24/5) = 50
    expect(results["1w"].value).toBe(1680); // 240 × 7
  });
});

describe("shouldSkipWindow", () => {
  it("does not skip reasonable conversions", () => {
    expect(shouldSkipWindow("1d", "1mo")).toBe(false);
    expect(shouldSkipWindow("5h", "1d")).toBe(false); // 5h→24h = same as 5h→1d
    expect(shouldSkipWindow("1w", "1mo")).toBe(false);
  });

  it("skips extreme conversions (1h → 1y)", () => {
    expect(shouldSkipWindow("1h", "1mo")).toBe(false); // 730:1 < 1000
    expect(shouldSkipWindow("1h", "1y")).toBe(true); // 8760:1 > 1000
  });
});
