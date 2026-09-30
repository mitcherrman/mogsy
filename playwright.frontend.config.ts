import { defineConfig, devices } from "@playwright/test";

/**
 * Canonical frontend-only browser-test configuration.
 *
 * Unlike playwright.config.ts, this does not start or seed the Combat Sim
 * backend. Specs must provide their own deterministic browser fixtures and
 * intercept any remote data they require. VITE_E2E_AUTH is passed directly to
 * Vite so injected guest/account identities work from one command on Windows.
 */
export default defineConfig({
  testDir: "./e2e",
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
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
