import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
 testDir:"./e2e",testMatch:["admin-account-journey/overview.spec.ts"],timeout:60_000,
 reporter:"list",use:{baseURL:"http://127.0.0.1:8164",screenshot:"only-on-failure"},
 projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}}],
 webServer:{command:"npx vite --mode e2e --host 127.0.0.1 --port 8164 --strictPort",
  env:{...process.env,VITE_E2E_AUTH:"1"},url:"http://127.0.0.1:8164",reuseExistingServer:!process.env.CI,timeout:120_000},
});