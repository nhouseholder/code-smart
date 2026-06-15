# Risks and Assumptions

**Project:** Code Smart
**Date:** 2026-06-14
**Status:** Pre-implementation — reviewed before Week 1 begins

---

## 1. Risk Register

Seven identified risks, ordered by (severity × probability).

---

### Risk 1: AA API Response Format Changes

**Severity:** High | **Probability:** Medium

**Impact:** If Artificial Analysis changes their API schema — renames fields, changes value scales, adds required parameters, or restructures the response object — `fetch-aa-indices.ts` either fails with a parse error or, worse, writes garbage data (wrong values mapped to wrong fields) into snapshot files. Garbage data is worse than missing data because it silently corrupts scores without any visible failure signal.

**Mitigation:**

1. **Zod validation at write time.** `fetch-aa-indices.ts` validates the full API response against a Zod schema (`src/lib/aa-response-schema.ts`) before writing anything to disk. If validation fails, the function throws and no snapshot file is written. The previous week's file remains intact and continues to be used by the build.

2. **Override file as fallback.** `src/data/aa-indices-override.json` holds the last known-good AA values, manually maintained. When a snapshot file cannot be written (validation failure, network error, API outage), `recompute-scores.ts` falls back to this file. It is seeded with the first successfully fetched snapshot and updated manually after any schema migration is resolved.

3. **Automated failure issue.** The `weekly-aa-fetch.yml` GH Actions workflow catches any thrown error and creates a GitHub issue (via `gh issue create`) with: the full error message, the raw API response (truncated to 2KB), the timestamp, and label `data-quality`. The issue template is at `.github/ISSUE_TEMPLATE/aa-fetch-failure.md`.

4. **Degraded UI state.** Model cards and plan cards where AA data is unavailable (null snapshot) show a yellow `"AA data unavailable"` badge instead of an `<AAIndexBadge>`. The Value Score still computes but with `uncertainty_score += 30` and a note: "AA indices missing — score is based on estimated quality only."

5. **Schema version pinning.** The Zod schema in `src/lib/aa-response-schema.ts` is versioned with a comment noting the AA API version it was written against and the date it was last confirmed working. When the schema is updated after a format change, update this comment.

**What "resolved" looks like:** Snapshot file written successfully, Zod schema updated to match new format, `aa-indices-override.json` updated with latest values, GH issue closed.

---

### Risk 2: AA Model Slugs Diverge from Model IDs

**Severity:** Medium | **Probability:** Medium

**Impact:** AA uses their own naming conventions for models (e.g., "claude-3-7-sonnet-20250219" vs. our internal ID "claude-sonnet-4"). When AA renames a model, the slug in `aa-model-slugs.json` becomes stale. `fetch-aa-indices.ts` fetches data for the wrong model or gets a 404. The affected model's AA values silently become null (or the previous stale snapshot persists).

**Mitigation:**

1. **Single slug registry.** `src/data/aa-model-slugs.json` is the only file that maps internal model IDs to AA slugs. Format: `{ "claude-sonnet-4": "claude-3-7-sonnet-20250219" }`. Changing the slug in this one file propagates to all fetch logic. There is no hardcoded slug anywhere else.

2. **404 and mismatch logging.** `fetch-aa-indices.ts` logs (to stdout, captured by GH Actions) every model whose fetch returned a 404 or whose response model name didn't match the expected slug. Log format: `[AA SLUG MISMATCH] model_id=claude-sonnet-4 slug=claude-3-7-sonnet-20250219 http_status=404`. This appears in the weekly job's output.

3. **14-day stale check.** `daily-check.yml` runs a stale check: any model with a non-null `aa_slug` in `aa-model-slugs.json` that has no snapshot entry within the last 14 days triggers a warning and creates a GH issue (label: `data-quality`). This catches slug drift before it becomes stale for more than two weeks.

4. **Weekly match summary.** The weekly fetch job outputs a summary at the end: "Matched: 22/25 models. Unmatched (404 or no data): claude-opus-4, gemini-2-0-flash, gpt-5-mini." This is visible in GH Actions logs and in the GH issue if the job creates one.

5. **`inherits_from` reference check in update checklist.** `docs/provider-registry.md` includes a checklist item: before updating a parent model's slug, run `grep -r '"inherits_from"' src/data/` to find all models that inherit from it. Update their confidence to "stale" until the parent slug is confirmed correct.

**What "resolved" looks like:** Slug updated in `aa-model-slugs.json`, fetch runs successfully, new snapshot contains the model's data, stale GH issue closed.

---

### Risk 3: Token Estimation Heuristics Are Wrong for Specific Plans

**Severity:** Medium | **Probability:** High

**Impact:** Token estimation is inherently approximate. Cursor's "500 fast requests/month" is not uniformly 500 × 4,000 tokens — it depends on request type, context length, and whether the user hits the fast limit and falls back to slow. Claude Pro's "usage limit" is deliberately opaque. GitHub Copilot Individual doesn't publish token counts at all. If the displayed estimates are significantly wrong for a specific plan, users may make purchasing decisions on bad numbers.

**Mitigation:**

1. **Confidence badges are mandatory on all estimates.** Every `<UsageEstimateRow>` shows a `<ProvenanceBadge>` with the actual confidence level. "inferred" means we applied a documented rule. "assumed" means we used a default constant. Users who hover see the rule name (e.g., "rule_3_unlimited: 80 sessions × 2,500 tokens/session").

2. **Unknown confidence = no estimate displayed.** Plans where the usage limit type is `"unknown"` show "—" for all usage columns, not a fabricated number. There are no phantom estimates. The `/methodology` page documents which plan types fall into each rule.

3. **All 8 estimation rules are public.** The `/methodology#token-estimation` page documents every rule with its formula, the assumption it rests on, and the plan types it applies to. Users can audit any estimate by reading that page.

4. **"How is this estimated?" link on every estimate.** The ⓘ icon in `<UsageEstimateRow>` links to `/methodology#token-estimation`. Users are one click from the explanation.

5. **Community corrections in v2.** A `corrections.json` file (planned for v2) will allow community-submitted adjustments: "Cursor Pro fast requests average ~3,200 tokens in practice." V1 acknowledges this gap explicitly on the methodology page: "These estimates are based on published plan limits and documented assumptions. If you have usage telemetry that contradicts these figures, [open an issue]."

**What "resolved" looks like:** For any plan where evidence exists that the estimate is wrong, update the relevant constant in `src/lib/usage-estimator.ts`, add a comment with the source, and update the confidence from "assumed" to "inferred" or "observed".

---

### Risk 4: Proxy Model Inheritance Creates Stale Scores

**Severity:** Medium | **Probability:** Low

**Impact:** Several plans use models that don't have direct AA entries — they're proxied through a provider (e.g., Cursor uses Claude Sonnet under the hood). These models have `inherits_from: "claude-sonnet-4"` in the provider JSON. When Anthropic releases claude-sonnet-4-7, Cursor's inherited AA data still reflects claude-sonnet-4-6. The inheritance chain doesn't auto-update. Users may see scores for "Cursor Pro" that reflect a model version Cursor replaced weeks ago.

**Mitigation:**

1. **Single-level inheritance only.** No model can inherit from a model that itself uses `inherits_from`. This prevents silent cascading staleness where A inherits B inherits C — a chain where C going stale propagates to both A and B without any direct signal.

2. **Parent staleness propagates to children.** When a parent model's AA snapshot is stale (>14 days old), all models with `inherits_from` pointing to that parent are also flagged stale in the computed scores. Their `confidence` drops to "stale".

3. **Inheritance logged in weekly fetch.** The weekly fetch job outputs: `[INHERITANCE] cursor-claude-sonnet inherits from claude-sonnet-4 (last snapshot: 2026-06-09, age: 5 days)`. This makes it easy to spot when inherited data is aging.

4. **"inferred" confidence is always displayed.** Inherited scores always carry `confidence: "inferred"` — never "observed". The `<AAIndexBadge>` confidence dot (blue for inferred) is always visible. Users who understand the confidence system know it's derived.

5. **Update checklist in `docs/provider-registry.md`.** When a parent model slug is updated (see Risk 2 mitigation #5), the checklist includes: "Search for all `inherits_from` references to the old model ID. Update them or flag them for manual review. Re-run `scripts/recompute-scores.ts` after updating."

**What "resolved" looks like:** `aa-model-slugs.json` updated with the new model version, `inherits_from` references updated in provider JSON files, `scripts/recompute-scores.ts` re-run, new computed-scores.json committed.

---

### Risk 5: CF Workers Bundle Size

**Severity:** Medium | **Probability:** Low

**Impact:** CF Workers has a compressed bundle size limit (~1MB). If the bundle exceeds this, `wrangler versions upload` fails at deploy time. The previous deployment remains live but the new one cannot be published.

**Mitigation:**

1. **No new npm dependencies.** The implementation plan explicitly requires no new npm packages — no DB drivers, no chart libraries, no new utility libraries. `<BenchmarkSparkline>` is native SVG. Data reads are direct JSON imports. This is the primary defense.

2. **Dry-run bundle size check before every deploy.** The deploy step in `weekly-aa-fetch.yml` and the manual deploy workflow both run `npx wrangler versions upload --dry-run` first. This reports the compressed bundle size in the output. If it exceeds 800KB (below the 1MB limit), the job fails with a warning before attempting a real deploy.

3. **JSON files are assets, not bundle.** `src/data/computed-scores.json` and `src/data/aa-snapshots/*.json` are Next.js static assets imported via `import()` — they are served by CF's asset pipeline, not bundled into the worker JS. This is the largest data payload and must remain outside the worker bundle.

4. **Dynamic imports as escape valve.** If the bundle does grow beyond the limit in the future, `/compare` and `/models` are the heaviest pages (most component code). Converting them to `next/dynamic` imports defers their code from the initial bundle. This is the first optimization step if needed.

5. **Monitor in CI.** The deploy workflow prints the bundle size on every run. If it trends upward (e.g., 400KB → 600KB over 4 weeks), investigate before it becomes a blocker.

**What "resolved" looks like:** Bundle stays below 800KB. If it grows, apply dynamic imports. If a deployment fails due to bundle size, do not merge new feature code until the bundle is reduced.

---

### Risk 6: Provider Pricing Changes Between Scrapes

**Severity:** Medium | **Probability:** High

**Impact:** AI subscription pricing is volatile. A provider raises prices (e.g., Cursor Pro goes from $20/mo to $25/mo), but the JSON file still shows $20. Users see incorrect prices. Value Scores are computed on stale pricing, potentially ranking the plan above its true value.

**Mitigation:**

1. **90-day staleness policy (existing).** `stale-check.ts` flags any plan where `last_verified` is older than 90 days. This runs daily via `daily-check.yml`. The output lists all stale plans and creates a GH issue (label: `data-quality`) if any are found. The threshold is 90 days — pricing typically holds for at least that long, but this catches quarterly pricing cycles.

2. **Playwright price comparison script.** `scripts/fetch-provider.ts` (Playwright) can scrape a provider's pricing page and compare the fetched price against the JSON value. On a mismatch of >5%, it outputs a diff report for manual review. This is run manually when a provider announces pricing changes, or as part of a monthly manual audit.

3. **Stale confidence badge on plan cards.** When `plan.pricing_confidence === "stale"`, `<PlanCard>` shows a red "Pricing stale" badge in the card header. The Value Score for stale-priced plans adds `uncertainty_score += 25` and a note: "Pricing confidence: stale — verify at {provider.pricing_url}".

4. **Direct link to official pricing.** `pricing_url` is a required field in the provider JSON schema. Every plan card footer links directly to the official pricing page. Users can always verify current pricing at the source. This is the last line of defense against stale data misleading a purchase decision.

5. **Version-tracked JSON files.** All provider JSON files are committed to git. When a price changes, the git history shows exactly when it was updated and what it changed from. This creates an audit trail.

**What "resolved" looks like:** Provider JSON updated with new price, `last_verified` set to today's date, `pricing_confidence` set to "observed", `scripts/recompute-scores.ts` re-run, stale badge removed from plan card.

---

### Risk 7: Git History Grows Large from Weekly Snapshot Files

**Severity:** Low | **Probability:** Low

**Impact:** One snapshot file per week at ~15KB each = ~780KB/year. After 5 years: ~3.9MB of snapshot data in git history. This is manageable but could slow fresh clones on slow connections or increase CI checkout time slightly. It is not a near-term problem.

**Mitigation:**

1. **Current verdict: do nothing.** At the current growth rate, this is not a concern for at least 5 years. The monitoring plan is: check repository size at Year 2 and reassess.

2. **Git LFS as escape valve.** If repository size becomes problematic, add `.gitattributes` to route `src/data/aa-snapshots/*.json` through Git LFS: `src/data/aa-snapshots/*.json filter=lfs diff=lfs merge=lfs -text`. LFS stores file contents outside the main git object store. GH Actions has LFS support. CF Workers static asset pipeline works with LFS-tracked files after checkout.

3. **Rolling 12-month retention.** Alternatively, add a cleanup step to the weekly GH Actions job: delete snapshot files older than 52 weeks (keeping the most recent 52 files). This caps the repository growth at ~780KB steady-state. Side effect: `<BenchmarkSparkline>` loses data older than 1 year, but 12 months of trend data is sufficient for the UI.

4. **Build is not affected by retention.** The build only reads the most recent snapshot file and the last 12 for sparklines. Deleting files older than 52 weeks has no effect on build output.

**What "resolved" looks like:** This risk is passive. No action needed at Week 1. Revisit at Year 2 of the project.

---

## 2. Assumptions Register

Six assumptions that the scoring model, usage estimates, and tier boundaries rest on. Each is falsifiable.

| # | Assumption | Value | Basis | Falsified When |
|---|-----------|-------|-------|----------------|
| 1 | Tokens per message (chat plans) | 2,000 tokens/message | ~300 tokens input (coding question + short code snippet) + 1,700 tokens output (explanation + code sample). Weighted toward shorter queries to represent message-limited free tiers conservatively. | A provider publishes average token/message telemetry showing a significantly different number. Update `TOKENS_PER_MESSAGE` constant in `src/lib/usage-estimator.ts` with the source cited in a comment. |
| 2 | Tokens per request (IDE agent plans) | 4,000 tokens/request | ~2,000 tokens of codebase context input (open files, cursor position, recent edits) + ~2,000 tokens of generated output (code changes, explanations). Represents agentic composer operations, not autocomplete completions. Autocomplete requests are excluded — they're an order of magnitude smaller and most plans don't count them. | Community measurement data or provider disclosure shows a materially different average for agentic IDE requests. Update `TOKENS_PER_AGENT_REQUEST` in `src/lib/usage-estimator.ts`. |
| 3 | Working sessions per month | 80 sessions/month | 4 sessions/day × 5 days/week × 4 weeks. A "session" is one focused AI-assisted coding block (a contiguous period of active use, not just having the editor open). This represents a full-time developer. Part-time users would scale down proportionally. | A developer survey or usage study shows a substantially different typical session count. Consider adding a user-adjustable sessions/month input in v2 of the UI rather than changing the default. |
| 4 | Unlimited plan monthly token cap | 200,000 tokens | 80 sessions × 2,500 tokens/session average. Represents the "reference developer profile" — typical use, not maximum possible. Not intended to model power users who run multi-hour agentic sessions. Plans marketed as "unlimited" still have rate limits; this estimate models typical use against those limits, not theoretical maximum. | Evidence emerges that a typical developer regularly exceeds 200K tokens/month on an unlimited plan (e.g., community telemetry, public usage data). Raise the cap constant in `src/lib/usage-estimator.ts` and re-run `recompute-scores.ts`. Cite the source in the commit message. |
| 5 | Speed Score upper anchor | 200 tps | Fastest frontier models available as of June 2026 are in the 150–200 output tokens/second range per Artificial Analysis speed benchmarks. Setting the anchor at 200 tps means the current fastest models score ~75–100 on the Speed axis, and slower models score proportionally lower. If the anchor were too low, all fast models would score 100 and the dimension would lose discrimination power. | A model is confirmed to exceed 200 tps in AA benchmarks. Recalibrate the divisor: `SPEED_ANCHOR_TPS` in `src/lib/usage-estimator.ts`. Re-run `recompute-scores.ts`. Log the recalibration as a comment in the constant definition: `// Updated from 200 to 280 on 2027-03-15 when [model] hit 267 tps (AA snapshot 2027-03-10)`. |
| 6 | Price tier boundaries | Low: $20–$30 / Mid: $30–$80 / High: >$80 | Current market clustering as of June 2026: entry AI subscriptions cluster at $20–$30 (Claude Pro $20, ChatGPT Plus $20, Cursor Pro $20); business tools cluster at $30–$80 (GitHub Copilot Business $39, Cursor Business $40); power user / high-volume plans are above $80 (Claude Max $100, ChatGPT Pro $200). The tier normalization of Value Score is only meaningful within a tier — comparing a $20 plan to a $200 plan on the same scale is not useful to a buyer. | Significant pricing shifts change the natural market clusters — e.g., if entry-tier plans move to $35–$50. Adjust `TIER_LOW_MAX`, `TIER_MID_MAX` in `src/lib/recompute-scores.ts` and re-run the full recompute. This will change all normalized scores — document the change in CHANGELOG.md and note the effective date. |

---

## 3. Prerequisites Before Implementation

All items below must be in place before Week 1 begins. Items marked ⚠ require an action.

| Item | Status | Required Action |
|------|--------|----------------|
| `AA_API_KEY` | Confirmed in `~/.claude/credentials/master.env` | Add to GitHub Actions repository secrets: `gh secret set AA_API_KEY --repo nhouseholder/code-smart` |
| `data-quality` GitHub label | Not yet created | `gh label create "data-quality" --color "fbca04" --description "Data pipeline or staleness issue" --repo nhouseholder/code-smart` |
| `GH_PAT` with `repo` write scope | Not yet generated | Generate at github.com/settings/tokens (classic, `repo` scope). Then: `gh secret set GH_PAT --repo nhouseholder/code-smart` |
| `CLOUDFLARE_API_TOKEN` | Check master.env | If present: `gh secret set CLOUDFLARE_API_TOKEN --repo nhouseholder/code-smart`. Required for the deploy step in weekly job. |
| No new npm packages | Confirmed by design | No installation step. Verify with `cat package.json` before Week 1 to confirm baseline, then do not add packages during implementation. |
| `src/data/aa-snapshots/` directory | Must exist before first fetch | `mkdir -p "/Volumes/Extreme Pro/ProjectsHQ/code-smart/src/data/aa-snapshots"` — add a `.gitkeep` so it's tracked. |
| `aa-indices-override.json` initial seed | Must exist before recompute | Written manually during Week 1 after first successful AA fetch. Until then, `recompute-scores.ts` gracefully skips AA dimensions (scores compute without AA, all AA confidence = "unknown"). |

---

## 4. Implementation Sequencing (6 Weeks)

Week-by-week delivery plan from current state to fully deployed. Each week has concrete, verifiable deliverables.

### Week 1: AA Data Foundation

**Goal:** AA data can be fetched, validated, and stored. The first snapshot exists.

**Deliverables:**

1. `src/data/aa-model-slugs.json` — all 25+ models mapped to their AA slugs. Populated by cross-referencing the AA API with existing provider JSON.
2. `src/lib/aa-response-schema.ts` — Zod schema for the AA API response. Reflects the actual API shape as of this week.
3. `scripts/fetch-aa-indices.ts` — fetches AA data, validates against Zod schema, writes to `src/data/aa-snapshots/YYYY-MM-DD.json`. Handles 404s (per Risk 2 mitigation), network errors (retry 3× with exponential backoff), and schema failures (write nothing, log error).
4. `src/data/aa-indices-override.json` — manually seeded with the first snapshot's values. This is the fallback for any future fetch failures.
5. `src/data/aa-snapshots/2026-06-16.json` — the first real snapshot, committed to the repository.
6. Manual verification: `node scripts/fetch-aa-indices.ts` runs without errors locally, output file contains values for all mapped models.

**Blocked on:** AA API key available in environment (`source ~/.claude/credentials/master.env && echo $AA_API_KEY`).

---

### Week 2: New Scoring Formula

**Goal:** The new WMQ + QAMU + ValueScore formula is implemented, tested, and produces a valid `computed-scores.json`.

**Deliverables:**

1. `src/types/index.ts` — updated with new types: `AAIndexSnapshot`, `UsageEstimate`, `ValueScore` (expanded with `uncertainty_score`, `notes`, `aa_coding_index`, `aa_agentic_index`, `speed_tps`, `tokens_per_month`, `value_score_normalized`). All changes additive and backward-compatible.
2. `src/lib/usage-estimator.ts` — implements all 8 token estimation rules. Each rule is a named function with its assumption documented in a comment. Exports `estimateUsage(plan: Plan, provider: Provider): UsageEstimate`.
3. `src/lib/value-scorer.ts` — implements WMQ, QAMU, and ValueScore computation. Tier normalization: computes raw scores for all plans in a tier, then normalizes to 0–100 within each tier. Exports `computeScore(plan: Plan, provider: Provider, aa: AAIndexSnapshot | null): ValueScore`.
4. `scripts/recompute-scores.ts` — reads all provider JSON + latest AA snapshot, calls `computeScore` for every plan, writes `src/data/computed-scores.json`. Prints a summary: "Computed scores for N plans across M providers. AA data available for K models."
5. `src/data/computed-scores.json` — generated and committed. Contains all plans with scores.
6. Tests: new test file `tests/value-scorer.test.ts` covering WMQ weights sum to 1, null AA input returns computed score with lower confidence, tier normalization produces values in 0–100 range, `formatTokens` null input returns "—".
7. All existing tests pass: `npx vitest run`.

**Blocked on:** Week 1 complete (`aa-model-slugs.json` exists, first snapshot exists).

---

### Week 3: API Routes

**Goal:** All 7 API routes are implemented and respond correctly.

**Deliverables:**

1. `src/app/api/providers/route.ts` — supports `?tier=` and `?maxPrice=` filters.
2. `src/app/api/providers/[id]/route.ts`.
3. `src/app/api/plans/route.ts` — supports `?tier=`, `?maxPrice=`, `?sort=` with all documented sort keys.
4. `src/app/api/models/route.ts` — supports `?sort=` with all documented sort keys.
5. `src/app/api/models/[id]/route.ts` — includes `aa_history` (last 12 snapshots for the model).
6. `src/app/api/scores/top-by-tier/route.ts`.
7. `src/app/api/health/route.ts` — returns version (from `package.json`), `aa_last_fetched` (most recent snapshot filename), `scores_computed_at`, `providers_count`.
8. All handlers use `export const revalidate = 3600`.
9. Manual verification: each route tested with `curl localhost:3000/api/...` against a local `next dev` server.

**Blocked on:** Week 2 complete (`computed-scores.json` exists and is valid).

---

### Week 4: Frontend — Model Pages

**Goal:** `/models` and `/models/[id]` are implemented and render correctly with real data.

**Deliverables:**

1. `src/components/AAIndexBadge.tsx` — server component, all color/confidence/tooltip rules implemented.
2. `src/components/UsageEstimateRow.tsx` — server component, all token formatting rules implemented.
3. `src/components/UncertaintyScore.tsx` — server component, renders only when score > 50.
4. `src/components/ModelCard.tsx` — server component, `variant="default"` and `variant="with-aa"`.
5. `src/components/ModelTable.tsx` — client component, sortable, null-values-to-bottom behavior, all 11 columns.
6. `src/components/BenchmarkSparkline.tsx` — client component, native SVG, hover tooltip, "Not enough history" fallback.
7. `src/app/models/page.tsx` — SSG page using `<ModelFilterBar>` and `<ModelTable>`.
8. `src/app/models/[id]/page.tsx` — SSG page with `generateStaticParams`, renders all sections.
9. `src/app/models/[id]/page.tsx` includes `<SparklineSection>` that passes the last 12 snapshot entries for the model.
10. Manual verification: `npm run build` succeeds. Routes render at `localhost:3000/models` and `localhost:3000/models/claude-sonnet-4`.

**Blocked on:** Week 3 complete (API routes exist for data sourcing, though pages also import JSON directly).

---

### Week 5: Frontend — Remaining Pages + Deploy

**Goal:** All 6 routes exist, navigation is updated, existing components are updated, first CF deploy is live.

**Deliverables:**

1. `src/components/ComparePicker.tsx` — client component, max-6 enforcement, URL query sync.
2. `src/components/CompareMatrix.tsx` — client component, all rows, difference highlighting.
3. `src/app/compare/page.tsx` — SSG shell with `<CompareClient>`.
4. `src/components/FormulaBlock.tsx` — server component, 3-equation chain with tooltips.
5. `src/app/methodology/page.tsx` — SSG page with all sections.
6. `src/components/PlanCard.tsx` — updated with `<UsageEstimateRow>`, `<UncertaintyScore>`, model chip links, AA snapshot date footer, `compact` prop.
7. `src/components/ComparisonTable.tsx` — updated with 5 new rows, updated Value Score label and footnote.
8. `src/components/FilterBar.tsx` — updated with model filter, normalized sort key.
9. `src/components/Hero.tsx` — updated with "Models tracked" stat, updated methodology one-liner.
10. `src/app/layout.tsx` — updated nav (4 links), updated footer (3 data freshness fields + Methodology link).
11. `src/components/TierTopTen.tsx` — server component with 3 tier sections.
12. First CF deploy: `npx wrangler versions upload` → `npx wrangler versions deploy <UUID>@100%`. Live URL confirmed via `curl`.
13. `/api/health` response verified on production URL.

**Blocked on:** Week 4 complete. CF deploy credentials available.

---

### Week 6: Automation + Polish

**Goal:** Weekly AA fetch is automated, test coverage is expanded, deployment is verified end-to-end, handoff is written.

**Deliverables:**

1. `.github/workflows/weekly-aa-fetch.yml` — cron `0 6 * * 1` (Monday 6am UTC). Steps: checkout → install → `fetch-aa-indices.ts` → `recompute-scores.ts` → commit + push data files → wrangler split-deploy. On failure: `gh issue create --label data-quality`.
2. `.github/ISSUE_TEMPLATE/aa-fetch-failure.md` — issue template for AA fetch failures.
3. `.github/workflows/daily-check.yml` extended — add stale-check step for AA staleness (>14 days per Risk 2 mitigation).
4. `src/components/TierTopTen.tsx` integrated on homepage — placed between `<ComparisonTable>` and footer.
5. Test coverage expanded:
   - `tests/usage-estimator.test.ts` — all 8 rules, null outputs for "unknown" plans.
   - `tests/aa-fetch.test.ts` — Zod schema validation (valid response passes, missing field fails, wrong type fails).
   - `tests/score-normalization.test.ts` — tier normalization produces 0–100 range, all-null AA input is handled.
6. `npm run build` clean (no warnings on new pages).
7. Live deploy verified: all 6 routes return 200, `/api/health` shows current AA snapshot date and computed-at timestamp.
8. `handoffs/2026-07-XX-week6-complete.md` written — covers: what was built, how the weekly job works, how to update provider data, known gaps, next priorities.

**Blocked on:** Week 5 complete. GH Actions secrets configured (see Prerequisites section).
