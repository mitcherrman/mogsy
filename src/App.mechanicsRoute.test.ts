/**
 * Routing contract for the Mechanics Explorer (MECH1 Phase 5B1), pinned
 * against the App.tsx route declarations in the same style as
 * App.routing-contract.test.ts: the declaration IS the contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("/lol/mechanics route", () => {
  it("declares the route with the lazy + Suspense convention", () => {
    const line = source
      .split("\n")
      .find((l) => l.includes('path="/lol/mechanics"') && l.includes("<Route"));
    expect(line, "no <Route> declared for /lol/mechanics").toBeTruthy();
    expect(line).toContain("MechanicsExplorerPage");
    expect(line).toContain("Suspense");
  });

  it("lazy-loads the page from the production /lol pages tree, not /dev", () => {
    expect(source).toContain(
      'lazy(() => import("./pages/lol/mechanics/MechanicsExplorerPage"))',
    );
    expect(source).not.toContain('import("./pages/dev/mechanics-xp/MechanicsXpPage").then');
  });

  it("leaves the dev XP calculator route untouched", () => {
    expect(source).toContain('path="/dev/mechanics/xp"');
  });
});
