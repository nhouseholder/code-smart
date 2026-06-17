# Environment Variables

Code Smart uses only two environment variables. Both are **build-time only** — the production site is fully static.

---

## `DB_PATH`

**Default:** `./data/code-smart.db`

**Purpose:** Path to the SQLite database file used by the build pipeline. The database stores:
- Provider scrape history
- Normalized usage data
- Artificial Analysis model scores
- Model value estimates
- Ranking snapshots
- Pipeline run history

**Used in:**
- `src/db/index.ts:19` — database connection initialization
- `scripts/db/seed.ts` — seed script
- `scripts/pipeline-daily.ts` — pipeline runs
- All `scripts/*.ts` that read/write DB

**Note:** The DB is **offline-only** — it is never queried at runtime by the Next.js app. It exists solely for the build pipeline to compute and emit static JSON files.

---

## `NODE_ENV`

**Values:** `development` (default) | `production`

**Purpose:** Controls build-time behavior. In `production` mode, the Next.js build enforces stricter validation on artifact files.

**Used in:**
- `src/lib/data-loader.ts:119` — conditional validation on production builds
- `next.config.ts` — build optimization decisions

---

## How to set

```bash
# Local development (defaults are fine)
cp .env.example .env

# Production build (CI sets this)
export NODE_ENV=production
export DB_PATH=./data/code-smart.db
```
