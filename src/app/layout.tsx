import type { Metadata } from "next";
import "./globals.css";

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
  return (
    <html lang="en">
      <body>
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <span className="font-semibold text-lg tracking-tight text-gray-900">
              Code<span className="text-brand-600">Smart</span>
            </span>
            <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-600">
              <a href="#plans" className="hover:text-gray-900 transition-colors">Plans</a>
              <a href="#benchmarks" className="hover:text-gray-900 transition-colors">Benchmarks</a>
              <a href="#value" className="hover:text-gray-900 transition-colors">Value Score</a>
            </nav>
          </div>
        </header>
        <main className="min-h-screen">{children}</main>
        <footer className="border-t border-gray-100 py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-400 space-y-1">
            <p>
              Data is crowd-verified and provenance-tracked. Every figure links to its original source.
              Confidence levels: <span className="text-green-600">● observed</span>{" "}
              <span className="text-blue-600">● inferred</span>{" "}
              <span className="text-amber-500">● assumed</span>{" "}
              <span className="text-red-500">● stale</span>{" "}
              <span className="text-gray-400">● unknown</span>
            </p>
            <p>Not affiliated with any provider. Last data refresh: 2026-06-14.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
