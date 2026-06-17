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
  docs_url?: string;
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

  // ── Sentinel rows (idempotent) ────────────────────────────────────────
  // Pipeline writes planId:"" and modelId:"unknown" for all extracted
  // candidates before plan matching. These FK targets must exist in every
  // DB state — not just test fixtures — or the first live scrape crashes.
  db.insert(providers).values({
    id: "__sentinel__",
    slug: "__sentinel__",
    name: "Sentinel (Internal)",
    websiteUrl: "https://internal.code-smart",
    pricingUrl: "https://internal.code-smart/pricing",
    docsUrl: null,
    status: "inactive",
    notes: "Synthetic provider for unresolved scraper candidates. Do not edit.",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing().run();

  db.insert(models).values({
    id: "unknown",
    canonicalModelId: "unknown",
    displayName: "Unknown Model",
    providerModelFamily: null,
    releaseDate: null,
    status: "inactive",
    aliases: null,
  }).onConflictDoNothing().run();

  db.insert(plans).values({
    id: "",
    providerId: "__sentinel__",
    slug: "candidate",
    planName: "Unresolved Candidate",
    billingInterval: "monthly",
    listedPrice: null,
    effectiveMonthlyPrice: null,
    currency: "USD",
    annualDiscountNotes: null,
    planUrl: null,
    status: "inactive",
  }).onConflictDoNothing().run();

  // Read all provider JSON files
  const files = fs
    .readdirSync(PROVIDERS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log("No provider JSON files found in", PROVIDERS_DIR);
    return;
  }

  // Check if seed already applied (exclude sentinel from count)
  const existing = db.select({ count: sql<number>`count(*)` })
    .from(providers)
    .where(sql`id != '__sentinel__'`)
    .get();
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

  // Use a transaction for atomicity.
  // Two passes: insert ALL providers + models first, then ALL plans. The models
  // table is global, so a plan may reference a model from another provider
  // (e.g. cursor-pro → gpt-5-5). Inserting every model up front means
  // plan_model_access FKs resolve regardless of provider file order.
  db.transaction((tx) => {
    const seenModelIds = new Set<string>();

    // ── Pass 1: providers, source pages, models ───────────────────
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

      // ── Insert provider_source_pages: pricing ─────────────
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

      // ── Insert provider_source_pages: docs (if available) ─
      if (raw.docs_url) {
        tx.insert(providerSourcePages).values({
          providerId,
          url: raw.docs_url,
          pageType: "docs",
          scrapeStrategy: "playwright",
          enabled: true,
          expectedUpdateFrequency: "weekly",
          notes: null,
          createdAt: now,
        }).run();
      }

      // ── Insert models (deduplicated globally across all providers) ──
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
    }

    // ── Pass 2: plans + plan_model_access + usage_limits ──────────
    for (const raw of providersData) {
      const providerId = raw.id;

      // Mirror the loader's in-scope rule (data-loader.ts isInScopePlan):
      // only paid individual/pro plans — free/api/team/enterprise excluded.
      const inScopePlans = raw.plans.filter(
        (p) =>
          (p.tier === "individual" || p.tier === "pro") &&
          typeof p.pricing.monthly_usd === "number" &&
          p.pricing.monthly_usd > 0,
      );
      for (const plan of inScopePlans) {
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
