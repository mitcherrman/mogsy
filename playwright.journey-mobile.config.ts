import { defineConfig,devices } from "@playwright/test";
export default defineConfig({
 testDir:"./e2e",testMatch:"journey-mobile-space.spec.ts",workers:1,timeout:60000,reporter:"list",
 use:{baseURL:"http://127.0.0.1:8131",...devices[process.env.JSPACE_FIREFOX==="1"?"Desktop Firefox":"Desktop Chrome"]},
 webServer:{command:"npx vite --mode e2e --host 127.0.0.1 --port 8131 --strictPort",
   url:"http://127.0.0.1:8131",reuseExistingServer:false,timeout:120000}
});
