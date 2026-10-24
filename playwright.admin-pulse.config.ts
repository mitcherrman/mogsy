// PULSE-2B — Admin Pulse Workspace browser acceptance. Bundled headless
// Chromium, one worker; meant for the GitHub runner (AGENTS.md).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["admin-pulse/workspace.spec.ts"],
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8172", screenshot: "only-on-failure", headless: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8172 --strictPort",
    url: "http://127.0.0.1:8172/e2e/admin-pulse/harness.html",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
