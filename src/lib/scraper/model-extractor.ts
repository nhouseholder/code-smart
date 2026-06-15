import type { Confidence } from "./types";

// ── Types ─────────────────────────────────────────────────────────────

export interface ExtractedModelMention {
  /** DB model ID (null if display name matched but no DB record found) */
  modelId: string | null;
  /** The raw text that matched in the source */
  rawText: string;
  /** The display name that was matched */
  displayName: string;
  confidence: Confidence;
  /** ~120-char window around the match */
  contextSnippet: string;
}

// ── Extractor ──────────────────────────────────────────────────────────

/**
 * Extract model mentions from text by scanning against a known model map.
 *
 * Algorithm:
 * 1. Sort known models by display name length descending (longest match first)
 * 2. Build word-bounded, case-insensitive regex per display name
 * 3. Scan text for matches, extract 120-char context snippet
 * 4. Deduplicate by `(modelId, rawText, matchIndex)`
 * 5. All literal matches → `"observed"` confidence
 */
export function extractModelMentions(
  text: string,
  knownModels: Map<string, string>,
  _sourceUrl?: string,
): ExtractedModelMention[] {
  const results: ExtractedModelMention[] = [];
  const seen = new Set<string>();
  // Track character positions already claimed by longer matches to prevent overlap
  const coveredPositions = new Set<number>();

  // Sort by display name length descending — longest match first
  const sorted = Array.from(knownModels.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  for (const [modelId, displayName] of sorted) {
    const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const rawText = match[0];

      // Skip if this match overlaps a longer display name's claim
      let overlap = false;
      for (let i = match.index; i < match.index + rawText.length; i++) {
        if (coveredPositions.has(i)) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;

      // Claim these character positions
      for (let i = match.index; i < match.index + rawText.length; i++) {
        coveredPositions.add(i);
      }

      const dedupKey = `${modelId}:${rawText}:${match.index}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      // 120-char context snippet (60 before, up to 60 after)
      const start = Math.max(0, match.index - 60);
      const end = Math.min(text.length, match.index + rawText.length + 60);
      let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
      if (start > 0) snippet = "…" + snippet;
      if (end < text.length) snippet = snippet + "…";

      results.push({
        modelId,
        rawText,
        displayName,
        confidence: "observed",
        contextSnippet: snippet,
      });
    }
  }

  return results;
}
