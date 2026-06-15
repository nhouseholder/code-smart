import { type Confidence, ExtractedLimit, scoreConfidence } from "./types";

// ── Pattern Config ──────────────────────────────────────────────────

interface LimitPattern {
  type: ExtractedLimit["limitType"];
  regex: RegExp;
  valueGroup?: number;
  unitGroup?: number;
  windowGroup?: number;
  requiresNormalization?: boolean;
}

// Priority-ordered: first match wins
const PATTERNS: LimitPattern[] = [
  // 1. Hard numeric: "50 messages per day", "1,000 requests/month"
  {
    type: "hard_numeric",
    regex:
      /(\d{1,6}(?:,\d{3})*)\s*(messages?|requests?|calls?|queries?|tokens?|words?|documents?|pages?|seats?|users?|conversations?|\bAPI\b)\s*(?:per|\/)\s*(second|min(?:ute)?|hour|day|week|month|mo|yr|year)?/gi,
    valueGroup: 1,
    unitGroup: 2,
    windowGroup: 3,
  },
  // 2. Relative: "5x more usage", "2x the rate"
  {
    type: "relative",
    regex: /(\d+)x?\s*(?:more|less|higher|the)\s*(usage|rate|limit|messages|tokens|requests)?/gi,
    valueGroup: 1,
    requiresNormalization: true,
  },
  // 3. Credits: "500 credits/month", "3000 credits per month"
  {
    type: "credits",
    regex:
      /(\d{1,7}(?:,\d{3})*)\s*credits?\s*(?:per|\/)\s*(second|min(?:ute)?|hour|day|week|month|mo|yr|year)?/gi,
    valueGroup: 1,
    windowGroup: 2,
  },
  // 4. Time-windowed: "every N hours", "reset every 24 hours"
  {
    type: "time_windowed",
    regex:
      /(?:every|per|each|reset\s*(?:every|after))\s+(\d+)\s*(second|min(?:ute)?|hour|day|week|month)/gi,
    valueGroup: 1,
    unitGroup: 2,
  },
  // 5. Rate limit: "rate limited during peak", "throttled"
  {
    type: "rate_limit",
    regex: /\b(rate\s*limit(?:ed)?|throttled|rate\s*limiting)\b/gi,
  },
  // 6. Fair use: "subject to fair use", "fair usage policy"
  {
    type: "fair_use",
    regex: /\b(fair\s*use|fair\s*usage\s*(?:policy|limit)|acceptable\s*use)\b/gi,
  },
  // 7. Model-specific: "varies by model", "depends on model"
  {
    type: "model_specific",
    regex: /\b(varies\s*(?:by|depending\s*on)|depends\s*on\s*(?:the\s*)?model|model[- ]dependent|per[- ]model)\b/gi,
  },
];

// 8. Vague catch-all — must check after all other patterns
const VAGUE_PATTERNS = [
  /\b(limited\s*usage|restricted|usage\s*limits?\s*apply|capped|usage\s*caps?)\b/gi,
];

/**
 * Extract usage limit information from text content.
 *
 * Priority-ordered (first match wins per location):
 * 1. Hard numeric → observed
 * 2. Relative → inferred, needsNormalization=true
 * 3. Credits → observed, leave as credits (no token conversion)
 * 4. Time-windowed → observed
 * 5. Model-specific → assumed
 * 6. Rate limit → assumed
 * 7. Fair use → assumed
 * 8. Vague → unknown, raw text only
 */
export function extractUsageLimits(
  text: string,
  _sourceUrl?: string,
): ExtractedLimit[] {
  const results: ExtractedLimit[] = [];
  const seen = new Set<string>();

  // Track matched positions to avoid duplicate vague matches
  const matchedTextPositions: Array<[number, number]> = [];

  // Try structured patterns first
  for (const pattern of PATTERNS) {
    // Reset regex state for fresh matching
    pattern.regex.lastIndex = 0;

    // Collect all matches for this pattern (matchAll ignores lastIndex for global regex)
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      const rawText = match[0];
      const dedupKey = rawText.toLowerCase().trim();
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      // Track matched positions for vague exclusion
      matchedTextPositions.push([match.index, match.index + match[0].length]);

      const valueStr =
        pattern.valueGroup && match[pattern.valueGroup]
          ? match[pattern.valueGroup].replace(/,/g, "")
          : null;
      const limitValue = valueStr ? parseFloat(valueStr) : null;
      const limitUnit = pattern.unitGroup ? match[pattern.unitGroup] ?? null : null;
      const resetWindow = pattern.windowGroup ? match[pattern.windowGroup] ?? null : null;

      // Normalize reset window to concise form
      const normalizedWindow = resetWindow
        ? normalizeResetWindow(resetWindow)
        : null;

      // Build context snippet
      const contextStart = Math.max(0, match.index - 80);
      const contextEnd = Math.min(text.length, match.index + rawText.length + 80);
      const contextSnippet = text
        .slice(contextStart, contextEnd)
        .replace(/\s+/g, " ")
        .trim();

      const patternType =
        pattern.type === "hard_numeric"
          ? "exact"
          : pattern.type === "credits"
            ? "exact"
            : pattern.type === "relative"
              ? "relative"
              : "fuzzy";

      // Hard numeric and credit limits are directly observed — no billing context needed
      const confidence: Confidence =
        pattern.type === "hard_numeric" || pattern.type === "credits"
          ? "observed"
          : scoreConfidence(1, contextSnippet, patternType);

      results.push({
        rawText,
        limitType: pattern.type,
        limitValue: limitValue && !isNaN(limitValue) ? limitValue : null,
        limitUnit: limitUnit ?? null,
        resetWindow: normalizedWindow,
        confidence,
        needsNormalization: pattern.requiresNormalization ?? false,
        contextSnippet: contextSnippet.slice(0, 200),
      });
    }
  }

  // Check vague patterns — only if text at that position wasn't already matched
  for (const vagueRegex of VAGUE_PATTERNS) {
    const matches = text.matchAll(vagueRegex);
    for (const match of matches) {
      const rawText = match[0];
      const dedupKey = rawText.toLowerCase().trim();
      if (seen.has(dedupKey)) continue;

      // Check if this position overlaps with a structured match
      const pos = match.index;
      const end = pos + match[0].length;
      const overlaps = matchedTextPositions.some(
        ([start, e]) => pos < e && end > start,
      );
      if (overlaps) continue;

      seen.add(dedupKey);

      const contextSnippet = text
        .slice(Math.max(0, pos - 80), Math.min(text.length, end + 80))
        .replace(/\s+/g, " ")
        .trim();

      results.push({
        rawText,
        limitType: "vague",
        limitValue: null,
        limitUnit: null,
        resetWindow: null,
        confidence: "unknown",
        needsNormalization: false,
        contextSnippet: contextSnippet.slice(0, 200),
      });
    }
  }

  return results;
}

function normalizeResetWindow(window: string): string {
  const w = window.toLowerCase().trim();
  if (w === "second" || w === "sec") return "1s";
  if (w === "min" || w === "minute") return "1m";
  if (w === "hour") return "1h";
  if (w === "day") return "1d";
  if (w === "week") return "1w";
  if (w === "month" || w === "mo") return "1mo";
  if (w === "year" || w === "yr") return "1y";
  // Already has number prefix, just return as-is
  return w;
}
