CREATE TABLE `artificial_analysis_model_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model_id` text NOT NULL,
	`observed_at` text NOT NULL,
	`intelligence_index` real,
	`coding_index` real,
	`agentic_index` real,
	`speed_score` real,
	`input_price` real,
	`output_price` real,
	`price_efficiency_metrics_json` text,
	`raw_payload_json` text,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_aa_scores_model_date` ON `artificial_analysis_model_scores` (`model_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_model_id` text NOT NULL,
	`display_name` text NOT NULL,
	`provider_model_family` text,
	`release_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`aliases` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_canonical_model_id_unique` ON `models` (`canonical_model_id`);--> statement-breakpoint
CREATE INDEX `idx_models_status` ON `models` (`status`);--> statement-breakpoint
CREATE TABLE `plan_model_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`model_id` text NOT NULL,
	`observed_at` text NOT NULL,
	`access_level` text NOT NULL,
	`notes` text,
	`source_snapshot_id` integer,
	`confidence` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_plan_model_access_plan` ON `plan_model_access` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`observed_at` text NOT NULL,
	`price` real,
	`effective_monthly_price` real,
	`source_snapshot_id` integer,
	`confidence` text,
	`extraction_method` text,
	`notes` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_plan_date` ON `plan_snapshots` (`plan_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`slug` text NOT NULL,
	`plan_name` text NOT NULL,
	`billing_interval` text NOT NULL,
	`listed_price` real,
	`effective_monthly_price` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`annual_discount_notes` text,
	`plan_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_plans_provider` ON `plans` (`provider_id`);--> statement-breakpoint
CREATE TABLE `provider_source_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`url` text NOT NULL,
	`page_type` text NOT NULL,
	`scrape_strategy` text DEFAULT 'playwright' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`expected_update_frequency` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_source_pages_provider` ON `provider_source_pages` (`provider_id`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`website_url` text NOT NULL,
	`pricing_url` text NOT NULL,
	`docs_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `providers_slug_unique` ON `providers` (`slug`);--> statement-breakpoint
CREATE TABLE `rankings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ranking_type` text NOT NULL,
	`price_band` text,
	`observed_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`methodology_version` text
);
--> statement-breakpoint
CREATE INDEX `idx_rankings_type_date` ON `rankings` (`ranking_type`,`observed_at`);--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error_message` text,
	`content_hash` text,
	`change_detected` integer,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_scrape_runs_provider` ON `scrape_runs` (`provider_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `source_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`source_url` text NOT NULL,
	`observed_at` text NOT NULL,
	`raw_html_or_text_reference` text,
	`content_hash` text,
	`extracted_text` text,
	`parser_version` text,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_provider_date` ON `source_snapshots` (`provider_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `usage_estimates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`model_id` text NOT NULL,
	`observed_at` text NOT NULL,
	`estimate_type` text NOT NULL,
	`estimated_tokens_5h` real,
	`estimated_tokens_24h` real,
	`estimated_tokens_1w` real,
	`estimated_tokens_1mo` real,
	`estimation_method` text,
	`benchmark_cost_basis` real,
	`uncertainty_low` real,
	`uncertainty_high` real,
	`confidence` text,
	`notes` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_estimates_plan_model_type` ON `usage_estimates` (`plan_id`,`model_id`,`estimate_type`);--> statement-breakpoint
CREATE TABLE `usage_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`model_id` text,
	`observed_at` text NOT NULL,
	`raw_limit_text` text NOT NULL,
	`limit_type` text NOT NULL,
	`limit_value` real,
	`limit_unit` text,
	`reset_window` text,
	`source_snapshot_id` integer,
	`confidence` text,
	`notes` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_snapshot_id`) REFERENCES `source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_usage_limits_plan` ON `usage_limits` (`plan_id`);