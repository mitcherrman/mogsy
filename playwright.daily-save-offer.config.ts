import { defineConfig, devices } from "@playwright/test";

/** DAILY-SAVE1: independent guest-offer browser check, stacked on F05. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["misc-w3a/daily-save-offer.spec.ts"],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8135", screenshot: "only-on-failure", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8135 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8135",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
