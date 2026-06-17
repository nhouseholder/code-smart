// ─── Confidence & Provenance ───────────────────────────────────────────────

/**
 * How certain we are about a specific data point.
 *
 * - observed:  Directly read from the provider's official page / API.
 * - inferred:  Mathematically derived from observed figures (e.g. annual ÷ 12).
 * - assumed:   Reasonable assumption not yet verified from an official source.
 * - stale:     Was observed but the source_date is >90 days old.
 * - unknown:   Could not determine; value is null or a placeholder.
 */
export type Confidence = "observed" | "inferred" | "assumed" | "stale" | "unknown";

export interface Provenance {
  url: string;
  accessed_date: string;          // ISO 8601 date, e.g. "2026-06-14"
  method: "manual" | "automated";
  confidence: Confidence;
  notes?: string;
}

// ─── Limits ────────────────────────────────────────────────────────────────

export type LimitType =
  | "messages_per_day"
  | "messages_per_month"
  | "tokens_per_minute"
  | "tokens_per_day"
  | "tokens_per_month"
  | "requests_per_minute"
  | "requests_per_day"
  | "requests_per_month"
  | "completions_per_month"   // IDE autocomplete
  | "credits_per_month"       // credit-based platforms
  | "compute_units_per_month"
  | "unknown";

export interface UsageLimit {
  type: LimitType;
  value: number | null;           // null when type = unknown
  unit?: string;                  // e.g. "messages", "tokens", "requests"
  applies_to?: string;            // e.g. "premium models", "autocomplete"
  notes?: string;
  provenance: Provenance;
}

// ─── Models & Benchmarks ───────────────────────────────────────────────────

export type BenchmarkName =
  | "HumanEval"
  | "SWE-bench-verified"
  | "SWE-bench-lite"
  | "Aider-polyglot"
  | "LiveCodeBench"
  | "MBPP"
  | "BigCodeBench"
  | "CodeContests"
  | "MultiSWE-bench"
  | string;                       // extensible for future benchmarks

export interface BenchmarkScore {
  name: BenchmarkName;
  score: number | null;
  unit: "percent" | "pass@1" | "normalized" | "rank";
  higher_is_better: boolean;
  notes?: string;
  provenance: Provenance;
}

export interface ModelRef {
  model_id: string;               // references Model.id
  access_type: "full" | "limited" | "preview" | "legacy";
  is_default?: boolean;           // default model for this plan
  notes?: string;
}

export interface Model {
  id: string;                     // e.g. "claude-sonnet-4-5"
  provider_id: string;
  display_name: string;           // e.g. "Claude Sonnet 4.5"
  family?: string;                // e.g. "claude-4", "gpt-4o"
  context_length_k: number | null;
  strengths: string[];            // e.g. ["coding", "reasoning", "long-context"]
  released_date?: string;         // ISO date
  benchmarks: BenchmarkScore[];
  provenance: Provenance;
}

// ─── Plans ─────────────────────────────────────────────────────────────────

export type PlanTier = "free" | "individual" | "pro" | "team" | "enterprise" | "api";

export interface PlanPricing {
  monthly_usd: number | null;             // null = contact sales / variable
  annual_monthly_usd: number | null;      // effective monthly if billed annually
  is_per_seat: boolean;
  trial_days?: number;
  currency: string;                       // ISO 4217
  notes?: string;
  provenance: Provenance;
}

export interface PlanFeatures {
  agent_capabilities: boolean;            // agentic/autonomous coding loops
  web_search: boolean;
  code_context_length_k: number | null;  // max context for coding tasks
  file_uploads: boolean;
  voice_input: boolean;
  ide_integrations: string[];            // ["VS Code", "JetBrains", ...]
  cli_access: boolean;
  api_access: boolean;                   // programmatic API included
  priority_access: boolean;              // lower queue times
  custom_instructions: boolean;
  team_features: boolean;
  sso: boolean;
  notes?: string;
}

export interface Plan {
  id: string;                            // e.g. "anthropic-claude-pro"
  provider_id: string;
  name: string;                          // e.g. "Claude.ai Pro"
  tier: PlanTier;
  pricing: PlanPricing;
  models: ModelRef[];
  usage_limits: UsageLimit[];
  features: PlanFeatures;
  target_personas: string[];             // ["solo developer", "team lead", ...]
  is_active: boolean;
  last_verified: string;                 // ISO date
  source_url: string;
}

// ─── Providers ─────────────────────────────────────────────────────────────

export type ProviderCategory = "ai_lab" | "ide_tool" | "platform" | "open_source";

export interface Provider {
  id: string;                            // e.g. "anthropic"
  name: string;                          // e.g. "Anthropic"
  display_name: string;                  // e.g. "Claude (Anthropic)"
  website: string;
  pricing_url: string;
  description: string;
  logo_slug: string;                     // CSS class / SVG key
  category: ProviderCategory;
  headquarters_country: string;
  founded_year?: number;
  plans: Plan[];
  models: Model[];
  last_verified: string;
  provenance: Provenance;
}

// ─── Value Scoring ─────────────────────────────────────────────────────────

export interface ValueScore {
  plan_id: string;
  effective_cost_per_message_usd: number | null;
  benchmark_quality_index: number | null;  // 0–100, composite of coding benchmarks
  feature_completeness_score: number;      // 0–100
  overall_value_score: number;             // 0–100, weighted composite
  score_breakdown: {
    cost_score: number;
    benchmark_score: number;
    feature_score: number;
    weights: { cost: number; benchmark: number; feature: number };
    qamu_estimated_tokens_1mo: number | null;
  };
  notes: string[];
  computed_at: string;
}

// ─── Artificial Analysis Scores ────────────────────────────────────────────────

export interface AAModelScore {
  modelId: string;
  observedAt: string;               // ISO date of snapshot
  agenticIndex: number | null;      // 0–100
  codingIndex: number | null;       // 0–100
  speedScore: number | null;        // 0–100 pre-normalized (NOT raw TPS)
  intelligenceIndex: number | null; // 0–100, display only — NOT used in WMQ
  inputPrice: number | null;        // USD per 1M input tokens
  outputPrice: number | null;       // USD per 1M output tokens
  costPerTask: number | null;             // AA cost-per-task (USD to run AA's standardized agentic task); null until seeded
  costPerTaskAccessedDate: string | null; // ISO date the cost-per-task value was observed; null until seeded
  confidence: Confidence;
  source: string;
}

// ─── Model Value Engine Output ─────────────────────────────────────────────────

export interface ModelValueEstimate {
  modelId: string;
  planId: string;

  // WMQ = 50% agentic + 40% coding + 10% speed
  weighted_model_quality: number | null;

  // Pass-through: raw token estimates from normalization engine
  estimated_tokens_5h: number | null;
  estimated_tokens_24h: number | null;
  estimated_tokens_1w: number | null;
  estimated_tokens_1mo: number | null;

  // A: Quality-adjusted (tokens × WMQ/100)
  quality_adjusted_tokens_5h: number | null;
  quality_adjusted_tokens_24h: number | null;
  quality_adjusted_tokens_1w: number | null;
  quality_adjusted_tokens_1mo: number | null;

  // B: Model-cost-adjusted (non-null only for credit-based limits with AA pricing)
  model_adjusted_tokens_5h: number | null;
  model_adjusted_tokens_24h: number | null;
  model_adjusted_tokens_1w: number | null;
  model_adjusted_tokens_1mo: number | null;

  // value_score = quality_adjusted_monthly × efficiency_multiplier / price, normalized 0–100 (null for free plans)
  value_score: number | null;

  // Bounded efficiency multiplier [0.85, 1.15] from AA cost-per-task vs median; 1.0 (neutral) when no data
  efficiency_multiplier: number | null;
  cost_per_task_usd: number | null;       // pass-through of this model's AA cost-per-task (display/transparency); null until seeded

  confidence: Confidence;
  calculation_methodology_version: string;
  notes: string[];
}

// ─── Comparison State (UI) ─────────────────────────────────────────────────

export type SortKey = "price" | "value_score" | "benchmark" | "provider";
export type FilterTier = "all" | PlanTier;

export interface ComparisonFilter {
  tier: FilterTier;
  max_price_monthly: number | null;       // null = no cap
  show_free_only: boolean;
  providers: string[];                    // empty = all
  sort_by: SortKey;
  sort_dir: "asc" | "desc";
}
