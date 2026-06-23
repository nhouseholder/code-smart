"use client";
import { useState, useMemo } from "react";
import { ProviderTableCard } from "@/components/ProviderTableCard";
import type { Provider, ProviderCategory, PlanTier } from "@/types";

const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  ai_lab: "AI Labs",
  ide_tool: "IDE & Coding Tools",
  platform: "Platforms",
  open_source: "Open Source",
};
const CATEGORY_ORDER: ProviderCategory[] = ["ai_lab", "ide_tool", "platform", "open_source"];

function getBestCodingIndex(provider: Provider): number {
  let best = -1;
  for (const model of provider.models) {
    for (const b of model.benchmarks) {
      if (b.name === "AA Coding Index" && typeof b.score === "number") {
        if (b.score > best) best = b.score;
      }
    }
  }
  return best;
}

interface Props {
  providers: Provider[];
  globalTiers: PlanTier[];
}

export function ProviderCatalog({ providers, globalTiers }: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"aa" | "az">("aa");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [providers, query]);

  const sorted = useMemo(() => {
    if (sort === "az") {
      return [...filtered].sort((a, b) => a.display_name.localeCompare(b.display_name));
    }
    return [...filtered].sort((a, b) => getBestCodingIndex(b) - getBestCodingIndex(a));
  }, [filtered, sort]);

  const byCategory = useMemo(() => {
    const map = new Map<ProviderCategory, Provider[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const p of sorted) map.get(p.category)?.push(p);
    return map;
  }, [sorted]);

  const hasResults = sorted.length > 0;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-8">
        <input
          type="text"
          placeholder="Search providers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "aa" | "az")}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
        >
          <option value="aa">Sort: AA Score</option>
          <option value="az">Sort: A–Z</option>
        </select>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const list = byCategory.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={cat} className="mb-10">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              {CATEGORY_LABELS[cat]}
              <span className="text-gray-400 font-normal normal-case tracking-normal">
                ({list.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {list.map((p) => (
                <ProviderTableCard key={p.id} provider={p} globalTiers={globalTiers} />
              ))}
            </div>
          </section>
        );
      })}

      {!hasResults && (
        <p className="text-center py-16 text-gray-400">
          No providers match &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  );
}
