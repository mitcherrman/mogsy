import { defineConfig } from "@playwright/test";

/**
 * INT1 — access checks for the owner-only interaction labs, against the real
 * production bundle served by `vite preview` (build first):
 *
 *   npx vite build && npx playwright test -c playwright.interaction-labs.config.ts
 *
 * Every non-local request is answered inside the spec, so it needs no network.
 */
const HOST = process.env.INT1_HOST ?? "127.0.0.1";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /interaction-labs-access\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://${HOST}:8125` },
  webServer: {
    command: `node_modules/.bin/vite preview --host ${HOST} --port 8125 --strictPort`,
    url: `http://${HOST}:8125`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
