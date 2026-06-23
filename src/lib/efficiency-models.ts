export type Model = {
  name: string;
  lab: "US" | "CN";
  intel: number;
  tps: number;
  tokPerTask: number;
  tokApprox: boolean;
  inPer1M: number;
  cachePer1M: number | null;
  outPer1M: number;
};

export const MODELS: Model[] = [
  { name: "GPT-OSS 120B",  lab: "US", intel: 24, tps: 344, tokPerTask: 36000,  tokApprox: false, inPer1M: 0.039, cachePer1M: null,  outPer1M: 0.180 },
  { name: "Mimo V2.5",     lab: "CN", intel: 40, tps: 82,  tokPerTask: 20000,  tokApprox: true,  inPer1M: 0.140, cachePer1M: 0.003, outPer1M: 0.280 },
  { name: "DS V4 Flash",   lab: "CN", intel: 40, tps: 108, tokPerTask: 45000,  tokApprox: false, inPer1M: 0.090, cachePer1M: 0.020, outPer1M: 0.180 },
  { name: "MiniMax M2.5",  lab: "CN", intel: 34, tps: 209, tokPerTask: 16000,  tokApprox: true,  inPer1M: 0.150, cachePer1M: 0.050, outPer1M: 0.900 },
  { name: "Gemma 4 31B",   lab: "US", intel: 29, tps: 35,  tokPerTask: 12000,  tokApprox: false, inPer1M: 0.120, cachePer1M: 0.090, outPer1M: 0.350 },
  { name: "Grok 4.3",      lab: "US", intel: 38, tps: 135, tokPerTask: 14000,  tokApprox: false, inPer1M: 1.250, cachePer1M: 0.200, outPer1M: 2.500 },
  { name: "DS V4 Pro",     lab: "CN", intel: 44, tps: 91,  tokPerTask: 37000,  tokApprox: false, inPer1M: 0.435, cachePer1M: 0.004, outPer1M: 0.870 },
  { name: "MiMo-V2.5-Pro", lab: "CN", intel: 42, tps: 53,  tokPerTask: 20000,  tokApprox: false, inPer1M: 0.435, cachePer1M: 0.004, outPer1M: 0.870 },
  { name: "MiniMax-M2.7",  lab: "CN", intel: 38, tps: 49,  tokPerTask: 18000,  tokApprox: false, inPer1M: 0.250, cachePer1M: 0.050, outPer1M: 1.000 },
  { name: "MiniMax-M3",    lab: "CN", intel: 44, tps: 57,  tokPerTask: 24000,  tokApprox: false, inPer1M: 0.300, cachePer1M: 0.060, outPer1M: 1.200 },
  { name: "GPT-5.4 Nano",  lab: "US", intel: 38, tps: 162, tokPerTask: 71000,  tokApprox: false, inPer1M: 0.200, cachePer1M: 0.020, outPer1M: 1.250 },
  { name: "GLM-5",         lab: "CN", intel: 40, tps: 77,  tokPerTask: 26000,  tokApprox: true,  inPer1M: 0.600, cachePer1M: 0.120, outPer1M: 1.920 },
  { name: "GLM-5.1",       lab: "CN", intel: 40, tps: 90,  tokPerTask: 26000,  tokApprox: false, inPer1M: 0.980, cachePer1M: 0.490, outPer1M: 3.080 },
  { name: "Haiku 4.5",     lab: "US", intel: 24, tps: 89,  tokPerTask: 10000,  tokApprox: true,  inPer1M: 1.000, cachePer1M: 0.100, outPer1M: 5.000 },
  { name: "Kimi K2.5",     lab: "CN", intel: 38, tps: 55,  tokPerTask: 30000,  tokApprox: true,  inPer1M: 0.375, cachePer1M: null,  outPer1M: 2.025 },
  { name: "Kimi K2.6",     lab: "CN", intel: 43, tps: 45,  tokPerTask: 35000,  tokApprox: false, inPer1M: 0.660, cachePer1M: 0.330, outPer1M: 3.500 },
];

export function costPerTask(m: Model): number {
  const freshCost = (7000 * m.inPer1M) / 1_000_000;
  const cacheCost = (3000 * (m.cachePer1M ?? m.inPer1M)) / 1_000_000;
  const outCost = (m.tokPerTask * m.outPer1M) / 1_000_000;
  return freshCost + cacheCost + outCost;
}

export type Row = Model & { cost100: number; intelPerCost: number; composite: number };

export const ROWS: Row[] = MODELS.map((m) => {
  const cost100 = costPerTask(m) * 100;
  const intelPerCost = m.intel / cost100;
  const composite = (m.intel * m.tps) / cost100;
  return { ...m, cost100, intelPerCost, composite };
}).sort((a, b) => b.composite - a.composite);

export const MAX_COMPOSITE = ROWS[0].composite;
