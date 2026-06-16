# Value Score Calculation Methodology

This document explains how Code Smart computes the Value Score for each AI coding plan. It is the authoritative reference for the `/methodology` page and for contributors maintaining the scoring logic.

---

## 1. Overview

The Value Score answers one question: **how much high-quality AI coding capability does this plan provide per dollar per month?**

It is built from three independently sourced inputs:

| Input | Source | How obtained |
|-------|--------|-------------|
| Model quality | Artificial Analysis (AA) | Weekly API fetch, stored as dated snapshots |
| Usage capacity | Derived from plan usage limits | 8-rule estimation strategy applied to provider JSON data |
| Pricing | Official provider pricing pages | Manual verification, stored in provider JSON files |

No single input is computed by Code Smart. We derive, normalize, and combine independently published data. Where data is estimated rather than directly observed, every displayed figure carries a confidence badge.

---

## 2. The Core Formula

Scoring proceeds in three steps.

### Step 1 — Weighted Model Quality (WMQ)

```
WMQ = 0.50 × Agentic Index
    + 0.40 × Coding Index
    + 0.10 × Speed Score
```

All three inputs are on a 0–100 scale. WMQ is therefore always 0–100.

Weight rationale:
- Agentic Index (50%): multi-step autonomous task completion is the highest-value capability for a professional coding assistant.
- Coding Index (40%): raw code generation and debugging quality is the baseline capability.
- Speed Score (10%): speed matters, but is secondary to quality for the typical use case (non-real-time, deliberate coding sessions).

### Step 2 — Quality Adjusted Monthly Usage (QAMU)

```
QAMU = Estimated Monthly Tokens × (WMQ / 100)
```

This converts raw token capacity into quality-adjusted capacity. A plan with 200,000 tokens/month and WMQ 80 delivers 160,000 quality-adjusted tokens. A plan with the same token count but WMQ 40 delivers only 80,000 quality-adjusted tokens.

### Step 3 — Value Score

```
Value Score (raw) = QAMU / Effective Monthly Price (USD)
Value Score (normalized) = normalized within price tier to 0–100
```

Higher is better. The normalization step makes scores comparable within a price tier (see Section 8).

---

## 3. Agentic Index and Coding Index

**Source:** [Artificial Analysis](https://artificialanalysis.ai) — an independent AI benchmarking organization that maintains continuously updated model leaderboards.

- **Agentic Index (0–100):** AA's composite of multi-step tool use, instruction following, and autonomous task completion benchmarks. As of June 2026, this includes SWE-bench Verified, OSWorld, TAU-bench, and other agentic evaluation suites, combined by AA's own weighting methodology.
- **Coding Index (0–100):** AA's composite of code generation, debugging, and refactoring benchmarks. As of June 2026, this includes HumanEval, LiveCodeBench, Aider Polyglot, and SWE-bench Verified.

Code Smart fetches these weekly via the AA API and stores them as dated snapshots in `src/data/aa-snapshots/`. We do not compute these indices — they are AA's own composite scores. The methodology for AA's indices is documented at [artificialanalysis.ai/methodology](https://artificialanalysis.ai/methodology).

**Staleness:** If the most recent snapshot for a model is older than 14 days, the fetch script logs a stale warning (exit code 1). The value is still used, but the plan card shows the snapshot date so users can see the data age.

**If null:** When AA has no profile for a model (aa_slug is null and no inherits_from parent), WMQ cannot be computed. The plan's Value Score displays as "—" (not 0). Uncertainty Score is set to 100. This applies to models with no public benchmark presence (e.g., proprietary wrapped models with no independently verified benchmarks).

---

## 4. Speed Score

**Source:** Artificial Analysis output tokens per second (median, measured by AA across their standard test suite).

Speed is normalized to a 0–100 scale with a linear transform:

```
Speed Score = min(100, speed_tps / 2.0)
```

Reference points:
- 0 tps → Score 0
- 100 tps → Score 50
- 200 tps → Score 100 (upper anchor: fastest frontier models as of June 2026)
- Greater than 200 tps → Score 100 (capped)

**Why linear, not logarithmic:** Speed has linear value to a developer in a typical coding session. A response at 100 tps is meaningfully twice as fast as 50 tps — the time savings is proportional, not diminishing, within the range where most users operate. A logarithmic curve would underweight the practical difference between 50 and 150 tps.

**Upper anchor recalibration:** The divisor (2.0, meaning 200 tps = 100) is recalibrated annually when the frontier speed upper anchor shifts significantly. If models routinely exceed 200 tps, the anchor is raised and all Speed Scores are recomputed.

**If null:** Speed Score defaults to 50 (the neutral midpoint of the 0–100 scale). This is noted in the plan's Uncertainty Score and shown as an "assumed" confidence badge on the speed display.

---

## 5. Estimated Monthly Tokens

Token estimation is now performed by the **normalization engine** (`src/lib/normalization/engine.ts`, methodology v1.0.0). See `src/lib/normalization/config.ts` for the full assumption table. This engine replaces the simplified priority table used in earlier versions.

### 5.1 Normalization Engine

The engine converts heterogeneous `usage_limits` rows (scraped from provider pricing pages) into per-window token estimates using an 8-layer priority dispatch. The first matching layer wins.

| Layer | Trigger | Method | Confidence |
|-------|---------|--------|------------|
| 1. Direct tokens | `limitUnit = "tokens"` | Use value directly; apply model multiplier if configured | observed |
| 2. Unlimited/Fair use | `limitType = "fair_use"` or text contains "unlimited" | `sessionsPerMonth × tokensPerAgenticRequest.base` | assumed |
| 3. Message limits | `limitUnit = "messages"` | Monthly messages × `tokensPerCodingMessage` (low/base/high range) | inferred |
| 4. Request limits | `limitUnit = "requests"` or `"calls"` | Monthly requests × `tokensPerAgenticRequest` (low/base/high range) | inferred |
| 5. Credit limits | `limitType = "credits"` | Credits × provider-specific or default credit-to-token mapping | inferred (mapped) / assumed (default) |
| 6. Compute units | `limitType = "compute_units"` | Units × provider-specific or default compute-unit-to-token mapping | inferred (mapped) / assumed (default) |
| 7. Time-window catch-all | Numeric value with reset window | Extrapolate proportionally; apply model multiplier if configured | window-dependent |
| 8. Unknown/Vague | Catch-all | All estimates null | unknown |

**Per-window estimates** are generated for 4 target time windows (5h, 24h, 1w, 1mo) using proportional extrapolation with confidence decay:

| Extrapolation Ratio | Confidence |
|---------------------|------------|
| 1× (same window) | observed |
| 0.2×–5× | inferred |
| 5×–50× | assumed |
| 50×+ | unknown |

Each estimate includes uncertainty ranges (low/high) derived from the assumption range or provider-specific mappings, a full conversion audit trail, and a methodology version tag. All displayed estimates carry a confidence badge matching the window with the highest-quality source data.

**Model-specific multipliers** are applied when a plan's model family has a configured multiplier (e.g., `claude-sonnet-4-6` matches family `claude-4` with a 2.5× factor). Multipliers are documented in the config and displayed in the estimate notes.

**Key config values** (from `config.ts` v1.0.0):

| Assumption | Base | Range |
|-----------|------|-------|
| Tokens per coding message | 2,000 | 1,000–5,000 |
| Tokens per agentic request | 5,000 | 3,000–12,000 |
| Tokens per autocomplete | 150 | 50–400 |
| Tokens per credit | 500 | — |
| Tokens per compute unit | 1,000 | — |
| Sessions per month (developer) | 80 | — |
| Working days per month | 20 | — |
| Weeks per month | 4 | — |
| Hours per session | 5 | — |

---

## 6. Key Assumptions

The following assumptions are built into the estimation rules. Each is explicitly documented, falsifiable, and will be updated when better data is available.

| Assumption | Value Used | Basis | What Would Change It |
|-----------|-----------|-------|---------------------|
| Tokens per message (chat plans) | 2,000 | ~300 input + 1,700 output for a typical coding query with code context | Provider-published average token/message data |
| Tokens per request (IDE agent plans) | 4,000 | ~2,000 context input + 2,000 generated output for a typical agent request | Community measurement data, or provider disclosure |
| Sessions per month (developer profile) | 80 | 4 sessions/day × 5 days/week × 4 weeks | Survey data showing different typical usage patterns |
| Tokens per session (unlimited plans) | 2,500 | Conservative estimate for a focused 5-hour session | User profile selection (planned v2 feature) |
| Speed Score upper anchor | 200 tps | Fastest frontier models as of June 2026 | Annual recalibration |
| Tokens per credit | 500 | Estimated average across credit-based providers; varies significantly by provider | Provider disclosure or community measurement |

The 200,000 tokens/month figure for unlimited plans is derived directly from the session assumption: 80 sessions × 2,500 tokens/session = 200,000.

---

## 7. Effective Monthly Price

```
Effective Monthly Price = min(monthly_usd, annual_monthly_usd)
```

If both monthly and annual pricing are available and annual is cheaper, the annual price is used. Most plans offer a 10–25% discount for annual commitment. The price displayed on the plan card always states whether it reflects annual billing.

Edge cases:
- If only monthly pricing is available: use monthly.
- If only annual pricing is available: use annual (divided by 12 to produce monthly equivalent).
- If both are null (contact-sales enterprise plans): Value Score cannot be computed. The plan is displayed but shows "—" for Value Score.

**Free plans (price = $0):** Division by zero is prevented. Free plans do not receive a Value Score. They are listed separately on the site and compared only on model quality and usage capacity.

---

## 8. Tier Normalization

Raw Value Scores have different natural ranges across price tiers because the price denominator differs. A $20/month plan and a $100/month plan produce very different raw QAMU/price ratios even at comparable quality. Normalization enables within-tier ranking on a consistent 0–100 scale.

```
Normalized Score = ((raw - tier_min) / (tier_max - tier_min)) × 100
```

Tier boundaries (by effective monthly price):

| Tier | Price Range |
|------|------------|
| Low cost | $0.01–$30/month |
| Mid cost | $30.01–$80/month |
| High cost | Greater than $80/month |

If only one plan exists in a tier, its Normalized Score is 100 (sole reference point).
Plans with a null raw score receive a null Normalized Score and sort to the bottom of their tier.

Tier boundaries are updated when the market pricing distribution shifts significantly (for example, if the majority of new plans release at $50–$100 and the current "high cost" bracket becomes the norm).

---

## 9. Uncertainty Score

The Uncertainty Score quantifies how many of a plan's inputs were non-observed (estimated or unknown rather than directly verified). It is additive:

```
Uncertainty Score = 0
  + 30  if agentic_index confidence ≠ "observed"
  + 25  if coding_index confidence ≠ "observed"
  + 10  if speed_tps confidence ≠ "observed"
  + 25  if plan pricing confidence ≠ "observed"
  + 10  if usage limit confidence ≠ "observed"
= min(100, sum)
```

| Score | Meaning | UI Treatment |
|-------|---------|-------------|
| 0 | All inputs directly observed | No badge |
| 1–49 | Some inputs inferred or assumed | "Low uncertainty" label |
| 50–74 | Multiple inputs estimated | Orange badge |
| 75–100 | Most inputs unknown or assumed | Red ⚠ warning badge |

A score above 50 shows a warning badge on the plan card, indicating that the Value Score should be treated as a rough estimate rather than a precise comparison.

---

## 10. Backward Compatibility

The previous scoring formula — 35% cost score + 40% benchmark score + 25% feature completeness score — is retained as `legacy_value_score` in `computed-scores.json` for debugging and regression detection. It is not displayed in the UI and is not exposed in API responses.

The `overall_value_score` field in API responses now maps to `value_score_normalized` (the WMQ + QAMU formula). This is a breaking change in semantic meaning but not in the JSON key name. All existing tests that check `overall_value_score` are updated to reflect the new formula's expected ranges.

The feature completeness score (used in the legacy formula) continues to be computed and stored in `computed-scores.json` as `feature_completeness_score`. It is available for internal analysis.

---

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| v3.1 | 2026-06-15 | Rankings layer (`RANKINGS_METHODOLOGY_VERSION` 1.0.0): 10 persisted rankings — 3 price bands, 4 model-metric lists, best-plans-per-model, provider coding-value, transparency. No formula change. See §12. |
| v3.0 | 2026-06-15 | Normalization engine v1.0.0 replaces simplified estimation table; per-window estimates with uncertainty ranges; model multipliers |
| v2.0 | 2026-06-14 | New WMQ + QAMU formula; AA indices replace internal benchmarks; tier normalization; Uncertainty Score |
| v1.0 | 2026-05-01 | Initial formula: 35% cost + 40% benchmark + 25% feature completeness |

---

## 12. Rankings

Rankings aggregate the per-plan and per-model figures above into the ten ordered lists the site publishes. The ranking layer adds **no new formula** — it filters, sorts, and groups the existing WMQ / QAMU / Value Score / Uncertainty outputs, then persists each list with its own methodology version.

**Methodology version:** `RANKINGS_METHODOLOGY_VERSION = "1.0.0"` (defined in `src/lib/rankings.ts`, an axis independent of the engine's `ENGINE_VERSION`). It bumps when the *aggregation* rules change — band semantics, sort keys, the ranking-set shape — not when the underlying math does. Every persisted ranking row and the `rankings.json` payload is stamped with this version so any stored ranking remains reproducible against the methodology that produced it.

**Computation split:** `computeAllRankings()` in `src/lib/rankings.ts` is pure and deterministic — no clock, no IO, no randomness. `scripts/generate-rankings.ts` performs the IO: it loads the latest AA scores (`getLatestAAScores`) and provider plans (`getAllPlans`), recomputes per-plan value estimates in-process (via `computePlanValueEstimates`, so rankings never depend on a possibly-stale `model-value-estimates.json`), calls `computeAllRankings({ plans, estimatesByPlan, aaScores, observedAt })`, then writes one row per ranking type to the `rankings` DB table and the full set to `public/data/api/rankings.json`.

### 12.1 The Ten Rankings

| # | `rankingType` | View key | Source metric | Sort (desc) |
|---|---------------|----------|---------------|-------------|
| 1 | `price-band-low` | `byPriceBand.low` | plan×model Value Score, low band | Value Score |
| 2 | `price-band-mid` | `byPriceBand.mid` | plan×model Value Score, mid band | Value Score |
| 3 | `price-band-high` | `byPriceBand.high` | plan×model Value Score, high band | Value Score |
| 4 | `model-intelligence` | `byIntelligence` | AA Intelligence Index | index |
| 5 | `model-coding` | `byCoding` | AA Coding Index | index |
| 6 | `model-agentic` | `byAgentic` | AA Agentic Index | index |
| 7 | `model-wmq` | `byWeightedQuality` | WMQ (§2 Step 1) | WMQ |
| 8 | `best-plans-per-model` | `bestPlansPerModel` | per model: best plan in each band by Value Score | WMQ (model order) |
| 9 | `provider-coding-value` | `byProviderCodingValue` | peak coding-weighted value across a provider's plans/models | coding value |
| 10 | `transparency` | `byTransparency` | Transparency = 100 − Uncertainty (§9) | transparency |

- **Bands (#1–3):** top 10 plan×model combos each. Free / null-price plans are excluded — they carry no Value Score (§7).
- **Model rankings (#4–7):** top 10 models each, one row per model (deduped — these metrics are plan-independent). A model with a null metric is excluded. #4–6 use the AA snapshot's own confidence; #7 uses the confidence `computeWMQ` returns (which may differ when speed is defaulted).
- **#8 best-plans-per-model:** for every model with ≥1 confidence-passing plan estimate (output WMQ-sorted, nulls last), `{ bestLowCost, bestMidCost, bestHighCost }` — each the top-Value-Score plan in that band, or `null` plus an explanation caveat when the model has no plan in that band.
- **#9 provider-coding-value:** per (plan, model), `codingValue = (estimatedMonthlyTokens × CodingIndex/100) / effectiveMonthlyPrice`; a provider's score (`codingValuePeak`) is the **maximum** codingValue across all its plans and models — its single best usable coding-value offering — with `bestPlanId` / `bestModelId` recording where the peak occurs.
- **#10 transparency:** all plans, scored `100 − UncertaintyScore`. The plan's representative model for the AA-confidence term is its highest-WMQ estimate.

### 12.2 Price Bands

Bands match the §8 tier boundaries (by effective monthly price):

| Band | Price Range |
|------|------------|
| Free | $0 / null |
| Low  | $0.01–$30/month |
| Mid  | $30.01–$80/month |
| High | Greater than $80/month |

`getPriceBand(price)` returns `"free"` for null or ≤ 0, `"low"` for ≤ 30, `"mid"` for ≤ 80, else `"high"`. Free-band plans never appear in the value-ranked bands (#1–3) because they have no Value Score.

### 12.3 Raw vs Normalized Value Score

Plan×model rows expose **both** value scores from §2 Step 3:
- `valueScoreRaw` — unnormalized `QAMU(1mo) / Effective Monthly Price`. Comparable across the whole dataset; it is the sort key within a band.
- `valueScore` — the §8 tier-normalized 0–100 score. Comparable within a tier; the human-facing figure.

Exposing both lets the frontend rank within a band by the raw ratio while still showing the friendly 0–100 number. A row with a null raw or normalized score sorts to the bottom.

### 12.4 Confidence Inclusion Policy

Default `minConfidence = "assumed"`: a row is ranked when its governing confidence is `observed`, `inferred`, or `assumed`; `unknown` and null-metric rows are dropped. The governing confidence is the estimate's confidence for plan×model rows (#1–3, #8, #9), the AA snapshot's for #4–6, and `computeWMQ`'s for #7. Every included row below `observed` carries a caveat string naming the confidence level. #8 additionally emits an explicit per-band null-reason caveat. A `RankingConfig.minConfidence` override can tighten any run to observed-only.

**Exception — transparency (#10):** the transparency ranking intentionally includes **all** plans regardless of confidence; suppressing low-confidence plans would defeat the purpose of a list whose job is to surface how opaque each plan's data is. Opaque plans simply rank low (high uncertainty → low transparency).

### 12.5 Determinism (acceptance a)

Every list carries a **total order**: primary metric desc → `monthlyPriceUsd` asc (null last) → `planId` asc → `modelId` asc (provider lists tie-break on `providerId` asc; model lists on `modelId` asc). Because `observedAt` is injected as the only clock read, identical DB state yields byte-identical `payloadJson` and `rankings.json` on re-run — Map iteration order cannot affect output.

### 12.6 Output Fields

Each row carries the spec-required provenance: `rank, providerId, providerName, confidence, caveats[], sourceDates{aa, pricing, usage}`. Plan×model rows add `planId, planName, modelId, modelDisplayName, monthlyPriceUsd, priceBand, weightedModelQuality, estimatedMonthlyTokens, modelAdjustedMonthlyTokens, qualityAdjustedMonthlyUsage (QAMU), valueScoreRaw, valueScore`. The full set is wrapped as `{ generatedAt, methodologyVersion, rankings: { … } }`.
