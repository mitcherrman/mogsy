import { defineConfig, devices } from "@playwright/test";

/**
 * Match History V2 (Track D) — question-inspector browser acceptance.
 *
 * CI ONLY. AGENTS.md forbids launching browsers on the owner's PC, so this
 * config refuses to run unless `CI` is set (GitHub Actions sets it). It uses
 * Playwright's BUNDLED Chromium: there is deliberately no `channel` option and
 * `PW_CHANNEL` is ignored.
 *
 *   (GitHub Actions)  npx playwright test -c playwright.history-review.config.ts
 */
if (!process.env.CI) {
  throw new Error(
    "history-review browser acceptance runs on GitHub Actions only (AGENTS.md: no local browser automation).",
  );
}

export default defineConfig({
  testDir: "./e2e/history-review",
  testMatch: ["*.spec.ts"],
  outputDir: "test-results/history-review",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  retries: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/history-review", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8137",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8137 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8137",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
