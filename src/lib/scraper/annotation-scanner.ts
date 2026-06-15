import type { ExtractedPrice, ExtractedLimit } from "./types";
import type { ExtractedModelMention } from "./model-extractor";

// ── Footnote Scanning ──────────────────────────────────────────────────

/**
 * Scan text for small-print / caveat footnotes.
 *
 * Captures asterisk disclaimers, "fine print" boilerplate,
 * "as of" date markers, and caveat keywords.
 */
export function scanFootnotes(text: string): string[] {
  const results = new Set<string>();

  // 1. Asterisk / disclaimer footnotes: "*Limited to 100 requests/day"
  const asteriskRe = /\*\s*(.+?)(?:\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = asteriskRe.exec(text)) !== null) {
    const footnote = m[1].trim();
    if (footnote) results.add(footnote);
  }

  // 2. "Fine print" boilerplate
  const finePrintRe = /(?:fine print|terms apply|subject to|restrictions apply)[^.]*\./gi;
  while ((m = finePrintRe.exec(text)) !== null) {
    results.add(m[0].trim());
  }

  // 3. "As of" / "last updated" / "pricing effective" date markers
  const asOfRe = /(?:as of|last updated|pricing effective)[^.]*\./gi;
  while ((m = asOfRe.exec(text)) !== null) {
    results.add(m[0].trim());
  }

  // 4. Caveat keywords: "limited to", "capped at", "maximum of", "up to"
  const caveatRe = /(?:limited to|capped at|maximum of|up to)\s[^.]*\./gi;
  while ((m = caveatRe.exec(text)) !== null) {
    results.add(m[0].trim());
  }

  return Array.from(results);
}

// ── Assumption Recording ───────────────────────────────────────────────

/**
 * Record factual statements about what the extractor did or didn't find.
 *
 * NOT speculative — only states what the extractor produced.
 */
export function recordAssumptions(
  extractedText: string,
  prices: ExtractedPrice[],
  limits: ExtractedLimit[],
  modelMentions: ExtractedModelMention[],
): string[] {
  const assumptions: string[] = [];

  const noInterval = prices.filter((p) => p.billingInterval === null).length;
  assumptions.push(
    `${prices.length} price(s) extracted, ${noInterval} without billing interval`,
  );

  const needNorm = limits.filter((l) => l.needsNormalization).length;
  assumptions.push(
    `${limits.length} usage limit(s) extracted, ${needNorm} require normalization`,
  );

  assumptions.push(`${modelMentions.length} model mention(s) found`);

  const hasFree = prices.some((p) => p.amount === 0);
  if (!hasFree) {
    assumptions.push("No free tier detected");
  }

  assumptions.push("All prices assumed USD");
  assumptions.push(`Text length: ${extractedText.length} chars`);

  return assumptions;
}
