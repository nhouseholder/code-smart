"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ModelRow } from "@/lib/rankings";
import { cn } from "@/lib/utils";
import { ProviderBadge } from "./ProviderBadge";
import { ConfidenceBadge } from "./ProvenanceBadge";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type SortKey = "rank" | "model" | "metric";
type Dir = "asc" | "desc";

interface Props {
  rows: ModelRow[];
  /** AA-prefixed metric column header, e.g. "Coding Index". */
  metricLabel: string;
  emptyMessage?: string;
}

/** Sortable model table. Null metric values sort to the bottom. AA-prefixed metric column. */
export function ModelRankingTable({ rows, metricLabel, emptyMessage = "No models ranked for this metric yet." }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<Dir>("asc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "rank") cmp = a.rank - b.rank;
      else if (sortKey === "model") cmp = a.modelDisplayName.localeCompare(b.modelDisplayName);
      else {
        // null/undefined metric → bottom regardless of direction
        const av = a.metricValue, bv = b.metricValue;
        const aNull = av == null, bNull = bv == null;
        if (aNull && bNull) cmp = 0;
        else if (aNull) return 1;
        else if (bNull) return -1;
        else cmp = av - bv;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir]);

  function toggle(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "metric" ? "desc" : "asc");
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return <ArrowUpDown size={11} className="opacity-30" />;
    return dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  }

  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-sm min-w-[440px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            <th className="py-2.5 px-3 text-left w-12">#</th>
            <th className="py-2.5 px-3 text-left">
              <button onClick={() => toggle("model")} className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-gray-800 cursor-pointer">
                Model <SortIcon k="model" />
              </button>
            </th>
            <th className="py-2.5 px-3 text-left">Provider</th>
            <th className="py-2.5 px-3 text-right">
              <button onClick={() => toggle("metric")} className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-gray-800 cursor-pointer">
                <span className="text-[9px] opacity-60">AA</span> {metricLabel} <SortIcon k="metric" />
              </button>
            </th>
            <th className="py-2.5 px-3 text-right">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={`${r.modelId}-${r.metric}`} className="border-t border-gray-100 even:bg-gray-50/40 hover:bg-brand-50/30 transition-colors">
              <td className="py-2.5 px-3 text-gray-400 tabular-nums">{r.rank}</td>
              <td className="py-2.5 px-3">
                <Link href={`/models/${r.modelId}`} className="font-medium text-gray-900 hover:text-brand-700 transition-colors">
                  {r.modelDisplayName}
                </Link>
              </td>
              <td className="py-2.5 px-3">
                <ProviderBadge providerId={r.providerId} name={r.providerName} size="sm" />
              </td>
              <td className={cn("py-2.5 px-3 text-right font-bold tabular-nums", r.metricValue == null ? "text-gray-400" : "text-gray-900")}>
                {r.metricValue == null ? "—" : r.metricValue}
              </td>
              <td className="py-2.5 px-3 text-right">
                <ConfidenceBadge confidence={r.confidence} className="scale-90 origin-right" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
