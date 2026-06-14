#!/usr/bin/env tsx
/**
 * Check all data files for stale provenance entries (>90 days since last verification).
 * Run: npm run stale-check
 * Exit 0 = nothing stale, Exit 1 = stale entries found.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "src/data/providers");
const STALE_DAYS = 90;

interface ProvenanceLike {
  accessed_date?: string;
  confidence?: string;
  url?: string;
}

function daysAgo(date: string): number {
  const d = new Date(date);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function findProvenance(obj: unknown, path: string): Array<{ path: string; prov: ProvenanceLike }> {
  if (!obj || typeof obj !== "object") return [];
  const results: Array<{ path: string; prov: ProvenanceLike }> = [];

  if ("accessed_date" in (obj as Record<string, unknown>)) {
    results.push({ path, prov: obj as ProvenanceLike });
    return results;
  }

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    results.push(...findProvenance(val, `${path}.${key}`));
    if (Array.isArray(val)) {
      val.forEach((item, i) => results.push(...findProvenance(item, `${path}.${key}[${i}]`)));
    }
  }
  return results;
}

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
let hasStale = false;

console.log(`\nStale provenance check (threshold: ${STALE_DAYS} days)\n${"─".repeat(60)}`);

for (const file of files) {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, file), "utf-8"));
  const provenances = findProvenance(raw, file.replace(".json", ""));

  const stale = provenances.filter(({ prov }) => {
    if (!prov.accessed_date) return false;
    return daysAgo(prov.accessed_date) > STALE_DAYS;
  });

  if (stale.length > 0) {
    hasStale = true;
    console.log(`⚠  ${file} — ${stale.length} stale provenance entry(ies):`);
    for (const { path, prov } of stale) {
      const age = prov.accessed_date ? daysAgo(prov.accessed_date) : -1;
      console.log(`   ${path} — last verified ${prov.accessed_date} (${age}d ago) → ${prov.url}`);
    }
  } else {
    console.log(`✓ ${file.padEnd(40)} all provenance within ${STALE_DAYS}d`);
  }
}

console.log(`\n${"─".repeat(60)}`);

if (hasStale) {
  console.warn(`\n⚠  Stale data found. Re-verify the above entries and update "accessed_date" + "confidence".\n`);
  process.exit(1);
} else {
  console.log(`✅ All provenance entries are fresh.\n`);
  process.exit(0);
}
