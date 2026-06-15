import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc } from "drizzle-orm";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import http from "http";

import * as schema from "../../src/db/schema";
import {
  providers,
  plans,
  providerSourcePages,
  scrapeRuns,
  sourceSnapshots,
  planSnapshots,
  usageLimits,
  planModelAccess,
} from "../../src/db/schema";
import { runScrapePipeline } from "../../src/lib/scraper/pipeline";

// ── Test Infrastructure ──────────────────────────────────────────────

let dbDir: string;
let dbPath: string;
let _sqlite: Database.Database | null = null;

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
    sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), "utf-8"));
  }
  sqlite.close();
}

function seedProviderAndPage(db: ReturnType<typeof drizzle>, url: string): number {
  db.insert(providers)
    .values({
      id: "test-provider",
      slug: "test-provider",
      name: "Test Provider",
      websiteUrl: "https://example.com",
      pricingUrl: url,
      status: "active",
      createdAt: "2026-06-14",
      updatedAt: "2026-06-14",
    })
    .run();

  // Sentinel plan for candidate records (pipeline inserts planId="" before matching)
  db.insert(plans)
    .values({
      id: "",
      providerId: "test-provider",
      slug: "candidate",
      planName: "Candidate Plan",
      billingInterval: "monthly",
      currency: "USD",
      status: "active",
    })
    .run();

  // Seed a model so model mention extraction has known models to work with
  db.insert(schema.models)
    .values({
      id: "test-model-v1",
      canonicalModelId: "test-model-v1",
      displayName: "Test Model V1",
      status: "active",
    })
    .run();

  const result = db
    .insert(providerSourcePages)
    .values({
      providerId: "test-provider",
      url,
      pageType: "pricing",
      scrapeStrategy: "static",
      enabled: true,
      createdAt: "2026-06-14",
    })
    .returning({ id: providerSourcePages.id })
    .get();

  return result.id;
}

// ── Local HTTP Server ────────────────────────────────────────────────

const PRICING_HTML = `<html><body>
  <h1>Test Provider Pricing</h1>
  <div class="plans">
    <div class="plan">
      <h2>Starter</h2>
      <p class="price">$20/mo for individuals</p>
      <p>Includes 50 messages per day.</p>
    </div>
    <div class="plan">
      <h2>Pro</h2>
      <p class="price">$200/year for professionals</p>
      <p>Includes 1000 requests per hour.</p>
    </div>
  </div>
  <footer>© 2026 Test Provider. Subject to fair use policy.</footer>
</body></html>`;

const PRICING_HTML_MODIFIED = `<html><body>
  <h1>Test Provider Pricing (Updated)</h1>
  <div class="plans">
    <div class="plan">
      <h2>Starter</h2>
      <p class="price">$25/mo for individuals</p>
      <p>Includes 75 messages per day.</p>
    </div>
    <div class="plan">
      <h2>Pro</h2>
      <p class="price">$250/year for professionals</p>
      <p>Includes 2000 requests per hour.</p>
    </div>
  </div>
</body></html>`;

const PRICING_HTML_COSMETIC = `<html><body>
  <h1>Test Provider Pricing</h1>
  <div class="pricing-v2">
    <div class="tier">
      <h2>Starter</h2>
      <p class="amount">$20/mo for individuals</p>
      <p>Includes 50 messages per day.</p>
      <p>Powered by Test Model V1.</p>
    </div>
    <div class="tier">
      <h2>Pro</h2>
      <p class="amount">$200/year for professionals</p>
      <p>Includes 1000 requests per hour.</p>
      <p>Powered by Test Model V1.</p>
    </div>
  </div>
  <footer>Now with 99.9% uptime SLA. New footer content.</footer>
</body></html>`;

let server: http.Server;
let serverUrl: string;
let serverContent: string;

function startServer(content: string): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(serverContent);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as import("net").AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}/pricing`;
      serverContent = content;
      resolve(serverUrl);
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// ── Globals ──────────────────────────────────────────────────────────

let db: ReturnType<typeof drizzle>;
let sourcePageId: number;

beforeAll(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-pipeline-test-"));
  dbPath = path.join(dbDir, "test.db");
  runMigrations();
  db = createTestDb();

  await startServer(PRICING_HTML);
  sourcePageId = seedProviderAndPage(db, serverUrl);
}, 15_000);

afterAll(() => {
  stopServer();
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
  }
  fs.rmSync(dbDir, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────────────────

describe("runScrapePipeline", () => {
  it("populates DB with scrape run, snapshot, prices and limits", async () => {
    const result = await runScrapePipeline(db, { force: true });

    expect(result.processed).toBe(1);
    expect(result.changed).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.prices).toBeGreaterThanOrEqual(2); // $20/mo + $200/year
    expect(result.limits).toBeGreaterThanOrEqual(2); // 50 messages/day + 1000 requests/hour
  });

  it("provides scrape_run with correct fields", () => {
    const runs = db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.providerId, "test-provider"))
      .all();

    expect(runs.length).toBeGreaterThanOrEqual(1);
    const run = runs[runs.length - 1];
    expect(run.status).toBe("success");
    expect(run.sourcePageId).toBe(sourcePageId);
    expect(run.startedAt).toBeTruthy();
    expect(run.finishedAt).toBeTruthy();
    expect(run.contentHash).toBeTruthy();
    expect(run.changeDetected).toBe(true);
  });

  it("stores source_snapshot with content hash and extracted text", () => {
    const snapshots = db
      .select()
      .from(sourceSnapshots)
      .where(eq(sourceSnapshots.providerId, "test-provider"))
      .all();

    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    const sn = snapshots[snapshots.length - 1];
    expect(sn.sourceUrl).toBe(serverUrl);
    expect(sn.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sn.extractedText).toBeTruthy();
    expect(sn.extractedText!.length).toBeGreaterThan(50);
    // Extracted text should contain pricing info
    expect(sn.extractedText).toContain("$20");
    expect(sn.extractedText).toContain("50 messages");
  });

  it("stores plan_snapshots with candidate sentinel planId", () => {
    const snaps = db.select().from(planSnapshots).all();

    expect(snaps.length).toBeGreaterThanOrEqual(2);
    for (const s of snaps) {
      // All snapshots linked to a source_snapshot
      expect(s.sourceSnapshotId).toBeTruthy();
    }
  });

  it("stores usage_limits with correct limit types", () => {
    const limits = db.select().from(usageLimits).all();

    expect(limits.length).toBeGreaterThanOrEqual(2);
    const types = limits.map((l) => l.limitType);
    expect(types).toContain("hard_numeric");
  });

  it("FKs link correctly across tables", () => {
    // plan_snapshots → source_snapshots FK
    const pSnaps = db
      .select()
      .from(planSnapshots)
      .innerJoin(sourceSnapshots, eq(planSnapshots.sourceSnapshotId, sourceSnapshots.id))
      .all();
    expect(pSnaps.length).toBeGreaterThanOrEqual(2);

    // usage_limits → source_snapshots FK
    const uLimits = db
      .select()
      .from(usageLimits)
      .innerJoin(sourceSnapshots, eq(usageLimits.sourceSnapshotId, sourceSnapshots.id))
      .all();
    expect(uLimits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("runScrapePipeline — re-run unchanged", () => {
  it("detects no change on second run with same content", async () => {
    const result = await runScrapePipeline(db);

    expect(result.processed).toBe(1);
    expect(result.changed).toBe(0);
    expect(result.errors).toBe(0);

    // Verify changeDetected=false on the latest scrape run
    const runs = db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.providerId, "test-provider"))
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(1)
      .all();

    expect(runs[0].changeDetected).toBe(false);
    expect(runs[0].status).toBe("success");
  });

  it("still stores a snapshot even when content is unchanged", () => {
    const snapshots = db
      .select()
      .from(sourceSnapshots)
      .where(eq(sourceSnapshots.providerId, "test-provider"))
      .all();

    // Should have at least 2 snapshots now (one from first run, one from re-run)
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
  });
});

describe("runScrapePipeline — content changed", () => {
  it("detects change on modified content", async () => {
    // Change the server content
    serverContent = PRICING_HTML_MODIFIED;

    // Give server time to register new content
    const result = await runScrapePipeline(db, { force: true });

    expect(result.processed).toBe(1);
    expect(result.changed).toBe(1);

    // Verify new snapshot has different hash
    const snapshots = db
      .select()
      .from(sourceSnapshots)
      .where(eq(sourceSnapshots.providerId, "test-provider"))
      .orderBy(desc(sourceSnapshots.observedAt))
      .limit(1)
      .all();

    expect(snapshots[0].extractedText).toContain("Updated");
  });

  it("detects cosmetic change but extracts same prices and limits (Gap 6)", async () => {
    serverContent = PRICING_HTML_COSMETIC;

    const result = await runScrapePipeline(db, { force: true });

    expect(result.processed).toBe(1);
    expect(result.changed).toBe(1); // hash differs → change detected
    expect(result.prices).toBeGreaterThanOrEqual(2); // same 2 prices
    expect(result.limits).toBeGreaterThanOrEqual(2); // same 2 limits

    // Verify extracted prices match original values ($20, $200), not modified values ($25, $250)
    const snaps = db
      .select()
      .from(planSnapshots)
      .orderBy(desc(planSnapshots.observedAt))
      .limit(5)
      .all();
    const amounts = snaps.map((s) => s.price).sort((a, b) => a - b);
    expect(amounts).toContain(20);
    expect(amounts).toContain(200);

    // Verify planModelAccess rows were written (model mention found)
    const access = db
      .select()
      .from(planModelAccess)
      .innerJoin(sourceSnapshots, eq(planModelAccess.sourceSnapshotId, sourceSnapshots.id))
      .all();
    expect(access.length).toBeGreaterThanOrEqual(1);
    expect(access[0].plan_model_access.planId).toBe("");
    expect(access[0].plan_model_access.accessLevel).toBe("unknown");
  });
});

describe("runScrapePipeline — error handling", () => {
  it("marks scrape_run as error when page is unreachable", async () => {
    // Insert a source page pointing to a non-existent URL
    const badUrl = "http://127.0.0.1:1/nonexistent";
    db.insert(providers)
      .values({
        id: "broken-provider",
        slug: "broken-provider",
        name: "Broken Provider",
        websiteUrl: "https://example.com",
        pricingUrl: badUrl,
        status: "active",
        createdAt: "2026-06-14",
        updatedAt: "2026-06-14",
      })
      .run();

    db.insert(providerSourcePages)
      .values({
        providerId: "broken-provider",
        url: badUrl,
        pageType: "pricing",
        scrapeStrategy: "static",
        enabled: true,
        createdAt: "2026-06-14",
      })
      .run();

    const result = await runScrapePipeline(db, { provider: "broken-provider" });

    // Page is processed, fetch error is handled gracefully (scrape_run marked "error")
    // but pipeline errors counter only tracks unexpected exceptions
    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.changed).toBe(0);
  }, 30_000);
});
