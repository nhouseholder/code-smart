# Handoff — Code Smart Frontend Website Shipped

**Date:** 2026-06-16
**Version shipped:** 1.1.0 (was 1.0.11)
**HEAD SHA at deploy:** bc95a95 (commit follows this handoff)
**Live:** https://code-smart.pages.dev · immutable: https://c59ad6a9.code-smart.pages.dev

## What changed (Session 9)

Built the full user-facing website over the existing data engine. 8 pages, ~20 new components, strict uncertainty/provenance UX, Framer Motion polish.

- **Pages (new):** `/compare`, `/plans/[id]`, `/models`, `/models/[id]`, `/rankings`, `/methodology`, `/freshness`. Enhanced `/` and `layout.tsx` nav. Kept `/providers/[id]`.
- **Components (new):** ProviderBadge, ModelBadge, PriceBandBadge, MethodologyTooltip, MetricCard, AAIndexBadge, CaveatCallout, RankingCard, CalculationExplainer, UsageEstimateRow, UncertaintyScore, BenchmarkSparkline, ModelRankingTable, ModelTabs, PlanComparisonTable, motion/{FadeIn,Stagger,CountUp}. ProvenanceBadge extended with ConfidenceBadge/FreshnessBadge/SourceLink variants.
- **data-loader.ts:** added getRankings/getMethodologyMeta/getModelsApi/getPlansApi with Zod validation + build-integrity guards (throw on missing/empty required artifact in production).
- **utils.ts:** added formatTokens (null→"—", K/M), uncertaintyTier.

## UX invariants honored
Null renders `—` never `0` · AA numbers carry "AA" prefix · confidence never upgraded · estimated≠guaranteed copy · locked brand/confidence theme untouched · Framer Motion gated on reduced-motion, never on table rows.

## Preflight / verification
- **Tests:** 240 passing (228 existing + 12 new component checks). `vitest.config.ts` got `esbuild.jsx:"automatic"` so tsx tests compile.
- **Build:** `pnpm build` → 70 static pages, full `out/`. Required Next 15 migration of `params` to `Promise` on `models/[id]` + `plans/[id]`.
- **Secret scan:** clean.
- **Live:** all 8 routes 200 (trailing-slash 308→200 is the `trailingSlash:true` design). `/plans/anthropic-pro/` shows real pricing + confidence badges + `—`. Home renders real providers (Anthropic/Cursor/Copilot/OpenAI/GitHub). `/freshness` tables render.

## Known issue (pre-existing, NOT from this session)
`/data/api/*.json` served from origin returns a **schema-shape summary** (alphabetized keys, `string`/`date?`/`int` types) instead of raw JSON — for ALL five artifacts, including providers.json (the earlier "real" response was a stale edge-cache hit). A transform/Pages-Function on the `/data/api/*` path is rewriting these responses. **Does not affect the website** — the 8 pages are static and bake JSON at build via `fs`, not at runtime. But any external consumer of the public JSON API gets the schema, not data.

## Top 3 next priorities
1. **Investigate the `/data/api/*.json` transform** — find the Pages Function / transform rule rewriting these to schema summaries; restore raw JSON for external API consumers (or document the endpoint as schema-only).
2. **Manual 375px mobile pass** — `npx serve out`, spot-check all 8 routes for horizontal overflow + reduced-motion.
3. **Wire BenchmarkSparkline history** — currently single-snapshot ("Not enough history"); accrue AA snapshots over time so model trend charts populate.
