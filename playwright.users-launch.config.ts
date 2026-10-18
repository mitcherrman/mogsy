import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["users-launch/audience-pulse.spec.ts"],
  timeout: 45_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8141", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8141 --strictPort",
    env: { ...process.env, VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8141",
    reuseExistingServer: !process.env.CI, timeout: 90_000,
  },
});
