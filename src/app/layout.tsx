import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getMethodologyMeta } from "@/lib/data-loader";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/providers", label: "Providers" },
  { href: "/models", label: "Models" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
];

const NAV_FOOTER = [
  { href: "/", label: "Home" },
  { href: "/models", label: "Models" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/efficiency", label: "Efficiency" },
  { href: "/radar", label: "Radar" },
  { href: "/rankings", label: "Rankings" },
  { href: "/freshness", label: "Freshness" },
];

export const metadata: Metadata = {
  title: "Code Smart — AI Coding Subscription Comparison",
  description:
    "Compare AI coding plans across Claude, ChatGPT, Copilot, Cursor, Gemini and more. Real pricing, honest limits, provenance-tracked data.",
  keywords: ["AI coding", "LLM comparison", "Claude", "GitHub Copilot", "Cursor", "ChatGPT", "Gemini"],
  openGraph: {
    title: "Code Smart",
    description: "Which AI coding plan is actually worth it?",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMethodologyMeta();
  const refreshed = meta.generated_at ?? "—";
  return (
    <html lang="en">
      <body>
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold text-lg tracking-tight text-gray-900">
              Code<span className="text-brand-600">Smart</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600">
              {NAV.slice(1).map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-gray-900 transition-colors">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="min-h-screen">{children}</main>
        <footer className="border-t border-gray-100 py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-400 space-y-2">
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-gray-500">
              {NAV_FOOTER.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-gray-800 transition-colors">
                  {n.label}
                </Link>
              ))}
            </nav>
            <p>
              Data is provenance-tracked. Every figure links to its original source.
              Confidence: <span className="text-green-600">● observed</span>{" "}
              <span className="text-blue-600">● inferred</span>{" "}
              <span className="text-amber-500">● assumed</span>{" "}
              <span className="text-red-500">● stale</span>{" "}
              <span className="text-gray-400">● unknown</span>
            </p>
            <p>
              Not affiliated with any provider. Scores computed {refreshed} ·{" "}
              <Link href="/freshness" className="underline hover:text-gray-700">data freshness</Link> ·{" "}
              <Link href="/methodology" className="underline hover:text-gray-700">methodology</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
