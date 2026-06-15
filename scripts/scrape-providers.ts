#!/usr/bin/env tsx
/**
 * CLI entry point for the provider scrape pipeline.
 *
 * Usage:
 *   pnpm scrape:providers [--provider <id>] [--dry-run] [--force]
 *
 * Exit codes: 0=success, 1=fatal, 2=usage error
 */
import { getDb, runMigrations } from "../src/db/index";
import { runScrapePipeline } from "../src/lib/scraper/pipeline";

interface CliArgs {
  provider?: string;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, force: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--provider":
        if (i + 1 >= argv.length) {
          console.error("Error: --provider requires an argument");
          process.exit(2);
        }
        args.provider = argv[++i];
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--help":
      case "-h":
        console.log(`
Usage: pnpm scrape:providers [options]

Options:
  --provider <id>   Scrape only a single provider (by ID)
  --dry-run         Fetch and extract but don't write to DB
  --force           Re-extract even if content hasn't changed
  --help, -h        Show this help message
        `.trim());
        process.exit(0);
      default:
        console.error(`Error: Unknown argument: ${arg}`);
        console.error("Usage: pnpm scrape:providers [--provider <id>] [--dry-run] [--force]");
        process.exit(2);
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log("=".repeat(60));
  console.log("  Provider Scraper Pipeline");
  console.log("=".repeat(60));

  if (args.dryRun) console.log("  DRY RUN — no database writes");
  if (args.provider) console.log(`  Filtered to provider: ${args.provider}`);
  if (args.force) console.log("  Force mode — re-extract despite cached hash");
  console.log();

  // Initialize DB
  const db = getDb();
  runMigrations();

  if (args.dryRun) {
    console.log("[DRY RUN] Pipeline would execute with these options:");
    console.log(`  Provider: ${args.provider ?? "all enabled"}`);
    console.log(`  Force: ${args.force}`);
    console.log("\nSkipping execution (--dry-run).");
    process.exit(0);
  }

  const result = await runScrapePipeline(db, {
    provider: args.provider,
    force: args.force,
  });

  console.log("\n" + "=".repeat(60));
  console.log(`  Pages processed:  ${result.processed}`);
  console.log(`  Content changed:  ${result.changed}`);
  console.log(`  Errors:           ${result.errors}`);
  console.log(`  Prices extracted: ${result.prices}`);
  console.log(`  Limits extracted: ${result.limits}`);
  console.log(`  Models mentioned: ${result.modelMentions}`);
  console.log("=".repeat(60));

  process.exit(result.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
