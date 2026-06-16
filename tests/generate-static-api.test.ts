import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const OUT_DIR = path.join(process.cwd(), "public", "data", "api");

// Run the generator once before all tests. Uses real provider data.
beforeAll(() => {
  execSync("npx tsx scripts/generate-static-api.ts", {
    cwd: process.cwd(),
    stdio: "pipe",
  });
}, 30_000);

function readJson(file: string): unknown {
  const filePath = path.join(OUT_DIR, file);
  expect(fs.existsSync(filePath), `${file} should exist`).toBe(true);
  const raw = fs.readFileSync(filePath, "utf8");
  expect(raw.trim().length, `${file} should not be empty`).toBeGreaterThan(0);
  return JSON.parse(raw);
}

describe("generate-static-api output shape", () => {
  it("providers.json is a non-empty array", () => {
    const data = readJson("providers.json") as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("name");
  });

  it("plans.json has plans array and bySlug map", () => {
    const data = readJson("plans.json") as { plans: unknown[]; bySlug: Record<string, unknown> };
    expect(Array.isArray(data.plans)).toBe(true);
    expect(data.plans.length).toBeGreaterThan(0);
    expect(typeof data.bySlug).toBe("object");
    // bySlug keys should match plan ids
    const planIds = (data.plans as Array<{ id: string }>).map((p) => p.id);
    for (const id of planIds) {
      expect(data.bySlug).toHaveProperty(id);
    }
  });

  it("models.json is a non-empty array with providerId", () => {
    const data = readJson("models.json") as Array<{ id: string; providerId: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("providerId");
  });

  it("rankings.json has all and byBand with 4 bands", () => {
    const data = readJson("rankings.json") as {
      all: unknown[];
      byBand: Record<string, unknown[]>;
    };
    expect(Array.isArray(data.all)).toBe(true);
    expect(data.all.length).toBeGreaterThan(0);
    expect(data.byBand).toHaveProperty("free");
    expect(data.byBand).toHaveProperty("under-20");
    expect(data.byBand).toHaveProperty("under-40");
    expect(data.byBand).toHaveProperty("40-plus");
    // all ranked plans have rank field
    for (const entry of data.all as Array<{ rank: number }>) {
      expect(typeof entry.rank).toBe("number");
    }
  });

  it("methodology.json has required formula fields", () => {
    const data = readJson("methodology.json") as {
      version: string;
      formula: string;
      weights: Record<string, number>;
      wmq: Record<string, number>;
    };
    expect(data.version).toBe("3.0");
    expect(typeof data.formula).toBe("string");
    expect(data.weights).toHaveProperty("cost");
    expect(data.weights).toHaveProperty("benchmark");
    expect(data.weights).toHaveProperty("feature");
    expect(data.wmq).toHaveProperty("agentic");
    expect(data.wmq).toHaveProperty("coding");
    expect(data.wmq).toHaveProperty("speed");
  });

  it("staging directory is cleaned up", () => {
    const staging = path.join(OUT_DIR, ".staging");
    expect(fs.existsSync(staging)).toBe(false);
  });
});
