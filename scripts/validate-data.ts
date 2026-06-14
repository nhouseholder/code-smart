#!/usr/bin/env tsx
/**
 * Validate all provider JSON files against the Zod schema.
 * Run: npm run validate
 * Exit 0 = all valid, Exit 1 = validation errors found.
 */

import { ProviderSchema } from "../src/lib/schema";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "src/data/providers");

let hasErrors = false;
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));

console.log(`\nValidating ${files.length} provider file(s) in ${DATA_DIR}\n${"─".repeat(60)}`);

for (const file of files) {
  const path = join(DATA_DIR, file);
  let raw: unknown;

  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    console.error(`✗ ${file}: JSON parse error — ${String(e)}`);
    hasErrors = true;
    continue;
  }

  const result = ProviderSchema.safeParse(raw);

  if (result.success) {
    const p = result.data;
    const planCount = p.plans.length;
    const modelCount = p.models.length;
    console.log(`✓ ${file.padEnd(30)} ${p.name.padEnd(20)} ${planCount} plan(s)  ${modelCount} model(s)`);
  } else {
    console.error(`✗ ${file}:`);
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      console.error(`   [${path}] ${issue.message}`);
    }
    hasErrors = true;
  }
}

console.log(`\n${"─".repeat(60)}`);

if (hasErrors) {
  console.error("❌ Validation failed. Fix errors above before deploying.\n");
  process.exit(1);
} else {
  console.log("✅ All provider data files are valid.\n");
  process.exit(0);
}
