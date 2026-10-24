import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Local worker cap. Vitest's default is (CPU threads - 1), i.e. ~15 jsdom workers on the owner's 16-thread PC,
// which saturated RAM when several Claude sessions ran suites at once. mogzy-guard sets MOGZY_VITEST_WORKERS
// (1-2); unguarded local runs default to 2. CI keeps Vitest's own default (GitHub runners are isolated).
const localWorkers = Math.max(1, Number(process.env.MOGZY_VITEST_WORKERS) || 2);

export default defineConfig({
  plugins: [react()],
  test: {
    ...(process.env.CI ? {} : { maxWorkers: localWorkers, minWorkers: 1 }),
    // Warns (or fails when MOGZY_GUARD_ENFORCE=1) if a local run did not go through tools/dev-guard.
    globalSetup: ["./tools/dev-guard/vitest-guard-setup.mjs"],
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
