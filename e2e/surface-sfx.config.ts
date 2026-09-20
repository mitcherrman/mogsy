import { defineConfig, devices } from "@playwright/test";

/** Self-contained SFX1.6 desktop/mobile browser QA. */
export default defineConfig({
  testDir: ".",
  testMatch: "surface-sfx.spec.ts",
  timeout: 35_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "edge", use: { ...devices["Desktop Chrome"], channel: "msedge" } },
  ],
  webServer: {
    command: ".\\node_modules\\.bin\\vite.CMD --host 127.0.0.1 --port 8080 --strictPort",
    cwd: process.cwd(),
    url: "http://127.0.0.1:8080",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
