import { getAllProviders } from "@/lib/data-loader";
import { ProviderCatalog } from "./ProviderCatalog";
import type { PlanTier } from "@/types";

const TIER_ORDER: PlanTier[] = ["free", "individual", "pro", "team", "enterprise", "api"];

export default function ProvidersPage() {
  const providers = getAllProviders();
  const totalPlans = providers.reduce((sum, p) => sum + p.plans.length, 0);

  const tierSet = new Set<PlanTier>();
  for (const p of providers) {
    for (const plan of p.plans) tierSet.add(plan.tier);
  }
  const globalTiers = TIER_ORDER.filter((t) => tierSet.has(t)).slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">AI Coding Providers</h1>
        <p className="text-gray-500 mt-1">
          Compare {providers.length} providers across {totalPlans} plans
        </p>
      </div>
      <ProviderCatalog providers={providers} globalTiers={globalTiers} />
    </div>
  );
}
