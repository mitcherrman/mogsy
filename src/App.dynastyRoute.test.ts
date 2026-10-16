import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ROG1-D1: Worlds Dynasty is owner-only. The real page sits behind AdminRoute;
// the fixture preview exists only in DEV builds.
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("ROG1-D1 — Worlds Dynasty routes", () => {
  it("gates /admin/dynasty with AdminRoute", () => {
    expect(appSource).toContain(
      '<Route path="/admin/dynasty" element={<AdminRoute><Suspense fallback={<RouteFallback />}><DynastyRunPage /></Suspense></AdminRoute>} />',
    );
  });

  it("registers the fixture preview only in development", () => {
    expect(appSource).toMatch(/const DynastyPreview = import\.meta\.env\.DEV\s*\n\s*\? lazy\(\(\) => import\("\.\/pages\/dev\/dynasty\/DynastyPreview"\)\)\s*\n\s*: null;/);
    expect(appSource).toMatch(/\{DynastyPreview \? \(\s*\n\s*<Route path="\/dev\/dynasty"/);
  });

  it("declares the owner path exactly once", () => {
    const occurrences = appSource.match(/path="\/admin\/dynasty/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});
