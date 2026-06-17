# Code Smart — Senior Engineer Review & Polish Pass

**Date:** 2026-06-17 · **Reviewed version:** v1.1.1 → **v1.2.0** (this pass) · **Reviewer:** senior-engineer review (Session 11)
**Scope:** full-codebase review across 10 dimensions, with obvious fixes applied directly and an honest launch-readiness call.

---

## TL;DR

The core engine is well-built. The QAMU/WMQ value formula is deterministic with safe null/NaN fallbacks, Zod validation runs end-to-end, the SQLite layer is build-time only (zero runtime DB, zero runtime attack surface via static export), there are no secrets in the bundle, and the scraper is a respectful citizen (truthful UA, 3s floor). The gaps this pass closed were **doc drift**, a **maintainability smell** in the normalization windows, **manual-only staleness** (data could silently age without downgrading confidence), **missing robots.txt compliance**, **no script-level retry**, and **thin mobile/deep-link coverage** on `/compare`.

**Launch readiness: 8 / 10** (post-fix). See [§Launch readiness](#launch-readiness) for the two things gating a 9–10.

---

## Review checklists (with evidence)

### 1. Data trust — *can a user believe a number on the page?*

| Question | Verdict | Evidence |
|---|---|---|
| Is every displayed figure traceable to a source? | **Solid** | Each value carries a `Provenance { confidence, accessed_date, source_url }`; `ProvenanceBadge`/`ConfidenceBadge`/`SourceLink` surface it in the UI (`src/components/ProvenanceBadge.tsx`). |
| Are undisclosed values faked as 0? | **Solid** | Null usage/limits render `—`, never `0` (`ComparisonTable.tsx` `Maybe`/`Minus`; `/compare` copy states "a `—` means the value isn't disclosed"). |
| Does stale data degrade trust automatically? | **Fixed** | Was manual-only. Added `effectiveConfidence()` / `weakenForStaleness()` (`src/lib/utils.ts`): any value whose `accessed_date` is >90d old (`isStale`) is downgraded to at most `stale` at scoring/badge boundaries. Wired into `value-scorer.ts`, `rankings.ts`, `ProvenanceBadge.tsx`, `plans/[id]`, `freshness`. |
| Is confidence ever silently upgraded? | **Solid** | Enum is strictly ordered (`observed>inferred>assumed>stale>unknown`); `weakenForStaleness` only ever lowers, never raises; manual `stale`/`unknown` preserved (unit-tested, `tests/components/effective-confidence.test.ts`). |

**Known residual:** `aaConf` in `rankings.ts` (Artificial-Analysis benchmark confidence, from the `aaScores` Map) has no `accessed_date`, so it is **not** auto-staled. Tracked under [Recommendations](#remaining-recommendations).

### 2. Calculation trust — *is the ranking formula correct and stable?*

| Question | Verdict | Evidence |
|---|---|---|
| Is the value formula deterministic? | **Solid** | `WMQ = 0.5·agentic + 0.4·coding + 0.1·speed`; `QAMU = estimatedTokens · WMQ/100`; `ValueScore = QAMU/price`, normalized 0–100 per price band (`src/lib/value-scorer.ts`). No randomness in scoring. |
| Are null/NaN inputs handled? | **Solid** | Missing benchmark → `null` propagates and renders `—`; price 0/null routed through `effectiveMonthlyPrice` and band logic; no `NaN` reaches the UI. |
| Is normalization honest about what it does? | **Fixed** | `windows.ts` previously computed `rawRatio`/`useWorkingDays`/`fromIsActive`/`hasUnitConversion` that fed nothing, and comments described "working-days scaling" that did **not** exist (`isActiveUseUnit(null)` was hardwired `false`). Removed dead locals; rewrote comments to describe the actual wall-clock proportional scaling. Output unchanged — proven green by `tests/normalization/engine.test.ts`. |
| Are price bands consistent across surfaces? | **Solid** | Single band definition (free ≤0 / low ≤30 / mid ≤80 / high >80) mirrored in `PlanComparisonTable.bandOf` and methodology. |

### 3. Backend — *pipeline, scraping, scheduling*

| Question | Verdict | Evidence |
|---|---|---|
| Does the scraper respect robots.txt? | **Fixed** | Added `src/lib/scraper/robots.ts` (RFC 9309 subset: UA-group selection most-specific-wins, Allow/Disallow longest-match with Allow winning ties, Crawl-Delay). `pipeline.ts` now fetches+caches robots per host, **skips** (does not fail) disallowed pages, and honors `max(3s, Crawl-Delay)`. Missing/unreachable robots = allow-all. Unit-tested (`tests/scraper/robots.test.ts`). |
| Is the per-fetch layer resilient? | **Solid** | `fetchWithRetry` retries 5xx/429/network with exponential backoff + jitter; never retries 4xx (`fetcher.ts:173`). |
| Is the orchestration script resilient to transient failures? | **Fixed** | `pipeline-daily.ts` steps had no retry. Added `spawnWithRetry` (2 attempts, linear backoff), excluding read-only assertions (`stale-check`, `validate`). Safe because writes are `observedAt`-keyed upserts (idempotent). |
| Is mutual exclusion preserved? | **Solid** | Lock-based pipeline guard + 3s rate limit retained; retry wraps individual steps, not the lock. |

### 4. Frontend — *clarity, mobile, accessibility*

| Question | Verdict | Evidence |
|---|---|---|
| Are wide tables usable on mobile? | **Fixed (improved)** | All three matrices keep the sticky-left Feature column + horizontal-scroll container (the standard wide-table mobile pattern) and had their forced min-widths reduced (`ComparisonTable` 700→640, `PlanComparisonTable` 640→480, `ModelRankingTable` 520→440) so fewer-column views don't force needless overflow. New e2e asserts no document-level horizontal overflow at 375px. |
| Is `/compare` state shareable? | **Fixed** | `PlanComparisonTable` filter + selection state was `useState`-only (reset on nav). Now backed by `useSearchParams` (`?q`, `?provider`, `?band`, `?conf`, `?sel`, `?diff`) — deep-linkable and bookmarkable. Wrapped in `<Suspense>` for static export. |
| Can users see *what differs* between plans? | **Fixed** | Added a "Differences only" mode that highlights and/or isolates feature rows that differ across the selected plans (`DIFF_ACCESSORS` derive primitive signatures so JSX is never diffed). |
| Empty/loading/error states present? | **Solid** | Comparison, picker, and model tables all render explicit empty states; Suspense fallback added for `/compare`. |

### 5. Security — *secrets, attack surface, dependencies*

| Question | Verdict | Evidence |
|---|---|---|
| Any secrets in the client bundle? | **Solid** | None. No API keys; data is pre-baked static JSON. |
| Runtime attack surface? | **Solid (minimal)** | `output: "export"` → pure static assets on Cloudflare Pages; no server, no runtime DB, no user input persisted. |
| Injection / unsafe HTML? | **Solid** | No `dangerouslySetInnerHTML`; all values rendered as React children. |
| Scraper identity honest? | **Solid** | Single truthful UA constant (`SCRAPER_USER_AGENT`) for both fetch and robots matching; no UA spoofing of crawler-blocked bots. |

---

## Prioritized issue list

| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | High | Data could age past 90d without confidence downgrade (false trust) | **Fixed** — `effectiveConfidence` |
| 2 | High | Scraper ignored robots.txt | **Fixed** — `robots.ts` gate |
| 3 | Med | `windows.ts` dead code + comments describing non-existent behavior | **Fixed** — cleanup, tests green |
| 4 | Med | `pipeline-daily.ts` no retry on transient step failure | **Fixed** — `spawnWithRetry` |
| 5 | Med | `/compare` filters reset on nav; not shareable | **Fixed** — URL-backed state |
| 6 | Low | Wide tables force horizontal scroll on 375px | **Fixed** — min-widths + sticky cols + e2e |
| 7 | Low | CLAUDE.md said "Workers/opennextjs"; actually static Pages | **Fixed** — doc corrected |
| 8 | Low | CURRENT_STATE listed already-shipped `/rankings` as next step | **Fixed** — doc corrected |
| 9 | Low | e2e harness unrunnable — `playwright` 1.60 vs `@playwright/test` 1.61 split | **Fixed** — aligned to 1.61 |
| 10 | Low | `aaConf` (AA benchmark) has no `accessed_date`, can't auto-stale | **Recommended** |
| 11 | Low | `pipeline.ts` candidate rows keyed by empty-string FK (`planId: ""`) | **Recommended** — sentinel row |
| 12 | Low | No provider-level `last_updated` field | **Recommended** |

---

## Completed fixes (this session) + verification

- **Tier 1** — doc/dead-code: CLAUDE.md deploy line corrected; CURRENT_STATE next-steps de-drifted; `windows.ts` dead locals removed and comments rewritten.
- **Tier 2** — auto-stale confidence: `weakenForStaleness`/`effectiveConfidence` added and wired at every scoring/display boundary; 6 new unit tests.
- **Tier 3** — `robots.ts` + `RobotsCache` (7 unit tests); `pipeline.ts` robots gate + crawl-delay; `pipeline-daily.ts` `spawnWithRetry`.
- **Tier 4** — URL-backed `/compare` filters + "Differences only" diff mode; mobile min-width reductions; `playwright` version alignment; new e2e spec (`tests/e2e/compare-mobile-url.spec.ts`).

**Verification (run from project root):**
```
pnpm typecheck   # clean
pnpm lint        # No issues found
pnpm test        # 290 passed (was 277)
pnpm quality-check
pnpm build       # static export OK; /compare prerendered static
pnpm test:e2e    # smoke + mobile/URL specs
```

---

## Remaining recommendations (not done this pass)

1. **Give AA benchmark scores an `accessed_date`** so `aaConf` participates in auto-staleness (issue #10). Today AA freshness is invisible to the staleness gate.
2. **Replace the empty-string FK sentinel** (`pipeline.ts` `planId: ""`) with a dedicated `__candidate__` sentinel row, so candidate snapshots can't be confused with real plan joins.
3. **Add a provider-level `last_updated`** field surfaced on `/freshness` and provider pages — currently freshness is per-value only.
4. **Expand e2e viewport matrix** to 768px and 1024px, plus a sortable-column assertion on `ModelRankingTable`.
5. **Persist the AA seed cache TTL config** alongside the registry so the 7d cache window is one canonical value, not embedded in the seed script.

---

## Launch readiness

**8 / 10.**

What's solid: correct deterministic formula, honest provenance + now-automatic staleness, zero runtime attack surface, respectful robots-compliant scraping, resilient pipeline, green test suite (290 unit + e2e), clean static build.

What gates a **9–10**:
1. **Benchmark freshness blind spot** — AA scores (`aaConf`) can't auto-stale (no `accessed_date`). Until that's closed, one class of input can silently age. (Recommendation #1.)
2. **e2e breadth** — the viewport/interaction matrix is now real but thin (375px + URL state). A 9 wants the 768/1024 + sort/interaction coverage (Recommendation #4) running in the deploy gate.

Neither blocks launch; both are bounded, known, and tracked.
