import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.frontend.config";

/**
 * Academy Core cross-browser run: the frontend-only config plus a Firefox
 * project. Firefox needs its own Playwright build (`npx playwright install
 * firefox`); Chromium is the default project.
 *
 *   npx playwright test -c playwright.academy-core.config.ts e2e/academy-core.spec.ts --project=chromium
 *   npx playwright test -c playwright.academy-core.config.ts e2e/academy-core.spec.ts --project=firefox
 */
export default defineConfig({
  ...base,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
