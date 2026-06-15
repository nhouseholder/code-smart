# Frontend Design Plan

**Project:** Code Smart
**Date:** 2026-06-14
**Status:** Pre-implementation — authoritative spec for the implementation phase

---

## 1. Current Route Inventory

Two routes exist today:

| Route | Component | Status |
|-------|-----------|--------|
| `/` | `src/app/page.tsx` — Hero, PlansGrid, ComparisonTable | Live, needs TierTopTen + score updates |
| `/providers/[id]` | `src/app/providers/[id]/page.tsx` — provider header, ModelGrid, PlanCards | Live, needs AA index columns |

---

## 2. Target Route Map

Six total routes at full implementation:

| Route | Rendering Mode | Data Source | Status |
|-------|---------------|-------------|--------|
| `/` | SSG, rebuilt on weekly AA push | JSON + computed-scores.json | Exists — needs TierTopTen + score updates |
| `/providers/[id]` | SSG, generateStaticParams | JSON + latest aa-snapshot | Exists — needs AA index columns |
| `/models` | SSG, rebuilt weekly | JSON + latest aa-snapshot | New |
| `/models/[id]` | SSG, generateStaticParams | JSON + last 12 aa-snapshot files | New |
| `/compare` | Client component (no server round-trip) | JSON passed as props from parent | New |
| `/methodology` | SSG, static content | Static content only | New |

**Rendering contract:** All pages are built as static HTML at deploy time. No runtime DB queries. No SSR. CF Workers serves pre-rendered pages. The only runtime code is client-side interactivity (sort, filter, compare picker, sparkline hover).

---

## 3. API Routes

All under `src/app/api/`. Route Handlers read from JSON files at startup — no database. Use `export const revalidate = 3600` for CDN caching across all handlers.

### Route Table

| Method | Path | Query Params | Response Shape |
|--------|------|-------------|----------------|
| GET | `/api/providers` | `?tier=`, `?maxPrice=` | `{ providers: Provider[], computed_at: string }` |
| GET | `/api/providers/[id]` | — | `{ provider: Provider, plans: PlanWithScore[], models: ModelWithAA[] }` |
| GET | `/api/plans` | `?tier=`, `?maxPrice=`, `?sort=value_score\|price\|benchmark\|provider` | `{ plans: PlanWithScore[], total: number }` |
| GET | `/api/models` | `?sort=intelligence_index\|coding_index\|agentic_index\|speed_tps\|model_age` | `{ models: ModelWithAA[], snapshot_date: string }` |
| GET | `/api/models/[id]` | — | `{ model: Model, aa_history: AAIndexSnapshot[], best_plans: PlanWithScore[] }` |
| GET | `/api/scores/top-by-tier` | — | `{ low: TierEntry[], mid: TierEntry[], high: TierEntry[], computed_at: string }` |
| GET | `/api/health` | — | `{ version: string, aa_last_fetched: string, scores_computed_at: string, providers_count: number }` |

### Response Types

```typescript
type PlanWithScore = {
  provider: Provider;
  plan: Plan;
  score: ValueScore;
};

type ModelWithAA = {
  model: Model;
  provider: Provider;
  aa: AAIndexSnapshot | null;
  best_plans: string[]; // plan IDs
};

type TierEntry = {
  rank: number;
  plan_id: string;
  model_id: string;
  provider_name: string;
  plan_name: string;
  value_score_normalized: number;
  price_usd: number;
};
```

### Implementation Notes

- Each handler imports JSON directly: `import computedScores from "@/data/computed-scores.json"`.
- Filtering (`?tier=`, `?maxPrice=`) is done in the handler, not pushed to a query language.
- `/api/health` is the canary endpoint — checked after every deploy.
- All handlers return `Content-Type: application/json` with a `Cache-Control: public, s-maxage=3600` header.

---

## 4. Component Tree

### `/` (Homepage) — Updated

```
<HomePage> [server, SSG]
├── <Hero> [server]
│   └── UPDATED: add "Models tracked" stat card
├── <PlansGrid> [client]
│   ├── <FilterBar> [client]
│   │   └── UPDATED: add model multi-select filter
│   └── <PlanCard> × N [server]
│       └── UPDATED: add UsageEstimateRow + UncertaintyScore
├── <ComparisonTable> [server]
│   └── UPDATED: add AA rows + usage rows
└── <TierTopTen> [server] — NEW
    ├── <TierSection label="Low Cost ($20–$30)">
    │   └── <PlanCard compact={true} /> × ≤10 (with rank badge overlay)
    ├── <TierSection label="Mid Cost ($30–$80)">
    │   └── <PlanCard compact={true} /> × ≤10
    └── <TierSection label="High Cost (>$80)">
        └── <PlanCard compact={true} /> × ≤10
```

Tiers with zero entries are skipped entirely. TierTopTen is placed below ComparisonTable and above the footer.

### `/providers/[id]` — Updated

```
<ProviderDetailPage> [server, SSG]
├── back link + provider header (existing)
├── <ProviderStats> (existing: plan count, model count, starting price, verified date)
├── <ModelGrid> [server]
│   └── <ModelCard variant="with-aa"> × N
│       └── UPDATED: 4 AA index pills added
└── <PlanCards> × N
    └── <PlanCard>
        └── UPDATED: UsageEstimateRow added
```

### `/models` — New

```
<ModelsPage> [server, SSG]
├── <ModelPageHeader> — page title, description, snapshot date ("AA data as of YYYY-MM-DD")
├── <ModelFilterBar> [client] — filter by provider, sort column
└── <ModelTable> [client]
    └── Row × N — one per model, all 10 columns, sortable
```

### `/models/[id]` — New

```
<ModelDetailPage> [server, SSG]
├── <ModelHeader> — name, provider badge, context length, release date, computed age
├── <AAIndexSummary> — 4 metric cards: Intelligence, Coding, Agentic, Speed
│   └── Each card: value, <AAIndexBadge>, confidence dot, link to AA source
├── <SparklineSection label="12-week trend">
│   ├── <BenchmarkSparkline metric="coding_index" snapshots={last12} />
│   └── <BenchmarkSparkline metric="agentic_index" snapshots={last12} />
├── <PlanAvailability> — table of all plans including this model
│   └── Each row: provider | plan name | tier | price | access type (full/limited/preview)
└── <BestValuePlans> — top 3 plans by value_score_normalized that include this model
    └── <PlanCard compact={true} /> × 3
```

### `/compare` — New

```
<ComparePage> [server, SSG — renders picker + empty matrix shell]
└── <CompareClient> [client — owns all state]
    ├── <ComparePicker> [client]
    │   └── Multi-select list, grouped by provider, max 6 plans
    │       Checkbox + plan name + price per row
    │       "Clear all" button
    │       URL query string sync: ?plans=anthropic-pro,cursor-pro,...
    └── <CompareMatrix> [client — shown when ≥2 plans selected]
        └── Sticky left column (row labels) + N plan columns
            Rows (in order):
              Plan name
              Provider
              Tier
              Monthly price
              Annual price
              Billing interval
              AA Coding Index
              AA Agentic Index
              Speed (tps)
              Est. tokens/month
              Est. tokens/5h session
              Value Score (tier-normalized)
              Usage limit
              Agent capabilities       [boolean: ✓/✗/—]
              Web search               [boolean: ✓/✗/—]
              Code context             [boolean: ✓/✗/—]
              File uploads             [boolean: ✓/✗/—]
              CLI access               [boolean: ✓/✗/—]
              API access               [boolean: ✓/✗/—]
              IDE integrations         [boolean: ✓/✗/—]
              Custom instructions      [boolean: ✓/✗/—]
              Uncertainty Score
              Source
              Last verified
```

Difference highlighting: non-maximum numeric values in a row get a subtle amber background when values differ across columns.

### `/methodology` — New

```
<MethodologyPage> [server, SSG — fully static content]
├── <FormulaBlock>
│   └── 3-equation chain, variable definitions with tooltips
│       Each variable: name, description, source, scale
├── <WeightRationale>
│   └── Explanation of 50/40/10 weighting (agentic > coding > speed)
│       Why agentic is top-weighted for developer workflows
├── <TokenEstimationTable>
│   └── All 8 estimation rules as a formatted table with assumptions
├── <AssumptionsTable>
│   └── 6 documented assumptions with falsifiability criteria
├── <ConfidenceLegend>
│   └── observed / inferred / assumed / stale / unknown — color codes + definitions
└── <DataSources>
    └── Links: AA, SWE-bench, HumanEval, Aider, provider pricing pages
```

---

## 5. New Components

### `<TierTopTen>` (server component)

**File:** `src/components/TierTopTen.tsx`

**Props:**
```typescript
type TierTopTenProps = {
  entries: {
    low: TierEntry[];
    mid: TierEntry[];
    high: TierEntry[];
  };
};
```

**Behavior:**
- Renders three labeled sections: "Low Cost ($20–$30)", "Mid Cost ($30–$80)", "High Cost (>$80)".
- Desktop layout: 5-column grid, 2 rows per tier (up to 10 cards per tier).
- Mobile: horizontal scroll container per tier section.
- Each card is `<PlanCard compact={true} />` with a rank badge overlay (absolute-positioned, top-left corner, "1st", "2nd", etc. or just the rank number).
- Tiers with 0 entries are not rendered (no empty section heading).
- Section heading includes entry count: "Low Cost ($20–$30) — 8 plans".

---

### `<ModelCard variant="with-aa">` (server component)

**File:** `src/components/ModelCard.tsx` (new file — ModelCard does not currently exist)

**Props:**
```typescript
type ModelCardProps = {
  model: Model;
  provider: Provider;
  aaSnapshot: AAIndexSnapshot | null;
  variant?: "default" | "with-aa"; // default: plain display
};
```

**Behavior:**
- Base display (variant="default"): model name, provider badge, context length, release date.
- variant="with-aa" adds 4 metric pills below the model name:
  - Intelligence: `<AAIndexBadge value={aa?.intelligence_index} label="AA Intelligence" confidence={aa?.confidence} />`
  - Coding: `<AAIndexBadge value={aa?.coding_index} label="AA Coding" confidence={aa?.confidence} />`
  - Agentic: `<AAIndexBadge value={aa?.agentic_index} label="AA Agentic" confidence={aa?.confidence} />`
  - Speed: `<AAIndexBadge value={speedScore} label="Speed (tps)" unit="tps" rawValue={aa?.speed_tps} confidence={aa?.confidence} />`
- When `aaSnapshot` is null: all 4 pills render with `value={null}` (gray "—" state).
- Entire card is a Next.js `<Link href={/models/${model.id}}>` — navigates to model detail page on click.
- Clicking the card does NOT navigate to provider page (that's the provider chip's job).

---

### `<ModelTable>` (client component)

**File:** `src/components/ModelTable.tsx`

**Props:**
```typescript
type ModelSortKey =
  | "intelligence_index"
  | "coding_index"
  | "agentic_index"
  | "speed_tps"
  | "model_age"
  | "api_input_price"
  | "api_output_price";

type ModelTableProps = {
  models: ModelWithAA[];
};
```

**Behavior:**
- Sortable table. Sort state managed with `useState<ModelSortKey>("coding_index")` + `useState<"asc" | "desc">("desc")`.
- Clicking a column header: if already sorted by that column, toggles direction. Otherwise, sorts descending by default.
- Columns (in order):

| Column | Sticky | Notes |
|--------|--------|-------|
| Model | Yes (left) | Links to `/models/[id]` |
| Provider | No | Provider name, no badge |
| Intelligence | No | `<AAIndexBadge>` |
| Coding | No | `<AAIndexBadge>` |
| Agentic | No | `<AAIndexBadge>` |
| Speed | No | `<AAIndexBadge unit="tps" rawValue={tps}>` |
| API Input $/1M | No | Formatted to 2 decimal places |
| API Output $/1M | No | Formatted to 2 decimal places |
| Age | No | "X months" or "X years Y months" |
| Available In | No | Comma-joined plan names, max 3 then "+ N more" |
| Best Plan | No | Top plan_id by value_score_normalized |

- Null AA values: render "—" (not "0", not empty). No sorting of null values above non-null.
- Null sort behavior: null values sort to the bottom regardless of sort direction.
- Each AA column header has a `title` attribute tooltip: "AA Coding Index — sourced from Artificial Analysis coding benchmarks. Scale: 0–100."
- Row is a `<Link>` to `/models/[model.id]`.

---

### `<AAIndexBadge>` (server component)

**File:** `src/components/AAIndexBadge.tsx`

**Props:**
```typescript
type Confidence = "observed" | "inferred" | "assumed" | "stale" | "unknown";

type AAIndexBadgeProps = {
  value: number | null;
  label: string; // e.g. "AA Coding"
  confidence: Confidence | null;
  unit?: string; // e.g. "tps" — appended after value
  rawValue?: number; // if provided (for speed), tooltip shows raw tps value
};
```

**Color rules:**
- `value >= 70`: green background (`bg-green-100 text-green-800`)
- `value >= 50 && value < 70`: amber background (`bg-amber-100 text-amber-800`)
- `value < 50`: red background (`bg-red-100 text-red-800`)
- `value === null`: gray background (`bg-gray-100 text-gray-500`), displays "—"

**Confidence dot:**
- Rendered as a 6px dot in the top-right corner of the pill.
- observed: green dot
- inferred: blue dot
- assumed: amber dot
- stale: red dot
- unknown / null: gray dot (hidden if confidence is null)

**Tooltip (title attribute):**
- When `rawValue` is provided: `"AA Speed: {rawValue} tps (normalized score: {value})"`
- Otherwise: `"{label}: {value}"` — e.g. `"AA Coding: 84.1"`
- When null: `"Artificial Analysis index not available for this model."`

**Invariant:** Label always prefixed with "AA" in tooltip. Never display a raw number without the "AA" prefix.

---

### `<UsageEstimateRow>` (server component)

**File:** `src/components/UsageEstimateRow.tsx`

**Props:**
```typescript
type UsageEstimate = {
  tokens_per_5h_session: number | null;
  tokens_per_day: number | null;
  tokens_per_week: number | null;
  tokens_per_month: number | null;
  confidence: Confidence;
  source_rule: string; // e.g. "rule_3_unlimited"
};

type UsageEstimateRowProps = {
  estimate: UsageEstimate;
};
```

**Behavior:**
- Renders a horizontal row of four cells: "5h session" | "Daily" | "Weekly" | "Monthly".
- Row header label: "Est. Usage" with an ⓘ icon that links to `/methodology#token-estimation`.
- One `<ProvenanceBadge confidence={estimate.confidence} />` rendered once for the row (not per cell).
- Token formatting rules:

| Value range | Display format |
|------------|----------------|
| `null` | "—" |
| < 1,000 | "800 tokens" |
| 1,000 – 999,999 | "45K tokens" |
| ≥ 1,000,000 | "1.2M tokens" |

- Formatting function: round to 1 decimal place for M values, round to nearest integer for K values.
- The confidence badge tooltip shows `source_rule` to explain which estimation rule was applied.

---

### `<UncertaintyScore>` (server component)

**File:** `src/components/UncertaintyScore.tsx`

**Props:**
```typescript
type UncertaintyScoreProps = {
  score: number; // 0–100
  notes: string[]; // reasons contributing to uncertainty
};
```

**Behavior:**
- Renders only when `score > 50`. Returns `null` below that threshold.
- Display: `⚠` icon + "Low confidence" text in amber (`text-amber-700`).
- Tooltip (via `title` attribute on the wrapper): joined `notes[]` separated by newlines.
- Example notes: "Pricing confidence: stale", "AA data missing", "Usage limit: unknown".
- Positioned next to the Value Score ring on PlanCard — does not push layout.

---

### `<BenchmarkSparkline>` (client component)

**File:** `src/components/BenchmarkSparkline.tsx`

**Props:**
```typescript
type SparklineMetric = "coding_index" | "agentic_index";

type BenchmarkSparklineProps = {
  snapshots: AAIndexSnapshot[]; // chronological, oldest first
  metric: SparklineMetric;
  label: string; // e.g. "AA Coding Index"
};
```

**Behavior:**
- Native SVG only — no chart library. SVG dimensions: width=180px, height=48px.
- Plots the last 12 data points from `snapshots` (takes the last 12 if more are provided).
- If fewer than 3 data points exist: renders `<p className="text-xs text-gray-400">Not enough history</p>` instead of an SVG.
- Axes: implicit — no tick labels, no axis lines, just the sparkline itself.
- Line: `stroke="currentColor"` so it inherits the parent's text color. `strokeWidth=1.5`. `fill="none"`.
- Hover interaction: a transparent `<rect>` overlay tracks `onMouseMove`. On hover, shows a tooltip `<div>` (absolutely positioned) with: `"{snapshot.date}: {value}"`.
- Data normalization: scales y values to fit within the SVG height with 4px padding top and bottom.
- The hook for hover state: `useState<{ date: string; value: number; x: number; y: number } | null>(null)`.

---

### `<ComparePicker>` (client component)

**File:** `src/components/ComparePicker.tsx`

**Props:**
```typescript
type ComparePickerProps = {
  plans: PlanWithScore[];
  selected: string[]; // plan IDs
  onChange: (selected: string[]) => void;
};
```

**Behavior:**
- Multi-select list, grouped by provider (provider name as section header).
- Each item: `[checkbox] Provider Plan Name — $XX/mo`.
- Maximum 6 selected: when 6 are selected, all unchecked checkboxes become `disabled` until one is deselected.
- "Clear all" button: resets to empty selection. Hidden when selection is empty.
- Selection count label: "3 of 6 selected".
- On change: updates URL query string with `?plans=plan-id-1,plan-id-2` using Next.js `useRouter().replace()` (no page reload).
- On page load: reads `?plans=` from URL and initializes `selected` state from it.

---

### `<CompareMatrix>` (client component)

**File:** `src/components/CompareMatrix.tsx`

**Props:**
```typescript
type CompareMatrixProps = {
  selected: PlanWithScore[]; // in display order
};
```

**Behavior:**
- Renders only when `selected.length >= 2`. Returns `null` otherwise.
- Layout: CSS grid with sticky left column. Left column contains row labels. Each subsequent column is one selected plan.
- Boolean rows (agent_capabilities, web_search, code_context, file_uploads, cli_access, api_access, ide_integrations, custom_instructions): render ✓ (green), ✗ (red), or — (gray) icons.
- Numeric rows (AA Coding, AA Agentic, Speed, Value Score, Uncertainty Score): colored values. For AA values, wraps in `<AAIndexBadge>`.
- Difference highlighting: for each numeric row, find the max value across all columns. Non-max columns get `bg-amber-50` applied to their cell.
- Plan column header: plan name + provider name + tier badge + monthly price.
- Horizontal scroll on mobile: the matrix container is `overflow-x-auto`.

---

### `<FormulaBlock>` (server component)

**File:** `src/components/FormulaBlock.tsx`

**Behavior:**
- Renders the 3-step formula chain:
  1. `WMQ = (AA_coding × 0.5) + (AA_agentic × 0.4) + (Speed_score × 0.1)`
  2. `QAMU = WMQ × monthly_tokens_estimated`
  3. `ValueScore = QAMU / monthly_price_usd`
- Each formula rendered in a styled `<pre>` or `<code>` block with monospace font.
- Each variable is a `<span>` with a `title` tooltip:
  - `AA_coding`: "AA Coding Index — Artificial Analysis coding benchmark composite. Scale 0–100."
  - `AA_agentic`: "AA Agentic Index — Artificial Analysis agentic capability benchmark. Scale 0–100."
  - `Speed_score`: "Speed Score — AA speed_tps normalized to 0–100 (divisor: 200 tps upper anchor)."
  - `monthly_tokens_estimated`: "Estimated monthly tokens — computed from plan type and usage rules. See token estimation table."
  - `monthly_price_usd`: "Monthly price in USD — taken from provider JSON, confidence-flagged when stale."
- Mobile: outer container is `overflow-x-auto` so the formula block scrolls horizontally on narrow screens rather than wrapping.

---

## 6. Updates to Existing Components

### `<PlanCard>` updates (`src/components/PlanCard.tsx`)

1. **Add `<UsageEstimateRow>`** below existing usage limit display line. New optional prop: `estimate?: UsageEstimate`. Renders nothing if prop is absent (backward-compatible).

2. **Add `<UncertaintyScore>`** next to Value Score ring. New optional prop: `uncertaintyScore?: { score: number; notes: string[] }`. Renders nothing if prop absent or score ≤ 50.

3. **Update Value Score ring tooltip:** Change to: "Value Score (normalized): How much quality-adjusted monthly usage this plan delivers per dollar, compared to other plans in its price tier. Higher is better."

4. **Model chips link to detail page:** Each model chip in the "Included Models" section becomes a `<Link href={/models/${model_id}}>`. Currently they are non-interactive spans.

5. **AA snapshot date in footer:** Add `aa_snapshot_date?: string` prop. Renders as a line in the card footer: "AA data: {date}". Only shown when prop is present.

6. **`compact` prop:** Existing `compact?: boolean` prop (if it exists) — or add it. When `compact={true}`, hide UsageEstimateRow, UncertaintyScore, and the full description. Show only: plan name, provider, tier badge, price, top 3 model chips, Value Score ring.

### `<ComparisonTable>` updates (`src/components/ComparisonTable.tsx`)

Add new rows after all existing rows. New rows (in order):

| Row Label | Data | Cell Rendering |
|-----------|------|----------------|
| "AA Coding Index" | `score.aa_coding_index` | `<AAIndexBadge value={v} label="AA Coding" confidence={c} />` |
| "AA Agentic Index" | `score.aa_agentic_index` | `<AAIndexBadge value={v} label="AA Agentic" confidence={c} />` |
| "Speed (tps)" | `score.speed_tps` | `<AAIndexBadge value={v} label="Speed" unit="tps" rawValue={v} confidence={c} />` |
| "Est. Monthly Tokens" | `score.tokens_per_month` | Formatted string + `<ProvenanceBadge confidence={c} />` |
| "Uncertainty Score" | `score.uncertainty_score` | Colored number: green <30, amber 30–60, red >60 |

Additional updates:
- Change row label "Value Score" to "Value Score (tier-normalized)".
- Update methodology footnote text to: "Value Score = (AA Coding × 50% + AA Agentic × 40% + Speed × 10%) × Monthly Token Estimate ÷ Monthly Price. Normalized within each price tier."

### `<FilterBar>` updates (`src/components/FilterBar.tsx`)

1. **Add model filter:** Multi-select dropdown listing all unique model IDs (with display names) across all plans. When one or more models are selected, `<PlansGrid>` filters to show only plans that include at least one selected model. New prop on FilterBar: `availableModels: { id: string; name: string }[]`.

2. **`sort_by` default:** Change `value_score` sort key to use `value_score_normalized` from computed-scores.json instead of raw value score. Update the sort comparator in FilterBar or PlansGrid accordingly.

### `<Hero>` updates (`src/components/Hero.tsx`)

1. **Add "Models tracked" stat card:** New prop `modelsCount: number`. Add a fourth stat card alongside existing stat cards. Label: "Models tracked". Value: `modelsCount`.

2. **Update methodology one-liner:** Change the sub-headline/description text to: "Value Score = Quality × Usage ÷ Price — quality sourced from Artificial Analysis indices."

---

## 7. Navigation Updates

Add to `src/app/layout.tsx` header nav:

```tsx
<nav>
  <Link href="/#plans">Plans</Link>
  <Link href="/models">Models</Link>
  <Link href="/compare">Compare</Link>
  <Link href="/methodology">Methodology</Link>
</nav>
```

The "Plans" link uses a hash anchor to scroll to the plans section on the homepage. All other links are full page navigations.

Mobile nav: collapse to hamburger menu below `sm` breakpoint. Same 4 links in a vertical dropdown.

Active state: use Next.js `usePathname()` to apply `font-semibold` to the matching nav item. "/" is active only for exact match (not prefix).

---

## 8. Global Transparency Footer

Expand existing footer in `src/app/layout.tsx`:

```tsx
<footer>
  {/* existing content */}
  <div className="text-xs text-gray-500 mt-4 flex flex-wrap gap-x-4 gap-y-1">
    <span>Data last verified: {maxLastVerified}</span>
    <span>AA indices: {aaSnapshotDate}</span>
    <span>Scores computed: {scoresComputedAt}</span>
    <Link href="/methodology">Methodology</Link>
  </div>
</footer>
```

Data sourcing:
- `maxLastVerified`: `Math.max(...providers.map(p => p.last_verified))` — formatted as "YYYY-MM-DD".
- `aaSnapshotDate`: from the most recent file in `src/data/aa-snapshots/` — the filename is the date.
- `scoresComputedAt`: `computed_at` field from `src/data/computed-scores.json`.

All three values are read at build time (server component). No runtime fetch needed.

---

## 9. Design Constraints

**No chart library.** `<BenchmarkSparkline>` uses native SVG only. Rationale: CF Workers has a compressed bundle limit and the sparkline is the only charting use case. Importing Recharts or Chart.js for one sparkline would be a significant bundle cost.

**Server components by default.** Every new component is a server component unless it requires:
- `useState` or `useEffect` (ModelTable sort, ComparePicker selection, BenchmarkSparkline hover, CompareClient)
- URL reads at interaction time (ComparePicker, CompareClient)
Client boundary is marked with `"use client"` at the top of the file.

**Confidence color system unchanged.** The existing `<ProvenanceBadge>` color system is the source of truth:
- observed: green
- inferred: blue
- assumed: amber
- stale: red
- unknown: gray

`<AAIndexBadge>` uses a separate color scale (based on score value, not confidence), but its confidence dot uses the same color system.

**AA prefix on all index displays.** Every tooltip and label showing an AA-sourced value must include the "AA" prefix. Never display "84.1" alone — always "AA Coding: 84.1". This makes data provenance clear to users who may not have read the methodology page.

**Null scores show "—" not "0".** A null value means "not measured", not "zero capability". Displaying 0 would actively mislead. Tooltip on null AAIndexBadge: "Artificial Analysis index not available for this model."

**No breaking changes to existing component APIs.** All PlanCard, ComparisonTable, FilterBar, and Hero updates are additive. New props are optional with sensible defaults. Existing call sites continue to work without modification.

**Token formatting is deterministic.** The same token count always formats the same way — no locale-dependent formatting. Use integer division for K values, one decimal for M values:
```typescript
function formatTokens(n: number | null): string {
  if (n === null) return "—";
  if (n < 1_000) return `${n} tokens`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}K tokens`;
  return `${(n / 1_000_000).toFixed(1)}M tokens`;
}
```
