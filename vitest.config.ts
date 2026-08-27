import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
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
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
