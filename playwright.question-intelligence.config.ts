import { defineConfig, devices } from "@playwright/test";

// QI1 capture: bundled headless Chromium only (never an installed Edge/Chrome
// channel), one worker, fixture data only. See AGENTS.md before running locally.
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["question-intelligence/question-intelligence.spec.ts"],
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/question-intelligence",
  use: { baseURL: "http://127.0.0.1:8143", screenshot: "only-on-failure", headless: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: undefined } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8143 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8143",
    reuseExistingServer: false, timeout: 120_000,
  },
});
