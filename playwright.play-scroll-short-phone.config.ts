import { defineConfig, devices } from "@playwright/test";

// F06 hosted CI only: isolated fixture route, bundled headless Chromium, one worker.
// Do not run on the user's Windows desktop without explicit approval (AGENTS.md).
export default defineConfig({
  testDir: "./e2e",
  testMatch: "play-scroll-short-phone.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8146",
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    channel: undefined,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8146 --strictPort",
    url: "http://127.0.0.1:8146/dev/play-scroll",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
