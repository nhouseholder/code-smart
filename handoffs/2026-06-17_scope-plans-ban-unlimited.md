# Handoff — 2026-06-17 · Scope plans to paid individual/pro + ban "unlimited" coding limits

**Version shipped:** v1.4.0
**HEAD SHA:** 85deba6b94e49c43e9a7a82277305c85a06fecdb
**Live:** https://code-smart.pages.dev (deployment 14008dff) — production branch `main`

## What changed
- **In-scope filter** at the loader chokepoint (`src/lib/data-loader.ts` `isInScopePlan`, applied in `getAllProviders`; `src/db/seed.ts` mirrors it). Keep-rule: `tier ∈ {individual, pro} AND monthly_usd > 0`. Reduces 30 → **10** surfaced plans. Removal is reversible (filter, not JSON deletion); raw provider JSON retained.
  - Survivors (10): anthropic-pro $20, anthropic-max $100, openai-plus $20, copilot-individual $10, cursor-pro $20, google-gemini-advanced $19.99, kimi-plus $8, kimi-pro $27, copilot-xcode-individual $10, mimo-pro $14.99.
  - Removed (20): 10 free, 4 api/pay-per-token (minimax×2, qwen×2), 4 team, 2 enterprise (copilot-enterprise, openai-pro $200).
- **"unlimited" banned as a coding limit:** removed from `LimitType` (`src/types/index.ts`) + `LimitTypeSchema` (`src/lib/schema.ts`); normalization engine Layer 2 (fake ~40K-token manufacture) deleted → undocumented limits fall through to `unknown` → null; scraper (`limit-extractor.ts`) emits `vague`/`unknown` for unlimited/fair-use; display arms dropped in PlanCard/ComparisonTable/value-scorer/plans-page.
- **6 formerly-"unlimited" survivors** now carry a real sourced coding limit or honest `type:"unknown"` (confidence `unknown`) with a dig-deeper note + provenance URL — **no fabrication**. (copilot-individual, copilot-xcode-individual, cursor-pro, kimi-plus, kimi-pro, mimo-pro.) Note: the word "unlimited" still appears in explanatory note *prose* (intentional — explains why it's banned), never as a field value.
- Also includes the AA cost-per-task efficiency feature (prior verified work, was uncommitted).

## Verification
- Gate (all ✓): `pnpm validate` (11 files) · `typecheck` · `lint` · `test` (307 passed) · `quality-check` (0 errors, 62 warnings) · `build` (50/50 static pages, 3/3 exported, no 500s on now-empty providers minimax/qwen/opencode).
- **Live raw check** (`/data/api/plans.json`, cache-busted, python-parsed): 10 plans / 10 distinct ids = exact survivors; `"type":"unlimited"` → none; banned tier values (free/api/team/enterprise/unlimited) → none.

## Top 3 next priorities
1. (Optional) Physical purge of removed-plan provider JSON — currently filtered at loader; deletion is a deliberate follow-up if wanted.
2. Re-verify Copilot Pro coding allowance once GitHub publishes a concrete agentic request quota (currently honest `unknown` post 2026-06-01 usage-based-billing switch).
3. Confirm `/compare` and `/rankings` UX reads well with only 10 plans (visual pass).
