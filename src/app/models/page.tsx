import type { Metadata } from "next";
import { getRankings, getMethodologyMeta } from "@/lib/data-loader";
import type { ModelRow } from "@/lib/rankings";
import { ModelTabs } from "@/components/ModelTabs";
import { MethodologyTooltip } from "@/components/MethodologyTooltip";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Models — Code Smart",
  description: "AI coding models ranked by Artificial Analysis intelligence, coding, agentic and weighted-quality indices.",
};

export default function ModelsPage() {
  const { rankings } = getRankings();
  const meta = getMethodologyMeta();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          Model rankings
          <MethodologyTooltip text="Indices are sourced from Artificial Analysis. WMQ = 50% agentic + 40% coding + 10% speed." anchor="wmq" />
        </h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Models ranked by <span className="font-medium">AA</span> benchmark indices. All metric values
          carry an <strong>AA</strong> prefix; a <code className="text-xs">—</code> means the index is
          not disclosed for that model.
          {meta.generated_at && <span className="text-gray-400"> Scores computed {meta.generated_at}.</span>}
        </p>
      </header>

      <ModelTabs
        byIntelligence={rankings.byIntelligence as ModelRow[]}
        byCoding={rankings.byCoding as ModelRow[]}
        byAgentic={rankings.byAgentic as ModelRow[]}
        byWeightedQuality={rankings.byWeightedQuality as ModelRow[]}
      />
    </div>
  );
}
