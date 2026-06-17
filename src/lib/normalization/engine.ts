import type { Confidence } from "@/lib/scraper/types";
import { CONFIDENCE_RANK } from "@/lib/scraper/types";
import type { NormalizationConfig, NormalizedEstimate, ConversionStep, UsageLimitRow, TargetWindow } from "./types";
import { extrapolateToAllTargetWindows, shouldSkipWindow } from "./windows";
import { NORMALIZATION_METHODOLOGY_VERSION } from "./config";

const TARGET_WINDOWS: TargetWindow[] = ["5h", "24h", "1w", "1mo"];

/**
 * Main entry point: convert a single usage_limits row into a normalized estimate.
 *
 * Dispatches to the first matching conversion layer (priority order).
 */
export function normalizeLimit(
  limit: UsageLimitRow,
  config: NormalizationConfig,
): NormalizedEstimate {
  const chain: ConversionStep[] = [];
  const assumptions: string[] = [];

  const estimate = normalizeLimitInternal(limit, config, chain, assumptions);

  return {
    methodologyVersion: NORMALIZATION_METHODOLOGY_VERSION,
    sourceLimitId: limit.id,
    planId: limit.planId,
    modelId: limit.modelId,
    observedAt: limit.observedAt,
    limitType: limit.limitType,
    originalRawText: limit.rawLimitText,
    conversionChain: chain,
    estimatedTokens5h: estimate.tokens5h,
    estimatedTokens24h: estimate.tokens24h,
    estimatedTokens1w: estimate.tokens1w,
    estimatedTokens1mo: estimate.tokens1mo,
    uncertaintyLow5h: estimate.low5h,
    uncertaintyHigh5h: estimate.high5h,
    uncertaintyLow24h: estimate.low24h,
    uncertaintyHigh24h: estimate.high24h,
    uncertaintyLow1w: estimate.low1w,
    uncertaintyHigh1w: estimate.high1w,
    uncertaintyLow1mo: estimate.low1mo,
    uncertaintyHigh1mo: estimate.high1mo,
    confidence: estimate.confidence,
    assumptions,
    notes: JSON.stringify({
      method: estimate.methodLabel,
      chainSteps: chain.length,
      warnings: estimate.warnings,
      perWindowDetail: estimate.perWindowDetail,
    }),
  };
}

// ── Internal ────────────────────────────────────────────────────────────

interface EstimateResult {
  tokens5h: number | null;
  tokens24h: number | null;
  tokens1w: number | null;
  tokens1mo: number | null;
  low5h: number | null;
  high5h: number | null;
  low24h: number | null;
  high24h: number | null;
  low1w: number | null;
  high1w: number | null;
  low1mo: number | null;
  high1mo: number | null;
  confidence: Confidence;
  methodLabel: string;
  warnings: string[];
  perWindowDetail: Record<string, string>;
}

function normalizeLimitInternal(
  limit: UsageLimitRow,
  config: NormalizationConfig,
  chain: ConversionStep[],
  assumptions: string[],
): EstimateResult {
  const limitValue = limit.limitValue;
  const limitUnit = limit.limitUnit?.toLowerCase() ?? null;
  const resetWindow = limit.resetWindow ?? null;
  const rawText = limit.rawLimitText.toLowerCase();

  // ── Layer 1: Direct tokens ──────────────────────────────────────────
  if (limitUnit === "tokens" && limitValue !== null) {
    let monthlyTokens = limitValue;

    // Apply model multiplier if applicable
    const multiplier = getModelMultiplier(limit.modelId, config);
    if (multiplier !== null) {
      monthlyTokens = Math.round(monthlyTokens * multiplier);
      assumptions.push(
        `Model multiplier ${multiplier}× applied to direct token limit for ${limit.modelId}`,
      );
    }

    chain.push({
      layer: "direct_tokens",
      description: `Direct token limit: ${limitValue} tokens${multiplier ? ` → ${monthlyTokens} with ${multiplier}× model multiplier` : ""}`,
      inputValue: limitValue,
      inputUnit: limitUnit,
      outputTokens: monthlyTokens,
      targetWindow: resetWindow ?? "1mo",
    });
    return windowNormalize(monthlyTokens, "1mo", config, "Direct token limit", chain, assumptions);
  }

  // ── Layer 2: (removed) ──────────────────────────────────────────────
  // "Unlimited"/fair-use is banned as a coding limit — advertised "unlimited"
  // refers to chat, not coding/agentic usage, which is always capped. We no
  // longer manufacture a synthetic sessions×tokens estimate from it. Such
  // limits now fall through to Layer 8 (unknown) → null estimate, shown "—".

  // ── Layer 3: Messages ───────────────────────────────────────────────
  if (limitUnit === "messages" && limitValue !== null) {
    const monthlyMessages = extrapolateToMonthly(limitValue, resetWindow, config);
    const result = estimateFromMessages(monthlyMessages, config, chain, assumptions, limit.modelId);
    return result;
  }

  // ── Layer 4: Requests / Calls ───────────────────────────────────────
  if ((limitUnit === "requests" || limitUnit === "calls") && limitValue !== null) {
    const monthlyRequests = extrapolateToMonthly(limitValue, resetWindow, config);
    const result = estimateFromRequests(monthlyRequests, config, chain, assumptions, limit.modelId);
    return result;
  }

  // ── Layer 5: Credits ────────────────────────────────────────────────
  if (limit.limitType === "credits_per_month" && limitValue !== null) {
    return estimateFromCredits(limitValue, resetWindow, config, limit.planId, chain, assumptions);
  }

  // ── Layer 5a: USD Credit Budget ─────────────────────────────────────
  if (limit.limitType === "usd_credits_per_month" && limitValue !== null) {
    return estimateFromUsdCredits(limitValue, resetWindow, config, limit.planId, chain, assumptions);
  }

  // ── Layer 6: Compute units ──────────────────────────────────────────
  if (limit.limitType === "compute_units_per_month" && limitValue !== null) {
    return estimateFromComputeUnits(limitValue, resetWindow, config, limit.planId, chain, assumptions);
  }

  // ── Layer 7: Time-window numeric (generic catch-all) ────────────────
  if (limitValue !== null && resetWindow !== null) {
    const window = resetWindow;
    if (["1h", "3h", "5h", "1d", "1w", "1mo", "1y"].includes(window)) {
      chain.push({
        layer: "time_window",
        description: `Generic time-window limit: ${limitValue} ${limitUnit ?? ""} per ${window}`,
        inputValue: limitValue,
        inputUnit: limitUnit,
        outputTokens: null,
        targetWindow: window,
      });

      // Apply model multiplier if applicable
      const multiplier = getModelMultiplier(limit.modelId, config);
      if (multiplier !== null) {
        assumptions.push(`Model multiplier applied: ${limit.modelId} → ×${multiplier}`);
      }

      return convertUnitThenWindow(
        limitValue,
        limitUnit,
        window,
        config,
        multiplier,
        chain,
        assumptions,
      );
    }
  }

  // ── Layer 8: Unknown / Vague ────────────────────────────────────────
  chain.push({
    layer: "unknown",
    description: "Cannot estimate — limit type is unknown or too vague",
    inputValue: limitValue,
    inputUnit: limitUnit,
    outputTokens: null,
    targetWindow: "N/A",
  });

  return {
    tokens5h: null,
    tokens24h: null,
    tokens1w: null,
    tokens1mo: null,
    low5h: null,
    high5h: null,
    low24h: null,
    high24h: null,
    low1w: null,
    high1w: null,
    low1mo: null,
    high1mo: null,
    confidence: "unknown",
    methodLabel: "unknown",
    warnings: ["Cannot estimate — unknown limit type"],
    perWindowDetail: {},
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extrapolate a value from its reset window to a monthly equivalent.
 */
function extrapolateToMonthly(
  value: number,
  window: string | null,
  config: NormalizationConfig,
): number {
  if (!window) return value; // assume monthly if no window given
  switch (window) {
    case "1h":
      return value * config.hoursPerSession * config.sessionsPerMonth;
    case "3h":
      return Math.round(value * config.workingDaysPerMonth * config.hoursPerSession / 3);
    case "5h":
      return value * config.sessionsPerMonth;
    case "1d":
      return value * config.workingDaysPerMonth;
    case "1w":
      return value * config.weeksPerMonth;
    case "1mo":
      return value;
    case "1y":
      return Math.round(value / 12);
    default:
      return value;
  }
}

/**
 * Get model multiplier from config if applicable.
 * Returns null if no multiplier is configured for this model.
 */
function getModelMultiplier(
  modelId: string | null,
  config: NormalizationConfig,
): number | null {
  if (!modelId) return null;
  // Check exact model ID match first
  if (config.modelMultipliers[modelId]) {
    return config.modelMultipliers[modelId].base;
  }
  // Try family prefix match (e.g., "claude-sonnet-4-6" → "claude-4")
  for (const [key, range] of Object.entries(config.modelMultipliers)) {
    const familyPrefix = key.split("-")[0];
    if (familyPrefix && modelId.startsWith(familyPrefix)) {
      return range.base;
    }
  }
  return null;
}

/**
 * Convert a unit-based limit (messages, requests) to tokens via the
 * assumption table, then window-normalize.
 */
function convertUnitThenWindow(
  value: number,
  unit: string | null,
  window: string,
  config: NormalizationConfig,
  multiplier: number | null,
  chain: ConversionStep[],
  assumptions: string[],
): EstimateResult {
  // Determine per-unit tokens
  let perUnitTokens: number;
  let unitLabel: string;
  let confidenceLabel: string;

  if (unit === "messages") {
    perUnitTokens = config.tokensPerCodingMessage.base;
    unitLabel = "coding message";
    confidenceLabel = "inferred";
    assumptions.push(
      `Message limit: ${perUnitTokens} tokens/message (base assumption, range ${config.tokensPerCodingMessage.low}-${config.tokensPerCodingMessage.high})`,
    );
  } else if (unit === "requests" || unit === "calls") {
    perUnitTokens = config.tokensPerAgenticRequest.base;
    unitLabel = "agentic request";
    confidenceLabel = "inferred";
    assumptions.push(
      `Request limit: ${perUnitTokens} tokens/request (base assumption, range ${config.tokensPerAgenticRequest.low}-${config.tokensPerAgenticRequest.high})`,
    );
  } else {
    // Generic fallback: use agentic request as default
    perUnitTokens = config.tokensPerAgenticRequest.base;
    unitLabel = unit ?? "unit";
    confidenceLabel = "assumed";
    assumptions.push(
      `Generic unit limit: ${perUnitTokens} tokens/${unitLabel} (assumed default)`,
    );
  }

  // Apply multiplier
  const effectiveTokensPerUnit = multiplier !== null
    ? Math.round(perUnitTokens * multiplier)
    : perUnitTokens;

  const monthlyFromUnit = value * effectiveTokensPerUnit;

  chain.push({
    layer: unit === "messages" ? "messages" : "requests",
    description: `${value} ${unitLabel}s × ${effectiveTokensPerUnit} tokens = ${monthlyFromUnit} monthly`,
    inputValue: value,
    inputUnit: unit,
    outputTokens: monthlyFromUnit,
    targetWindow: window,
  });

  // Extrapolate monthly (the value might be daily/weekly etc.)
  const monthlyTokens = extrapolateToMonthly(monthlyFromUnit, "1mo", config);

  return windowNormalize(
    monthlyTokens,
    "1mo",
    config,
    `${unitLabel} limit converted via ${effectiveTokensPerUnit} tokens/${unitLabel}`,
    chain,
    assumptions,
    confidenceLabel,
  );
}

/**
 * Window-normalize a token value to all 4 target windows.
 */
function windowNormalize(
  monthlyTokens: number,
  fromWindow: string,
  config: NormalizationConfig,
  methodLabel: string,
  chain: ConversionStep[],
  assumptions: string[],
  forceConfidence?: string,
): EstimateResult {
  const windowed = extrapolateToAllTargetWindows(
    monthlyTokens,
    fromWindow as any,
    config,
  );

  // Determine overall confidence across windows
  let overallConfidence: Confidence | null = null;
  const perWindowDetail: Record<string, string> = {};
  const warnings: string[] = [];

  const result: Partial<Record<TargetWindow, number | null>> = {};
  const lowResult: Partial<Record<TargetWindow, number | null>> = {};
  const highResult: Partial<Record<TargetWindow, number | null>> = {};

  for (const tw of TARGET_WINDOWS) {
    const w = windowed[tw];
    result[tw] = w.value;
    lowResult[tw] = null;
    highResult[tw] = null;

    perWindowDetail[tw] = `${w.value} tokens (confidence: ${w.confidence})`;
    if (w.notes.length > 0) {
      perWindowDetail[tw] += ` — ${w.notes.join("; ")}`;
    }

    // Track highest confidence (best source quality) across windows for overall.
    // Overall confidence reflects how reliable the source data is, not
    // how well we can extrapolate to each target window.
    const confRank = CONFIDENCE_RANK[w.confidence] ?? 0;
    const currentRank = overallConfidence !== null
      ? CONFIDENCE_RANK[overallConfidence] ?? 0
      : -1;
    if (confRank > currentRank) {
      overallConfidence = w.confidence;
    }

    if (w.confidence === "unknown") {
      warnings.push(`Window ${tw} has unknown confidence (large extrapolation)`);
    }
  }

  // Apply forced confidence only if more restrictive (lower) than computed
  const forcedRank = forceConfidence
    ? CONFIDENCE_RANK[forceConfidence as keyof typeof CONFIDENCE_RANK] ?? 0
    : null;
  const computedRank = overallConfidence
    ? CONFIDENCE_RANK[overallConfidence] ?? 0
    : 0;

  const finalConfidence =
    forcedRank !== null && forcedRank < computedRank
      ? (forceConfidence as Confidence)
      : (overallConfidence ?? "unknown");

  return {
    tokens5h: result["5h"] ?? null,
    tokens24h: result["24h"] ?? null,
    tokens1w: result["1w"] ?? null,
    tokens1mo: result["1mo"] ?? null,
    low5h: lowResult["5h"] ?? null,
    high5h: highResult["5h"] ?? null,
    low24h: lowResult["24h"] ?? null,
    high24h: highResult["24h"] ?? null,
    low1w: lowResult["1w"] ?? null,
    high1w: highResult["1w"] ?? null,
    low1mo: lowResult["1mo"] ?? null,
    high1mo: highResult["1mo"] ?? null,
    confidence: finalConfidence,
    methodLabel,
    warnings,
    perWindowDetail,
  };
}

/**
 * Estimate tokens from a message-based limit.
 */
function estimateFromMessages(
  monthlyMessages: number,
  config: NormalizationConfig,
  chain: ConversionStep[],
  assumptions: string[],
  modelId: string | null,
): EstimateResult {
  const perUnitBase = config.tokensPerCodingMessage.base;

  // Apply model multiplier
  const multiplier = getModelMultiplier(modelId, config);
  const effectivePerUnit = multiplier !== null
    ? Math.round(perUnitBase * multiplier)
    : perUnitBase;

  const baseMonthly = monthlyMessages * effectivePerUnit;
  const lowMonthly = monthlyMessages * config.tokensPerCodingMessage.low;
  const highMonthly = monthlyMessages * config.tokensPerCodingMessage.high;

  chain.push({
    layer: "messages",
    description: `${monthlyMessages} messages/month × ${effectivePerUnit} tokens = ${baseMonthly}`,
    inputValue: monthlyMessages,
    inputUnit: "messages",
    outputTokens: baseMonthly,
    targetWindow: "1mo",
  });

  assumptions.push(
    `Message-to-token: ${effectivePerUnit} tokens/message${multiplier ? ` (base ${perUnitBase} × ${multiplier} model factor)` : ""}, range ${config.tokensPerCodingMessage.low}-${config.tokensPerCodingMessage.high}`,
  );

  const base = windowNormalize(baseMonthly, "1mo", config, "Message-based estimate", chain, assumptions, "inferred");

  // Add uncertainty ranges
  if (lowMonthly !== baseMonthly) {
    const low = windowNormalize(lowMonthly, "1mo", config, "Message-based estimate (low)", [], []);
    base.low5h = low.tokens5h;
    base.low24h = low.tokens24h;
    base.low1w = low.tokens1w;
    base.low1mo = low.tokens1mo;
  }
  if (highMonthly !== baseMonthly) {
    const high = windowNormalize(highMonthly, "1mo", config, "Message-based estimate (high)", [], []);
    base.high5h = high.tokens5h;
    base.high24h = high.tokens24h;
    base.high1w = high.tokens1w;
    base.high1mo = high.tokens1mo;
  }

  return base;
}

/**
 * Estimate tokens from a request/calls-based limit.
 */
function estimateFromRequests(
  monthlyRequests: number,
  config: NormalizationConfig,
  chain: ConversionStep[],
  assumptions: string[],
  modelId: string | null,
): EstimateResult {
  const perUnitBase = config.tokensPerAgenticRequest.base;

  // Apply model multiplier
  const multiplier = getModelMultiplier(modelId, config);
  const effectivePerUnit = multiplier !== null
    ? Math.round(perUnitBase * multiplier)
    : perUnitBase;

  const baseMonthly = monthlyRequests * effectivePerUnit;
  const lowMonthly = monthlyRequests * config.tokensPerAgenticRequest.low;
  const highMonthly = monthlyRequests * config.tokensPerAgenticRequest.high;

  chain.push({
    layer: "requests",
    description: `${monthlyRequests} requests/month × ${effectivePerUnit} tokens = ${baseMonthly}`,
    inputValue: monthlyRequests,
    inputUnit: "requests",
    outputTokens: baseMonthly,
    targetWindow: "1mo",
  });

  assumptions.push(
    `Request-to-token: ${effectivePerUnit} tokens/request${multiplier ? ` (base ${perUnitBase} × ${multiplier} model factor)` : ""}, range ${config.tokensPerAgenticRequest.low}-${config.tokensPerAgenticRequest.high}`,
  );

  const base = windowNormalize(baseMonthly, "1mo", config, "Request-based estimate", chain, assumptions, "inferred");

  if (lowMonthly !== baseMonthly) {
    const low = windowNormalize(lowMonthly, "1mo", config, "Request-based estimate (low)", [], []);
    base.low5h = low.tokens5h;
    base.low24h = low.tokens24h;
    base.low1w = low.tokens1w;
    base.low1mo = low.tokens1mo;
  }
  if (highMonthly !== baseMonthly) {
    const high = windowNormalize(highMonthly, "1mo", config, "Request-based estimate (high)", [], []);
    base.high5h = high.tokens5h;
    base.high24h = high.tokens24h;
    base.high1w = high.tokens1w;
    base.high1mo = high.tokens1mo;
  }

  return base;
}

/**
 * Estimate tokens from a credit-based limit.
 */
function getMapping<T>(
  planId: string,
  mappings: Record<string, T>,
): T | undefined {
  if (mappings[planId]) return mappings[planId];
  // Prefix fallback: "openai-pro" → key "openai"
  for (const [key, value] of Object.entries(mappings)) {
    if (planId.startsWith(key)) return value;
  }
  return undefined;
}

function estimateFromUsdCredits(
  usdPerMonth: number,
  resetWindow: string | null,
  config: NormalizationConfig,
  planId: string,
  chain: ConversionStep[],
  assumptions: string[],
): EstimateResult {
  const mapping = config.usdCreditRates[planId] ?? config.defaultUsdCreditRate;

  const monthlyUsd = extrapolateToMonthly(usdPerMonth, resetWindow, config);

  // Convert: tokens = (USD × 1_000_000) / ($/MTok output rate)
  const baseTokens = Math.round((monthlyUsd * 1_000_000) / mapping.outputRatePerMtokBase);
  const lowTokens = Math.round((monthlyUsd * 1_000_000) / mapping.outputRatePerMtokConservative);
  const highTokens = Math.round((monthlyUsd * 1_000_000) / mapping.outputRatePerMtokOptimistic);

  chain.push({
    layer: "usd_credits",
    description: `$${monthlyUsd}/mo ÷ $${mapping.outputRatePerMtokBase}/MTok out = ${baseTokens} tokens (range ${lowTokens}–${highTokens})`,
    inputValue: monthlyUsd,
    inputUnit: "USD",
    outputTokens: baseTokens,
    targetWindow: "1mo",
  });

  assumptions.push(
    `USD credit conversion: $${monthlyUsd}/mo at $${mapping.outputRatePerMtokConservative}–$${mapping.outputRatePerMtokOptimistic}/MTok output (${mapping.source})`,
  );

  const base = windowNormalize(baseTokens, "1mo", config, "USD credit budget estimate", chain, assumptions, "inferred");

  // Attach uncertainty range
  const low = windowNormalize(lowTokens, "1mo", config, "low", [], []);
  const high = windowNormalize(highTokens, "1mo", config, "high", [], []);
  base.low5h = low.tokens5h;
  base.low24h = low.tokens24h;
  base.low1w = low.tokens1w;
  base.low1mo = low.tokens1mo;
  base.high5h = high.tokens5h;
  base.high24h = high.tokens24h;
  base.high1w = high.tokens1w;
  base.high1mo = high.tokens1mo;

  return base;
}

function estimateFromCredits(
  credits: number,
  resetWindow: string | null,
  config: NormalizationConfig,
  planId: string,
  chain: ConversionStep[],
  assumptions: string[],
): EstimateResult {
  const mapping = getMapping(planId, config.creditMappings);
  const tokensPerCredit = mapping?.tokensPerCredit ?? config.tokensPerCredit.base;
  const sourceLabel = mapping ? mapping.source : "default assumption";

  const monthlyCredits = extrapolateToMonthly(credits, resetWindow, config);
  const monthlyTokens = monthlyCredits * tokensPerCredit;

  chain.push({
    layer: "credits",
    description: `${monthlyCredits} credits/month × ${tokensPerCredit} tokens/credit = ${monthlyTokens}`,
    inputValue: monthlyCredits,
    inputUnit: "credits",
    outputTokens: monthlyTokens,
    targetWindow: "1mo",
  });

  assumptions.push(
    `Credit mapping: ${tokensPerCredit} tokens/credit (${sourceLabel})`,
  );

  const confidenceLabel = mapping ? "inferred" : "assumed";
  return windowNormalize(
    monthlyTokens,
    "1mo",
    config,
    "Credit-based estimate",
    chain,
    assumptions,
    confidenceLabel,
  );
}

/**
 * Estimate tokens from a compute-unit-based limit.
 */
function estimateFromComputeUnits(
  units: number,
  resetWindow: string | null,
  config: NormalizationConfig,
  planId: string,
  chain: ConversionStep[],
  assumptions: string[],
): EstimateResult {
  const mapping = getMapping(planId, config.computeUnitMappings);
  const tokensPerUnit = mapping?.tokensPerComputeUnit ?? config.tokensPerComputeUnit.base;
  const sourceLabel = mapping ? mapping.source : "default assumption";

  const monthlyUnits = extrapolateToMonthly(units, resetWindow, config);
  const monthlyTokens = monthlyUnits * tokensPerUnit;

  chain.push({
    layer: "compute_units",
    description: `${monthlyUnits} compute-units/month × ${tokensPerUnit} tokens/unit = ${monthlyTokens}`,
    inputValue: monthlyUnits,
    inputUnit: "compute_units",
    outputTokens: monthlyTokens,
    targetWindow: "1mo",
  });

  assumptions.push(
    `Compute-unit mapping: ${tokensPerUnit} tokens/compute-unit (${sourceLabel})`,
  );

  const confidenceLabel = mapping ? "inferred" : "assumed";
  return windowNormalize(
    monthlyTokens,
    "1mo",
    config,
    "Compute-unit-based estimate",
    chain,
    assumptions,
    confidenceLabel,
  );
}
