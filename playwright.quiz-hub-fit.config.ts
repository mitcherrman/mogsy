import { defineConfig, devices } from "@playwright/test";

/**
 * Quiz Hub main-screen fit acceptance. Discovers only the one frontend-only
 * geometry spec (other E2E modules need a backend). Bundled headless Chromium
 * on a CI runner: never an installed Edge/Chrome (see AGENTS.md).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["quiz-hub-main-fit.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8131",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8131 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8131",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
