# Provider Registry

## 1. Registry Design

The provider registry is the collection of JSON files in `src/data/providers/`. Each file represents one provider and contains: provider metadata, all available plans (with pricing, features, and usage limits), and all models offered by that provider.

These files are the **canonical source of truth** for all plan, pricing, feature, and model data. They are:
- Edited manually by contributors
- Validated against the Zod schema (`ProviderSchema` in `src/lib/schema.ts`) on every CI run
- Committed to git with a `last_verified` date on every update

**Artificial Analysis indices are NOT stored in provider JSON files.** They live in `src/data/aa-snapshots/` as dated files fetched by the weekly pipeline. The `src/data/aa-model-slugs.json` file connects model IDs in provider files to their AA slugs.

The schema is defined in `src/lib/schema.ts` and enforced by `scripts/validate-data.ts`. A failing validation blocks the daily build.

---

## 2. Current Provider Table (11 Providers)

| ID | Display Name | Category | Plans | Models | Status |
|----|-------------|---------|-------|--------|--------|
| `anthropic` | Claude (Anthropic) | ai_lab | 4 | 3+ | Active; full AA profiles |
| `openai` | ChatGPT (OpenAI) | ai_lab | 3+ | 4+ | Active; full AA profiles |
| `github-copilot` | GitHub Copilot | ide_tool | 4 | composite | Active; `inherits_from` claude-sonnet-4-6 + gpt-4o |
| `cursor` | Cursor | ide_tool | 3 | composite | Active; `inherits_from` claude-sonnet-4-6 |
| `google` | Gemini (Google) | ai_lab | 3+ | 3+ | Active; full AA profiles |
| `kimi` | Kimi (Moonshot AI) | ai_lab | 3 | 2 | Active; CNY pricing converted to USD |
| `qwen` | Qwen (Alibaba) | ai_lab | 2 | 2 | API-only; limited AA profiles |
| `copilot-xcode` | GitHub Copilot for Xcode | ide_tool | 3 | composite | Active; mirrors Copilot pricing |
| `opencode` | OpenCode | platform | 1 | BYOK | $0 BYOK; no AA profile |
| `mimo` | Mimo | platform | 2 | proprietary | Education-focused; non-professional; no AA profile |
| `minimax` | MiniMax | ai_lab | 2 | 2 | API-only; limited AA profiles |

**Category definitions:**
- `ai_lab` — companies that develop frontier models and sell access via chat or API
- `ide_tool` — products designed primarily as IDE plugins or agentic coding environments
- `platform` — products that provide access to third-party models or specialize in a vertical use case
- `open_source` — reserved for future open-weight model hosting providers

---

## 3. AA Model Slug Mapping

**File:** `src/data/aa-model-slugs.json`

This file maps each `model_id` used in provider JSON files to the corresponding Artificial Analysis model slug. The weekly fetch script (`scripts/fetch-aa-indices.ts`) reads this file to know which models to fetch.

### Format

```json
{
  "MODEL_ID": {
    "aa_slug": "aa-model-slug-or-null",
    "aa_url": "https://artificialanalysis.ai/models/... or null",
    "inherits_from": "parent-model-id or null"
  }
}
```

### Field Rules

| Field | Required | Value |
|-------|----------|-------|
| `aa_slug` | Yes | AA's identifier for this model, or `null` if not indexed by AA |
| `aa_url` | Yes | Direct URL to the model's AA profile, or `null` |
| `inherits_from` | Yes | Parent model ID if this is a proxy/wrapped model, or `null` |

### Combination Rules

| `aa_slug` | `inherits_from` | Behavior |
|-----------|-----------------|---------|
| non-null | null | Direct AA profile. Fetch from AA API using `aa_slug`. |
| null | non-null | Proxy/wrapped model. Copy parent's fetched values with `confidence: "inferred"`. |
| null | null | No AA profile, no parent. All index values = null, `confidence: "unknown"`. |
| non-null | non-null | Invalid. A model cannot both have its own AA profile and inherit from a parent. |

**Inheritance rules:**
- Single-level only. `inherits_from` must point to a model that has `aa_slug != null`.
- No chained inheritance (A → B → C is not supported; B must have its own `aa_slug`).
- No circular references.
- When a proxy model inherits from a parent, the `confidence` field is always set to `"inferred"` regardless of the parent's confidence level.

### Initial Slug Mapping

Known mappings at project launch (populate with verified values, leave unknown slugs as null):

| Model ID | AA Slug | Notes |
|----------|---------|-------|
| `claude-sonnet-4-6` | `claude-3-7-sonnet` | Verify at artificialanalysis.ai/models/ |
| `claude-opus-4-8` | verify at AA | Update when confirmed |
| `gpt-4o` | `gpt-4o` | Stable slug |
| `gemini-2-5-pro` | `gemini-2-5-pro` | Verify at AA |
| `cursor-claude-sonnet` | null | `inherits_from: "claude-sonnet-4-6"` |
| `copilot-base` | null | `inherits_from: "gpt-4o"` |
| `copilot-xcode-preview` | null | `inherits_from: "gpt-4o"` |
| `opencode-byok` | null | BYOK, no fixed model; `inherits_from: null` |
| `mimo-proprietary` | null | No AA profile; `inherits_from: null` |

---

## 4. Checklist: Adding a New Provider

Follow all steps in order. Do not skip validation.

1. **Create the provider JSON file** at `src/data/providers/<provider-id>.json`. Copy `src/data/providers/anthropic.json` as a template. All required fields must be populated — no empty arrays, no null pricing without a reason documented in `notes`.

2. **Verify required top-level fields:** `id`, `name`, `display_name`, `website`, `pricing_url`, `description`, `logo_slug`, `category`, `headquarters_country`, `plans[]`, `models[]`, `last_verified`, `provenance`.

3. **Verify each plan:** Every plan must have at least one `usage_limits` entry. If usage limits are not publicly disclosed, include `{ "type": "unknown", "value": null, "provenance": { ... "confidence": "unknown" } }`. Never leave `usage_limits: []`.

4. **Add the import to `src/lib/data-loader.ts`:**
   ```typescript
   import newProvider from "@/data/providers/new-provider.json";
   ```
   Add `newProvider` to the `PROVIDER_FILES` array at the bottom of that file.

5. **Add AA model slug entries to `src/data/aa-model-slugs.json`** for every model in the new provider. If a model has no AA profile and no parent, set both `aa_slug` and `inherits_from` to null.

6. **Run validation:** `npm run validate` — must exit 0 with no errors.

7. **Fetch AA indices:** `AA_API_KEY=<key> npm run fetch-aa` — this writes a new snapshot file that includes the new models.

8. **Recompute scores:** `npm run recompute-scores` — rewrites `computed-scores.json` with the new provider's plans included.

9. **Commit all changed files:** the new provider JSON, `aa-model-slugs.json`, the latest aa-snapshot file, and `computed-scores.json`.

10. **Verify the build:** `npm run build` — confirm the new provider renders correctly and no TypeScript errors appear.

---

## 5. Data Conventions

### Pricing

- All pricing stored in USD. Never store local currency amounts in the JSON.
- CNY providers (Kimi, MiniMax): convert at the spot exchange rate on the day of data entry. Document the rate and date in `pricing.notes`. Example: `"CNY 20/month, converted at 7.25 CNY/USD on 2026-06-14"`.
- Annual pricing: store as the effective monthly equivalent. Example: $192/year → `"annual_monthly_usd": 16`. The notes field should document the annual total: `"$192/year billed annually"`.
- Per-seat plans: set `is_per_seat: true`. Pricing stored is per-seat; the UI displays it as such.
- Contact-sales plans: set both `monthly_usd` and `annual_monthly_usd` to null. Include a `notes` entry explaining this.

### Model IDs

- **Canonical models** (used on multiple platforms without modification): use the provider's official model ID. Examples: `gpt-4o`, `claude-sonnet-4-6`, `gemini-2-5-pro`.
- **Proprietary or wrapped models** (custom weights, provider-specific tuning, or unclear underlying model): use `<provider-id>-<model-name>`. Examples: `cursor-claude-sonnet`, `copilot-base`, `copilot-xcode-preview`.
- Model IDs must be globally unique across all JSON files. If two providers both wrap the same underlying model, they each get a distinct ID (one per provider) even if the aa-slug points to the same parent.

### Confidence Levels

Confidence levels are applied to individual provenance fields and to usage limit provenance. Use the correct level — do not round up to "observed" for estimated values.

| Level | Meaning |
|-------|---------|
| `"observed"` | You personally navigated to the source URL and read the value on that date. |
| `"inferred"` | You derived the value from an observed figure using a documented formula (e.g., annual total ÷ 12). |
| `"assumed"` | You estimated the value based on comparable providers, community knowledge, or indirect signals. |
| `"stale"` | The value was once observed but `last_verified` is now beyond 90 days. Set by `scripts/stale-check.ts`. |
| `"unknown"` | No reliable basis for the value. |

### Plan Lifecycle

- **Active plans:** `is_active: true`
- **Deprecated plans:** set `is_active: false`. Never delete a plan from the JSON. Deactivated plans are excluded from scoring and rankings but remain in the data for historical reference.
- `last_verified` must be updated to today's date whenever any field in a plan is manually verified, even if the value did not change. This resets the 90-day staleness clock.

### Usage Limits

- Every plan must have at least one `usage_limits` entry.
- If usage limits are not publicly disclosed, use: `{ "type": "unknown", "value": null }`.
- Never leave `usage_limits: []` (empty array). An empty array will cause `estimateUsage()` to fall through to Rule 8 (unknown), which is the correct behavior, but the empty array also fails to document that you looked and found nothing.
- Multiple limit entries are allowed (e.g., a plan might have both a `messages_per_day` limit and a `tokens_per_minute` rate limit). The estimation function picks the highest-priority applicable rule.
- `provenance.url` must point to the official documentation or pricing page where the limit is stated. For undisclosed limits, use the pricing page URL and set `confidence: "unknown"`.

### Logo Slugs

`logo_slug` must match a file in the frontend's logo asset directory. Convention: lowercase kebab-case matching the provider ID. Example: `"logo_slug": "github-copilot"` → resolved to `/logos/github-copilot.svg` by the frontend.

---

## 6. Planned Provider Additions

Prioritized by user impact and data availability. Assigned P0/P1/P2 based on market presence and documentation quality.

### P0 — High Priority

| Provider | Plan Range | Notes |
|----------|-----------|-------|
| Devin (Cognition AI) | ~$500/month | Agentic coding agent; enterprise-focused; pricing page public |
| Amazon CodeWhisperer | Free + $19/month Professional | AWS integration; usage limits documented in AWS docs |
| Cursor Business | $40/seat/month | Separate from existing Cursor plans; team admin features |

### P1 — Medium Priority

| Provider | Plan Range | Notes |
|----------|-----------|-------|
| Mistral Le Chat Pro | $14.99/month | European provider; Codestral model |
| JetBrains AI Pro | $16.50/month | IDE-native for IntelliJ/WebStorm ecosystem |
| Tabnine | Enterprise contact-sales | Enterprise-focused; limited public pricing |
| Windsurf (Codeium) | Free + Pro tiers | IDE agent; formerly Codeium; pricing documented |

### P2 — Future

| Provider | Notes |
|----------|-------|
| Replit | Browser-based; unique hosted execution model |
| GitHub Models | API-based token credits; not a subscription |
| Sourcegraph Cody | Enterprise pricing; on-prem option |
| Zed | Editor with AI; integrated Claude access |

---

## 7. Data Quality Standards

A provider entry is considered "complete" when all of the following are true:

- **Pricing:** All plans have pricing with `confidence: "observed"` and `last_verified` within 90 days. If the plan has changed to contact-sales, this must be documented and dated.
- **Usage limits:** Every plan has at least one usage limit entry with a `provenance.url` pointing to the official documentation or pricing page.
- **Models:** Every model in the provider's `models[]` array has at least one `benchmarks[]` entry, OR a documented note in `model.provenance.notes` explaining why no benchmark data exists (e.g., "Proprietary model, no public benchmarks").
- **AA slugs:** Every model in the provider that could plausibly have an AA profile (non-proprietary, non-BYOK) has an entry in `aa-model-slugs.json`, with either a valid `aa_slug` or a documented reason for null.
- **Validation:** `npm run validate` exits 0 with no schema errors.

**Staleness trigger:** The stale-check script flags any plan where the most recent `provenance.accessed_date` across all pricing entries is older than 90 days. This fires a GitHub issue through the daily-check workflow.

---

## 8. Schema Reference Summary

For the full schema, see `src/lib/schema.ts`. Key constraints:

| Field | Constraint |
|-------|-----------|
| All dates | ISO format `YYYY-MM-DD` |
| `provider.id` | Must match the filename (minus `.json`) |
| `plan.id` | Must be unique within the provider |
| `model.id` | Must be globally unique across all providers |
| `plan.tier` | One of: `free`, `individual`, `pro`, `team`, `enterprise`, `api` |
| `provider.category` | One of: `ai_lab`, `ide_tool`, `platform`, `open_source` |
| `provenance.confidence` | One of: `observed`, `inferred`, `assumed`, `stale`, `unknown` |
| `usage_limits` | Must have at least 1 entry per plan (validated by `scripts/validate-data.ts`) |
| `plan.pricing.currency` | Must be exactly 3 characters (ISO 4217 currency code) |
| `benchmark.score` | 0–200 range (allows >100 for normalized benchmark formats) |
