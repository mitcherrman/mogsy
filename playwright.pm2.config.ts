import { defineConfig, devices } from "@playwright/test";

/**
 * PM2 — one-screen mobile Practice acceptance.
 *
 * GitHub Actions only (AGENTS.md): bundled Chromium, one worker, headless.
 * Every backend request is intercepted by the spec; the vite server in e2e
 * auth mode is the whole dependency.
 *
 *   npx playwright test -c playwright.pm2.config.ts
 */
export default defineConfig({
  testDir: "./e2e/pm2",
  outputDir: "test-results/pm2/artifacts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/pm2/report.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8126",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node_modules/.bin/vite --mode e2e --host 127.0.0.1 --port 8126 --strictPort",
    env: { VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8126",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
