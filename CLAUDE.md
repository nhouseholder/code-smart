# code-smart — Context Pack

## Stack
- Language: TypeScript 5 (strict)
- Framework: Next.js 15.3 (App Router, Turbopack dev)
- Styling: Tailwind CSS 3 (never strip existing theme values)
- DB (offline only): Better-SQLite3 + Drizzle ORM (12 tables)
- Scraping: Playwright (headless Chromium)
- Testing: Vitest (in-process, no browser)
- Deploy: Cloudflare **Pages** — 100% static export (`output: "export"`). NOT Workers/OpenNext.
- Version files: `package.json` (version field)
- Deploy command: `pnpm build` → `wrangler pages deploy out --project-name=code-smart --branch=main`. Do NOT use `wrangler deploy` or `wrangler versions` (those are for Workers — wrong target here).

## Architecture & Key Files
- **Production data flow**: `src/data/providers/*.json` → `src/lib/data-loader.ts` → `src/lib/value-scorer.ts` → Next.js static export (`output: "export"`) → CF Pages (no runtime DB)
- **Offline toolchain**: `pnpm scrape:providers` → SQLite (`data/code-smart.db`) → `pnpm normalize:usage` → `usage_estimates` table (feeds scoring; not queried at runtime)
- **Adding a provider**: (1) create `src/data/providers/<slug>.json`, (2) add static import in `src/lib/data-loader.ts` PROVIDER_FILES array — dynamic imports break CF Workers SSG
- **Normalization engine entry**: `src/lib/normalization/engine.ts:normalizeLimit(limit, DEFAULT_CONFIG)`
- **Value Score formula (v3.0)**: QAMU = estimatedTokens1mo × (WMQ/100); score = QAMU/price → 0–100. See `docs/calculation-methodology.md`.
- **Schema validation**: run `pnpm validate` after any edit to `src/data/providers/*.json`

## Domain Rules
- Never query SQLite at Next.js runtime — site is a static export; all data is baked in at build time
- Deploy = static export → Pages: `pnpm build` (`output: "export"` → `out/`) then `wrangler pages deploy out --project-name=code-smart --branch=main`. App is 100% static; no OpenNext/Workers.
- Scraper sentinel rows (`planId: ""`, `modelId: "unknown"`) are intentional FK targets, not bugs — plan-matching is not yet implemented
- Confidence levels are an ordered enum: `observed > inferred > assumed > stale > unknown` — never upgrade confidence
- Never edit `src/data/providers/*.json` without running `pnpm validate` after
- `data/code-smart.db` is gitignored — bootstrap with `pnpm db:reset`; CI restores from artifact
- QAMU formula is authoritative (docs/calculation-methodology.md §2); do not revert to the legacy 3-weight formula
