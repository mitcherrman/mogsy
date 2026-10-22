import { defineConfig, devices } from "@playwright/test";

/**
 * Content Creator acceptance (e2e/content-creator). CI only — see AGENTS.md.
 * Bundled headless browsers, one worker. The asset stub stands in for the
 * combat backend's images; the spec answers every API call itself.
 */
export default defineConfig({
  testDir: "./e2e/content-creator",
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/content-creator" }]],
  use: {
    baseURL: "http://127.0.0.1:8181",
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1600, height: 1000 } } },
  ],
  webServer: [
    {
      command: "npx tsx scripts/quiz-screenshots/ci-asset-stub.ts --port 8000",
      url: "http://127.0.0.1:8000/api/assets/champions",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npx vite --mode e2e --host 127.0.0.1 --port 8181 --strictPort",
      url: "http://127.0.0.1:8181",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...process.env,
        VITE_E2E_AUTH: "1",
        VITE_COMBAT_API_URL: "http://127.0.0.1:8000",
        VITE_SUPABASE_URL: "https://e2e-supabase.test",
        VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-placeholder-key",
        VITE_SUPABASE_PROJECT_ID: "e2e",
      },
    },
  ],
});
