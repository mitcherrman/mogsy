/**
 * ATL-P1-C — structural guard on the Atlas prototype routes.
 *
 * The prototype must be reachable only where the owner can reach it: as a
 * child of the AdminRoute-protected /admin shell in every build, and at the
 * development-only /lol/dev twin that a production build drops. One lazy
 * import, two paths, no public route and no production surface touched.
 *
 * Raw source on purpose: App.tsx carries a `/*` inside a string literal that
 * defeats the comment stripper other route tests use, and every assertion
 * below is specific enough (a `path="…"` attribute or a `const … =` line)
 * that prose cannot satisfy it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appCode = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("ATL-P1-C route map", () => {
  it("lazy-loads the page exactly once", () => {
    const imports = appCode.match(/lazy\(\(\) => import\("\.\/pages\/dev\/atlas-p1c\/AtlasP1CPage"\)\)/g) ?? [];
    expect(imports).toHaveLength(1);
  });

  it("registers the admin child under the AdminRoute-protected /admin shell", () => {
    const start = appCode.indexOf('path="/admin"');
    expect(start).toBeGreaterThan(-1);
    const parentLine = appCode.slice(start, appCode.indexOf("\n", start));
    expect(parentLine).toContain("<AdminRoute>");
    const child = appCode.indexOf('path="atlas-p1c"');
    expect(child).toBeGreaterThan(start);
    const childLine = appCode.slice(child, appCode.indexOf("\n", child));
    expect(childLine).toContain("<AtlasP1CAdmin />");
  });

  it("registers the /lol/dev twin only when the DEV flag holds the component", () => {
    expect(appCode).toMatch(/const AtlasP1CDev = import\.meta\.env\.DEV \? AtlasP1CAdmin : null;/);
    expect(appCode).toMatch(/\{AtlasP1CDev \? \(\s*<Route path="\/lol\/dev\/atlas-p1c"/);
  });

  it("declares no public Atlas route", () => {
    const paths = appCode.match(/path="[^"]*atlas[^"]*"/g) ?? [];
    // ATL-CS-UX-001 added its own owner-only pair; still no public Atlas route.
    expect([...paths].sort()).toEqual(
      ['path="/lol/dev/atlas-p1c"', 'path="atlas-p1c"', 'path="/lol/dev/atlas-cross-section"', 'path="atlas-cross-section"', 'path="content-atlas"'].sort(),
    );
  });
});
