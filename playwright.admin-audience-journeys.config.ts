import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["admin-audience-journeys/*.spec.ts"],
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8171", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --mode e2e --host 127.0.0.1 --port 8171 --strictPort",
    env: {
      ...process.env,
      VITE_E2E_AUTH: "1",
      // Placeholder client config: the spec intercepts every request to this host.
      VITE_SUPABASE_URL: "https://e2e-supabase.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-placeholder-key",
    },
    url: "http://127.0.0.1:8171",
    reuseExistingServer: !process.env.CI, timeout: 120_000,
  },
});
