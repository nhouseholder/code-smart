# code-smart — Current State

**Version:** 1.8.0
**Updated:** 2026-06-17
**Branch:** main

---

## What just shipped

Session 13 — Provider usage limit estimation (v1.8.0).

- **OpenAI Plus**: 160 messages/3h rolling window (official) → 6M tokens/month. New `messages_per_period` limit type + `reset_window` field added throughout schema/seed/engine.
- **Anthropic Pro/Max**: 45/225 messages/5h (community-observed, `confidence: "assumed"`) → 90K/450K tokens/month.
- **Cursor Pro**: $20/mo compute allowance (official) → 133K–10M token range via Layer 5 USD credits. 0 token estimates rendered because cursor-pro.json has no models listed (pre-existing data gap).
- **Engine**: Added `"3h"` to `ResetWindow`, `WINDOW_HOURS`, `extrapolateToMonthly` (active-hours wall-clock: 20 days × 5h/day / 3h = 33.3 windows/mo), and Layer 7 valid windows. `NORMALIZATION_METHODOLOGY_VERSION` bumped to `"1.2.0"`.
- **Stale check**: Tiered freshness — `assumed` entries expire at 30 days (vs 90 for observed/inferred).
- **State:** 323 tests pass, typecheck clean, build green, deployed to code-smart.pages.dev.

## What's next

- **Cursor Pro models**: Add model list to `cursor.json` so USD credits → token estimates render on `/plans/cursor-pro`.
- **Google Gemini Advanced**: No absolute usage anchor; only shows "—" — needs Google to publish a message/token cap.
- **Copilot Business/Enterprise**: No per-seat credit allotment published; credits→tokens blocked.
- **OpenAI Free**: Community reports ~10–30 msgs/day (unofficial); blocked without official source.
- **Confidence improvement**: `anthropic-pro` / `anthropic-max` estimates are `assumed` (30-day stale threshold) — upgrade to `observed` when Anthropic publishes official limits.

---

## Prior — Session 12 — USD credits conversion + methodology page fix (v1.7.0).

- **USD credits conversion (normalization Layer 5):** New `usd_credits_per_month` limit type added to `schema.ts`. Engine Layer 5a converts monthly dollar credit budgets to token estimates using published model API output rates (conservative $75/MTok Opus → base $20/MTok avg → optimistic $10/MTok GPT-4o). Uncertainty range spans cheapest→most expensive model on the plan.
- **Layer 5/6 bug fixed:** Engine was checking `"credits"` and `"compute_units"` but schema uses `"credits_per_month"` / `"compute_units_per_month"` — layers were unreachable. Fixed; tests updated.
- **GitHub Copilot data updated:** `copilot-individual` → $15/mo AI credits (was null/stale), `copilot-pro-plus` → $70/mo, new `copilot-max` plan added ($100/mo, $200/mo AI credits). Source: github.com/features/copilot/plans verified 2026-06-17.
- **Plan detail UI:** Usage limit value cell now shows notes as italic subtext under "—" when type=unknown or value=null.
- **Methodology page pre-existing bug fixed:** All string literals used Unicode curly quotes (U+201C/201D) as TypeScript delimiters — replaced 62 occurrences with ASCII quotes. Added USD credits as Layer 5 in the normalization table (8 layers total).
- **State:** 323 tests pass, typecheck clean, build green.

## What's next

- **Home chart (v1.6.0):** `src/components/ValueByTierChart.tsx` + mounted in `src/app/page.tsx` — "Model quality by price tier" bar chart (Budget ≤$15 / Standard $16–49 / Premium ≥$50), 10 plans, WMQ metric, all observed.
- **byQualityPerBand ranking:** `src/lib/rankings.ts` computes plan×model WMQ rows directly from global AA scores (bypasses same-provider model restriction so cursor/copilot cross-provider refs work); threaded through `schema.ts`, `data-loader.ts`, `generate-rankings.ts`. New tier boundaries in `getPriceBand()`.
- **Model catalog refresh (v1.5.0):** `scripts/fetch-aa-current-models.ts` — 10→34 models, all ≤6mo (cutoff 2025-12-17), real AA data; `isCurrentModel()` recency filter in `data-loader.ts`; new providers `xai.json`/`deepseek.json`; `seed-aa-scores.ts` now reads `src/data/aa-scores.json` (real coding index, observed). `src/db/seed.ts` made two-pass so cross-provider plan refs resolve the FK.
- **Plan scoping (v1.4.0):** `isInScopePlan()` loader filter (paid individual/pro only); "unlimited" coding limit banned.
- **Copilot Pro+ $39** added (fetch-verified) to `github-copilot.json`.
- **State:** 323 tests pass, 0 quality-check errors, typecheck + lint clean, build green.

## Key constraint discovered this session

Providers don't publish absolute coding usage caps (Copilot=USD credits, Claude=relative 5x/20x, Cursor/ChatGPT=none/403), so honest **value-per-dollar can't be computed** — the home chart uses **WMQ (model quality)** instead. Seeding fabricated limits was explicitly declined.

---

## What's next

1. Real value-per-dollar chart — only viable if absolute coding limits become sourceable; revisit `src/lib/normalization/engine.ts` (already handles requests/messages/credits→tokens) when data exists.
2. Premium tier is thin (1 plan) — add fetch-verifiable premium individual plans (Claude Max 20x, ChatGPT Pro, Cursor Ultra, Gemini Ultra) when prices are confirmable from source.
3. Wire `BenchmarkSparkline` AA-snapshot history (multiple `aa-scores.json` observations over time).
4. Frontend/mobile e2e coverage — viewport tests (375/768/1024) for the new `ValueByTierChart`.

---

## Prior — Session 10 — QA, Testing, Observability (v1.1.1)

Production-readiness layer: `scripts/data-quality-check.ts` (9 checks), `src/lib/logger.ts`, Playwright smoke tests, CI steps, `docs/ENVIRONMENT.md`+`docs/DEPLOYMENT.md`. Real AA coding/agentic indices (a then-open item) were delivered in Session 11.

---

## Prior — Session 9 — User-Facing Website (v1.1.0)

8 pages over the data engine, ~20 components, uncertainty/provenance UX, Framer Motion. 240 tests, 70 static pages. **Post-ship investigation:** the reported `/data/api/*.json` "schema-shape transform" was a **false alarm** — a local RTK token-compression artifact. Origin serves correct raw JSON.

---

## Prior — Session 8 — Ranking Engine

Replaced the placeholder single-list ranking with the **10 required rankings**, persisted to DB with a methodology version and exposed via `rankings.json`.

- `src/lib/rankings.ts` — rewrote core: `computeAllRankings()` (pure/deterministic) produces the 8-view `RankingSet`; `getPriceBand()` switched to §8 bands (free / low $0.01–30 / mid $30.01–80 / high >$80); new `RANKINGS_METHODOLOGY_VERSION = "1.0.0"`; removed the `computeRankings` placeholder.
- `src/db/helpers.ts` — added `insertRanking()` + `getAllLatestRankings()` (latest row per ranking type).
- `scripts/generate-rankings.ts` (new) — recomputes plan×model estimates in-process, runs `computeAllRankings`, persists 10 DB rows (idempotent per `observedAt`), writes `public/data/api/rankings.json`.
- `scripts/generate-static-api.ts` — dropped the rankings block (now owned by generate-rankings); `methodology.json` v3.0→3.1 with §8 bands + `rankings_methodology_version`.
- `scripts/pipeline-daily.ts` + `package.json` — wired `generate:rankings` between value-estimates and static-api; `build` now runs `generate:rankings && generate:static-api && next build`.
- `docs/calculation-methodology.md` — new §12 Rankings (10 types, bands, raw-vs-normalized, confidence policy, determinism) + changelog v3.1.
- Tests: rewrote `tests/rankings.test.ts` (computeAllRankings + §8 bands), added helpers round-trip tests, fixed static-api shape test → 228 passing.

## The 10 rankings (view keys in rankings.json)

`byPriceBand.{low,mid,high}` · `byIntelligence` · `byCoding` · `byAgentic` · `byWeightedQuality` · `bestPlansPerModel` · `byProviderCodingValue` · `byTransparency`

## API endpoints (static JSON, served by Next.js from /public)

- `GET /data/api/providers.json`
- `GET /data/api/plans.json` (includes `bySlug` map)
- `GET /data/api/models.json`
- `GET /data/api/rankings.json` (full `RankingSet`: `{generatedAt, methodologyVersion, rankings:{8 views}}`)
- `GET /data/api/methodology.json` (v3.1)
- `GET /data/api/pipeline-status.json` (written by `pipeline:daily`)

**Production:** https://code-smart.pages.dev (Cloudflare Pages, static export) — deployed + verified 2026-06-15

## What's next

1. Wire `rankings.json` into the frontend — render a rankings page / sidebar widget (data is produced & retrievable; rendering is the open piece).
2. Real AA coding/agentic indices — replace proxied values in DB (confidence="assumed"); just re-run the pipeline, no code change. Rankings surface the proxy via caveats today.
3. Improve usage-limit coverage for Anthropic/Google (currently WMQ ✓ but null QAMU → those plan×model rows drop from value bands).

## Architecture notes

- Pipeline order: `stale-check → scrape (hash-skip) → normalize → seed-aa (7d cache) → value-estimates → generate:rankings → static-api → validate`
- `computeAllRankings` is pure (no clock/random; `observedAt` injected) → byte-identical output for identical DB state + date. Total order: primary metric desc → price asc (null last) → planId asc → modelId asc.
- All API responses are pre-built static JSON — no runtime DB.
- Deploy: `next build` (`output: "export"`) → static `out/` → `wrangler pages deploy out --project-name=code-smart`. No OpenNext/Workers — app is 100% static.
- DB rankings rows: one per ranking type per `observedAt`, `methodologyVersion` stamped; 3 band rows carry `priceBand`, the rest null. Idempotent: re-running same day deletes that day's rows first.
