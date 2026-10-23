import { defineConfig, devices } from "@playwright/test";

/**
 * Content Creator production-build gates (e2e/content-creator-prod). Serves an
 * already-built `dist/` with `vite preview`; the workflow builds it first with
 * placeholder backend URLs. CI only — see AGENTS.md.
 */
export default defineConfig({
  testDir: "./e2e/content-creator-prod",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8183", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite preview --host 127.0.0.1 --port 8183 --strictPort",
    url: "http://127.0.0.1:8183",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
