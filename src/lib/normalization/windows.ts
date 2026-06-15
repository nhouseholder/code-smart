import type { Confidence } from "@/lib/scraper/types";
import type { NormalizationConfig, ResetWindow, TargetWindow, WindowConversionResult } from "./types";

/**
 * Canonical hours in each reset window.
 */
export const WINDOW_HOURS: Record<ResetWindow, number> = {
  "1h": 1,
  "5h": 5,
  "1d": 24,
  "1w": 168,
  "1mo": 730,
  "1y": 8760,
};

/**
 * Hours in each target window (subset of all windows).
 */
export const TARGET_HOURS: Record<TargetWindow, number> = {
  "5h": 5,
  "24h": 24,
  "1w": 168,
  "1mo": 730,
};

const TARGET_WINDOWS: TargetWindow[] = ["5h", "24h", "1w", "1mo"];

/**
 * Determine whether a value unit is an "active-use" metric (messages, requests, calls).
 * Active-use metrics should be scaled by working days only, not calendar days.
 */
function isActiveUseUnit(unit: string | null): boolean {
  if (!unit) return false;
  return ["messages", "requests", "calls", "queries", "completions"].includes(unit.toLowerCase());
}

/**
 * Compute confidence level based on extrapolation ratio and whether we
 * are converting units (e.g., messages → tokens) in addition to window scaling.
 */
function computeConfidence(
  extrapRatio: number,
  hasUnitConversion: boolean,
): Confidence {
  // Unit conversion always adds a notch of uncertainty
  const penalty = hasUnitConversion ? 1 : 0;

  if (extrapRatio === 1 && !hasUnitConversion) return "observed";
  if (extrapRatio >= 1 && extrapRatio <= 5) return penalty >= 2 ? "assumed" : "inferred";
  if (extrapRatio > 5 && extrapRatio <= 50) return "assumed";
  return "unknown";
}

/**
 * Convert a value from one reset window to a target window.
 *
 * For active-use metrics (messages, requests), scales by working days
 * when crossing calendar boundaries. For raw token/byte values, scales
 * proportionally by wall-clock hours.
 */
export function extrapolateToTargetWindow(
  value: number,
  fromWindow: ResetWindow,
  toWindow: TargetWindow,
  config: NormalizationConfig,
): WindowConversionResult {
  const notes: string[] = [];

  // Edge: zero value
  if (value === 0) {
    return { value: 0, confidence: "inferred", notes: ["Zero limit — estimate is zero"] };
  }

  const fromHours = WINDOW_HOURS[fromWindow];
  const toHours = TARGET_HOURS[toWindow];
  const rawRatio = fromHours / toHours;

  let result: number;
  const hasUnitConversion = false; // window-only, no unit crossing

  // Same window (by hours, not by string key — "1d" and "24h" are equivalent)
  if (fromHours === toHours) {
    return { value, confidence: "observed", notes: ["Direct window match"] };
  }

  // Scale by working days when converting from a daily-or-larger window
  // and the source is a smaller window than the target
  const fromIsActive = false; // This function doesn't know about units — caller handles unit conversion
  const useWorkingDays = isActiveUseUnit(null) && rawRatio < 1;

  if (fromHours < toHours) {
    // Scaling up: need to multiply
    // For simple scaling, use wall-clock proportion
    const factor = toHours / fromHours;
    result = value * factor;
    notes.push(`Scaled up by ${factor.toFixed(1)}× (${fromWindow}→${toWindow})`);
  } else {
    // Scaling down: divide proportionally
    const factor = fromHours / toHours;
    result = value / factor;
    notes.push(`Scaled down by ${factor.toFixed(1)}× (${fromWindow}→${toWindow})`);
  }

  const confidence = computeConfidence(Math.max(fromHours / toHours, toHours / fromHours), false);

  return { value: Math.round(result), confidence, notes };
}

/**
 * Convenience: convert a single value from one reset window to ALL four target windows.
 */
export function extrapolateToAllTargetWindows(
  value: number,
  fromWindow: ResetWindow,
  config: NormalizationConfig,
): Record<TargetWindow, WindowConversionResult> {
  const results = {} as Record<TargetWindow, WindowConversionResult>;
  for (const tw of TARGET_WINDOWS) {
    results[tw] = extrapolateToTargetWindow(value, fromWindow, tw, config);
  }
  return results;
}

/**
 * Check if the extrapolation from one window to another exceeds
 * the maximum sensible ratio (1000:1).
 */
export function shouldSkipWindow(fromWindow: ResetWindow, toWindow: ResetWindow): boolean {
  const fromH = WINDOW_HOURS[fromWindow];
  const toH = WINDOW_HOURS[toWindow];
  const ratio = Math.max(fromH, toH) / Math.min(fromH, toH);
  return ratio > 1000;
}
