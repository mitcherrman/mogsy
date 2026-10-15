import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir:"./e2e",testMatch:"mobile-recording-fit.spec.ts",
  timeout:60000,workers:1,reporter:"list",
  use:{baseURL:"http://127.0.0.1:8126",...devices["Desktop Chrome"]},
  webServer:{command:"npx vite --mode e2e --host 127.0.0.1 --port 8126 --strictPort",
    url:"http://127.0.0.1:8126",reuseExistingServer:false,timeout:120000}
});
