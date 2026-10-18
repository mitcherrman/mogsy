import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["release-qa/guest-upgrade-live.spec.ts"],
  timeout: 660_000,
  expect: { timeout: 25_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8149",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: {} }],
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 8149 --strictPort",
    url: "http://127.0.0.1:8149",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, VITE_E2E_AUTH: "0" },
  },
});
