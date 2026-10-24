import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import os from "os";
import path from "path";
import { currentVitestArgs, vitestScope } from "./tools/dev-guard/scope.mjs";

// Local resource bounds; CI keeps Vitest's defaults (GitHub runners are isolated). Vitest's default is
// (CPU threads - 1), i.e. ~15 jsdom workers on the owner's 16-thread PC, which saturated RAM when several
// Claude sessions ran suites at once. These bounds never refuse a run, so tests keep working while League
// and Firefox are open:
//  * targeted runs (<= 8 named test files): 1 worker, files run one after another;
//  * broad runs: MOGZY_VITEST_WORKERS (set by mogzy-guard) or 2;
//  * every local worker gets a heap cap (MOGZY_VITEST_HEAP_MB, default 2048) and the run below-normal CPU
//    priority, which its workers inherit, so the game and the browser are scheduled first.
const isLocal = !process.env.CI;
const targeted = vitestScope(currentVitestArgs()).scope === "targeted";
const localWorkers = targeted ? 1 : Math.max(1, Number(process.env.MOGZY_VITEST_WORKERS) || 2);
const workerExecArgv = [`--max-old-space-size=${Math.max(512, Number(process.env.MOGZY_VITEST_HEAP_MB) || 2048)}`];
if (isLocal) {
  try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not permitted: run at normal priority */ }
}

export default defineConfig({
  plugins: [react()],
  test: {
    ...(isLocal
      ? {
          maxWorkers: localWorkers,
          minWorkers: 1,
          fileParallelism: localWorkers > 1,
          poolOptions: { forks: { execArgv: workerExecArgv }, threads: { execArgv: workerExecArgv } },
        }
      : {}),
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.{ts,tsx}",
      // VERIFY1 edge-function security primitives are pure TypeScript and are
      // unit tested here. Scoped to this one function on purpose: the other
      // supabase/functions tests are Deno-native (Deno.test, https:// imports)
      // and are not runnable under vitest.
      "supabase/functions/identity-link/**/*.{test,spec}.ts",
      // PT1.5's offer catalog is likewise pure TypeScript (its Deno.env reads
      // are optional-chained), and it is the checkout allowlist, so it is unit
      // tested here. Named explicitly: its sibling gift-catalog.test.ts is
      // Deno-native and must not be picked up.
      "supabase/functions/_shared/offer-catalog.test.ts",
      // PT1.6b's custom one-time offer rules and its checkout/webhook handlers
      // are pure TypeScript with injected Stripe/RPC, so they are unit tested
      // here too (the SQL is run on PGlite in src/test/security/pt16*).
      "supabase/functions/_shared/custom-offer.test.ts",
      // PT1.7's private annual gift rules, likewise pure TypeScript.
      "supabase/functions/_shared/private-annual-gift.test.ts",
      // FUNNEL1B3.1's ingest contract is likewise pure TypeScript — the Deno
      // and Supabase imports live in its index.ts, not here — and it decides
      // what may enter analytics_events from Railway, so it is unit tested.
      "supabase/functions/railway-analytics-ingest/contract.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
