import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static data files are loaded at build time; no external image domains needed for v1
};

export default nextConfig;
