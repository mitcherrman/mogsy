/**
 * Routing contract for the HI1 Academy introduction, pinned against the App.tsx
 * route declarations in the same style as App.routing-contract.test.ts: the
 * declaration IS the contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("/welcome route", () => {
  it("declares the route with the lazy + Suspense convention", () => {
    const line = source
      .split("\n")
      .find((l) => l.includes('path="/welcome"') && l.includes("<Route"));
    expect(line, "no <Route> declared for /welcome").toBeTruthy();
    expect(line).toContain("AcademyWelcomePage");
    expect(line).toContain("Suspense");
  });

  it("lazy-loads the page from the production welcome tree, not /dev", () => {
    expect(source).toContain('lazy(() => import("./pages/welcome/AcademyWelcomePage"))');
  });

  it("mounts outside <Layout /> like the entrance it follows", () => {
    // Everything inside the shell sits after the `<Route element={<Layout />}>`
    // opener; the introduction owns the whole viewport and must precede it.
    const welcomeAt = source.indexOf('path="/welcome"');
    const layoutAt = source.indexOf("<Route element={<Layout />}>");
    expect(welcomeAt).toBeGreaterThan(-1);
    expect(layoutAt).toBeGreaterThan(-1);
    expect(welcomeAt).toBeLessThan(layoutAt);
  });

  it("is not wrapped in a guard — the introduction gates nothing", () => {
    const line = source.split("\n").find((l) => l.includes('path="/welcome"'))!;
    expect(line).not.toContain("ProtectedRoute");
    expect(line).not.toContain("RequireRankedTutorial");
    expect(line).not.toContain("AdminRoute");
  });

  it("leaves the entrance and hub routes in place", () => {
    expect(source).toContain('path="/dev/mogzy-entry-v2"');
    expect(source).toContain('path="/lol"');
  });
});

describe("root entrance (MG-B)", () => {
  it("runs automatically and hands off to the Hub — no click-gated Welcome funnel", () => {
    const line = source
      .split("\n")
      .find((l) => l.includes("<MogzyEntryV2") && l.includes('seo="root"'));
    expect(line, "root route no longer renders MogzyEntryV2").toBeTruthy();
    expect(line).toContain("autoEnter");
  });

  it("keeps the dev preview as the interactive gate", () => {
    const line = source.split("\n").find((l) => l.includes('path="/dev/mogzy-entry-v2"'))!;
    expect(line).toContain("<MogzyEntryV2 />");
    expect(line).not.toContain("autoEnter");
  });

  it("does not redirect /welcome away for anyone", () => {
    const line = source.split("\n").find((l) => l.includes('path="/welcome"'))!;
    expect(line).not.toContain("Navigate");
  });
});
