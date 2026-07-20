import { defineConfig, devices } from "@playwright/test";

// Combat Sim Battles acceptance E2E. Runs the vite dev server in `e2e` mode
// (loads .env.e2e.local → VITE_E2E_AUTH=1 + local backend URL). global-setup
// ensures/spawns the disposable FastAPI backend, seeds the dataset, and mints
// persona tokens. Never touches production Supabase or a production DB.
//
// One-time install (kept out of the shared node_modules by default):
//   npm i -D @playwright/test && npx playwright install chromium
// Then: npm run test:e2e
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node_modules/.bin/vite --mode e2e --port 8080 --strictPort",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
