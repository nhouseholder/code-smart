"use client";

import { useState } from "react";
import { ModelRadarChart } from "./ModelRadarChart";
import type { RadarProfile } from "@/lib/radar";

const MAX_SELECTED = 8;

interface Props {
  allProfiles: RadarProfile[];
  defaultIds: string[];
}

export function RadarCompare({ allProfiles, defaultIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultIds));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // keep at least 1
      } else {
        if (next.size < MAX_SELECTED) next.add(id);
      }
      return next;
    });
  }

  const profiles = allProfiles.filter((p) => selected.has(p.modelId));

  return (
    <div className="space-y-6">
      {/* Model selector chips */}
      <div className="flex flex-wrap gap-2">
        {allProfiles.map((p) => {
          const on = selected.has(p.modelId);
          const disabled = !on && selected.size >= MAX_SELECTED;
          return (
            <button
              key={p.modelId}
              onClick={() => toggle(p.modelId)}
              disabled={disabled}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                on
                  ? "bg-brand-600 text-white border-brand-600"
                  : disabled
                  ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed"
                  : "bg-white text-gray-600 border-gray-300 hover:border-brand-400 hover:text-brand-600"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">
        {selected.size} of {MAX_SELECTED} max selected
      </p>

      <ModelRadarChart profiles={profiles} />
    </div>
  );
}
