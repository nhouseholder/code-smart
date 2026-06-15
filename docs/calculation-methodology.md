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

Most plans do not publish token counts directly. Code Smart derives a monthly token estimate from each plan's publicly stated usage limits using the following rules, applied in priority order:

| Priority | Limit Type | Estimation Formula | Confidence |
|----------|-----------|-------------------|------------|
| 1 | `tokens_per_month` | Use stated value directly | observed |
| 2 | `tokens_per_day` | `value × 20 working days` | inferred |
| 3 | `messages_per_month` | `value × 2,000 tokens/message` | inferred |
| 4 | `messages_per_day` | `value × 20 days × 2,000 tokens/message` | inferred |
| 5 | `requests_per_month` | `value × 4,000 tokens/request` | assumed |
| 6 | `credits_per_month` | `value × 500 tokens/credit` | assumed |
| 7 | `unlimited` | 200,000 tokens/month (developer profile baseline) | assumed |
| 8 | `unknown` | null — no estimate possible | unknown |

The first matching rule in this list is used. If multiple limit types are present in a plan's data, only the highest-priority matching rule applies.

**Derived estimates from monthly total:**

| Period | Formula | Basis |
|--------|---------|-------|
| 5-hour session | `monthly ÷ 80` | 80 sessions/month (4/day × 20 working days) |
| Daily | `monthly ÷ 20` | 20 working days/month |
| Weekly | `monthly ÷ 4` | 4 weeks/month |

All derivations carry the same confidence level as the monthly estimate. Every displayed estimate includes its confidence badge and a human-readable explanation of how it was computed.

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
| v2.0 | 2026-06-14 | New WMQ + QAMU formula; AA indices replace internal benchmarks; tier normalization; Uncertainty Score |
| v1.0 | 2026-05-01 | Initial formula: 35% cost + 40% benchmark + 25% feature completeness |
