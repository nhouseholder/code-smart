import { z } from "zod";

export const ProviderStatusSchema = z.object({
  providerId: z.string(),
  status: z.enum(["ok", "changed", "failed", "skipped", "stale"]),
  pagesChecked: z.number().int().nonnegative(),
  pagesChanged: z.number().int().nonnegative(),
  errorMessage: z.string().optional(),
  staleSince: z.string().optional(),
});

export const PipelineWarningSchema = z.object({
  timestamp: z.string(),
  component: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
});

export const PipelineRunSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number().nonnegative(),
  dryRun: z.boolean(),
  stepsRun: z.array(z.string()),
  providers: z.array(ProviderStatusSchema),
  unmappedModels: z.array(z.string()),
  lowConfidenceEstimates: z.number().int().nonnegative(),
  failedProviders: z.array(z.string()),
  success: z.boolean(),
  errorMessage: z.string().optional(),
  warnings: z.array(PipelineWarningSchema).default([]),
});

export const PipelineStatusSchema = z.object({
  lastRun: PipelineRunSchema.nullable(),
  history: z.array(PipelineRunSchema),
});

export type PipelineRunInput = z.input<typeof PipelineRunSchema>;
export type PipelineStatusInput = z.input<typeof PipelineStatusSchema>;
