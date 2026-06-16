import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  // Component checks (*.test.tsx) use JSX without importing React explicitly.
  esbuild: { jsx: "automatic" },
  test: {
    // Node is the default for the existing *.test.ts suite (228 passing).
    // Component checks (*.test.tsx) opt into jsdom + jest-dom matchers.
    environment: "node",
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
