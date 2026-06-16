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

## ~~Known issue~~ → RESOLVED (false alarm, no bug)
**The `/data/api/*.json` "schema-shape transform" was NOT real.** Root cause: the local **RTK token-compression hook** (`~/.claude/settings.json:136` → `hooks/rtk-rewrite.sh`). It `rtk rewrite`s Bash commands before they run — `curl …x.json` → `rtk curl …` and `cat …x.json` → `rtk read …`, both of which emit a token-saving **type-schema summary** (alphabetized keys, `string[74]`/`date?`/`float`) instead of the raw body. `head`/`python -c json.load` are NOT rewritten, which is why local file checks showed raw JSON while `curl` showed the schema — the inconsistency that masked the cause.

Proof the origin is correct: `WebFetch` (egresses from Anthropic, bypasses the Bash/RTK channel) returned valid raw JSON with quoted keys for `methodology.json`. The site and its public JSON API are healthy for all real consumers. No code change, no redeploy needed.

**Diagnostic gotcha for next session:** to inspect a JSON endpoint/file truthfully, use `WebFetch`, or bypass RTK (`command curl …`, `rtk read --raw …`, or `head`/`python`). Don't trust `curl …json` / `cat …json` output through the Bash channel — it's summarized.

## Top 3 next priorities
1. **Manual 375px mobile pass** — `npx serve out`, spot-check all 8 routes for horizontal overflow + reduced-motion.
2. **Wire BenchmarkSparkline history** — currently single-snapshot ("Not enough history"); accrue AA snapshots over time so model trend charts populate.
3. **`/compare` polish** — difference-highlighting + filter UX review on the 2–6 plan picker.

(The former #1 "investigate /data/api transform" is resolved — false alarm, RTK artifact. See Known issue section above.)
