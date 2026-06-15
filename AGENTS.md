# AGENTS.md — code-smart

AI agent operational reference. Durable, non-obvious facts only. Volatile state belongs in handoffs and `CURRENT_STATE.md`.

---

## Project Purpose

Code Smart is a developer-facing comparison tool for AI coding plans. It answers: **which AI coding plan gives the most coding quality per dollar?** Plans are scored by a weighted composite of model quality (via Artificial Analysis indices), usage capacity (normalized via 8-layer token-estimation engine), and pricing — displayed as a Value Score 0–100.

---

## Architecture Overview

Two completely separate layers:

### 1. Production (Cloudflare Workers + Next.js SSG) — No Runtime DB
- Data source of truth: `src/data/providers/*.json` — one JSON file per provider, validated by Zod at load time.
- `src/lib/data-loader.ts` imports all JSON statically; Cloudflare Workers can read JSON but cannot run TCP DB connections or Prisma binaries.
- `src/lib/value-scorer.ts` computes Value Scores from the in-memory JSON data. **No DB query at runtime.**
- Deploy produces a static bundle via `opennextjs-cloudflare`. All scoring happens at build time or first-request startup.

### 2. Offline Scraper/Analysis Toolchain — SQLite Only
- `data/code-smart.db` — gitignored SQLite file; bootstrapped via `pnpm db:reset`.
- 12-table schema in `src/db/schema.ts` (Drizzle ORM). Tracks scrape runs, source snapshots, extracted prices/limits, and normalized usage estimates.
- `scripts/scrape-providers.ts` → runs the Playwright scraper pipeline, writes candidates to SQLite.
- `scripts/normalize-usage.ts` → reads `usage_limits` rows, writes `usage_estimates` rows via the normalization engine.
- This layer is **never queried by the Next.js app** — its output is meant to feed back into the JSON files (manual curation loop) and eventually the Value Score pipeline.

### Current Gap
The normalization output (`usage_estimates.estimatedTokens1mo`) is **not yet wired into `value-scorer.ts`**. The scorer currently reads `plan.usage_limits` from JSON, not from the DB. Wiring this is the next major milestone.

---

## Directory Map

```
code-smart/
├── .github/workflows/
│   └── daily-check.yml        # Daily: validate + seed + stale-check; opens GH issue if stale
├── docs/
│   ├── architecture.md        # Authoritative system design (read before major changes)
│   ├── calculation-methodology.md  # WMQ → QAMU → Value Score formula (authoritative)
│   ├── data-model.md          # Type system reference
│   └── product-spec.md        # Product requirements
├── scripts/
│   ├── scrape-providers.ts    # CLI: run scraper pipeline (--provider, --dry-run, --force)
│   ├── normalize-usage.ts     # CLI: normalize usage_limits → usage_estimates
│   ├── stale-check.ts         # Detect provenance >90 days old
│   ├── validate-data.ts       # Zod schema check on all provider JSON
│   └── fetch-provider.ts      # One-off debug fetch for a single provider URL
├── src/
│   ├── app/                   # Next.js App Router pages
│   ├── components/            # React UI components (ComparisonTable, PlanCard, etc.)
│   ├── data/providers/        # *.json — 13 providers — canonical source of truth
│   ├── db/
│   │   ├── schema.ts          # 12-table Drizzle schema (SQLite, offline toolchain only)
│   │   ├── index.ts           # getDb() singleton + runMigrations()
│   │   ├── seed.ts            # Seeds JSON → SQLite; inserts sentinel rows; idempotent
│   │   └── migrations/        # SQL files applied in lexicographic order
│   ├── lib/
│   │   ├── data-loader.ts     # getAllProviders(), getAllPlans(), effectiveMonthlyPrice()
│   │   ├── value-scorer.ts    # scorePlan() — weights: cost 35%, benchmark 40%, feature 25%
│   │   ├── schema.ts          # Zod schemas derived from src/types/index.ts (for validation)
│   │   ├── utils.ts           # cn() (clsx + tailwind-merge)
│   │   └── normalization/
│   │       ├── engine.ts      # normalizeLimit() — 8-layer dispatch (direct_tokens → unknown)
│   │       ├── windows.ts     # extrapolateToAllTargetWindows() — 4-window with confidence decay
│   │       ├── config.ts      # NormalizationConfig + NORMALIZATION_METHODOLOGY_VERSION
│   │       └── types.ts       # NormalizedEstimate, ConversionStep, UsageLimitRow types
│   ├── types/index.ts         # ALL canonical TypeScript types (Provider, Plan, Model, ValueScore…)
│   └── lib/scraper/
│       ├── pipeline.ts        # runScrapePipeline() — orchestrates 7 scraper stages
│       ├── fetcher.ts         # fetchWithPlaywright() + fetchStatic() + fetchWithRetry()
│       ├── price-extractor.ts # Regex extraction → ExtractedPrice[]
│       ├── limit-extractor.ts # Regex extraction → ExtractedLimit[]
│       ├── model-extractor.ts # Longest-match scan → ExtractedModelMention[]
│       ├── annotation-scanner.ts  # scanFootnotes() + recordAssumptions() → notes JSON
│       └── text-extractor.ts  # HTML → clean plaintext + content hash
├── tests/
│   ├── helpers/db.ts          # Shared: createTestDb() opens in-memory SQLite, runs migrations
│   ├── db/                    # DB helper and schema tests
│   ├── scraper/               # Scraper module tests (unit + integration)
│   ├── normalization/         # Normalization engine tests (43 tests)
│   └── value-scorer.test.ts   # Value scorer tests
├── data/code-smart.db         # Gitignored SQLite — bootstrap via `pnpm db:reset`
├── drizzle.config.ts          # Points drizzle-kit at src/db/schema.ts
├── vitest.config.ts           # Tests in-process (no worker threads required)
└── wrangler.jsonc             # CF Worker config — opennextjs-cloudflare target
```

---

## All Commands

```bash
# Dev
pnpm dev                    # Next.js dev server (Turbopack)
pnpm build                  # opennextjs-cloudflare build → .open-next/
pnpm start                  # Serve production build locally

# Data validation & quality
pnpm validate               # Zod schema check on all provider JSON; exit 1 on fail
pnpm stale-check            # Detect provenance >90 days; exit 1 if stale entries found

# Scraper pipeline
pnpm scrape:providers                      # Scrape all enabled source pages
pnpm scrape:providers -- --provider anthropic  # Single provider
pnpm scrape:providers -- --dry-run         # No DB writes
pnpm scrape:providers -- --force           # Skip content-hash dedup (always scrapes)

# Normalization
pnpm normalize:usage                       # Run normalization engine → write usage_estimates
pnpm normalize:usage -- --dry-run          # Print what would be written

# Database
pnpm db:migrate             # Apply pending migrations (creates data/code-smart.db if absent)
pnpm db:seed                # Seed provider JSON → SQLite (idempotent, inserts sentinel rows)
pnpm db:reset               # Delete DB + migrate + seed (start fresh)
pnpm db:generate            # Regenerate migration files after schema changes (drizzle-kit)

# Tests
pnpm test                   # Run all 157 tests via Vitest (in-process, no browser)
pnpm test:watch             # Watch mode

# Deploy (manual — split upload+deploy required)
source ~/.claude/credentials/master.env && \
  CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN \
  NODE_OPTIONS='--import ./dns-fix.mjs' \
  NODE_TLS_REJECT_UNAUTHORIZED=0 \
  npx wrangler versions upload --config wrangler.jsonc
# Capture UUID from output, then:
npx wrangler versions deploy <UUID>@100% --config wrangler.jsonc --yes
```

---

## Environment Setup

No `.env` file needed for local development. All provider data is in committed JSON files.

For deploy and CI:
| Secret | Purpose | Location |
|--------|---------|---------|
| `CLOUDFLARE_API_TOKEN` | Deploy workers | `~/.claude/credentials/master.env` |
| `GH_PAT` | GitHub Actions commit back | `master.env` as `GH_PAT_CODE_SMART` |
| `AA_API_KEY` | Artificial Analysis weekly fetch | `master.env` (planned — AA integration not yet built) |
| `DB_PATH` | Override SQLite path | Optional env var; defaults to `./data/code-smart.db` |

---

## Key Conventions

- **Adding a new provider:** (1) create `src/data/providers/<slug>.json` matching `src/types/index.ts` schema; (2) add a static import in `src/lib/data-loader.ts` PROVIDER_FILES array. Dynamic imports don't work for CF Workers SSG.
- **Confidence levels (5-tier):** `observed` → `inferred` → `assumed` → `stale` → `unknown`. Always carry through provenance; never lose it by converting to a raw number.
- **Drizzle ORM patterns:** `db.select().from(table).where(...).all()` for synchronous SQLite reads. No `await` — better-sqlite3 is synchronous.
- **Scraper sentinel rows:** All scraped candidate rows insert `planId: ""` and `modelId: "unknown"` — plan matching is NOT yet implemented. Don't filter these out as errors.
- **Schema strictness:** Manually curated tables use `.strict()` on insert schemas (rejects unknown keys/typos). Scraper-output tables use `.partial().passthrough()` (loose).
- **Commit format:** `type(scope): message` — conventional commits. Types: feat/fix/chore/docs/test.

---

## External Services

| Service | How used | Local stub |
|---------|---------|-----------|
| Playwright / Chromium | Scraper page rendering | Installed via `playwright` package; headless |
| GitHub Actions | daily-check.yml (validate + stale-check + stale issue) | Run locally via `pnpm stale-check` |
| Cloudflare Workers | Production hosting | `wrangler` CLI for deploy |
| Artificial Analysis API | Weekly model quality index fetch | **Not yet implemented** — see `docs/architecture.md §6` for planned fallback |

---

## Gotchas & Decisions

1. **Split wrangler deploy is mandatory.** Combined `wrangler deploy` fails on this machine (LibreSSL TLS 1.3 bug with `api.cloudflare.com`). Always use `wrangler versions upload` → capture UUID → `wrangler versions deploy <UUID>@100%`. See `~/.kimi/WRANGLER_NOTES.md`.

2. **`weekly-aa-fetch.yml` does not exist yet.** The architecture doc describes a weekly AA API fetch workflow, but as of v1.0.6 only `daily-check.yml` is implemented. The AA integration (fetch-aa-indices.ts, recompute-scores.ts, aa-snapshots/) is planned but not built.

3. **value-scorer.ts reads benchmark data from JSON, not AA API.** `BENCHMARK_REFERENCE` max values in `value-scorer.ts` are manually maintained constants. The planned migration path is to replace them with the AA API's `intelligenceIndex` / `codingIndex` from the `artificial_analysis_model_scores` table once the AA integration is built.

4. **22/36 usage_limits are "unknown" type.** The normalization engine dispatches to Layer 8 (unknown) for these. Root cause: scrapers extract raw text but can't parse vague limits like "usage based" or "contact sales". Enriching `src/lib/scraper/limit-extractor.ts` for these 22 cases is an open task.

5. **`data/` is gitignored — DB doesn't exist in CI without artifact restore.** `daily-check.yml` uses `actions/download-artifact` to restore the DB from the previous run before seeding. On first run, artifact download is `continue-on-error: true` and seed creates a fresh DB.

6. **Normalization estimates are not yet wired into Value Score.** `usage_estimates.estimatedTokens1mo` must feed the QAMU step (`QAMU = estimatedTokens1mo × (WMQ / 100)`), but `value-scorer.ts` currently uses raw `plan.usage_limits` from JSON. The DB connection is offline-only; the wiring requires either baking normalized values back into provider JSON or building a build-time DB read step.

7. **COST_REFERENCE_USD = 20 in value-scorer.ts is a hardcoded assumption.** This is the "fair price" reference for cost scoring. Changing it shifts cost scores for all plans — treat as a calibration constant, not a bug.

8. **Scraper inserts planId: "" as candidate rows.** Plan-matching (linking scraped prices/limits to canonical plan IDs) is not yet implemented. All scraper output hangs off sentinel FK rows until this is built.

9. **data-loader.ts caches providers in module scope.** `_cachedProviders` is module-level — if tests don't properly isolate modules, stale cache can cause cross-test pollution. Tests that modify provider data should reset the cache or use a fresh module import.

---

## Current Known Issues / Active WIP

- **Next milestone:** Wire `usage_estimates.estimatedTokens1mo` into Value Score pipeline (see handoff v1.0.6).
- **22/36 "unknown" limits** need scraper enrichment before normalization can reach full coverage.
- **No live deployment** — wrangler deploy not yet run; no production URL exists.
- **AA integration not built** — `docs/architecture.md` describes planned AA API fetch; code does not exist yet.

---

## Handoff Pointers

- Latest handoff: `handoffs/2026-06-15_v1.0.6_normalization-engine.md`
- Handoff index: `handoffs/INDEX.md`
- Current state: `.kimi/CURRENT_STATE.md` (does not exist — create before next session close)

---

## What NOT To Do

- **Do not use `wrangler deploy` (combined).** Always split: `versions upload` → `versions deploy <UUID>@100%`.
- **Do not edit `src/data/providers/*.json` programmatically without running `pnpm validate` after.** Schema violations will break the build.
- **Do not query the SQLite DB at Next.js runtime.** CF Workers cannot open TCP connections; sqlite3 binary won't load. All runtime data must come from JSON imported at build time.
- **Do not add a provider via dynamic import.** CF Workers SSG requires static imports in `data-loader.ts`. Dynamic `require()` or `fs.readFileSync()` at module init won't survive the bundle.
- **Do not treat scraper sentinel rows (`planId: ""`) as bugs.** They are intentional FK sentinels until plan-matching is implemented.
- **Do not commit `data/code-smart.db`.** It's gitignored; the DB is passed via GitHub Actions artifact.

---

## Init — 2026-06-15

Created from scratch. All sections above are net-new.
