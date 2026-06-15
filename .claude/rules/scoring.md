---
paths:
  - src/lib/value-scorer.ts
  - src/lib/normalization/**
  - tests/value-scorer.test.ts
  - tests/normalization/**
---
# Scoring Rules
- QAMU formula (docs/calculation-methodology.md) is the authoritative scoring spec — do not revert to legacy weights
- `WEIGHTS` object and `COST_REFERENCE_USD` are calibration constants — changes need a doc update in calculation-methodology.md
- Normalization engine dispatch order (Layers 1–8 in engine.ts) must not be reordered — priority is intentional
- `normalizeLimit()` is pure — no side effects, no DB calls
- Confidence must propagate downward only: never upgrade (observed > inferred > assumed > stale > unknown)
- `usageLimitToRow()` in value-scorer.ts is the only place JSON UsageLimit → UsageLimitRow conversion happens — keep it there
- Test normalization in isolation (`tests/normalization/`) not via value-scorer integration tests
