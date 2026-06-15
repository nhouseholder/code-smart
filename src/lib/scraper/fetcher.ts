import crypto from "node:crypto";
import type { Browser, BrowserContext } from "playwright";
import { FetchResult } from "./types";

// ── Static HTTP Fetch ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

/**
 * Fetch a URL using Node's built-in `fetch()`.
 * Returns raw HTML; caller can pass to `text-extractor.ts` for cleanup.
 */
export async function fetchStatic(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchResult> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Follow redirects manually (up to MAX_REDIRECTS)
    let currentUrl = url;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const resp = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
      });

      const location = resp.headers.get("location");
      if (
        (resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) &&
        location &&
        i < MAX_REDIRECTS
      ) {
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const rawBody = await resp.text();
      const duration = Math.round(performance.now() - start);
      const contentHash = crypto
        .createHash("sha256")
        .update(rawBody, "utf-8")
        .digest("hex");

      return {
        url: currentUrl,
        httpStatus: resp.status,
        contentType: resp.headers.get("content-type") ?? "",
        rawBody,
        contentHash,
        fetchMethod: "static",
        fetchDurationMs: duration,
        error: resp.status >= 400 ? `HTTP ${resp.status}: ${resp.statusText}` : undefined,
      };
    }

    // Exceeded redirect limit
    const duration = Math.round(performance.now() - start);
    return {
      url: currentUrl,
      httpStatus: 0,
      contentType: "",
      rawBody: "",
      contentHash: "",
      fetchMethod: "static",
      fetchDurationMs: duration,
      error: `Exceeded ${MAX_REDIRECTS} redirects`,
    };
  } catch (err: unknown) {
    const duration = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    return {
      url,
      httpStatus: 0,
      contentType: "",
      rawBody: "",
      contentHash: "",
      fetchMethod: "static",
      fetchDurationMs: duration,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Playwright Fetch ────────────────────────────────────────────────

/**
 * Fetch a URL using Playwright.
 *
 * Receives a shared `Browser` instance (caller manages lifecycle).
 * Creates an isolated `BrowserContext` per page — closed in `finally`.
 * Returns `page.content()` as rawBody and `page.innerText()` as extractedText.
 */
export async function fetchWithPlaywright(
  browser: Browser,
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<FetchResult> {
  const start = performance.now();
  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });

    const rawBody = await page.content();
    const extractedText = await page.innerText("body");
    const httpStatus = 200; // Playwright doesn't surface HTTP status after navigation
    const duration = Math.round(performance.now() - start);
    const contentHash = crypto
      .createHash("sha256")
      .update(rawBody, "utf-8")
      .digest("hex");

    return {
      url,
      httpStatus,
      contentType: "text/html",
      rawBody,
      contentHash,
      fetchMethod: "playwright",
      fetchDurationMs: duration,
      extractedText,
    };
  } catch (err: unknown) {
    const duration = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    return {
      url,
      httpStatus: 0,
      contentType: "",
      rawBody: "",
      contentHash: "",
      fetchMethod: "playwright",
      fetchDurationMs: duration,
      error: message,
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

// ── Retry Wrapper ───────────────────────────────────────────────────

type FetchFn = (url: string) => Promise<FetchResult>;

/**
 * Retry wrapper with exponential backoff + jitter.
 *
 * Retries on: network errors, 5xx, and 429 (rate limit).
 * Does NOT retry on: 400, 401, 403, 404.
 */
export async function fetchWithRetry(
  fn: FetchFn,
  url: string,
  maxRetries = 3,
): Promise<FetchResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn(url);

    // Success — no error or client error that shouldn't retry
    if (!result.error) return result;

    // Check if this is a retriable error
    const status = result.httpStatus;
    const isRetriable =
      status >= 500 ||
      status === 429 ||
      // Network errors (httpStatus === 0) are retriable
      status === 0;

    if (!isRetriable || attempt >= maxRetries) {
      return result;
    }

    // Exponential backoff: 1s, 2s, 4s + jitter (±25%)
    const baseDelay = 1000 * Math.pow(2, attempt);
    const jitter = 0.75 + Math.random() * 0.5; // 0.75–1.25
    const delay = Math.round(baseDelay * jitter);
    await new Promise((r) => setTimeout(r, delay));
  }

  // Should not reach here — fallback error
  const start = performance.now();
  return {
    url,
    httpStatus: 0,
    contentType: "",
    rawBody: "",
    contentHash: "",
    fetchMethod: "static",
    fetchDurationMs: Math.round(performance.now() - start),
    error: "Exhausted retries",
  };
}
