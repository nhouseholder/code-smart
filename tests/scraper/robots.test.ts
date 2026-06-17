import { describe, it, expect } from "vitest";
import { parseRobotsTxt } from "../../src/lib/scraper/robots";

const OUR_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

describe("parseRobotsTxt", () => {
  it("allows everything when there are no rules", () => {
    const r = parseRobotsTxt("", OUR_UA);
    expect(r.isAllowed("/anything")).toBe(true);
    expect(r.crawlDelaySec).toBeNull();
  });

  it("honors a wildcard Disallow", () => {
    const txt = `User-agent: *\nDisallow: /private`;
    const r = parseRobotsTxt(txt, OUR_UA);
    expect(r.isAllowed("/private/data")).toBe(false);
    expect(r.isAllowed("/public")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    const txt = `User-agent: *\nDisallow:`;
    const r = parseRobotsTxt(txt, OUR_UA);
    expect(r.isAllowed("/anything")).toBe(true);
  });

  it("applies longest-match with Allow overriding a broader Disallow", () => {
    const txt = `User-agent: *\nDisallow: /docs\nAllow: /docs/public`;
    const r = parseRobotsTxt(txt, OUR_UA);
    expect(r.isAllowed("/docs/secret")).toBe(false);
    expect(r.isAllowed("/docs/public/page")).toBe(true);
  });

  it("parses Crawl-Delay for the matched group", () => {
    const txt = `User-agent: *\nCrawl-delay: 10\nDisallow:`;
    const r = parseRobotsTxt(txt, OUR_UA);
    expect(r.crawlDelaySec).toBe(10);
  });

  it("prefers a UA-specific group over the wildcard group", () => {
    const txt = [
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: Chrome",
      "Disallow: /admin",
    ].join("\n");
    const r = parseRobotsTxt(txt, OUR_UA);
    // Our UA contains "Chrome" → use that group, not the blanket wildcard block.
    expect(r.isAllowed("/pricing")).toBe(true);
    expect(r.isAllowed("/admin/users")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const txt = `# a comment\nUser-agent: *\n\nDisallow: /x # trailing comment`;
    const r = parseRobotsTxt(txt, OUR_UA);
    expect(r.isAllowed("/x/y")).toBe(false);
    expect(r.isAllowed("/y")).toBe(true);
  });
});
