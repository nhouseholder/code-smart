# Code Smart — Product Specification

## 1. Product Overview

Code Smart answers a single question: **Which AI coding plan gives a professional developer the most value per dollar spent?**

This site is not affiliated with any provider. Every data point displayed links to a source with a confidence level. No provider pays for placement. Rankings are computed mechanically from third-party benchmark data and published pricing — not from editorial judgment or vendor relationships.

**Target user:** A solo developer or small team lead with a $0–$200/month AI coding budget who is actively comparing Claude Pro, Cursor Pro, GitHub Copilot, ChatGPT Plus, and similar plans. They want to understand real usage limits — not marketing copy — and they want to know which plan gives them the most AI capability per dollar for a typical professional coding week.

**What this site is not:**
- Not a general-purpose AI directory (focuses on coding plans only)
- Not a review site (no opinion scores, no star ratings)
- Not affiliated with Artificial Analysis or any data provider
- Not real-time (data is updated on a weekly snapshot schedule, not live)

---

## 2. Core Value Propositions

### VP1 — Proprietary Value Score from Independent Indices
The ranking is computed from Artificial Analysis (AA) indices — a third-party, independent benchmarking organization — not from provider self-reported benchmarks. AA publishes Intelligence, Coding, and Agentic indices for each model. Code Smart fetches these weekly via the AA API, stores dated snapshot files, and applies a weighted formula (§5) to produce a Value Score per plan+model combination. Providers cannot influence their own ranking.

### VP2 — Provenance on Every Number
Every price, limit, benchmark, and estimate shown carries a confidence badge:
- **observed** — directly confirmed from a primary source (provider pricing page, AA API response)
- **inferred** — derived from another observed value by logical extension (e.g., annual price ÷ 12 for monthly effective)
- **assumed** — used a documented assumption where the true value is unknown (e.g., estimated tokens/session from a vague "usage limit")
- **stale** — was observed, but the observation is older than 90 days
- **unknown** — no reliable source; field is blank or zeroed

Every data point also displays the source URL and the date it was last confirmed. No number appears without a source.

### VP3 — Usage Estimation in Developer-Meaningful Units
Provider limits are expressed in inconsistent units: some quote messages/month, others quote tokens/day, others have no published limit at all. Code Smart normalizes all limits to token equivalents and estimates how far a plan takes a typical developer across four time windows:
- **Per 5-hour coding session**
- **Per 24 hours**
- **Per week (5 working days)**
- **Per month (20 working days)**

Estimates use documented assumptions (e.g., average tokens per coding message = 1,500 input + 800 output) and clearly display the assumption chain. Where limits are unknown, the estimate is blank rather than fabricated.

### VP4 — Tier-Ranked Top-10 Lists
Plans are grouped into three price tiers and ranked within each tier:
- **Low-cost:** $20–$30/month effective price
- **Mid-cost:** $30–$80/month effective price
- **High-cost:** >$80/month effective price

Free plans are shown separately and are not ranked against paid plans. Top-10 lists per tier let a developer quickly find the best option at their budget level without comparing across incompatible price points.

### VP5 — Model Comparison Across Providers
Many providers offer the same underlying model (e.g., Claude Sonnet 4.6 appears in Anthropic's Claude Pro, Cursor Pro, and potentially others). Code Smart tracks this and shows:
- Which providers offer each model
- The AA Intelligence, Coding, and Agentic indices for that model (independent of provider)
- The best-value plans for accessing that model, ranked by Value Score

This lets a developer see: "If I want Claude Sonnet 4.6, which plan gives me the most of it per dollar?"

---

## 3. Plan Comparison Feature

The plan comparison table displays the following columns in this order:

| # | Column | Notes |
|---|--------|-------|
| 1 | Provider name + logo | Logo sourced from provider's official assets |
| 2 | Plan name + tier badge | Tier badge: Free / Low / Mid / High |
| 3 | Monthly price (pay-monthly) | As quoted on provider's pricing page, USD |
| 4 | Annual effective monthly price | Annual plan total ÷ 12; blank if annual not offered |
| 5 | Billing interval | `monthly` / `annual` / `per-seat` |
| 6 | Included models | Each model listed with access type: `full` / `limited` / `preview` |
| 7 | Primary usage limit | Type (token/message/credit/request/unknown) + value + unit |
| 8 | Credits per month | Numeric credit balance if credit-based; blank otherwise |
| 9 | Rate limits | Requests per minute or tokens per minute, if published |
| 10 | Estimated usage | 5h session / 24h / weekly (5d) / monthly (20d) in tokens |
| 11 | Uncertainty score | 0–100; higher = more inputs are non-observed or stale |
| 12 | Last updated date | Date the plan data was last confirmed against source |
| 13 | Source URL | Link to the provider's pricing or limits page |

**Sorting:** Default sort is Value Score descending within selected tier. User can re-sort by any numeric column.

**Filtering:** User can filter by tier, by included model, by billing interval, and by maximum monthly price.

---

## 4. Model Comparison Feature

The model comparison table displays the following columns in this order:

| # | Column | Notes |
|---|--------|-------|
| 1 | Model name + provider | Provider who developed the model (not who resells it) |
| 2 | AA Intelligence Index | 0–100, from Artificial Analysis; `null` if no AA profile |
| 3 | AA Coding Index | 0–100, from Artificial Analysis; `null` if no AA profile |
| 4 | AA Agentic Index | 0–100, from Artificial Analysis; `null` if no AA profile |
| 5 | Speed | Output tokens per second, from Artificial Analysis |
| 6 | Input price per 1M tokens | API pricing only; blank for subscription-only models |
| 7 | Output price per 1M tokens | API pricing only; blank for subscription-only models |
| 8 | Model release date | Calendar date + age in months from today |
| 9 | Available via | List of providers/plans that include this model |
| 10 | Best-value plans | Top 3 plans by Value Score that include this model |

**Sorting:** Default sort is AA Coding Index descending. User can re-sort by any numeric column.

**Filtering:** User can filter by provider (developer), by minimum AA index value, and by plan availability (e.g., "only models available on at least one plan I'm considering").

---

## 5. Proprietary Ranking

### Value Score Formula

```
WMQ (Weighted Model Quality) = 0.50 × Agentic_Index + 0.40 × Coding_Index + 0.10 × Speed_Score
  where Speed_Score = speed_tps normalized to 0–100 within the set of all tracked models

QAMU (Quality-Adjusted Monthly Usage) = estimated_monthly_tokens × (WMQ / 100)

Value Score (raw) = QAMU / effective_monthly_price_usd

Value Score (normalized) = raw score normalized to 0–100 within price tier
```

- Plans with no published usage limit receive `estimated_monthly_tokens = null`, making their QAMU and Value Score null (not ranked).
- Plans with no AA profile for their primary model receive `WMQ = null` (not ranked).
- The uncertainty score (0–100) accumulates penalty points for each non-observed or stale input to the formula. A score of 0 means all inputs are "observed"; 100 means all inputs are "assumed" or "unknown".

### Tier Definitions

**Low-cost ($20–$30/month effective):** Plans where the effective monthly price (accounting for annual billing) falls between $20.00 and $30.00 USD inclusive.

**Mid-cost ($30–$80/month effective):** Plans where the effective monthly price falls between $30.01 and $80.00 USD inclusive.

**High-cost (>$80/month effective):** Plans where the effective monthly price exceeds $80.00 USD.

**Free:** Plans with $0 effective monthly price. Displayed on the site but excluded from tier rankings.

### Tier Top-10 Lists

Each tier displays the top 10 plan+model combinations by normalized Value Score. If a provider offers multiple plans in the same tier, all may appear. A single plan can appear multiple times if it offers multiple primary models (each plan+model pair is a separate row in the ranking).

---

## 6. Transparency Requirements

Every page must display:

1. **Last updated date** for every data point — shown adjacent to the value, not just in a footer.
2. **Source link** for every price, limit, and benchmark — a clickable URL to the primary source.
3. **Confidence badge** for every data point — color-coded: observed (green) / inferred (blue) / assumed (yellow) / stale (orange) / unknown (red).
4. **Methodology callout** — a persistent link or inline callout on ranking pages explaining the Value Score formula and directing users to `/methodology`.
5. **Visual distinction** — confirmed values, inferred values, and estimated values must be visually distinct at all times. No mixing of confidence levels in a single cell without flagging.

The `/methodology` page (§7) must be linked from every page that shows a ranking or Value Score.

---

## 7. Page Inventory

### Page 1: `/` — Homepage
- **Hero section:** tagline, brief explanation of what Code Smart does, link to methodology
- **PlansGrid:** filterable grid of all tracked plans; filters: tier, included model, max price, billing interval
- **ComparisonTable:** top 6 plans across all tiers, full column set (§3)
- **TierTopTen section:** three side-by-side panels (Low / Mid / High) each showing top 10 ranked plan+model combos
- **Methodology callout:** brief explanation of Value Score with link to `/methodology`

### Page 2: `/providers/[id]` — Provider Detail
- Provider name, logo, brief description, official website link
- Model grid: all models offered by this provider with their AA indices (Intelligence / Coding / Agentic / Speed)
- Plan cards: all plans from this provider with pricing, limits, and estimated usage
- Full feature table: every tracked feature for every plan from this provider
- Confidence + source displayed for each data point

### Page 3: `/models` — Model Catalog
- Filterable, sortable table of all tracked models
- Columns: model name + developer, AA indices (3), speed, API pricing, age, available via, best-value plan
- Filter: by developer, by minimum AA index, by plan availability
- Sort: any numeric column

### Page 4: `/models/[id]` — Model Detail
- Model name, developer, release date, age
- AA index values (Intelligence / Coding / Agentic / Speed) with confidence badge and source
- 12-week sparkline chart for each AA index (one data point per weekly snapshot)
- Plan availability: all plans that include this model, with tier badge and Value Score
- Best-value plans: top 3 by Value Score with this model highlighted

### Page 5: `/compare` — Side-by-Side Comparison
- User picks 2–6 plans via search/select
- Full feature matrix: one column per selected plan, one row per feature
- Rows grouped by category: Pricing / Models / Usage Limits / Features / Rankings
- Cells color-coded: green (best in row) / neutral / red (worst in row)
- Export: copy comparison as markdown table

### Page 6: `/methodology` — Methodology Explanation
- Value Score formula: step-by-step derivation of WMQ → QAMU → raw → normalized
- Token estimation rules: documented assumptions for each limit type (token/message/credit/unknown)
- Confidence system: definition of each confidence level, how it is assigned, what triggers a stale flag
- AA index sources: how AA indices are fetched, what they measure, link to AA methodology page
- Update schedule: weekly AA fetches (Monday 8am UTC), 90-day staleness threshold for provider data
- Uncertainty score calculation: which inputs contribute, penalty weights per confidence level

---

## 8. Data Freshness Policy

### Provider Pricing and Limits
- Staleness threshold: **90 days**
- When a data point reaches 90 days without re-confirmation, its confidence badge changes to `stale` and its uncertainty score contribution increases
- The daily GitHub Actions check (`daily-check.yml`) identifies stale records and opens a GitHub issue listing them

### Artificial Analysis Indices
- Fetch schedule: **weekly, Monday 8am UTC** via GitHub Actions (`weekly-aa-fetch.yml`)
- Storage: one snapshot file per fetch, committed to git as `src/data/aa-snapshots/YYYY-MM-DD.json`
- Fallback: if the AA API fetch fails, `src/data/aa-indices-override.json` is used (confidence = `assumed`)
- Build-time resolution: the build reads the most recent snapshot file (sorted descending by date)
- Sparkline history: the 12 most recent snapshot files, one data point per file

### Computed Scores
- Regenerated at every build by `scripts/recompute-scores.ts`
- Output written to `src/data/computed-scores.json`
- Never edited manually — always regenerated from source files
- The `computed_at` timestamp in the file is the authoritative age of the scores

### Uncertainty Score Accumulation
The uncertainty score (0–100) for a plan is the weighted average of confidence levels for all inputs to its Value Score:
- `observed` contributes 0 penalty points
- `inferred` contributes 10 penalty points
- `assumed` contributes 35 penalty points
- `stale` contributes 50 penalty points
- `unknown` contributes 75 penalty points

A plan with all observed inputs has uncertainty = 0. A plan where every input is unknown or stale has uncertainty approaching 100.
