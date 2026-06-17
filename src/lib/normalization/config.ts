import type { NormalizationConfig, AssumptionRange, UsdCreditRateMapping } from "./types";

export const NORMALIZATION_METHODOLOGY_VERSION = "1.1.0";

// USD-per-MTok-output rates for published APIs.
// Conservative = most expensive model on a typical plan (Claude Opus 4.8: $75/MTok out).
// Base = weighted average of Copilot-offered models (~$20/MTok out).
// Optimistic = cheapest model (GPT-4o: $10/MTok out).
const COPILOT_USD_RATE: UsdCreditRateMapping = {
  outputRatePerMtokConservative: 75,
  outputRatePerMtokBase: 20,
  outputRatePerMtokOptimistic: 10,
  source: "Published API rates: Anthropic Claude Opus 4.8 $75/MTok output, OpenAI GPT-4o $10/MTok output; source github.com/features/copilot/plans",
};

export const DEFAULT_CONFIG: NormalizationConfig = {
  tokensPerCodingMessage: { low: 1000, base: 2000, high: 5000 },
  tokensPerAgenticRequest: { low: 3000, base: 5000, high: 12000 },
  tokensPerAutocomplete: { low: 50, base: 150, high: 400 },
  tokensPerCredit: { base: 500 },
  tokensPerComputeUnit: { base: 1000 },
  sessionsPerMonth: 80,
  workingDaysPerMonth: 20,
  weeksPerMonth: 4,
  hoursPerSession: 5,
  modelMultipliers: {},
  creditMappings: {},
  computeUnitMappings: {},
  defaultUsdCreditRate: {
    outputRatePerMtokConservative: 75,
    outputRatePerMtokBase: 20,
    outputRatePerMtokOptimistic: 10,
    source: "Generic range: expensive model $75/MTok out → cheap model $10/MTok out",
  },
  usdCreditRates: {
    "copilot-individual": COPILOT_USD_RATE,
    "copilot-pro-plus": COPILOT_USD_RATE,
    "copilot-max": COPILOT_USD_RATE,
  },
};

/**
 * Validate config ranges and values.
 * Returns an array of error messages (empty = valid).
 */
export function validateConfig(config: NormalizationConfig): string[] {
  const errors: string[] = [];

  const ranges: Array<{ name: string; r: AssumptionRange }> = [
    { name: "tokensPerCodingMessage", r: config.tokensPerCodingMessage },
    { name: "tokensPerAgenticRequest", r: config.tokensPerAgenticRequest },
    { name: "tokensPerAutocomplete", r: config.tokensPerAutocomplete },
  ];
  for (const { name, r } of ranges) {
    if (r.low < 0) errors.push(`${name}.low must be >= 0`);
    if (r.base < 0) errors.push(`${name}.base must be >= 0`);
    if (r.high < 0) errors.push(`${name}.high must be >= 0`);
    if (r.low > r.base) errors.push(`${name}.low (${r.low}) > base (${r.base})`);
    if (r.base > r.high) errors.push(`${name}.base (${r.base}) > high (${r.high})`);
  }

  if (config.tokensPerCredit.base < 0) errors.push("tokensPerCredit.base must be >= 0");
  if (config.tokensPerComputeUnit.base < 0) errors.push("tokensPerComputeUnit.base must be >= 0");

  if (config.sessionsPerMonth <= 0) errors.push("sessionsPerMonth must be > 0");
  if (config.workingDaysPerMonth <= 0 || config.workingDaysPerMonth > 31)
    errors.push("workingDaysPerMonth must be 1-31");
  if (config.weeksPerMonth <= 0) errors.push("weeksPerMonth must be > 0");
  if (config.hoursPerSession <= 0) errors.push("hoursPerSession must be > 0");

  return errors;
}
