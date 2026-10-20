import { defineConfig, devices } from "@playwright/test";

/**
 * CE-FIX1 — Combat Estimate on its public More Challenges route: no collapse,
 * no disappearing stage, no navigation away, six hits to the results, at
 * 390x844, 360x640, 1280x720 and 1440x900.
 *
 * GitHub Actions only (AGENTS.md): bundled Chromium, one worker, headless.
 * Every backend request is intercepted by the spec; the vite server in e2e
 * auth mode is the whole dependency.
 *
 *   npx playwright test -c playwright.combat-estimate-public.config.ts
 */
export default defineConfig({
  testDir: "./e2e/combat-estimate-public",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/combat-estimate-public/report.json" }]],
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
