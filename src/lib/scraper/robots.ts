import { fetchStatic } from "./fetcher";

/**
 * robots.txt compliance — pure parser + per-host fetch cache.
 *
 * Scope: enough of RFC 9309 to be a good citizen for our own scraping —
 * User-agent group selection, Allow/Disallow longest-match, and Crawl-delay.
 * A missing or unreachable robots.txt is treated as "allow all" (the standard
 * default), so a flaky host never blocks the pipeline.
 */

export interface RobotsRules {
  /** True if `path` (the URL path, e.g. "/pricing") may be fetched. */
  isAllowed(path: string): boolean;
  /** Crawl-Delay in seconds for the matched group, or null if unspecified. */
  crawlDelaySec: number | null;
}

interface Rule {
  type: "allow" | "disallow";
  path: string;
}

/** Allow-everything rules — used when robots.txt is absent/unreachable. */
const ALLOW_ALL: RobotsRules = { isAllowed: () => true, crawlDelaySec: null };

/**
 * Does a robots `User-agent` token apply to our agent?
 * `*` always matches; otherwise the token must appear (case-insensitive) in our UA.
 */
function uaMatches(token: string, ourUa: string): boolean {
  if (token === "*") return true;
  return ourUa.toLowerCase().includes(token.toLowerCase());
}

/**
 * Parse robots.txt content into rules for a specific user-agent.
 *
 * Group selection: collect every group whose `User-agent` matches ours, preferring
 * the most specific (longest non-`*` token) over the wildcard group. Within the
 * chosen group, Allow/Disallow use longest-path-match; ties favor Allow.
 */
export function parseRobotsTxt(content: string, userAgent: string): RobotsRules {
  // Split into groups keyed by their user-agent tokens.
  type Group = { agents: string[]; rules: Rule[]; crawlDelay: number | null };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      // Consecutive user-agent lines share one group.
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value);
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) continue;

    if (field === "disallow") {
      current.rules.push({ type: "disallow", path: value });
    } else if (field === "allow") {
      current.rules.push({ type: "allow", path: value });
    } else if (field === "crawl-delay") {
      const n = Number(value);
      if (!Number.isNaN(n)) current.crawlDelay = n;
    }
  }

  // Pick the most specific matching group.
  let chosen: Group | null = null;
  let chosenSpecificity = -1;
  for (const g of groups) {
    for (const token of g.agents) {
      if (!uaMatches(token, userAgent)) continue;
      const specificity = token === "*" ? 0 : token.length;
      if (specificity > chosenSpecificity) {
        chosen = g;
        chosenSpecificity = specificity;
      }
    }
  }

  if (!chosen) return ALLOW_ALL;
  const rules = chosen.rules;
  const crawlDelaySec = chosen.crawlDelay;

  return {
    crawlDelaySec,
    isAllowed(path: string): boolean {
      let best: { allow: boolean; len: number } | null = null;
      for (const rule of rules) {
        // An empty Disallow path means "allow all"; skip — it constrains nothing.
        if (rule.type === "disallow" && rule.path === "") continue;
        if (!path.startsWith(rule.path)) continue;
        const len = rule.path.length;
        if (!best || len > best.len || (len === best.len && rule.type === "allow")) {
          best = { allow: rule.type === "allow", len };
        }
      }
      return best ? best.allow : true;
    },
  };
}

/**
 * Per-host robots.txt cache. Fetches and parses `/robots.txt` once per host,
 * then answers allow/deny + crawl-delay for subsequent URLs on that host.
 *
 * Construct one instance per pipeline run so each run re-reads robots fresh.
 */
export class RobotsCache {
  private readonly cache = new Map<string, RobotsRules>();
  constructor(private readonly userAgent: string) {}

  /** Fetch + parse robots.txt for the URL's host (cached). Failures → allow-all. */
  async rulesFor(targetUrl: string): Promise<RobotsRules> {
    let host: string;
    try {
      host = new URL(targetUrl).origin;
    } catch {
      return ALLOW_ALL;
    }
    const cached = this.cache.get(host);
    if (cached) return cached;

    let rules = ALLOW_ALL;
    try {
      const res = await fetchStatic(`${host}/robots.txt`);
      if (!res.error && res.httpStatus < 400 && res.rawBody) {
        rules = parseRobotsTxt(res.rawBody, this.userAgent);
      }
    } catch {
      rules = ALLOW_ALL;
    }
    this.cache.set(host, rules);
    return rules;
  }

  /** Convenience: is this exact URL allowed for our agent? */
  async isAllowed(targetUrl: string): Promise<boolean> {
    const rules = await this.rulesFor(targetUrl);
    try {
      return rules.isAllowed(new URL(targetUrl).pathname);
    } catch {
      return true;
    }
  }
}
