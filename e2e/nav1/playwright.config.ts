import { defineConfig, devices } from "@playwright/test";

/** Self-contained NAV1 browser fixtures; every remote request is intercepted. */
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "webkit-nav1",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "webkit-iphone-nav1",
      grep: /mobile|390x844/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: "set VITE_E2E_AUTH=1&& .\\node_modules\\.bin\\vite.CMD --mode e2e --host 127.0.0.1 --port 8081 --strictPort",
    cwd: process.cwd(),
    url: "http://127.0.0.1:8081",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
