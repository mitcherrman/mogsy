import { defineConfig, devices } from "@playwright/test";

/**
 * NAV1 browser-history certification is frontend-only. It deliberately avoids
 * the combat acceptance suite's backend seeding and uses intercepted read data
 * so navigation tests cannot touch production or depend on gameplay state.
 */
export default defineConfig({
  testDir: "./e2e/nav1",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --port 8081 --strictPort",
    url: "http://127.0.0.1:8081",
    reuseExistingServer: true,
    timeout: 60_000,
    env: { ...process.env, VITE_E2E_AUTH: "1" },
  },
});

