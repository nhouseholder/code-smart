import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ────────────────────────────────────────────────────────────────────
// Table 1: providers
// ────────────────────────────────────────────────────────────────────
export const providers = sqliteTable(
  "providers",
  {
    id: text("id").primaryKey(), // e.g. "anthropic"
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    websiteUrl: text("website_url").notNull(),
    pricingUrl: text("pricing_url").notNull(),
    docsUrl: text("docs_url"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

// ────────────────────────────────────────────────────────────────────
// Table 2: provider_source_pages
// ────────────────────────────────────────────────────────────────────
export const providerSourcePages = sqliteTable(
  "provider_source_pages",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").notNull().references(() => providers.id),
    url: text("url").notNull(),
    pageType: text("page_type").notNull(), // "pricing" | "docs" | "models"
    scrapeStrategy: text("scrape_strategy").notNull().default("playwright"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    expectedUpdateFrequency: text("expected_update_frequency"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    providerIdx: index("idx_source_pages_provider").on(table.providerId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 3: scrape_runs
// ────────────────────────────────────────────────────────────────────
export const scrapeRuns = sqliteTable(
  "scrape_runs",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").notNull().references(() => providers.id),
    sourcePageId: integer("source_page_id", { mode: "number" }).references(() => providerSourcePages.id),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status").notNull(), // "success" | "error" | "running"
    errorMessage: text("error_message"),
    contentHash: text("content_hash"),
    changeDetected: integer("change_detected", { mode: "boolean" }),
  },
  (table) => ({
    providerIdx: index("idx_scrape_runs_provider").on(table.providerId, table.startedAt),
    sourcePageIdx: index("idx_scrape_runs_source_page").on(table.sourcePageId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 4: source_snapshots
// ────────────────────────────────────────────────────────────────────
export const sourceSnapshots = sqliteTable(
  "source_snapshots",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").notNull().references(() => providers.id),
    sourceUrl: text("source_url").notNull(),
    observedAt: text("observed_at").notNull(),
    rawHtmlOrTextReference: text("raw_html_or_text_reference"),
    contentHash: text("content_hash"),
    extractedText: text("extracted_text"),
    parserVersion: text("parser_version"),
    notes: text("notes"),
  },
  (table) => ({
    providerDateIdx: index("idx_snapshots_provider_date").on(table.providerId, table.observedAt),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 5: plans
// ────────────────────────────────────────────────────────────────────
export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(), // e.g. "anthropic-claude-pro"
    providerId: text("provider_id").notNull().references(() => providers.id),
    slug: text("slug").notNull(),
    planName: text("plan_name").notNull(),
    billingInterval: text("billing_interval").notNull(), // "monthly" | "annual" | "one-time"
    listedPrice: real("listed_price"),
    effectiveMonthlyPrice: real("effective_monthly_price"),
    currency: text("currency").notNull().default("USD"),
    annualDiscountNotes: text("annual_discount_notes"),
    planUrl: text("plan_url"),
    status: text("status").notNull().default("active"),
  },
  (table) => ({
    providerIdx: index("idx_plans_provider").on(table.providerId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 6: plan_snapshots
// ────────────────────────────────────────────────────────────────────
export const planSnapshots = sqliteTable(
  "plan_snapshots",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    planId: text("plan_id").notNull().references(() => plans.id),
    observedAt: text("observed_at").notNull(),
    price: real("price"),
    effectiveMonthlyPrice: real("effective_monthly_price"),
    sourceSnapshotId: integer("source_snapshot_id", { mode: "number" }).references(() => sourceSnapshots.id),
    confidence: text("confidence"),
    extractionMethod: text("extraction_method"),
    notes: text("notes"),
  },
  (table) => ({
    planDateIdx: index("idx_snapshots_plan_date").on(table.planId, table.observedAt),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 7: models
// ────────────────────────────────────────────────────────────────────
export const models = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(), // e.g. "claude-sonnet-4-6"
    canonicalModelId: text("canonical_model_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    providerModelFamily: text("provider_model_family"), // e.g. "claude-4", "gpt-4o"
    releaseDate: text("release_date"),
    status: text("status").notNull().default("active"),
    aliases: text("aliases"), // JSON array stored as string
  },
  (table) => ({
    statusIdx: index("idx_models_status").on(table.status),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 8: plan_model_access
// ────────────────────────────────────────────────────────────────────
export const planModelAccess = sqliteTable(
  "plan_model_access",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    planId: text("plan_id").notNull().references(() => plans.id),
    modelId: text("model_id").notNull().references(() => models.id),
    observedAt: text("observed_at").notNull(),
    accessLevel: text("access_level").notNull(), // "full" | "limited" | "preview" | "legacy"
    notes: text("notes"),
    sourceSnapshotId: integer("source_snapshot_id", { mode: "number" }).references(() => sourceSnapshots.id),
    confidence: text("confidence"),
  },
  (table) => ({
    planIdx: index("idx_plan_model_access_plan").on(table.planId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 9: usage_limits
// ────────────────────────────────────────────────────────────────────
export const usageLimits = sqliteTable(
  "usage_limits",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    planId: text("plan_id").notNull().references(() => plans.id),
    modelId: text("model_id").references(() => models.id),
    observedAt: text("observed_at").notNull(),
    rawLimitText: text("raw_limit_text").notNull(),
    limitType: text("limit_type").notNull(),
    limitValue: real("limit_value"),
    limitUnit: text("limit_unit"),
    resetWindow: text("reset_window"),
    sourceSnapshotId: integer("source_snapshot_id", { mode: "number" }).references(() => sourceSnapshots.id),
    confidence: text("confidence"),
    notes: text("notes"),
  },
  (table) => ({
    planIdx: index("idx_usage_limits_plan").on(table.planId),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 10: usage_estimates (merged normalized + adjusted)
// ────────────────────────────────────────────────────────────────────
export const usageEstimates = sqliteTable(
  "usage_estimates",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    planId: text("plan_id").notNull().references(() => plans.id),
    modelId: text("model_id").notNull().references(() => models.id),
    observedAt: text("observed_at").notNull(),
    estimateType: text("estimate_type").notNull(), // "normalized" | "adjusted"
    estimatedTokens5h: real("estimated_tokens_5h"),
    estimatedTokens24h: real("estimated_tokens_24h"),
    estimatedTokens1w: real("estimated_tokens_1w"),
    estimatedTokens1mo: real("estimated_tokens_1mo"),
    estimationMethod: text("estimation_method"),
    benchmarkCostBasis: real("benchmark_cost_basis"), // adjusted only
    uncertaintyLow: real("uncertainty_low"), // normalized only
    uncertaintyHigh: real("uncertainty_high"), // normalized only
    confidence: text("confidence"),
    notes: text("notes"),
  },
  (table) => ({
    planModelTypeIdx: index("idx_estimates_plan_model_type").on(table.planId, table.modelId, table.estimateType),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 11: artificial_analysis_model_scores
// ────────────────────────────────────────────────────────────────────
export const artificialAnalysisModelScores = sqliteTable(
  "artificial_analysis_model_scores",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    modelId: text("model_id").notNull().references(() => models.id),
    observedAt: text("observed_at").notNull(),
    intelligenceIndex: real("intelligence_index"),
    codingIndex: real("coding_index"),
    agenticIndex: real("agentic_index"),
    speedScore: real("speed_score"),
    inputPrice: real("input_price"),
    outputPrice: real("output_price"),
    priceEfficiencyMetricsJson: text("price_efficiency_metrics_json"),
    rawPayloadJson: text("raw_payload_json"),
    source: text("source").notNull(),
    confidence: text("confidence").notNull(),
  },
  (table) => ({
    modelDateIdx: index("idx_aa_scores_model_date").on(table.modelId, table.observedAt),
  }),
);

// ────────────────────────────────────────────────────────────────────
// Table 12: rankings
// ────────────────────────────────────────────────────────────────────
export const rankings = sqliteTable(
  "rankings",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    rankingType: text("ranking_type").notNull(),
    priceBand: text("price_band"),
    observedAt: text("observed_at").notNull(),
    payloadJson: text("payload_json").notNull(),
    methodologyVersion: text("methodology_version"),
  },
  (table) => ({
    typeDateIdx: index("idx_rankings_type_date").on(table.rankingType, table.observedAt),
  }),
);

// ────────────────────────────────────────────────────────────────────
// drizzle-zod auto-generated schemas
// ────────────────────────────────────────────────────────────────────

// Strict validation — manually-edited tables
// Override receives the column's own Zod schema, not a parent object
export const insertProviderSchema = createInsertSchema(providers, {
  id: (s) => s.min(2).max(50),
  slug: (s) => s.min(2).max(50),
  name: (s) => s.min(1).max(200),
  websiteUrl: (s) => s.url(),
  pricingUrl: (s) => s.url(),
  docsUrl: (s) => s.url().optional().nullable(),
}).strict(); // reject unknown keys (e.g. typos like picing_url)
export const selectProviderSchema = createSelectSchema(providers);

export const insertPlanSchema = createInsertSchema(plans, {
  id: (s) => s.min(2).max(100),
  slug: (s) => s.min(2).max(100),
  planName: (s) => s.min(1).max(200),
  billingInterval: (s) => s.refine(
    (v) => ["monthly", "annual", "one-time", "weekly", "daily"].includes(v),
    { message: "Must be a valid billing interval" },
  ),
  currency: (s) => s.length(3),
  planUrl: (s) => s.url().optional().nullable(),
}).strict();
export const selectPlanSchema = createSelectSchema(plans);

export const insertModelSchema = createInsertSchema(models, {
  id: (s) => s.min(2).max(100),
  canonicalModelId: (s) => s.min(2).max(100),
  displayName: (s) => s.min(1).max(200),
}).strict();
export const selectModelSchema = createSelectSchema(models);

export const insertRankingSchema = createInsertSchema(rankings, {
  rankingType: (s) => s.min(2).max(50),
}).strict();

// Partial / passthrough — scrape-sourced tables
export const insertProviderSourcePageSchema = createInsertSchema(providerSourcePages)
  .partial()
  .passthrough();
export const selectProviderSourcePageSchema = createSelectSchema(providerSourcePages);

export const insertScrapeRunSchema = createInsertSchema(scrapeRuns)
  .partial()
  .passthrough();
export const selectScrapeRunSchema = createSelectSchema(scrapeRuns);

export const insertSourceSnapshotSchema = createInsertSchema(sourceSnapshots)
  .partial()
  .passthrough();
export const selectSourceSnapshotSchema = createSelectSchema(sourceSnapshots);

export const insertPlanSnapshotSchema = createInsertSchema(planSnapshots)
  .partial()
  .passthrough();
export const selectPlanSnapshotSchema = createSelectSchema(planSnapshots);

export const insertPlanModelAccessSchema = createInsertSchema(planModelAccess)
  .partial()
  .passthrough();
export const selectPlanModelAccessSchema = createSelectSchema(planModelAccess);

export const insertUsageLimitSchema = createInsertSchema(usageLimits)
  .partial()
  .passthrough();
export const selectUsageLimitSchema = createSelectSchema(usageLimits);

export const insertUsageEstimateSchema = createInsertSchema(usageEstimates)
  .partial()
  .passthrough();
export const selectUsageEstimateSchema = createSelectSchema(usageEstimates);

export const insertAAScoreSchema = createInsertSchema(artificialAnalysisModelScores)
  .partial()
  .passthrough();
export const selectAAScoreSchema = createSelectSchema(artificialAnalysisModelScores);
