# code-smart — Current State

**Version:** 1.0.7
**Updated:** 2026-06-15
**Branch:** main

---

## What just shipped

- `src/lib/model-value-engine.ts` — WMQ engine (50% agentic + 40% coding + 10% speed), quality-adjusted token estimates (tokens × WMQ/100), model-cost-adjusted estimates for credit-based plans, value_score 0–100
- `src/types/index.ts` — `AAModelScore` and `ModelValueEstimate` interfaces
- `tests/model-value-engine.test.ts` — 24 tests, all passing (184 total)
- `src/lib/value-scorer.ts` — exported `usageLimitToRow()` for engine import

## What's next

1. Wire AA data from `artificial_analysis_model_scores` DB table into `computePlanValueEstimates` caller (Session 7)
2. Replace benchmark proxy WMQ in `value-scorer.ts` with real `computeWMQ()` from engine
3. Build the static-generation step that runs `computePlanValueEstimates` for all plans → writes `public/data/model-value-estimates.json`
4. Add `AAModelScore` rows to DB for real providers (Anthropic, OpenAI, Google, Cursor)
5. Surface `ModelValueEstimate` data in the comparison UI (value_score column + quality-adjusted tooltip)

## Architecture notes

- Normalization engine: `src/lib/normalization/engine.ts` — converts usage limits to per-window token estimates
- Value engine: `src/lib/model-value-engine.ts` — quality-adjusted + cost-adjusted on top of normalization
- Static JSON data: `src/data/providers/*.json` — no AA data here; AA lives in DB only
- No runtime DB in production — all data must be pre-generated to `public/data/`
