import { defineConfig } from "@playwright/test";

/** Geometry-only Global HUD acceptance; no gameplay backend is required. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /ux1a-global-hud-reflow\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:8124" },
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8124 --strictPort",
    env: { VITE_E2E_AUTH: "1" },
    url: "http://127.0.0.1:8124",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
