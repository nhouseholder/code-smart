import crypto from "node:crypto";

// ── Noise Stripping (static HTTP fetches only) ──────────────────────

const NOISE_TAGS = /<(script|style|noscript|svg|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_COMMENTS = /<!--[\s\S]*?-->/g;

/**
 * Strip non-content tags and comments from raw HTML.
 * Used only for static HTTP fetches (Node `fetch()` returns raw HTML).
 * For Playwright, use `page.innerText()` directly — it already strips
 * scripts, styles, and tags.
 */
export function stripNoise(html: string): string {
  return html
    .replace(NOISE_TAGS, "")
    .replace(HTML_COMMENTS, "")
    .trim();
}

/**
 * Strip remaining HTML tags, normalize whitespace, and cap length.
 *
 * - Static fetches: call `stripNoise` first, then strip tags.
 * - Playwright: pass `page.innerText()` output directly
 *   (no stripNoise needed — Playwright handles it).
 */
export function extractReadableText(raw: string, capBytes = 524_288): string {
  // Strip any remaining HTML tags
  const noTags = raw.replace(/<[^>]*>/g, "");
  // Normalize whitespace — collapse runs, trim lines
  const normalized = noTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Cap at capBytes (default 500KB)
  return normalized.length > capBytes
    ? normalized.slice(0, capBytes)
    : normalized;
}

/**
 * Compute SHA-256 hex digest of the raw body (before any stripping).
 * Used for change detection — consistent hash regardless of extraction.
 */
export function computeContentHash(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody, "utf-8").digest("hex");
}
