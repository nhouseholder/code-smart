import { ExtractedPrice, scoreConfidence } from "./types";

// ── Price Regex ─────────────────────────────────────────────────────

const PRICE_REGEX =
  /\$(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)\s*(?:\/|\s*per\s*)?\s*(mo(?:nth)?|yr|year|seat|user)?/gi;

const MONTHLY_SIGNALS = /\b(month|mo)\b/i;
const ANNUAL_SIGNALS = /\b(year|yr|annual|annually)\b/i;

/**
 * Extract price information from text content.
 *
 * Confidence rules:
 * - `$20/mo` with monthly context → observed
 * - `$20` alone without billing context → inferred
 * - Fuzzy/approximate matches → assumed
 */
export function extractPrices(
  text: string,
  _sourceUrl?: string,
): ExtractedPrice[] {
  const seen = new Set<string>();
  const results: ExtractedPrice[] = [];

  let match: RegExpExecArray | null;
  PRICE_REGEX.lastIndex = 0;

  while ((match = PRICE_REGEX.exec(text)) !== null) {
    const rawText = match[0];
    const amountStr = match[1].replace(/,/g, "");
    const amount = parseFloat(amountStr);
    const intervalStr = (match[2] ?? "").toLowerCase();

    if (isNaN(amount)) continue;

    // Dedup by raw match text
    if (seen.has(rawText)) continue;
    seen.add(rawText);

    // Determine billing interval
    let billingInterval: ExtractedPrice["billingInterval"] = null;
    if (MONTHLY_SIGNALS.test(intervalStr)) {
      billingInterval = "monthly";
    } else if (ANNUAL_SIGNALS.test(intervalStr)) {
      billingInterval = "annual";
    }

    // Capture context snippet (±100 chars around match)
    const matchStart = match.index;
    const contextStart = Math.max(0, matchStart - 100);
    const contextEnd = Math.min(text.length, matchStart + rawText.length + 100);
    const contextSnippet = text
      .slice(contextStart, contextEnd)
      .replace(/\s+/g, " ")
      .trim();

    // Score confidence — price regex only matches clean dollar amounts (all exact)
    const confidence = scoreConfidence(1, contextSnippet, "exact");

    results.push({
      rawText,
      amount,
      currency: "USD",
      billingInterval,
      confidence,
      contextSnippet: contextSnippet.slice(0, 200),
    });
  }

  return results;
}

/**
 * Check if text contains "free" or "$0" — captures free tiers.
 * Returns an extracted price with amount=0 if found.
 */
export function extractFreeTier(text: string): ExtractedPrice | null {
  const hasFreeTier = /\b(free|free\s*tier|free\s*plan)\b/i.test(text);
  const hasZero = /\$0(?:\.00)?(?:\s*\/?\s*(mo(?:nth)?|yr|year|seat|user)?)?/i.test(text);

  if (!hasFreeTier && !hasZero) return null;

  return {
    rawText: hasFreeTier ? "Free" : "$0",
    amount: 0,
    currency: "USD",
    billingInterval: null,
    confidence: "observed",
    contextSnippet: "",
  };
}
