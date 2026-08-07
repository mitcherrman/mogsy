/**
 * Structural guard on the SIM2 team-sim route.
 *
 * Phase 4B is additive: the production Combat Lab surfaces must keep their
 * exact paths and components, and the new team editor must live on a /dev
 * route that nothing in production navigation links to.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("team-sim route map", () => {
  it("registers the team editor on a dev route", () => {
    expect(appSource).toMatch(
      /path="\/dev\/combat-lab\/team-sim"\s+element=\{<Suspense[^\n]*?<TeamSimPage\s*\/>/
    );
  });

  it("leaves the production Combat Lab routes exactly as they were", () => {
    expect(appSource).toMatch(
      /path="\/combat-lab"\s+element=\{<Suspense[^\n]*?<CombatLab\s*\/>/
    );
    expect(appSource).toMatch(
      /path="\/combat-lab\/diagnostics"\s+element=\{<Suspense[^\n]*?<CombatLabDiagnostics\s*\/>/
    );
  });

  it("does not replace or shadow any existing route path", () => {
    // The new path is strictly deeper than /combat-lab and is not declared twice.
    const occurrences = appSource.match(/path="\/dev\/combat-lab\/team-sim"/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(appSource.match(/path="\/combat-lab"/g) ?? []).toHaveLength(1);
  });

  it("is not linked from production navigation or the sitemap", () => {
    for (const file of [
      "src/components/Navbar.tsx",
      "src/pages/LolHub.tsx",
      "scripts/generate-sitemap.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, `${file} must not link to the dev team-sim route`).not.toMatch(
        /\/dev\/combat-lab\/team-sim/
      );
    }
  });

  it("keeps the team-sim feature out of the existing Combat Lab modules", () => {
    for (const file of ["src/pages/CombatLab.tsx", "src/lib/combat-lab/api.ts"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, `${file} must not depend on the team-sim slice`).not.toMatch(
        /team-sim/
      );
    }
  });

  it("never points the team-sim slice at the legacy /api/meta vocabulary", () => {
    // Comments are stripped first: these modules explain WHY /api/meta is the
    // wrong authority here, and that prose must not read as a call site.
    const stripComments = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const file of [
      "src/lib/combat-lab/team-sim/client.ts",
      "src/lib/combat-lab/team-sim/catalog.ts",
      "src/lib/combat-lab/team-sim/contract.ts",
      "src/lib/combat-lab/team-sim/hooks.ts",
    ]) {
      const source = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"));
      expect(source, `${file} must not reference /api/meta`).not.toMatch(
        /["'`]\/api\/meta\//
      );
    }
  });

  it("keeps the billable POST free of any retry configuration", () => {
    const hooks = readFileSync(
      resolve(process.cwd(), "src/lib/combat-lab/team-sim/hooks.ts"),
      "utf8"
    );
    // Comments are stripped first, the same way the /api/meta guard above
    // does it. This assertion is about the mutation's CODE; when it read the
    // raw file it measured prose distance instead, and every explanatory
    // paragraph added between `mutationFn` and `retry` — exactly what a
    // safety-critical block attracts — pushed the two further apart until the
    // guard failed while the guarantee it protects was still intact.
    const code = hooks
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(code).toMatch(/mutationFn:[\s\S]{0,400}retry:\s*false/);
    expect(code).not.toMatch(/retryDelay|retryOnMount|refetchInterval/);
  });
});
