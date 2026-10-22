import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ROG1-D1 / RC0: Worlds Dynasty is owner-only. The real page (the E3B campaign
// since RC0) sits behind AdminRoute; the fixture previews exist only in DEV builds.
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("ROG1-D1 — Worlds Dynasty routes", () => {
  it("gates /admin/dynasty with AdminRoute and serves the E3B campaign there", () => {
    expect(appSource).toContain(
      '<Route path="/admin/dynasty" element={<AdminRoute><Suspense fallback={<RouteFallback />}><DynastyCampaignPage /></Suspense></AdminRoute>} />',
    );
    expect(appSource).toContain('const DynastyCampaignPage = lazy(() => import("./pages/admin/dynasty/DynastyCampaignPage"));');
    // the v1 run page needs /api/admin/dynasty/runs, which the E3B backend does not serve
    expect(appSource).not.toMatch(/<DynastyRunPage \/>/);
  });

  it("keeps the full campaign UI out of production except through the owner route", () => {
    expect(appSource).toMatch(/const DynastyV2Prototype = import\.meta\.env\.DEV\s*\n\s*\? lazy\(\(\) => import\("\.\/pages\/dev\/dynasty-v2\/DynastyV2Prototype"\)\)\s*\n\s*: null;/);
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
