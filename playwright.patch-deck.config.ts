import { defineConfig, devices } from "@playwright/test";

/**
 * PHD-RELEASE — Patch Hub List View, Deck View and Catch Up browser acceptance.
 *
 * CI ONLY. AGENTS.md forbids launching browsers on the owner's PC, so this
 * config refuses to run unless `CI` is set (GitHub Actions sets it). It uses
 * Playwright's BUNDLED Chromium: there is deliberately no `channel` option and
 * `PW_CHANNEL` is ignored. One worker.
 *
 * Two targets, same spec:
 *   - candidate (default): the production bundle (`vite build`) served by
 *     `vite preview`, reading the LIVE public Patch Report API, logged out.
 *   - live: PATCH_DECK_BASE_URL=https://mogzy.lol (no local server at all).
 *
 *   (GitHub Actions)  npx playwright test -c playwright.patch-deck.config.ts
 */
if (!process.env.CI) {
  throw new Error("patch-deck browser acceptance runs on GitHub Actions only (AGENTS.md: no local browser automation).");
}

// The workflow passes an empty string when no base_url input was given.
const live = process.env.PATCH_DECK_BASE_URL?.trim() || undefined;
const PORT = 8141;

export default defineConfig({
  testDir: "./e2e/patch-deck",
  testMatch: ["*.spec.ts"],
  outputDir: "test-results/patch-deck",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/patch-deck", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: live ?? `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: live
    ? undefined
    : {
        command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: false,
        timeout: 300_000,
      },
});
