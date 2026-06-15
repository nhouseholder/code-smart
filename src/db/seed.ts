import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, runMigrations } from "./index";
import { sql } from "drizzle-orm";
import {
  providers,
  plans,
  models,
  planModelAccess,
  usageLimits,
  providerSourcePages,
} from "./schema";

const PROVIDERS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "providers",
);

interface ProviderJSON {
  id: string;
  name: string;
  display_name: string;
  website: string;
  pricing_url: string;
  description: string;
  logo_slug: string;
  category: string;
  headquarters_country: string;
  founded_year?: number;
  last_verified: string;
  models: ModelJSON[];
  plans: PlanJSON[];
}

interface ModelJSON {
  id: string;
  provider_id: string;
  display_name: string;
  family?: string;
  context_length_k: number | null;
  strengths: string[];
  released_date?: string;
  benchmarks: Array<{ name: string; score: number | null; unit: string }>;
  provenance: { confidence: string };
}

interface PlanJSON {
  id: string;
  provider_id: string;
  name: string;
  tier: string;
  pricing: {
    monthly_usd: number | null;
    annual_monthly_usd: number | null;
    is_per_seat: boolean;
    currency: string;
    notes?: string;
    provenance: { confidence: string };
  };
  models: Array<{ model_id: string; access_type: string }>;
  usage_limits: Array<{
    type: string;
    value: number | null;
    unit?: string;
    applies_to?: string;
    notes?: string;
    provenance: { confidence: string };
  }>;
  target_personas: string[];
  is_active: boolean;
  last_verified: string;
  source_url: string;
}

export function seed(): void {
  const db = getDb();
  const now = new Date().toISOString().split("T")[0]; // "2026-06-14"

  // Read all provider JSON files
  const files = fs
    .readdirSync(PROVIDERS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log("No provider JSON files found in", PROVIDERS_DIR);
    return;
  }

  // Check if seed already applied by looking for existing providers
  const existing = db.select({ count: sql<number>`count(*)` }).from(providers).get();
  if (existing && existing.count > 0) {
    console.log(`DB already seeded with ${existing.count} providers — skipping.`);
    return;
  }

  console.log(`Seeding from ${files.length} provider files...`);

  // Read all files first (I/O before transaction to avoid holding the write lock)
  const providersData: ProviderJSON[] = files.map((file) => {
    const filePath = path.join(PROVIDERS_DIR, file);
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProviderJSON;
  });

  // Use a transaction for atomicity
  db.transaction((tx) => {
    for (const raw of providersData) {
      const providerId = raw.id;

      // ── Insert provider ──────────────────────────────────────────
      tx.insert(providers).values({
        id: providerId,
        slug: providerId, // id is already a slug-style identifier
        name: raw.name,
        websiteUrl: raw.website,
        pricingUrl: raw.pricing_url,
        docsUrl: null,
        status: "active",
        notes: raw.description || null,
        createdAt: now,
        updatedAt: now,
      }).run();

      // ── Insert provider_source_pages ─────────────────────────────
      tx.insert(providerSourcePages).values({
        providerId,
        url: raw.pricing_url,
        pageType: "pricing",
        scrapeStrategy: "playwright",
        enabled: true,
        expectedUpdateFrequency: "weekly",
        notes: null,
        createdAt: now,
      }).run();

      // ── Insert models (deduplicated across provider and plans) ──
      const seenModelIds = new Set<string>();
      for (const m of raw.models) {
        if (seenModelIds.has(m.id)) continue;
        seenModelIds.add(m.id);

        tx.insert(models).values({
          id: m.id,
          canonicalModelId: m.id,
          displayName: m.display_name,
          providerModelFamily: m.family ?? null,
          releaseDate: m.released_date ?? null,
          status: "active",
          aliases: null,
        }).run();
      }

      // ── Insert plans + plan_model_access + usage_limits ─────────
      for (const plan of raw.plans) {
        // "annual" if the JSON has annual_monthly_usd (even if identical to monthly)
        const billingInterval =
          plan.pricing.annual_monthly_usd !== null ? "annual" : "monthly";

        tx.insert(plans).values({
          id: plan.id,
          providerId,
          // Assumes every plan ID starts with `<providerId>-` — brittle if data changes
          slug: plan.id.replace(`${providerId}-`, ""),
          planName: plan.name,
          billingInterval,
          listedPrice: plan.pricing.monthly_usd,
          effectiveMonthlyPrice:
            plan.pricing.annual_monthly_usd ?? plan.pricing.monthly_usd,
          currency: plan.pricing.currency,
          annualDiscountNotes: plan.pricing.notes ?? null,
          planUrl: plan.source_url || null,
          status: plan.is_active ? "active" : "inactive",
        }).run();

        // Plan → model access
        for (const ref of plan.models) {
          tx.insert(planModelAccess).values({
            planId: plan.id,
            modelId: ref.model_id,
            observedAt: now,
            accessLevel: ref.access_type,
            notes: null,
            sourceSnapshotId: null,
            confidence: null,
          }).run();
        }

        // Usage limits
        for (const ul of plan.usage_limits) {
          tx.insert(usageLimits).values({
            planId: plan.id,
            modelId: null,
            observedAt: now,
            rawLimitText: ul.type || ul.notes || "",
            limitType: ul.type,
            limitValue: ul.value,
            limitUnit: ul.unit ?? null,
            resetWindow: null,
            sourceSnapshotId: null,
            confidence: ul.provenance.confidence ?? "unknown",
            notes: ul.notes ?? null,
          }).run();
        }
      }
    }
  });

  // Verify counts
  const providerRow = db.select({ count: sql<number>`count(*)` }).from(providers).get();
  const planRow = db.select({ count: sql<number>`count(*)` }).from(plans).get();
  const modelRow = db.select({ count: sql<number>`count(*)` }).from(models).get();
  const accessRow = db.select({ count: sql<number>`count(*)` }).from(planModelAccess).get();
  const limitRow = db.select({ count: sql<number>`count(*)` }).from(usageLimits).get();
  const sourcePageRow = db.select({ count: sql<number>`count(*)` }).from(providerSourcePages).get();

  console.log(`\nSeed complete:`);
  console.log(`  Providers:           ${providerRow?.count ?? 0}`);
  console.log(`  Plans:               ${planRow?.count ?? 0}`);
  console.log(`  Models:              ${modelRow?.count ?? 0}`);
  console.log(`  Plan-Model Access:   ${accessRow?.count ?? 0}`);
  console.log(`  Usage Limits:        ${limitRow?.count ?? 0}`);
  console.log(`  Source Pages:        ${sourcePageRow?.count ?? 0}`);
}

// ── CLI: `npx tsx src/db/seed.ts` ──────────────────────────────────
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed")) {
  console.log("Seeding database...");
  getDb();
  // Migration is a separate step — caller must run db:migrate before db:seed
  seed();
  console.log("Seed complete.");
  process.exit(0);
}
