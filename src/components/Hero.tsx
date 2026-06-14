import type { Provider } from "@/types";
import { ArrowDown, Database, RefreshCcw, Shield } from "lucide-react";

interface Props {
  providers: Provider[];
  totalPlans: number;
}

export function Hero({ providers, totalPlans }: Props) {
  const providerNames = providers.map((p) => p.display_name);
  const lastVerified = providers
    .map((p) => p.last_verified)
    .sort()
    .at(-1) ?? "—";

  return (
    <section className="relative overflow-hidden bg-white border-b border-gray-100">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(to right, #6366f1 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-14">
        {/* Asymmetric layout: text left, stat block right */}
        <div className="grid lg:grid-cols-[1fr_auto] gap-12 items-start">
          <div>
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-medium text-blue-700 tracking-wide">
                AI Coding Plan Intelligence — {lastVerified}
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-[1.1] tracking-tight mb-5 max-w-2xl">
              Which AI coding plan is{" "}
              <span className="text-brand-600">actually</span>{" "}
              worth it?
            </h1>

            <p className="text-lg text-gray-500 max-w-xl leading-relaxed mb-6">
              Honest comparison of {totalPlans} plans across {providers.length} providers.
              Real pricing, honest limits, provenance-tracked data — not marketing copy.
            </p>

            <div className="flex flex-wrap gap-3 mb-8">
              {providerNames.slice(0, 5).map((name) => (
                <span
                  key={name}
                  className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium"
                >
                  {name}
                </span>
              ))}
              {providerNames.length > 5 && (
                <span className="px-3 py-1 bg-gray-100 text-gray-400 rounded-full text-xs">
                  +{providerNames.length - 5} more
                </span>
              )}
            </div>

            <a
              href="#plans"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl font-semibold text-sm hover:bg-brand-700 transition-colors shadow-sm"
            >
              Compare plans
              <ArrowDown size={14} />
            </a>
          </div>

          {/* Trust stats block */}
          <div className="lg:w-72 grid grid-cols-2 lg:grid-cols-1 gap-3">
            <StatCard
              icon={<Database size={16} className="text-blue-600" />}
              value={`${totalPlans}`}
              label="Plans tracked"
              bg="bg-blue-50 border-blue-100"
            />
            <StatCard
              icon={<Shield size={16} className="text-green-600" />}
              value={`${providers.length}`}
              label="Providers"
              bg="bg-green-50 border-green-100"
            />
            <StatCard
              icon={<RefreshCcw size={16} className="text-amber-600" />}
              value={lastVerified}
              label="Last verified"
              bg="bg-amber-50 border-amber-100"
            />
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs text-gray-500 leading-relaxed">
              Every figure links to its source.{" "}
              <span className="text-amber-600 font-medium">● Estimated</span> where exact limits are
              undisclosed.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  icon, value, label, bg,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  bg: string;
}) {
  return (
    <div className={`${bg} border rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">{icon}</div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
