import { defineConfig } from "@playwright/test";

/**
 * Ranked arena FIT acceptance — a second, deliberately tiny Playwright project.
 *
 * WHY IT IS NOT IN `playwright.config.ts`
 * That config is the Combat Sim Battles acceptance run: its `globalSetup`
 * spawns a disposable FastAPI backend, seeds a dataset and mints persona JWTs.
 * These specs need none of it — `/dev/ranked-shell-probe` serves canned
 * backend-shaped rounds from an in-page `fetch` interceptor, so a vite server
 * is the entire dependency. Hanging them off the heavier config would make a
 * pure layout check fail whenever a backend that has nothing to do with layout
 * is unavailable.
 *
 *   npx playwright test -c playwright.arena.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /ranked-arena-fit\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8123" },
  webServer: {
    command: "node_modules/.bin/vite --port 8123 --strictPort",
    url: "http://localhost:8123",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
