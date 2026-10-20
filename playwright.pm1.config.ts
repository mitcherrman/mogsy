import { defineConfig, devices } from "@playwright/test";

/**
 * PM1 — Quick Study, More Challenges and Practice-in-the-arena acceptance.
 *
 * GitHub Actions only (AGENTS.md): bundled Chromium, one worker, headless.
 * Every backend request is intercepted by the spec; the vite server in e2e
 * auth mode is the whole dependency.
 *
 *   npx playwright test -c playwright.pm1.config.ts
 */
export default defineConfig({
  testDir: "./e2e/pm1",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8125",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node_modules/.bin/vite --mode e2e --host 127.0.0.1 --port 8125 --strictPort",
    env: { VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8125",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
