# code-smart — Current State

**Version:** 1.0.9
**Updated:** 2026-06-15
**Branch:** main

---

## What just shipped

Session 7 — Backend API, Daily Pipeline, Admin Debug:

- `src/types/pipeline.ts` — `PipelineRun`, `PipelineStatus`, `ProviderStatus` types
- `src/lib/pipeline-schema.ts` — Zod schemas for runtime validation + test assertions
- `src/lib/rankings.ts` — `computeRankings()` + `getPriceBand()` with 4 price bands
- `scripts/generate-static-api.ts` — atomic write (staging→rename); generates 5 API JSONs to `public/data/api/`
- `scripts/pipeline-daily.ts` — full pipeline orchestrator; lock file, atomic status write, AA cache (7d), dry-run support
- Tests: 3 new test files, 29 new tests → 213 total, all passing
- `package.json`: new scripts `generate:static-api`, `pipeline:daily`, `pipeline:status`; build now runs `generate:static-api && next build`

## API endpoints (static JSON, served by Next.js from /public)

- `GET /data/api/providers.json`
- `GET /data/api/plans.json` (includes `bySlug` map)
- `GET /data/api/models.json`
- `GET /data/api/rankings.json` (includes `byBand` for 4 price bands)
- `GET /data/api/methodology.json`
- `GET /data/api/pipeline-status.json` (written by `pipeline:daily`)

## What's next

1. Deploy v1.0.9 to production (wrangler split-deploy)
2. Real AA coding/agentic indices — replace proxied values in DB (confidence="assumed") when subscription available
3. Improve usage limit coverage for Anthropic/Google (currently WMQ ✓ but null QAMU)
4. Add WMQ badge to `PlanCard` component
5. Wire `/data/api/rankings.json` into frontend (rankings page or sidebar widget)

## Architecture notes

- Pipeline order: `stale-check → scrape (hash-skip) → normalize → seed-aa (7d cache) → value-estimates → static-api → validate`
- All API responses are pre-built static JSON — no runtime DB; works on CF Workers
- Lock file: `data/.pipeline.lock` (PID-based, stale lock auto-cleared)
- Atomic status write: `pipeline-status.json.tmp` → rename (never corrupt mid-run)
- Admin view: `pnpm pipeline:status` prints formatted last-run report to console
