import { defineConfig } from "@playwright/test";

/**
 * INT1 — access checks for the owner-only interaction labs.
 *
 * Two servers, two projects:
 *   · `owner-dev`   vite DEV with VITE_E2E_AUTH=1, so the existing DEV-only E2E
 *                   identity seam can present an owner / non-owner persona to
 *                   `AdminRoute` (the seam is compiled out of production builds).
 *   · `prod-preview` `vite preview` of an existing `dist` (run `npx vite build`
 *                   first): the real production bundle, signed out.
 *
 *   npx vite build && npx playwright test -c playwright.interaction-labs.config.ts
 */
const HOST = process.env.INT1_HOST ?? "127.0.0.1";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /interaction-labs-access\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  projects: [
    { name: "owner-dev", grep: /@owner-dev/, use: { baseURL: `http://${HOST}:8124` } },
    { name: "prod-preview", grep: /@prod-preview/, use: { baseURL: `http://${HOST}:8125` } },
  ],
  webServer: [
    {
      command: `node_modules/.bin/vite --host ${HOST} --port 8124 --strictPort`,
      url: `http://${HOST}:8124`, reuseExistingServer: true, timeout: 120_000,
      env: { VITE_E2E_AUTH: "1" },
    },
    {
      command: `node_modules/.bin/vite preview --host ${HOST} --port 8125 --strictPort`,
      url: `http://${HOST}:8125`, reuseExistingServer: true, timeout: 120_000,
    },
  ],
});
