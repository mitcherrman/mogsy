import { defineConfig, devices } from "@playwright/test";

/**
 * PM1 production verification against https://mogzy.lol. GitHub Actions only
 * (AGENTS.md); read-only by construction — see e2e/pm1-prod/production.spec.ts.
 */
export default defineConfig({
  testDir: "./e2e/pm1-prod",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/pm1/report.json" }]],
  use: { ...devices["Desktop Chrome"], headless: true, screenshot: "only-on-failure" },
});
