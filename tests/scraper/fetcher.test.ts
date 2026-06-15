import { describe, it, expect } from "vitest";
import { stripNoise, extractReadableText, computeContentHash } from "../../src/lib/scraper/text-extractor";

describe("stripNoise", () => {
  it("removes <script> blocks", () => {
    const html = "<div>Hello</div><script>alert('x')</script>";
    expect(stripNoise(html)).toBe("<div>Hello</div>");
  });

  it("removes <style> blocks", () => {
    const html = "<style>body { color: red; }</style><p>Text</p>";
    expect(stripNoise(html)).toBe("<p>Text</p>");
  });

  it("removes HTML comments", () => {
    const html = "<p>Hi</p><!-- comment --><p>There</p>";
    expect(stripNoise(html)).toBe("<p>Hi</p><p>There</p>");
  });

  it("removes <nav> and <footer>", () => {
    const html = "<nav>Links</nav><main>Content</main><footer>© 2026</footer>";
    expect(stripNoise(html)).toBe("<main>Content</main>");
  });
});

describe("extractReadableText", () => {
  it("strips HTML tags and normalizes whitespace", () => {
    const html = "<p>Hello  <b>world</b></p>";
    expect(extractReadableText(html)).toBe("Hello world");
  });

  it("decodes HTML entities", () => {
    const html = "<p>Cost: $20 &amp; up</p>";
    expect(extractReadableText(html)).toBe("Cost: $20 & up");
  });

  it("caps at max bytes", () => {
    const big = "A".repeat(10_000);
    const html = `<p>${big}</p>`;
    const result = extractReadableText(html, 100);
    expect(result.length).toBeLessThanOrEqual(101); // cap + possible newline
  });

  it("passes through Playwright innerText unchanged (no tag stripping needed)", () => {
    const innerText = "Hello world\nLine 2";
    expect(extractReadableText(innerText)).toBe("Hello world Line 2");
  });
});

describe("computeContentHash", () => {
  it("SHA-256 hex is deterministic", () => {
    const hash1 = computeContentHash("hello world");
    const hash2 = computeContentHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("different inputs produce different hashes", () => {
    const hash1 = computeContentHash("hello");
    const hash2 = computeContentHash("world");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 64-character hex string", () => {
    const hash = computeContentHash("test content");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes original raw body, not stripped version", () => {
    const raw = "<script>bad</script>hello";
    const stripped = stripNoise(raw);
    const hashRaw = computeContentHash(raw);
    const hashStripped = computeContentHash(stripped);
    expect(hashRaw).not.toBe(hashStripped);
  });
});
