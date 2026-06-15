import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import * as schema from "../../src/db/schema";
import {
  insertProviderSchema,
  insertPlanSchema,
  insertModelSchema,
  insertScrapeRunSchema,
  insertSourceSnapshotSchema,
  providers,
  plans,
  models,
  scrapeRuns,
} from "../../src/db/schema";

let dbDir: string;
let dbPath: string;

function createTestDb() {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

function runMigrations(): void {
  const sqlite = new Database(dbPath);

  // Read and apply migration files from src/db/migrations/
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

beforeAll(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-schema-test-"));
  dbPath = path.join(dbDir, "test.db");
  runMigrations();
});

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
});

describe("schema validation", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    // Fresh DB for each test
    try { fs.unlinkSync(dbPath); } catch { /* ok */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch { /* ok */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch { /* ok */ }
    runMigrations();
    db = createTestDb();
  });

  it("insertProviderSchema rejects missing required fields", () => {
    expect(() =>
      insertProviderSchema.parse({ id: "test" }),
    ).toThrow();
  });

  it("insertProviderSchema rejects empty name", () => {
    expect(() =>
      insertProviderSchema.parse({
        id: "test",
        slug: "test",
        name: "",
        websiteUrl: "https://example.com",
        pricingUrl: "https://example.com/pricing",
        createdAt: "2026-06-14",
        updatedAt: "2026-06-14",
      }),
    ).toThrow();
  });

  it("insertProviderSchema rejects invalid URL", () => {
    expect(() =>
      insertProviderSchema.parse({
        id: "test",
        slug: "test",
        name: "Test",
        websiteUrl: "not-a-url",
        pricingUrl: "https://example.com/pricing",
        createdAt: "2026-06-14",
        updatedAt: "2026-06-14",
      }),
    ).toThrow();
  });

  it("insertProviderSchema accepts valid provider", () => {
    const data = {
      id: "test-provider",
      slug: "test-provider",
      name: "Test Provider",
      websiteUrl: "https://example.com",
      pricingUrl: "https://example.com/pricing",
      createdAt: "2026-06-14",
      updatedAt: "2026-06-14",
    };
    expect(() => insertProviderSchema.parse(data)).not.toThrow();
  });

  it("insertPlanSchema rejects missing planName", () => {
    expect(() =>
      insertPlanSchema.parse({
        id: "test-plan",
        slug: "test-plan",
        billingInterval: "monthly",
      }),
    ).toThrow();
  });

  it("insertModelSchema rejects empty displayName", () => {
    expect(() =>
      insertModelSchema.parse({
        id: "test-model",
        canonicalModelId: "test-model",
        displayName: "",
      }),
    ).toThrow();
  });

  it("unique slug constraint rejects duplicates", () => {
    db.insert(providers).values({
      id: "p1",
      slug: "same-slug",
      name: "Provider One",
      websiteUrl: "https://example.com",
      pricingUrl: "https://example.com/pricing",
      createdAt: "2026-06-14",
      updatedAt: "2026-06-14",
    }).run();

    expect(() =>
      db.insert(providers).values({
        id: "p2",
        slug: "same-slug",
        name: "Provider Two",
        websiteUrl: "https://example.com",
        pricingUrl: "https://example.com/pricing",
        createdAt: "2026-06-14",
        updatedAt: "2026-06-14",
      }).run(),
    ).toThrow();
  });

  it("unique canonicalModelId rejects duplicates", () => {
    db.insert(models).values({
      id: "m1",
      canonicalModelId: "same-model",
      displayName: "Model One",
    }).run();

    expect(() =>
      db.insert(models).values({
        id: "m2",
        canonicalModelId: "same-model",
        displayName: "Model Two",
      }).run(),
    ).toThrow();
  });
});

describe("partial/passthrough on scrape tables", () => {
  it("insertScrapeRunSchema accepts partial data with extra fields", () => {
    const messyData = {
      providerId: "test",
      started_at: "2026-06-14T00:00:00Z",
      status: "success",
      extra_field_1: "something",
      unknown_data: { nested: true },
    };

    const parsed = insertScrapeRunSchema.parse(messyData);
    expect(parsed.providerId).toBe("test");
    expect(parsed.status).toBe("success");
    // passthrough means extra fields are not stripped
    expect((parsed as any).extra_field_1).toBe("something");
  });

  it("insertScrapeRunSchema allows missing optional fields", () => {
    const minimal = {
      providerId: "test",
      started_at: "2026-06-14T00:00:00Z",
      status: "running",
    };

    const parsed = insertScrapeRunSchema.parse(minimal);
    expect(parsed.providerId).toBe("test");
    expect(parsed.status).toBe("running");
    // Optional fields should be undefined, not required
    expect(parsed.error_message).toBeUndefined();
  });

  it("insertSourceSnapshotSchema accepts partial data with unknown fields", () => {
    const partialSnapshot = {
      providerId: "test",
      source_url: "https://example.com",
      observed_at: "2026-06-14",
      raw_html_or_text_reference: "<html>...</html>",
      UNEXPECTED_COLUMN: true,
    };

    const parsed = insertSourceSnapshotSchema.parse(partialSnapshot);
    expect(parsed.providerId).toBe("test");
    expect((parsed as any).UNEXPECTED_COLUMN).toBe(true);
  });
});

describe("insert and select round-trip", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ok */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch { /* ok */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch { /* ok */ }
    runMigrations();
    db = createTestDb();
  });

  it("inserts and selects a provider", () => {
    db.insert(providers).values({
      id: "roundtrip",
      slug: "roundtrip",
      name: "Round Trip",
      websiteUrl: "https://example.com",
      pricingUrl: "https://example.com/pricing",
      createdAt: "2026-06-14",
      updatedAt: "2026-06-14",
    }).run();

    const result = db.select().from(providers).where(eq(providers.id, "roundtrip")).all();
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Round Trip");
    expect(result[0].createdAt).toBe("2026-06-14");
  });

  it("inserts and selects a plan with FK reference", () => {
    // Insert provider first (FK requirement)
    db.insert(providers).values({
      id: "fk-provider",
      slug: "fk-provider",
      name: "FK Provider",
      websiteUrl: "https://example.com",
      pricingUrl: "https://example.com/pricing",
      createdAt: "2026-06-14",
      updatedAt: "2026-06-14",
    }).run();

    db.insert(plans).values({
      id: "fk-plan",
      providerId: "fk-provider",
      slug: "fk-plan",
      planName: "FK Plan",
      billingInterval: "monthly",
      listedPrice: 20,
      effectiveMonthlyPrice: 20,
    }).run();

    const result = db.select().from(plans).where(eq(plans.id, "fk-plan")).all();
    expect(result.length).toBe(1);
    expect(result[0].providerId).toBe("fk-provider");
    expect(result[0].listedPrice).toBe(20);
  });

  it("FK constraint rejects orphan plan", () => {
    expect(() =>
      db.insert(plans).values({
        id: "orphan-plan",
        providerId: "non-existent",
        slug: "orphan",
        planName: "Orphan",
        billingInterval: "monthly",
      }).run(),
    ).toThrow();
  });
});
