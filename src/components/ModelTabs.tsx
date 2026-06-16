"use client";

import { useState } from "react";
import type { ModelRow } from "@/lib/rankings";
import { cn } from "@/lib/utils";
import { ModelRankingTable } from "./ModelRankingTable";
import { CaveatCallout } from "./CaveatCallout";

type TabKey = "intelligence" | "coding" | "agentic" | "speed" | "wmq";

interface Props {
  byIntelligence: ModelRow[];
  byCoding: ModelRow[];
  byAgentic: ModelRow[];
  byWeightedQuality: ModelRow[];
}

const TABS: Array<{ key: TabKey; label: string; metricLabel: string }> = [
  { key: "wmq", label: "Weighted quality", metricLabel: "WMQ" },
  { key: "intelligence", label: "Intelligence", metricLabel: "Intelligence" },
  { key: "coding", label: "Coding", metricLabel: "Coding" },
  { key: "agentic", label: "Agentic", metricLabel: "Agentic" },
  { key: "speed", label: "Speed", metricLabel: "Speed" },
];

export function ModelTabs({ byIntelligence, byCoding, byAgentic, byWeightedQuality }: Props) {
  const [tab, setTab] = useState<TabKey>("wmq");

  const data: Record<Exclude<TabKey, "speed">, ModelRow[]> = {
    wmq: byWeightedQuality,
    intelligence: byIntelligence,
    coding: byCoding,
    agentic: byAgentic,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-px" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-lg cursor-pointer transition-all duration-200 -mb-px border-b-2",
              tab === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "speed" ? (
        <div className="space-y-3">
          <CaveatCallout
            title="AA Speed isn't published as a standalone metric"
            caveats={[
              "Artificial Analysis speed scores feed the Weighted Model Quality (10% weight) but are not exported as a separate column in the static dataset.",
              "To rank by responsiveness, use the Weighted Quality tab — it already folds speed in alongside agentic and coding ability.",
            ]}
          />
          <button
            onClick={() => setTab("wmq")}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 cursor-pointer transition-colors"
          >
            → View Weighted quality ranking
          </button>
        </div>
      ) : (
        <ModelRankingTable
          rows={data[tab]}
          metricLabel={TABS.find((t) => t.key === tab)!.metricLabel}
          emptyMessage="No models ranked for this metric yet."
        />
      )}
    </div>
  );
}
