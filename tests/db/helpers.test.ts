import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

import * as schema from "../../src/db/schema";
import {
  providers,
  plans,
  models,
  sourceSnapshots,
  planSnapshots,
  artificialAnalysisModelScores,
  rankings,
  scrapeRuns,
} from "../../src/db/schema";
import {
  getLatestSourceSnapshot,
  getSourceSnapshotsSince,
  getLatestPlanSnapshot,
  getPlanSnapshotHistory,
  getLatestAAScores,
  getActiveProvidersWithPlans,
  getLatestRanking,
  hasContentChanged,
  getLatestScrapeRun,
} from "../../src/db/helpers";

let dbDir: string;
let dbPath: string;
let _sqlite: Database.Database | null = null;

/**
 * Create a test DB connection by applying migration SQL directly.
 * Returns the drizzle instance for queries.
 */
function createTestDb() {
  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  return drizzle(_sqlite, { schema });
}

function runMigrations(): void {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");

  const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "src",
    "db",
    "migrations",
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    sqlite.exec(content);
  }
  sqlite.close();
}

/**
 * Seed baseline test data matching helper function expectations.
 * All FK references are valid; dates are chosen for deterministic ordering.
 */
function seedTestData(db: ReturnType<typeof drizzle>): void {
  // ── Providers ─────────────────────────────────────────────────
  db.insert(providers).values({
    id: "provider-a",
    slug: "provider-a",
    name: "Provider A (Active)",
    websiteUrl: "https://example.com/a",
    pricingUrl: "https://example.com/a/pricing",
    status: "active",
    createdAt: "2026-06-01",
    updatedAt: "2026-06-14",
  }).run();

  db.insert(providers).values({
    id: "provider-b",
    slug: "provider-b",
    name: "Provider B (Inactive)",
    websiteUrl: "https://example.com/b",
    pricingUrl: "https://example.com/b/pricing",
    status: "inactive",
    createdAt: "2026-06-01",
    updatedAt: "2026-06-14",
  }).run();

  // ── Models ────────────────────────────────────────────────────
  db.insert(models).values({
    id: "model-1",
    canonicalModelId: "model-1",
    displayName: "Model One",
    status: "active",
  }).run();

  db.insert(models).values({
    id: "model-2",
    canonicalModelId: "model-2",
    displayName: "Model Two",
    status: "active",
  }).run();

  // ── Plans ─────────────────────────────────────────────────────
  db.insert(plans).values({
    id: "plan-a",
    providerId: "provider-a",
    slug: "plan-a",
    planName: "Plan A",
    billingInterval: "monthly",
    listedPrice: 20,
    effectiveMonthlyPrice: 20,
    status: "active",
  }).run();

  db.insert(plans).values({
    id: "plan-b",
    providerId: "provider-b",
    slug: "plan-b",
    planName: "Plan B",
    billingInterval: "monthly",
    listedPrice: 50,
    effectiveMonthlyPrice: 50,
    status: "active",
  }).run();

  db.insert(plans).values({
    id: "plan-a-inactive",
    providerId: "provider-a",
    slug: "plan-a-inactive",
    planName: "Plan A Inactive",
    billingInterval: "monthly",
    listedPrice: 100,
    effectiveMonthlyPrice: 100,
    status: "inactive",
  }).run();

  // ── Source Snapshots (ascending dates for deterministic ordering) ──
  db.insert(sourceSnapshots).values({
    providerId: "provider-a",
    sourceUrl: "https://example.com/a/pricing",
    observedAt: "2026-06-10",
    contentHash: "abc123",
    rawHtmlOrTextReference: "<html>snapshot 1</html>",
  }).run();

  db.insert(sourceSnapshots).values({
    providerId: "provider-a",
    sourceUrl: "https://example.com/a/pricing",
    observedAt: "2026-06-12",
    contentHash: "def456",
    rawHtmlOrTextReference: "<html>snapshot 2</html>",
  }).run();

  db.insert(sourceSnapshots).values({
    providerId: "provider-a",
    sourceUrl: "https://example.com/a/pricing",
    observedAt: "2026-06-14",
    contentHash: "ghi789",
    rawHtmlOrTextReference: "<html>snapshot 3</html>",
  }).run();

  // Different URL for provider-a (not returned by getLatestSourceSnapshot same-url filter)
  db.insert(sourceSnapshots).values({
    providerId: "provider-a",
    sourceUrl: "https://example.com/a/docs",
    observedAt: "2026-06-13",
    contentHash: "other-url",
    rawHtmlOrTextReference: "<html>docs page</html>",
  }).run();

  // ── Plan Snapshots ─────────────────────────────────────────────
  db.insert(planSnapshots).values({
    planId: "plan-a",
    observedAt: "2026-06-10",
    price: 20,
    effectiveMonthlyPrice: 20,
    extractionMethod: "manual",
  }).run();

  db.insert(planSnapshots).values({
    planId: "plan-a",
    observedAt: "2026-06-12",
    price: 25,
    effectiveMonthlyPrice: 25,
    extractionMethod: "manual",
  }).run();

  db.insert(planSnapshots).values({
    planId: "plan-a",
    observedAt: "2026-06-14",
    price: 30,
    effectiveMonthlyPrice: 30,
    extractionMethod: "manual",
  }).run();

  // ── AA Scores ──────────────────────────────────────────────────
  db.insert(artificialAnalysisModelScores).values({
    modelId: "model-1",
    observedAt: "2026-06-10",
    intelligenceIndex: 70,
    codingIndex: 65,
    source: "aa-test",
    confidence: "high",
  }).run();

  db.insert(artificialAnalysisModelScores).values({
    modelId: "model-1",
    observedAt: "2026-06-14",
    intelligenceIndex: 80,
    codingIndex: 75,
    source: "aa-test",
    confidence: "high",
  }).run();

  db.insert(artificialAnalysisModelScores).values({
    modelId: "model-2",
    observedAt: "2026-06-12",
    codingIndex: 90,
    source: "aa-test",
    confidence: "medium",
  }).run();

  // ── Rankings ───────────────────────────────────────────────────
  db.insert(rankings).values({
    rankingType: "overall",
    observedAt: "2026-06-10",
    payloadJson: JSON.stringify({ ranks: [{ modelId: "model-1", rank: 1 }] }),
    methodologyVersion: "1.0",
  }).run();

  db.insert(rankings).values({
    rankingType: "overall",
    observedAt: "2026-06-14",
    payloadJson: JSON.stringify({ ranks: [{ modelId: "model-1", rank: 2 }] }),
    methodologyVersion: "1.1",
  }).run();

  db.insert(rankings).values({
    rankingType: "coding",
    observedAt: "2026-06-14",
    payloadJson: JSON.stringify({ ranks: [{ modelId: "model-1", rank: 1 }] }),
    methodologyVersion: "1.0",
  }).run();

  // ── Scrape Runs (descending dates for ordering test) ───────────
  db.insert(scrapeRuns).values({
    providerId: "provider-a",
    startedAt: "2026-06-10T00:00:00Z",
    finishedAt: "2026-06-10T00:05:00Z",
    status: "success",
    contentHash: "abc123",
    changeDetected: true,
  }).run();

  db.insert(scrapeRuns).values({
    providerId: "provider-a",
    startedAt: "2026-06-12T00:00:00Z",
    finishedAt: "2026-06-12T00:05:00Z",
    status: "success",
    contentHash: "def456",
    changeDetected: true,
  }).run();

  // Running scrape should be excluded by getLatestScrapeRun
  db.insert(scrapeRuns).values({
    providerId: "provider-a",
    startedAt: "2026-06-14T00:00:00Z",
    status: "running",
  }).run();
}

// ── Globals (shared temp DB + seeded data) ───────────────────────────
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-helpers-test-"));
  dbPath = path.join(dbDir, "test.db");
  runMigrations();
  db = createTestDb();
  seedTestData(db);
});

afterAll(() => {
  if (_sqlite) { _sqlite.close(); _sqlite = null; }
  fs.rmSync(dbDir, { recursive: true, force: true });
});

// ── Source Snapshots ─────────────────────────────────────────────────

describe("getLatestSourceSnapshot", () => {
  it("returns the most recent source snapshot for a provider", () => {
    const result = getLatestSourceSnapshot(db, "provider-a");
    expect(result).not.toBeNull();
    expect(result!.providerId).toBe("provider-a");
    expect(result!.observedAt).toBe("2026-06-14");
    expect(result!.contentHash).toBe("ghi789");
  });

  it("returns null when no snapshots exist for provider", () => {
    const result = getLatestSourceSnapshot(db, "provider-b");
    expect(result).toBeNull();
  });

  it("returns null for nonexistent provider", () => {
    const result = getLatestSourceSnapshot(db, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("getSourceSnapshotsSince", () => {
  it("returns snapshots after the cutoff date", () => {
    const results = getSourceSnapshotsSince(db, "provider-a", "2026-06-11");
    expect(results.length).toBe(3); // 2026-06-12 (pricing), 2026-06-13 (docs), 2026-06-14 (pricing)
  });

  it("returns all snapshots when cutoff is before any data", () => {
    const results = getSourceSnapshotsSince(db, "provider-a", "2026-01-01");
    expect(results.length).toBe(4); // all 4 source snapshots for provider-a
  });

  it("returns empty array when cutoff is after all data", () => {
    const results = getSourceSnapshotsSince(db, "provider-a", "2026-12-31");
    expect(results.length).toBe(0);
  });

  it("orders results newest-first", () => {
    const results = getSourceSnapshotsSince(db, "provider-a", "2026-06-01");
    expect(results[0].observedAt).toBe("2026-06-14");
    expect(results[results.length - 1].observedAt).toBe("2026-06-10");
  });
});

// ── Plan Snapshots ───────────────────────────────────────────────────

describe("getLatestPlanSnapshot", () => {
  it("returns the most recent plan snapshot", () => {
    const result = getLatestPlanSnapshot(db, "plan-a");
    expect(result).not.toBeNull();
    expect(result!.planId).toBe("plan-a");
    expect(result!.observedAt).toBe("2026-06-14");
    expect(result!.price).toBe(30);
  });

  it("returns null for a plan with no snapshots", () => {
    const result = getLatestPlanSnapshot(db, "plan-b");
    expect(result).toBeNull();
  });

  it("returns null for nonexistent plan", () => {
    const result = getLatestPlanSnapshot(db, "nonexistent-plan");
    expect(result).toBeNull();
  });
});

describe("getPlanSnapshotHistory", () => {
  it("returns all snapshots within date range", () => {
    const results = getPlanSnapshotHistory(db, "plan-a", "2026-06-11");
    expect(results.length).toBe(2);
    expect(results[0].observedAt).toBe("2026-06-14");
    expect(results[1].observedAt).toBe("2026-06-12");
  });

  it("returns empty when cutoff is after all data", () => {
    const results = getPlanSnapshotHistory(db, "plan-a", "2026-12-31");
    expect(results.length).toBe(0);
  });
});

// ── AA Scores ────────────────────────────────────────────────────────

describe("getLatestAAScores", () => {
  it("returns a map keyed by modelId", () => {
    const map = getLatestAAScores(db);
    expect(map.has("model-1")).toBe(true);
    expect(map.has("model-2")).toBe(true);
  });

  it("returns the most recent score per model", () => {
    const map = getLatestAAScores(db);
    const m1 = map.get("model-1")!;
    expect(m1.intelligenceIndex).toBe(80); // from 2026-06-14
    expect(m1.observedAt).toBe("2026-06-14");

    const m2 = map.get("model-2")!;
    expect(m2.codingIndex).toBe(90);
    expect(m2.observedAt).toBe("2026-06-12");
  });
});

// ── Providers & Plans ────────────────────────────────────────────────

describe("getActiveProvidersWithPlans", () => {
  it("returns only providers with status=active", () => {
    const results = getActiveProvidersWithPlans(db);
    const names = results.map((p) => p.name);
    expect(names).toContain("Provider A (Active)");
    expect(names).not.toContain("Provider B (Inactive)");
  });

  it("includes only active plans for each provider", () => {
    const results = getActiveProvidersWithPlans(db);
    const providerA = results.find((p) => p.id === "provider-a")!;
    expect(providerA).toBeDefined();
    const planNames = providerA.plans.map((pl) => pl.slug);
    expect(planNames).toContain("plan-a");
    expect(planNames).not.toContain("plan-a-inactive");
  });
});

// ── Rankings ─────────────────────────────────────────────────────────

describe("getLatestRanking", () => {
  it("returns the latest overall ranking", () => {
    const result = getLatestRanking(db, "overall");
    expect(result).not.toBeNull();
    expect(result!.observedAt).toBe("2026-06-14");
    expect(result!.methodologyVersion).toBe("1.1");
  });

  it("returns the latest coding ranking", () => {
    const result = getLatestRanking(db, "coding");
    expect(result).not.toBeNull();
    expect(result!.rankingType).toBe("coding");
    expect(result!.observedAt).toBe("2026-06-14");
  });

  it("returns null for unknown ranking type", () => {
    const result = getLatestRanking(db, "nonexistent");
    expect(result).toBeNull();
  });
});

// ── Content Change Detection ─────────────────────────────────────────

describe("hasContentChanged", () => {
  it("returns true when no previous snapshot exists", () => {
    const result = hasContentChanged(
      db,
      "provider-b",
      "https://example.com/b/pricing",
      "brand-new-hash",
    );
    expect(result).toBe(true);
  });

  it("returns true when hash differs from previous snapshot", () => {
    const result = hasContentChanged(
      db,
      "provider-a",
      "https://example.com/a/pricing",
      "completely-new-hash",
    );
    expect(result).toBe(true);
  });

  it("returns false when hash matches previous snapshot", () => {
    const result = hasContentChanged(
      db,
      "provider-a",
      "https://example.com/a/pricing",
      "ghi789",
    );
    expect(result).toBe(false);
  });
});

// ── Scrape Runs ──────────────────────────────────────────────────────

describe("getLatestScrapeRun", () => {
  it("returns the most recent completed scrape run", () => {
    const result = getLatestScrapeRun(db, "provider-a");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("success");
    expect(result!.contentHash).toBe("def456");
    expect(result!.startedAt).toBe("2026-06-12T00:00:00Z");
  });

  it("excludes running scrapes", () => {
    const result = getLatestScrapeRun(db, "provider-a");
    expect(result!.status).not.toBe("running");
  });

  it("returns null when no completed scrapes exist", () => {
    const result = getLatestScrapeRun(db, "provider-b");
    expect(result).toBeNull();
  });
});
