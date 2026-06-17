export interface ProviderStatus {
  providerId: string;
  status: "ok" | "changed" | "failed" | "skipped" | "stale";
  pagesChecked: number;
  pagesChanged: number;
  errorMessage?: string;
  staleSince?: string; // ISO date of oldest stale provenance entry
}

export interface PipelineWarning {
  timestamp: string; // ISO
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface PipelineRun {
  runId: string;              // ISO timestamp used as unique id
  startedAt: string;         // ISO
  completedAt: string;       // ISO
  durationMs: number;
  dryRun: boolean;
  stepsRun: string[];
  providers: ProviderStatus[];
  unmappedModels: string[];
  lowConfidenceEstimates: number; // count with confidence = "assumed" | "stale"
  failedProviders: string[];
  success: boolean;
  errorMessage?: string;
  warnings: PipelineWarning[]; // accumulated quality/log warnings
}

export interface PipelineStatus {
  lastRun: PipelineRun | null;
  history: PipelineRun[]; // last 5 runs, newest first
}
