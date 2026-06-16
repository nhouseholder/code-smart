import { describe, it, expect } from "vitest";
import { PipelineRunSchema, PipelineStatusSchema } from "../src/lib/pipeline-schema";

const validRun = {
  runId: "2026-06-15T18:00:00.000Z",
  startedAt: "2026-06-15T18:00:00.000Z",
  completedAt: "2026-06-15T18:01:00.000Z",
  durationMs: 60000,
  dryRun: false,
  stepsRun: ["stale-check", "scrape", "normalize"],
  providers: [
    {
      providerId: "openai",
      status: "ok",
      pagesChecked: 2,
      pagesChanged: 0,
    },
  ],
  unmappedModels: [],
  lowConfidenceEstimates: 3,
  failedProviders: [],
  success: true,
};

describe("PipelineRunSchema", () => {
  it("accepts a valid run", () => {
    const result = PipelineRunSchema.safeParse(validRun);
    expect(result.success).toBe(true);
  });

  it("accepts a run with optional errorMessage", () => {
    const run = { ...validRun, success: false, errorMessage: "scrape step failed" };
    expect(PipelineRunSchema.safeParse(run).success).toBe(true);
  });

  it("rejects missing runId", () => {
    const { runId: _, ...rest } = validRun;
    expect(PipelineRunSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid provider status enum", () => {
    const run = {
      ...validRun,
      providers: [{ ...validRun.providers[0], status: "unknown" }],
    };
    expect(PipelineRunSchema.safeParse(run).success).toBe(false);
  });

  it("rejects negative durationMs", () => {
    const run = { ...validRun, durationMs: -1 };
    expect(PipelineRunSchema.safeParse(run).success).toBe(false);
  });

  it("rejects negative lowConfidenceEstimates", () => {
    const run = { ...validRun, lowConfidenceEstimates: -1 };
    expect(PipelineRunSchema.safeParse(run).success).toBe(false);
  });
});

describe("PipelineStatusSchema", () => {
  it("accepts status with a run", () => {
    const status = { lastRun: validRun, history: [validRun] };
    expect(PipelineStatusSchema.safeParse(status).success).toBe(true);
  });

  it("accepts status with null lastRun", () => {
    const status = { lastRun: null, history: [] };
    expect(PipelineStatusSchema.safeParse(status).success).toBe(true);
  });

  it("rejects missing history field", () => {
    const status = { lastRun: null };
    expect(PipelineStatusSchema.safeParse(status).success).toBe(false);
  });
});
