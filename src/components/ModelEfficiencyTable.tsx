import type { Row } from "@/lib/efficiency-models";

function fmt(n: number, digits = 1) {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

interface Props {
  rows: Row[];
  maxComposite: number;
}

export function ModelEfficiencyTable({ rows, maxComposite }: Props) {
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="py-2.5 px-3 text-left w-8">#</th>
              <th className="py-2.5 px-3 text-left">Model</th>
              <th className="py-2.5 px-3 text-center">Lab</th>
              <th className="py-2.5 px-3 text-right">Intel</th>
              <th className="py-2.5 px-3 text-right">t/s</th>
              <th className="py-2.5 px-3 text-right">$/100T</th>
              <th className="py-2.5 px-3 text-right">Intel/$100T</th>
              <th className="py-2.5 px-3 text-right">Intel·t/s/$100T</th>
              <th className="py-2.5 px-3 text-left w-36">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pct = (r.composite / maxComposite) * 100;
              const isTop3 = i < 3;
              return (
                <tr
                  key={r.name}
                  className={`border-t border-gray-100 ${isTop3 ? "bg-brand-50/30" : "even:bg-gray-50/40"}`}
                >
                  <td className={`py-2.5 px-3 tabular-nums font-medium ${isTop3 ? "text-brand-600" : "text-gray-400"}`}>
                    {i + 1}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-gray-900">
                    {r.name}
                    {r.tokApprox && (
                      <span className="ml-1 text-[10px] text-amber-500" title="Tok/Task estimated">~</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      r.lab === "US" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
                    }`}>
                      {r.lab}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.intel}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.tps.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">${fmt(r.cost100, 3)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{fmt(r.intelPerCost)}</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${isTop3 ? "text-brand-700" : "text-gray-900"}`}>
                    {Math.round(r.composite).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        ~ = Tok/Task estimated; cost approximate.{" "}
        <span className="text-blue-700 font-semibold">US</span> = US lab,{" "}
        <span className="text-red-700 font-semibold">CN</span> = Chinese lab.{" "}
        Intel = AA Intelligence Index · t/s = AA median output speed · OR pricing.
      </p>
    </>
  );
}
