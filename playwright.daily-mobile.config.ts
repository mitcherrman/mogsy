import { defineConfig, devices } from "@playwright/test";

/**
 * Branch-scoped Daily mobile acceptance. Deliberately discover only these
 * frontend-only specs, since other E2E modules rely on backend setup and
 * Node-incompatible JSON imports during Playwright test discovery.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["daily-mobile-header-fit.spec.ts", "nav1/daily-active-exit.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8124",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8124 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8124",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
