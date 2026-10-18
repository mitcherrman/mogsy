import { defineConfig, devices } from "@playwright/test";

/**
 * MISC W3A (F05) — branch-scoped Daily result density acceptance. Frontend-only:
 * it drives `e2e/misc-w3a/harness.html` (the real result components in the real
 * shell) and answers the one discoveries request itself, so it needs no backend,
 * auth or Supabase. Set PW_CHANNEL=msedge to use the system Edge instead of the
 * bundled Chromium.
 *
 *   npx playwright test -c playwright.daily-result-compact.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["misc-w3a/daily-result-compact.spec.ts"],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8135",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8135 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8135",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
