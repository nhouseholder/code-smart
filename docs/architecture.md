# Code Smart — Architecture

## 1. System Overview

Code Smart is built on a two-layer architecture with no runtime database.

### Data Layer
All data lives in static JSON files checked into git:
- **Provider/plan/feature data:** `src/data/providers/*.json` — one file per provider. Edited manually when pricing or limits change. Validated by Zod at build time.
- **AA index snapshots:** `src/data/aa-snapshots/YYYY-MM-DD.json` — one file per weekly fetch, committed by GitHub Actions. Never edited manually. Append-only.
- **Computed scores:** `src/data/computed-scores.json` — regenerated at each build by `scripts/recompute-scores.ts` from the above two sources. Never edited manually.
- **Supporting lookup files:** `src/data/aa-model-slugs.json` (model-to-AA mapping), `src/data/aa-indices-override.json` (manual fallback for AA fetch failures).

### Compute Layer
- **GitHub Actions pipeline** fetches AA indices weekly, commits snapshot files, regenerates computed scores, and triggers deployment.
- **Next.js 15** reads all JSON at build time via `fs` and generates static pages (SSG). No runtime DB queries.
- **Cloudflare Workers** (via `opennextjs-cloudflare`) serves the pre-rendered output. API routes read pre-loaded JSON at startup.

---

## 2. Why No Database

The dataset is too small to justify a runtime database:
- **11 providers**, approximately **25 models**, **30 plans** — fits comfortably in memory
- **Weekly AA data** = 1 JSON file (~15KB) committed to git
- **Computed scores** regenerate in seconds at each build
- **Git history is the version history** — no migration tooling needed, no schema drift risk

If the dataset grows to 100+ providers or requires sub-minute data freshness, the correct migration path is Neon (Postgres-compatible, Cloudflare Workers-compatible via HTTP API). The data model in `src/types/index.ts` is designed to translate directly to relational tables without structural changes if that migration occurs.

---

## 3. Cloudflare Workers Constraints

The production runtime is Cloudflare Workers via `opennextjs-cloudflare`. This imposes hard constraints that every code and dependency decision must respect:

| Constraint | Implication |
|------------|-------------|
| Runtime: `nodejs_compat` flag | Most Node.js built-ins available, but not all |
| No Prisma | Binary engines are incompatible with Workers; use JSON files instead |
| No runtime TCP DB connections | Eliminates pg, mysql2, sqlite3 |
| Bundle budget ~1MB compressed | Avoid large dependencies; audit `npx wrangler versions upload` output |
| All data importable as JSON at build time | `fs.readFileSync` at module init works; runtime DB calls do not |
| Secrets via `wrangler secret put` | Never hardcode secrets; never put secrets in `wrangler.jsonc [vars]` for production |

Environment variables for development go in `wrangler.jsonc [vars]`. Production secrets use `wrangler secret put` and are never committed to the repo.

---

## 4. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ WEEKLY (Monday 8am UTC) — GitHub Actions: weekly-aa-fetch.yml│
│                                                             │
│  reads: src/data/aa-model-slugs.json                        │
│    └─► calls Artificial Analysis API (AA_API_KEY secret)    │
│          └─► resolves proxy model inheritance               │
│                └─► writes src/data/aa-snapshots/YYYY-MM-DD.json
│                                                             │
│  runs: scripts/recompute-scores.ts                          │
│    reads: src/data/providers/*.json                         │
│    reads: src/data/aa-snapshots/<latest>.json               │
│    applies: WMQ → QAMU → Value Score formula                │
│    writes: src/data/computed-scores.json                    │
│                                                             │
│  git commit + push (GH_PAT secret)                          │
│    └─► triggers Cloudflare deploy                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ DAILY — GitHub Actions: daily-check.yml                     │
│                                                             │
│  runs: npm run stale-check                                  │
│    └─► opens GitHub issue listing stale data points         │
│         (uses GITHUB_TOKEN, auto-provided)                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ MANUAL DEPLOY — local machine                               │
│                                                             │
│  npm run validate         (Zod schema check — exit 0/1)     │
│  npm run stale-check      (90-day provenance — exit 0/1)    │
│  npm run recompute-scores (regenerate computed-scores.json) │
│  npm run build            (opennextjs-cloudflare → .open-next/)
│                                                             │
│  wrangler versions upload → capture UUID                    │
│  wrangler versions deploy <UUID>@100%                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CLOUDFLARE WORKER (runtime)                                 │
│                                                             │
│  request arrives                                            │
│    └─► serves pre-rendered page (no runtime DB query)       │
│    └─► API route? reads JSON files pre-loaded at startup    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. AA Snapshot File Strategy

### Storage
- One file per weekly fetch: `src/data/aa-snapshots/YYYY-MM-DD.json`
- Files are append-only — never edit or delete old snapshot files
- Accumulates approximately 780KB/year (52 files × ~15KB each)
- Acceptable for 5+ years of operation without any pruning

### Build-Time Resolution
The build reads snapshots using this pattern:
```typescript
import { readdirSync } from 'fs';
import path from 'path';

const snapshotDir = path.join(process.cwd(), 'src/data/aa-snapshots');
const files = readdirSync(snapshotDir)
  .filter(f => f.endsWith('.json'))
  .sort()
  .reverse(); // descending: newest first

const latestSnapshotPath = path.join(snapshotDir, files[0]);
```

### Sparkline History (12-Week)
```typescript
const last12 = files.slice(0, 12); // 12 most recent files
const sparklineData = last12.map(filename => ({
  date: filename.replace('.json', ''),
  data: JSON.parse(readFileSync(path.join(snapshotDir, filename), 'utf-8'))
}));
```
The 12-week sparkline gives a meaningful trend window that covers one quarter of activity.

---

## 6. AA Fetch Fallback

If `scripts/fetch-aa-indices.ts` cannot reach the AA API (network error, 4xx, 5xx, or malformed response), it falls back to `src/data/aa-indices-override.json`.

Fallback behavior:
1. Log the error with full detail to the GitHub Actions job output
2. Read `src/data/aa-indices-override.json`
3. Use it as the snapshot data for the current week
4. Set confidence to `"assumed"` on all records sourced from the override file
5. Proceed with `recompute-scores.ts` using the override data
6. **Do not commit a snapshot file** for the failed week (the build will continue to use the previous week's actual snapshot as "latest")
7. Open a GitHub issue via GITHUB_TOKEN noting the fetch failure

This ensures the pipeline never commits stale null data or zeroed-out scores. The fallback values degrade gracefully to `confidence: "assumed"` throughout the UI.

The override file must be kept up to date manually after any major model releases. It should never be more than 30 days old.

---

## 7. API Routes

All 7 API routes are Next.js Route Handlers. They read from JSON files — no database queries at runtime. The JSON is imported or read at module initialization, not on every request.

```
GET  /api/providers
  → all providers with computed scores (from providers/*.json + computed-scores.json)
  → response: Provider[] with embedded ValueScore[]

GET  /api/providers/[id]
  → single provider detail + models + plans + scores
  → 404 if id not found in any providers/*.json

GET  /api/plans
  → active plans + ValueScores
  → query params: ?tier=low|mid|high|free, ?maxPrice=<number>, ?sort=value|price|quality
  → response: Plan[] with embedded ValueScore

GET  /api/models
  → all models + latest AA indices + plan availability
  → joins: providers/*.json (model definitions) + aa-snapshots/<latest>.json (AA indices)
  → response: Model[] with AA index values and available-via plan list

GET  /api/models/[id]
  → model detail + last 12 weekly snapshot data points for sparkline
  → response: Model with aa_history: AAIndexSnapshot[] (12 items, newest first)

GET  /api/scores/top-by-tier
  → top 10 plan+model combos per tier (low/mid/high)
  → response: { low: ScoredPlan[], mid: ScoredPlan[], high: ScoredPlan[] }
  → each tier capped at 10 items, sorted by value_score_normalized descending

GET  /api/health
  → { version, aa_last_fetched, scores_computed_at, providers_count, models_count, plans_count }
  → version from package.json, aa_last_fetched from latest snapshot filename, scores_computed_at from computed-scores.json
```

---

## 8. Build and Deploy Pipeline

### Full Deploy Sequence (manual, from local machine)

```bash
# Step 0 — Validate data integrity
npm run validate          # Zod schema check; exits non-zero on any schema violation
npm run stale-check       # 90-day provenance check; exits non-zero on stale records (optional gate)

# Step 1 — Regenerate computed scores
npm run recompute-scores  # Reads providers/*.json + latest aa-snapshot → writes computed-scores.json

# Step 2 — Build static export
pnpm build                # output:"export" → out/ (15 static pages + /data/api/*.json)

# Step 3 — Deploy out/ to Cloudflare Pages
source ~/.claude/credentials/master.env && \
  CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN \
  CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID \
  ./node_modules/.bin/wrangler pages deploy out --project-name=code-smart --branch=main

# Step 4 — Verify live
curl -s -o /dev/null -w "%{http_code}\n" https://code-smart.pages.dev/
curl -s https://code-smart.pages.dev/data/api/providers.json | head -c 80
```

**Why Pages, not OpenNext/Workers?** The app is 100% static (`output: "export"`, `generateStaticParams`, build-time JSON, no route handlers), so a static export → Pages is the correct target — simpler than OpenNext/Workers and the Pages upload path avoids the LibreSSL TLS 1.3 bug that breaks `wrangler deploy` on this machine (no `dns-fix.mjs` needed).

### GitHub Actions Deploy (automated, via weekly-aa-fetch.yml)
The GitHub Actions workflow uses the same split strategy via shell script. It does NOT run `npm run stale-check` as a blocking gate — stale check runs separately in `daily-check.yml` and opens issues rather than blocking deploys.

---

## 9. GitHub Secrets Required

The following secrets must be configured in the GitHub repository settings (`Settings → Secrets and variables → Actions`):

| Secret | Value | Used by |
|--------|-------|---------|
| `AA_API_KEY` | Artificial Analysis API key (confirmed in `~/.claude/credentials/master.env`) | `weekly-aa-fetch.yml` |
| `CLOUDFLARE_API_TOKEN` | CF API token with Workers Script:Edit permission | All deploy jobs |
| `GH_PAT` | GitHub Personal Access Token with `repo` write scope | Committing snapshot files back to the repo |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions | Opening issues in `daily-check.yml` |

**Note:** `GH_PAT` is required because the default `GITHUB_TOKEN` cannot commit to protected branches or trigger subsequent workflows. The PAT must have `repo` scope (not `contents: write` alone, as that doesn't cover protected branches). Store the PAT in `~/.claude/credentials/master.env` as `GH_PAT_CODE_SMART`.

---

## 10. Directory Structure

```
code-smart/
├── .github/
│   └── workflows/
│       ├── weekly-aa-fetch.yml     # Monday 8am UTC: fetch AA → commit → deploy
│       └── daily-check.yml         # Daily: stale-check → open issue if stale
├── docs/
│   ├── product-spec.md             # This project's product specification
│   ├── architecture.md             # This file
│   └── data-model.md               # Data types, JSON formats, relationships
├── scripts/
│   ├── fetch-aa-indices.ts         # Fetch AA API → write snapshot file
│   ├── fetch-provider.ts           # One-off provider page fetch for debugging
│   ├── recompute-scores.ts         # providers + snapshot → computed-scores.json
│   ├── scrape-providers.ts         # CLI: run scraper pipeline (--provider, --dry-run, --force)
│   ├── stale-check.ts              # Detect 90-day stale provenance records
│   └── validate-data.ts            # Validate provider JSON files against Zod schemas
├── src/
│   ├── app/                        # Next.js App Router pages + layouts
│   ├── components/                 # React components
│   ├── data/
│   │   ├── providers/              # *.json — one per provider (source of truth)
│   │   ├── aa-snapshots/           # YYYY-MM-DD.json — one per weekly AA fetch
│   │   ├── aa-model-slugs.json     # Model ID → AA slug mapping
│   │   ├── aa-indices-override.json # Manual fallback for AA fetch failures
│   │   └── computed-scores.json    # Regenerated at each build (never edit manually)
│   ├── db/                         # SQLite persistence layer (Sessions 2–3)
│   │   ├── index.ts                # getDb(), runMigrations() — entry point
│   │   ├── schema.ts               # Drizzle table definitions (12 tables)
│   │   ├── helpers.ts              # Query helper functions (getLatestSnapshot etc.)
│   │   ├── seed.ts                 # Seed provider JSON → SQLite; inserts sentinel rows
│   │   └── migrations/             # Drizzle-managed SQL migration files
│   ├── lib/
│   │   ├── scraper/                # Scraping pipeline modules (Session 2)
│   │   │   ├── types.ts            # Shared types (Confidence, ExtractedPrice, etc.)
│   │   │   ├── fetcher.ts          # HTTP fetch + DOM parse via htmlparser2
│   │   │   ├── text-extractor.ts   # HTML → clean plaintext
│   │   │   ├── price-extractor.ts  # Regex price extraction → ExtractedPrice[]
│   │   │   ├── limit-extractor.ts  # Regex usage-limit extraction → ExtractedLimit[]
│   │   │   ├── model-extractor.ts  # Longest-match model-name scanning → ExtractedModelMention[]
│   │   │   ├── annotation-scanner.ts # Footnote + assumption extraction → notes JSON
│   │   │   └── pipeline.ts         # Orchestrates all stages, writes to DB
│   │   └── ...                     # Other utility modules
│   └── types/
│       └── index.ts                # All TypeScript types (canonical)
├── tests/
│   ├── helpers/
│   │   └── db.ts                   # Shared test utilities: runMigrations(), createTestDb()
│   ├── db/                         # DB layer tests (helpers, schema, seed)
│   └── scraper/                    # Scraper pipeline tests
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── wrangler.jsonc
```

## 11. SQLite Scraper Layer

Added in Sessions 2–3. Provides an immutable audit trail of all scraped pricing data alongside the existing JSON provider registry.

### src/db/

| File | Purpose |
|------|---------|
| `index.ts` | `getDb()` (opens/creates the DB), `runMigrations()` (applies SQL files in order) |
| `schema.ts` | Drizzle-ORM table definitions — 12 tables (see `docs/data-model.md` §8) |
| `helpers.ts` | Type-safe query helpers: `getLatestSourceSnapshot`, `hasContentChanged`, `getActiveProvidersWithPlans`, etc. |
| `seed.ts` | Seeds provider JSON files into SQLite; inserts sentinel rows before the guard; idempotent |
| `migrations/` | Drizzle-managed `.sql` files applied in lexicographic order |

### Scraper Pipeline (src/lib/scraper/)

Seven-stage pipeline per provider source page:

1. **fetcher** — HTTP GET + htmlparser2 DOM parse
2. **text-extractor** — strips tags → clean plaintext
3. **price-extractor** — regex extraction → `ExtractedPrice[]`
4. **limit-extractor** — regex extraction → `ExtractedLimit[]`
5. **model-extractor** — longest-match, word-bounded scan against known model display names → `ExtractedModelMention[]`
6. **annotation-scanner** — `scanFootnotes()` + `recordAssumptions()` → `{ footnotes, assumptions }` stored in `source_snapshots.notes`
7. **pipeline** — orchestrates stages 1–6, writes all rows to DB in a single transaction

### Sentinel Rows

Two sentinel FK targets exist in every DB state so the pipeline can write candidate rows before plan matching runs:

| Table | Sentinel value | Purpose |
|-------|---------------|---------|
| `plans` | `id = ""` | All `planSnapshots`, `usageLimits`, and `planModelAccess` rows written before plan resolution link here |
| `models` | `id = "unknown"` | Model mentions that matched a display name but no DB model record link here |
| `providers` | `id = "__sentinel__"` | FK parent of the sentinel plan row |

Sentinel rows are inserted by `seed.ts` using `onConflictDoNothing()` — idempotent across any number of re-runs.

### CLI

```bash
pnpm exec tsx scripts/scrape-providers.ts [--provider <id>] [--dry-run] [--force]
```

- `--provider <id>` — restrict to one provider's source pages
- `--dry-run` — print banner and exit without writing to DB
- `--force` — skip content-hash deduplication check (always scrapes)
