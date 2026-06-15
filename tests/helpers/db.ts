import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as schema from "../../src/db/schema";


/**
 * Apply all migration SQL files to the test database at dbPath.
 * Opens and closes its own connection — safe to call before createTestDb().
 */
export function runMigrations(dbPath: string): void {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const migrationsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "src",
    "db",
    "migrations",
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    sqlite.exec(readFileSync(join(migrationsDir, file), "utf-8"));
  }
  sqlite.close();
}

/**
 * Open a drizzle DB connection to the test database at dbPath.
 * Returns { db, sqlite } — caller holds sqlite ref for teardown (sqlite.close()).
 * Return type is intentionally inferred so callers get the concrete drizzle type.
 */
export function createTestDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
