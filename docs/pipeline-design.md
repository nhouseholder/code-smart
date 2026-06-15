# Pipeline Design

## 1. Pipeline Overview

Code Smart runs three automated pipelines:

| Pipeline | Trigger | Purpose |
|----------|---------|---------|
| **A. Daily check** | 9am UTC, every day (GitHub Actions) | Validate schema → stale-check → recompute scores → build |
| **B. Weekly AA fetch** | 8am UTC, every Monday (GitHub Actions) | Fetch AA indices → snapshot → recompute scores → notify on changes |
| **C. Manual / local-only** | Developer workstation only | Playwright pricing scraper; initial aa-indices-override setup |

No webhooks, no external queue systems. All pipelines are triggered via GitHub Actions schedules, `workflow_dispatch`, or npm scripts run locally. CI runners do not run the Playwright scraper — it is blocked by WAFs on most pricing pages.

---

## 2. Pipeline A — daily-check.yml (Extended)

**File:** `.github/workflows/daily-check.yml`

The existing workflow runs at 9am UTC daily. Current steps: checkout → setup-node 22 → npm ci → validate → stale-check → build → create GH issue if stale.

**Extension:** Add one new step between the stale-check step and the build step:

```yaml
- name: Recompute value scores
  run: npm run recompute-scores
```

This step is idempotent. If `computed-scores.json` is already current — same AA snapshot date and same provider file mtimes — it exits quickly with no changes. There is no risk of stale scores being committed because the step always reads the latest snapshot from `src/data/aa-snapshots/` and the latest provider JSONs from `src/data/providers/`.

The full extended workflow, for reference:

```yaml
name: Daily Data Check

on:
  schedule:
    - cron: "0 9 * * *"  # 9am UTC daily
  workflow_dispatch:

permissions:
  issues: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Validate provider data (schema check)
        run: npm run validate

      - name: Check for stale pricing data
        id: stale
        run: |
          if npm run stale-check; then
            echo "stale=false" >> "$GITHUB_OUTPUT"
          else
            echo "stale=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Recompute value scores
        run: npm run recompute-scores

      - name: Create stale-data issue (if stale entries found)
        if: steps.stale.outputs.stale == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TITLE="⚠️ Stale pricing data detected — $(date -u +%Y-%m-%d)"
          EXISTING=$(gh issue list --search "Stale pricing data detected" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
          if [ -n "$EXISTING" ]; then
            gh issue comment "$EXISTING" \
              --body "Stale check re-triggered on $(date -u +%Y-%m-%d). Run \`npm run stale-check\` locally to see which providers need re-verification."
          else
            gh issue create \
              --title "$TITLE" \
              --body "The daily stale-data check found provider pricing entries older than 90 days.\n\n**Action required:** Run \`npm run stale-check\` locally to see the full list, then verify each flagged provider's pricing page and update the JSON file.\n\n> Close this issue once all stale entries are refreshed." \
              --label "data-quality"
          fi

      - name: Build site (verify it compiles)
        run: npm run build
```

---

## 3. Pipeline B — weekly-aa-fetch.yml (New)

**File:** `.github/workflows/weekly-aa-fetch.yml`

This workflow fetches fresh Artificial Analysis indices every Monday, commits the new snapshot file and updated `computed-scores.json`, and opens or comments on a GitHub issue when data changes.

```yaml
name: Weekly AA Index Fetch
on:
  schedule:
    - cron: "0 8 * * 1"   # Monday 8am UTC
  workflow_dispatch:

permissions:
  contents: write          # for git push
  issues: write            # for gh issue create

jobs:
  fetch-aa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_PAT }}  # PAT needed to push commits

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Fetch AA indices
        id: fetch
        env:
          AA_API_KEY: ${{ secrets.AA_API_KEY }}
        run: |
          npm run fetch-aa
          echo "snapshot_date=$(date -u +%Y-%m-%d)" >> "$GITHUB_OUTPUT"

      - name: Recompute value scores
        run: npm run recompute-scores

      - name: Commit snapshot files
        id: commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/data/aa-snapshots/ src/data/computed-scores.json
          if git diff --staged --quiet; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            git commit -m "data: AA index snapshot ${{ steps.fetch.outputs.snapshot_date }}"
            git push
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Notify on significant changes
        if: steps.commit.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          EXISTING=$(gh issue list \
            --search "AA index update" \
            --state open \
            --json number \
            --jq '.[0].number')
          if [ -n "$EXISTING" ]; then
            gh issue comment "$EXISTING" \
              --body "New AA snapshot committed for ${{ steps.fetch.outputs.snapshot_date }}. Value scores recomputed."
          else
            gh issue create \
              --title "AA index update ${{ steps.fetch.outputs.snapshot_date }}" \
              --body "Weekly AA index fetch completed. New snapshot committed and value scores recomputed. Review updated rankings at /api/scores/top-by-tier." \
              --label "data-quality"
          fi
```

**Why a separate PAT for push:** `secrets.GITHUB_TOKEN` cannot push commits that trigger downstream workflows (GitHub restriction). `secrets.GH_PAT` is a classic Personal Access Token with `contents: write` scope on this repository only. Store it under Settings → Secrets → Actions with the name `GH_PAT`.

**Why `git diff --staged --quiet` before commit:** If the AA API returns the same values as the previous snapshot (no model releases, no benchmark updates), there is no reason to commit. This prevents a flood of no-op commits every Monday.

---

## 4. scripts/fetch-aa-indices.ts (New)

**File:** `scripts/fetch-aa-indices.ts`

**npm script:** `"fetch-aa": "npx tsx scripts/fetch-aa-indices.ts"` (add to `package.json`)

### Responsibilities

1. Read `src/data/aa-model-slugs.json` to get the model ID → AA slug mapping.
2. For each model with a non-null `aa_slug`, call the AA API using `AA_API_KEY` from environment.
3. Resolve `inherits_from` models: single-level only — find the parent's fetched values and copy them with `confidence: "inferred"`. The parent must have `aa_slug != null`.
4. For models with `aa_slug: null` and no `inherits_from`: write `null` for all index values with `confidence: "unknown"`.
5. If the AA API fails for any individual model: fall back to reading `src/data/aa-indices-override.json` for that model's values.
6. Write output to `src/data/aa-snapshots/YYYY-MM-DD.json` (today's UTC date).
7. Log a summary: count of models fetched, inherited, failed (recovered from override), and models with unknown status.
8. Exit codes:
   - `0` — all models with non-null `aa_slug` have current data
   - `1` — any model's most recent snapshot is older than 14 days (stale warning, non-fatal)
   - `2` — AA API failed AND `aa-indices-override.json` is missing or empty (fatal, no snapshot written)

### Error Handling

| Error | Behavior |
|-------|----------|
| HTTP 401/403 from AA API | Log "Invalid AA_API_KEY or access denied". Fall back to override file for that model. |
| HTTP 429 from AA API | Wait 60 seconds, retry once. On second failure, fall back to override. |
| Network timeout (>15s) | Fall back to override. |
| Override file missing | Exit 2 with error message. No snapshot committed. |
| Circular `inherits_from` | Log error for that model, treat as `confidence: "unknown"`. Do not crash. |

### Snapshot Output Format

```json
{
  "snapshot_date": "2026-06-14",
  "fetched_at": "2026-06-14T08:03:42Z",
  "source": "artificialanalysis.ai",
  "models": {
    "claude-sonnet-4-6": {
      "agentic_index": 74,
      "coding_index": 71,
      "speed_tps": 98,
      "confidence": "observed",
      "aa_url": "https://artificialanalysis.ai/models/claude-3-7-sonnet"
    },
    "cursor-claude-sonnet": {
      "agentic_index": 74,
      "coding_index": 71,
      "speed_tps": 98,
      "confidence": "inferred",
      "inherits_from": "claude-sonnet-4-6"
    },
    "opencode-byok": {
      "agentic_index": null,
      "coding_index": null,
      "speed_tps": null,
      "confidence": "unknown"
    }
  }
}
```

---

## 5. scripts/recompute-scores.ts (New)

**File:** `scripts/recompute-scores.ts`

**npm script:** `"recompute-scores": "npx tsx scripts/recompute-scores.ts"` (add to `package.json`)

### Responsibilities

1. Read all provider JSONs from `src/data/providers/` using `getAllProviders()` from `src/lib/data-loader.ts`.
2. Find the latest AA snapshot file:
   ```typescript
   const latest = fs.readdirSync("src/data/aa-snapshots")
     .filter(f => f.endsWith(".json"))
     .sort()
     .at(-1);
   ```
3. Read that snapshot as the current AA indices.
4. For each active plan in each provider, find the best model: highest `agentic_index`, then `coding_index` as tiebreak.
5. Compute `UsageEstimate` using the 8-rule estimation strategy from `src/lib/usage-estimator.ts`.
6. Compute new `ValueScore` using the WMQ + QAMU formula (see calculation-methodology.md).
7. Read previous `src/data/computed-scores.json` (if it exists) and diff against new scores.
8. Log any plan where `value_score_normalized` changed by more than 5 points.
9. Write the new `computed-scores.json` with current timestamp and snapshot date.
10. Exit 0 always. Errors are logged but not fatal — the previous `computed-scores.json` is left unchanged if an error occurs mid-write.

### Idempotency

Running `npm run recompute-scores` twice on the same day with no data changes produces output that differs only in `computed_at` (the ISO timestamp). Normalized scores, raw scores, and all usage estimates are identical. This is acceptable — the `computed_at` field is informational only.

### Output Format

```json
{
  "computed_at": "2026-06-14T09:05:11Z",
  "aa_snapshot_date": "2026-06-14",
  "schema_version": 2,
  "plans": [
    {
      "provider_id": "anthropic",
      "plan_id": "claude-pro",
      "wmq": 68.5,
      "usage_estimate": {
        "monthly": 200000,
        "tokens_per_5h_session": 2500,
        "tokens_per_day": 10000,
        "tokens_per_week": 50000,
        "confidence": "observed",
        "basis": "tokens_per_month",
        "notes": []
      },
      "qamu": 137000,
      "effective_monthly_price_usd": 20,
      "value_score_raw": 6850,
      "price_tier": "low_cost",
      "value_score_normalized": 82,
      "uncertainty_score": 10,
      "legacy_value_score": 71
    }
  ]
}
```

`legacy_value_score` carries the previous formula (35% cost + 40% benchmark + 25% features) for debugging. It is not displayed in the UI. `overall_value_score` in the API response maps to `value_score_normalized`.

---

## 6. src/lib/usage-estimator.ts (New)

**File:** `src/lib/usage-estimator.ts`

This library is called by `recompute-scores.ts` and by API routes that display per-plan usage estimates. It implements the 8-rule token estimation strategy.

```typescript
export interface UsageEstimate {
  monthly: number | null;
  tokens_per_5h_session: number | null;
  tokens_per_day: number | null;
  tokens_per_week: number | null;
  confidence: "observed" | "inferred" | "assumed" | "unknown";
  basis: string;
  notes: string[];
}

export function estimateUsage(plan: Plan): UsageEstimate {
  const limits = plan.usage_limits;

  // Rule 1: tokens_per_month — direct observation
  const tpm = limits.find(l => l.type === "tokens_per_month" && l.value !== null);
  if (tpm) return derive(tpm.value!, tpm.provenance.confidence, "tokens_per_month", []);

  // Rule 2: tokens_per_day × 20 working days
  const tpd = limits.find(l => l.type === "tokens_per_day" && l.value !== null);
  if (tpd) return derive(
    tpd.value! * 20, "inferred", "tokens_per_day",
    [`Estimated: ${tpd.value} tokens/day × 20 working days`]
  );

  // Rule 3: messages_per_month × 2,000 tokens/message
  const mpm = limits.find(l => l.type === "messages_per_month" && l.value !== null);
  if (mpm) return derive(
    mpm.value! * 2000, "inferred", "messages_per_month",
    [`Estimated: ${mpm.value} messages × 2,000 tokens/message average`]
  );

  // Rule 4: messages_per_day × 20 days × 2,000 tokens/message
  const mpd = limits.find(l => l.type === "messages_per_day" && l.value !== null);
  if (mpd) return derive(
    mpd.value! * 20 * 2000, "inferred", "messages_per_day",
    [`Estimated: ${mpd.value} messages/day × 20 days × 2,000 tokens/message`]
  );

  // Rule 5: requests_per_month × 4,000 tokens/request (IDE agent assumption)
  const rpm = limits.find(l => l.type === "requests_per_month" && l.value !== null);
  if (rpm) return derive(
    rpm.value! * 4000, "assumed", "requests_per_month",
    [`Estimated: ${rpm.value} requests × 4,000 tokens/request (IDE agent assumption)`]
  );

  // Rule 6: credits_per_month × ~500 tokens/credit
  const cpm = limits.find(l => l.type === "credits_per_month" && l.value !== null);
  if (cpm) return derive(
    cpm.value! * 500, "assumed", "credits_per_month",
    [`Estimated: ${cpm.value} credits × ~500 tokens/credit (variable by provider)`]
  );

  // Rule 7: unlimited — use developer profile baseline
  const unlim = limits.find(l => l.type === "unlimited");
  if (unlim) return derive(
    200000, "assumed", "unlimited",
    ["Estimated from typical developer usage profile: 80 sessions/month × 2,500 tokens/session. Plan has no enforced cap."]
  );

  // Rule 8: unknown — cannot estimate
  return {
    monthly: null,
    tokens_per_5h_session: null,
    tokens_per_day: null,
    tokens_per_week: null,
    confidence: "unknown",
    basis: "unknown",
    notes: ["Usage limit not publicly disclosed. Score cannot be computed."],
  };
}

function derive(
  monthly: number,
  confidence: UsageEstimate["confidence"],
  basis: string,
  notes: string[]
): UsageEstimate {
  return {
    monthly,
    tokens_per_5h_session: Math.round(monthly / 80),
    tokens_per_day: Math.round(monthly / 20),
    tokens_per_week: Math.round(monthly / 4),
    confidence,
    basis,
    notes,
  };
}
```

**Derivation constants:**
- `/ 80` for 5h-session estimate: 80 sessions/month = 4 sessions/day × 5 days/week × 4 weeks.
- `/ 20` for daily: 20 working days/month.
- `/ 4` for weekly: 4 weeks/month.

All derivations use the same confidence level as the monthly estimate. Displaying a derived figure always includes the confidence badge and a hover-accessible notes array.

---

## 7. Local-Only Scripts (Unchanged)

These scripts are never run in CI:

| Script | npm command | Why local-only |
|--------|-------------|----------------|
| `scripts/fetch-provider.ts` | `npm run fetch -- --provider anthropic` | Playwright WAF-blocked on GitHub Actions runners |
| `scripts/validate-data.ts` | `npm run validate` | Also runs in daily-check.yml |
| `scripts/stale-check.ts` | `npm run stale-check` | Also runs in daily-check.yml |

`fetch-provider.ts` requires a local Chromium install: `npx playwright install chromium` on first run. It is not listed in `devDependencies` as a binary dependency because Playwright is already a devDependency and the `install` command downloads browser binaries separately.

The AA indices override file (`src/data/aa-indices-override.json`) is also set up locally, not in CI. It contains manually entered fallback values for models that are not yet indexed by Artificial Analysis.

---

## 8. npm Script Additions

Add these two entries to `package.json` `"scripts"`:

```json
"fetch-aa": "npx tsx scripts/fetch-aa-indices.ts",
"recompute-scores": "npx tsx scripts/recompute-scores.ts"
```

Full updated scripts block:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "validate": "npx tsx scripts/validate-data.ts",
  "stale-check": "npx tsx scripts/stale-check.ts",
  "fetch": "npx tsx scripts/fetch-provider.ts",
  "fetch-aa": "npx tsx scripts/fetch-aa-indices.ts",
  "recompute-scores": "npx tsx scripts/recompute-scores.ts",
  "test": "npx vitest run",
  "test:watch": "npx vitest"
}
```

---

## 9. Error Handling Summary

| Failure | Behavior |
|---------|----------|
| AA API unavailable (network, timeout) | Fall back to `aa-indices-override.json` for affected models |
| AA API 401/403 | Log "Invalid AA_API_KEY or access denied"; fall back to override |
| AA API 429 | Retry after 60 seconds, once; on second failure, fall back to override |
| Override file missing when API fails | Exit 2 (fatal); no snapshot committed |
| `recompute-scores.ts` throws | Exit 0 with error logged; previous `computed-scores.json` unchanged |
| Git push fails (conflict) | Retry once with `git pull --rebase`; on second failure, exit 1 (GitHub Actions retries next Monday) |
| Schema validation fails (`npm run validate`) | `daily-check.yml` stops; red check in Actions tab; build does not run |
| Stale data detected | Issue created or commented; build still runs (non-blocking) |

---

## 10. Required GitHub Secrets

| Secret | Used By | Purpose |
|--------|---------|---------|
| `GITHUB_TOKEN` | Both workflows (auto-provided) | Creating/commenting on issues |
| `GH_PAT` | `weekly-aa-fetch.yml` only | Pushing commits from Actions |
| `AA_API_KEY` | `weekly-aa-fetch.yml` only | Authenticating with Artificial Analysis API |

`GITHUB_TOKEN` is provisioned automatically by GitHub Actions for every workflow run. `GH_PAT` and `AA_API_KEY` must be added manually under repository Settings → Secrets and variables → Actions.
