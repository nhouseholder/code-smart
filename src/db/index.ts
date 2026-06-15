import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

/**
 * Get or create the DB connection singleton.
 * Uses WAL journal mode for better concurrent-read performance.
 * Enables foreign key enforcement.
 */
export function getDb(dbFile?: string): ReturnType<typeof drizzle> {
  if (_db) return _db;

  const resolvedPath = dbFile ?? process.env.DB_PATH ?? "./data/code-smart.db";

  // Ensure parent directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _sqlite = new Database(resolvedPath);

  // Performance & safety pragmas
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");

  _db = drizzle(_sqlite, { schema });
  return _db;
}

/**
 * Apply all pending migrations from src/db/migrations/.
 * Tracks applied migrations in __drizzle_migrations table.
 * Caller must have initialized the DB via getDb() first.
 */
export function runMigrations(): void {
  const sqlite = _sqlite;
  if (!sqlite) throw new Error("DB not initialized. Call getDb() first.");

  // Create migration tracking table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations",
  );

  if (!fs.existsSync(migrationsDir)) {
    console.log("No migrations directory found — skipping.");
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    const hash = file.replace(/\.sql$/, "");

    // Skip if already applied
    const existing = sqlite
      .prepare("SELECT id FROM __drizzle_migrations WHERE hash = ?")
      .get(hash);
    if (existing) continue;

    const filePath = path.join(migrationsDir, file);
    const migration = fs.readFileSync(filePath, "utf-8");

    // Execute in a transaction for safety
    const applyMigration = sqlite.transaction(() => {
      sqlite.exec(migration);
      sqlite.prepare("INSERT INTO __drizzle_migrations (hash) VALUES (?)").run(hash);
    });
    applyMigration();
    console.log(`  ✓ Applied migration: ${file}`);
    count++;
  }

  if (count === 0) {
    console.log("  No pending migrations.");
  }
}

/**
 * Close the DB connection (for test teardown).
 */
export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

// ── CLI: `npx tsx src/db/index.ts --migrate` ──────────────────────
const args = process.argv.slice(2);
if (args.includes("--migrate")) {
  console.log("Running migrations...");
  getDb();
  runMigrations();
  console.log("Migrations complete.");
}
