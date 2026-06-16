# code-smart — Current State

**Version:** 1.1.0
**Updated:** 2026-06-16
**Branch:** main

---

## What just shipped

Session 9 — User-facing website (v1.1.0, live at code-smart.pages.dev, deploy c59ad6a9). 8 pages over the data engine, ~20 components, uncertainty/provenance UX, Framer Motion. 240 tests, 70 static pages. **Post-ship investigation:** the reported `/data/api/*.json` "schema-shape transform" was a **false alarm** — a local RTK token-compression artifact (`rtk rewrite` summarizes `curl …json`/`cat …json` in the Bash channel). Origin serves correct raw JSON (confirmed via WebFetch). No bug, no redeploy.

**Next 3:** (1) 375px mobile pass · (2) wire BenchmarkSparkline AA-snapshot history · (3) `/compare` diff-highlight + filter polish.

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
