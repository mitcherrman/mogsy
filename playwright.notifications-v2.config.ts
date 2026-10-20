import { defineConfig, devices } from "@playwright/test";

// Notifications 2.0 (#92). CI-only browser acceptance (AGENTS.md): bundled
// headless Chromium on the GitHub runner, one worker, no installed browsers.
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["notifications-v2/inbox.spec.ts"],
  timeout: 60_000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/notifications-v2" }]],
  use: { baseURL: "http://127.0.0.1:8173", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8173 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
