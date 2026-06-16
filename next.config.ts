import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static HTML export → deployed to Cloudflare Pages. App is 100% static
  // (force-static pages, generateStaticParams, build-time JSON; no route handlers).
  output: "export",
  // Pages serves /providers/[id] as /providers/[id]/index.html
  trailingSlash: true,
};

export default nextConfig;
