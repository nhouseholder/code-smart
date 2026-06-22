import fs from "fs";
import path from "path";
import { getRankings } from "./data-loader";
import type { ModelRow } from "./rankings";

export interface RadarAxis {
  key: string;
  label: string;
  value: number; // 0–100
}

export interface RadarProfile {
  modelId: string;
  name: string;
  axes: RadarAxis[];
}

const AXES = [
  { key: "intelligence", label: "Intelligence" },
  { key: "coding",       label: "Coding" },
  { key: "agentic",      label: "Agentic" },
  { key: "speed",        label: "Speed" },
  { key: "price",        label: "Affordability" },
] as const;

type AaEntry = {
  modelId: string;
  intelligenceIndex: number;
  codingIndex: number;
  speedTps: number;
  inputPrice: number;
  outputPrice: number;
};

type AaFile = {
  scores: AaEntry[];
};

/** Percentile rank of value in sorted ascending array (0–100). */
function percentileRank(sorted: number[], value: number): number {
  let rank = 0;
  for (const v of sorted) {
    if (v <= value) rank++;
  }
  return (rank / sorted.length) * 100;
}

let _profiles: RadarProfile[] | null = null;

export function getRadarProfiles(): RadarProfile[] {
  if (_profiles) return _profiles;

  // ── AA scores from JSON ───────────────────────────────────────────────────
  const aaPath = path.join(process.cwd(), "src/data/aa-scores.json");
  const aaFile = JSON.parse(fs.readFileSync(aaPath, "utf8")) as AaFile;
  const aaScores = aaFile.scores;

  // ── Rankings for agentic + model display names ────────────────────────────
  const { rankings } = getRankings();

  const intelMap  = new Map((rankings.byIntelligence  as ModelRow[]).map(r => [r.modelId, r]));
  const codingMap = new Map((rankings.byCoding        as ModelRow[]).map(r => [r.modelId, r]));
  const agenticMap = new Map((rankings.byAgentic      as ModelRow[]).map(r => [r.modelId, r]));

  // ── Precompute sorted arrays for percentile normalization ─────────────────
  const validSpeeds = aaScores
    .map(s => s.speedTps)
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  const blendedPrices = aaScores
    .map(s => s.inputPrice * 0.3 + s.outputPrice * 0.7)
    .sort((a, b) => a - b);

  // ── Build profiles ────────────────────────────────────────────────────────
  _profiles = aaScores.map((s): RadarProfile => {
    const displayName =
      intelMap.get(s.modelId)?.modelDisplayName ??
      codingMap.get(s.modelId)?.modelDisplayName ??
      agenticMap.get(s.modelId)?.modelDisplayName ??
      s.modelId;

    const intel   = intelMap.get(s.modelId)?.metricValue   ?? s.intelligenceIndex ?? 0;
    const coding  = codingMap.get(s.modelId)?.metricValue  ?? s.codingIndex       ?? 0;
    const agentic = agenticMap.get(s.modelId)?.metricValue ?? null;

    const speedPct = s.speedTps > 0
      ? percentileRank(validSpeeds, s.speedTps)
      : 0;

    const blended = s.inputPrice * 0.3 + s.outputPrice * 0.7;
    const pricePct = 100 - percentileRank(blendedPrices, blended); // inverted: cheaper = higher

    return {
      modelId: s.modelId,
      name: displayName,
      axes: [
        { key: "intelligence", label: "Intelligence", value: Math.round(intel) },
        { key: "coding",       label: "Coding",       value: Math.round(coding) },
        { key: "agentic",      label: "Agentic",      value: Math.round(agentic ?? 0) },
        { key: "speed",        label: "Speed",        value: Math.round(speedPct) },
        { key: "price",        label: "Affordability",value: Math.round(pricePct) },
      ],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return _profiles;
}

export { AXES };
