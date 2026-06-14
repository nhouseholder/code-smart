import { z } from "zod";

// ─── Primitives ─────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const ProvenanceSchema = z.object({
  url: z.string().url(),
  accessed_date: isoDate,
  method: z.enum(["manual", "automated"]),
  confidence: z.enum(["observed", "inferred", "assumed", "stale", "unknown"]),
  notes: z.string().optional(),
});

// ─── Limits ─────────────────────────────────────────────────────────────────

export const LimitTypeSchema = z.enum([
  "messages_per_day",
  "messages_per_month",
  "tokens_per_minute",
  "tokens_per_day",
  "tokens_per_month",
  "requests_per_minute",
  "requests_per_day",
  "requests_per_month",
  "completions_per_month",
  "credits_per_month",
  "compute_units_per_month",
  "unlimited",
  "unknown",
]);

export const UsageLimitSchema = z.object({
  type: LimitTypeSchema,
  value: z.number().positive().nullable(),
  unit: z.string().optional(),
  applies_to: z.string().optional(),
  notes: z.string().optional(),
  provenance: ProvenanceSchema,
});

// ─── Benchmarks & Models ────────────────────────────────────────────────────

export const BenchmarkScoreSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(200).nullable(),  // allow >100 for some normalized benchmarks
  unit: z.enum(["percent", "pass@1", "normalized", "rank"]),
  higher_is_better: z.boolean(),
  notes: z.string().optional(),
  provenance: ProvenanceSchema,
});

export const ModelRefSchema = z.object({
  model_id: z.string().min(1),
  access_type: z.enum(["full", "limited", "preview", "legacy"]),
  is_default: z.boolean().optional(),
  notes: z.string().optional(),
});

export const ModelSchema = z.object({
  id: z.string().min(1),
  provider_id: z.string().min(1),
  display_name: z.string().min(1),
  family: z.string().optional(),
  context_length_k: z.number().positive().nullable(),
  strengths: z.array(z.string()),
  released_date: isoDate.optional(),
  benchmarks: z.array(BenchmarkScoreSchema),
  provenance: ProvenanceSchema,
});

// ─── Plans ──────────────────────────────────────────────────────────────────

export const PlanPricingSchema = z.object({
  monthly_usd: z.number().nonnegative().nullable(),
  annual_monthly_usd: z.number().nonnegative().nullable(),
  is_per_seat: z.boolean(),
  trial_days: z.number().nonnegative().optional(),
  currency: z.string().length(3),
  notes: z.string().optional(),
  provenance: ProvenanceSchema,
});

export const PlanFeaturesSchema = z.object({
  agent_capabilities: z.boolean(),
  web_search: z.boolean(),
  code_context_length_k: z.number().positive().nullable(),
  file_uploads: z.boolean(),
  voice_input: z.boolean(),
  ide_integrations: z.array(z.string()),
  cli_access: z.boolean(),
  api_access: z.boolean(),
  priority_access: z.boolean(),
  custom_instructions: z.boolean(),
  team_features: z.boolean(),
  sso: z.boolean(),
  notes: z.string().optional(),
});

export const PlanSchema = z.object({
  id: z.string().min(1),
  provider_id: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(["free", "individual", "pro", "team", "enterprise", "api"]),
  pricing: PlanPricingSchema,
  models: z.array(ModelRefSchema),
  usage_limits: z.array(UsageLimitSchema),
  features: PlanFeaturesSchema,
  target_personas: z.array(z.string()),
  is_active: z.boolean(),
  last_verified: isoDate,
  source_url: z.string().url(),
});

// ─── Provider ────────────────────────────────────────────────────────────────

export const ProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  display_name: z.string().min(1),
  website: z.string().url(),
  pricing_url: z.string().url(),
  description: z.string().min(10),
  logo_slug: z.string().min(1),
  category: z.enum(["ai_lab", "ide_tool", "platform", "open_source"]),
  headquarters_country: z.string().min(2),
  founded_year: z.number().int().min(1990).optional(),
  plans: z.array(PlanSchema),
  models: z.array(ModelSchema),
  last_verified: isoDate,
  provenance: ProvenanceSchema,
});

export type ProviderInput = z.input<typeof ProviderSchema>;
export type ProviderOutput = z.output<typeof ProviderSchema>;
