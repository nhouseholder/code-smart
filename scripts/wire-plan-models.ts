/**
 * wire-plan-models.ts — Re-points in-scope plans' model refs to CURRENT models
 * (released within the recency window) after the catalog refresh. The old refs
 * pointed at undated proxy/legacy models that the loader now prunes, which would
 * leave every plan with dangling refs and no per-plan value ranking.
 *
 * Each ref is access_type "full" with notes "availability inferred" — the plan
 * sells a subscription that serves these models; the exact model list is an
 * inferred availability claim, not a per-token entitlement. Models that a plan
 * genuinely does not map to a named public model (e.g. Mimo's in-app tutor) are
 * left untouched rather than fabricated.
 *
 * Idempotent: re-running overwrites the same plans with the same refs.
 *
 * Usage: pnpm exec tsx scripts/wire-plan-models.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

const NOTE = "availability inferred";
const PROVIDERS_DIR = path.join(__dirname, "..", "src", "data", "providers");

interface Ref {
  model_id: string;
  access_type: "full" | "limited" | "preview" | "legacy";
  is_default?: boolean;
  notes?: string;
}

function ref(model_id: string, is_default = false): Ref {
  return { model_id, access_type: "full", ...(is_default ? { is_default: true } : {}), notes: NOTE };
}

// plan id -> ordered current model refs (first marked default). Models are
// referenced by catalog id; the value join is global, so coding-tool plans
// (cursor/copilot) can reference the frontier models they serve.
const WIRING: Record<string, Ref[]> = {
  // Anthropic (Claude subscriptions serve current Claude models)
  "anthropic-pro": [ref("claude-sonnet-4-6-adaptive", true), ref("claude-opus-4-7"), ref("claude-opus-4-8")],
  "anthropic-max": [ref("claude-opus-4-8", true), ref("claude-fable-5"), ref("claude-opus-4-7"), ref("claude-sonnet-4-6-adaptive")],
  // OpenAI (ChatGPT Plus serves current GPT-5 family)
  "openai-plus": [ref("gpt-5-5", true), ref("gpt-5-4"), ref("gpt-5-3-codex")],
  // Google (Gemini Advanced serves current Gemini family)
  "google-gemini-advanced": [ref("gemini-3-1-pro-preview", true), ref("gemini-3-5-flash"), ref("gemini-3-flash-reasoning")],
  // Kimi
  "kimi-plus": [ref("kimi-k2-6", true), ref("kimi-k2-5")],
  "kimi-pro": [ref("kimi-k2-7-code", true), ref("kimi-k2-6"), ref("kimi-k2-5")],
  // Coding tools — serve frontier models from multiple labs (inferred availability)
  "cursor-pro": [ref("claude-opus-4-8", true), ref("gpt-5-5"), ref("gemini-3-1-pro-preview")],
  "copilot-individual": [ref("gpt-5-5", true), ref("claude-opus-4-8"), ref("gemini-3-1-pro-preview")],
  "copilot-xcode-individual": [ref("gpt-5-5", true), ref("claude-opus-4-8")],
};

let changed = 0;
for (const file of fs.readdirSync(PROVIDERS_DIR)) {
  if (!file.endsWith(".json")) continue;
  const fp = path.join(PROVIDERS_DIR, file);
  const provider = JSON.parse(fs.readFileSync(fp, "utf8")) as {
    plans: Array<{ id: string; models?: Ref[] }>;
  };
  let touched = false;
  for (const plan of provider.plans ?? []) {
    if (WIRING[plan.id]) {
      plan.models = WIRING[plan.id];
      touched = true;
      changed++;
      console.log(`  ✓ ${plan.id.padEnd(28)} → ${WIRING[plan.id].map((r) => r.model_id).join(", ")}`);
    }
  }
  if (touched) fs.writeFileSync(fp, JSON.stringify(provider, null, 2) + "\n");
}
console.log(`\nRe-wired ${changed} plan(s). Mimo-pro left untouched (no named public model).`);
