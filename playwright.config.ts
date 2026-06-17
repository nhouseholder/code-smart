import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "npx serve out -l 5173 --no-clipboard",
    port: 5173,
    cwd: ".",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
