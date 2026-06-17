import { describe, it, expect } from "vitest";
import { LimitTypeSchema, UsageLimitSchema } from "../src/lib/schema";

const PROV = {
  url: "https://example.com",
  accessed_date: "2026-06-17",
  method: "manual",
  confidence: "unknown",
} as const;

describe("LimitTypeSchema — 'unlimited' is banned", () => {
  it("rejects the literal 'unlimited' limit type", () => {
    expect(LimitTypeSchema.safeParse("unlimited").success).toBe(false);
  });

  it("still accepts 'unknown' (the honest fallthrough for unquantifiable limits)", () => {
    expect(LimitTypeSchema.safeParse("unknown").success).toBe(true);
  });

  it("accepts a real coding limit type", () => {
    expect(LimitTypeSchema.safeParse("requests_per_month").success).toBe(true);
  });

  it("UsageLimitSchema rejects a usage_limit declaring type 'unlimited'", () => {
    const bad = { type: "unlimited", value: null, provenance: PROV };
    expect(UsageLimitSchema.safeParse(bad).success).toBe(false);
  });

  it("UsageLimitSchema accepts an honest unknown limit (null value)", () => {
    const ok = { type: "unknown", value: null, provenance: PROV };
    expect(UsageLimitSchema.safeParse(ok).success).toBe(true);
  });
});
