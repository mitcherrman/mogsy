/**
 * Structural guard on the SIM2 team-sim routes.
 *
 * Phase 4B asserted the feature was confined to a /dev route nothing linked
 * to. Phase 5A promotes it, so the guard changes shape but not purpose: what
 * it protects is still "the production Combat Lab surfaces are untouched, and
 * the team simulator cannot be reached by accident".
 *
 * The four properties that matter now:
 *
 *   1. the existing /combat-lab routes keep their exact paths and components;
 *   2. the promoted route and the /dev alias render the SAME element, so the
 *      two surfaces cannot drift — and the copy that drifted would be the one
 *      taking money;
 *   3. the promoted route and every link to it are behind the same flag, so a
 *      visible entry point can never point at an unregistered path;
 *   4. the billable POST still has no retry configuration anywhere.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const appSource = read("src/App.tsx");

/** Comments explain WHY a path or module is or is not used; that prose must
 *  not be measured as if it were a call site. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const appCode = stripComments(appSource);

describe("team-sim route map", () => {
  it("renders both paths from one shared element", () => {
    // A single element constant, used twice. This is the structural form of
    // "one implementation, two paths".
    expect(appCode).toMatch(/const teamSimElement = \(/);
    expect(appCode).toMatch(
      /path=\{TEAM_SIM_ROUTE\}\s+element=\{teamSimElement\}/
    );
    expect(appCode).toMatch(
      /path=\{TEAM_SIM_DEV_ROUTE\}\s+element=\{teamSimElement\}/
    );
    // Exactly one lazy import of the page: no second copy of the module.
    const imports =
      appCode.match(/lazy\(\(\) => import\("\.\/pages\/dev\/team-sim\/TeamSimPage"\)\)/g) ??
      [];
    expect(imports).toHaveLength(1);
  });

  it("wraps both paths in the route-level error boundary", () => {
    // Outside the <Suspense>, so a failed lazy-chunk load is caught too.
    expect(appCode).toMatch(
      /<TeamSimErrorBoundary>\s*<Suspense[\s\S]{0,200}<TeamSimPage\s*\/>[\s\S]{0,80}<\/TeamSimErrorBoundary>/
    );
    // Eagerly imported: a boundary inside the lazy chunk could not catch that
    // chunk failing to load.
    expect(appCode).toMatch(
      /^import TeamSimErrorBoundary from "@\/components\/combat-lab\/TeamSimErrorBoundary";$/m
    );
    expect(appCode).not.toMatch(/lazy\([^)]*TeamSimErrorBoundary/);
  });

  it("registers the promoted route only behind the feature flag", () => {
    expect(appCode).toMatch(
      /isTeamSimPublicRouteEnabled\(\)\s*\?\s*\(\s*<Route path=\{TEAM_SIM_ROUTE\}/
    );
  });

  it("registers the internal alias only in development builds", () => {
    // COMBAT1. The alias used to be UNCONDITIONAL, and COMBAT0 measured what
    // that meant in production: /combat-lab/team-sim 404s with the public flag
    // off while /dev/combat-lab/team-sim rendered the whole 5v5 editor to any
    // anonymous visitor, with an enabled Run button. Harmless only because the
    // backend refused every execution — and about to stop being harmless the
    // moment TEAM_SIM_ENABLED is turned on.
    //
    // `import.meta.env.DEV` is the literal `false` in a production build, so
    // this branch is dead-code-eliminated there and the path 404s. Asserted on
    // the ROUTE MAP rather than on a rendered app, because the guarantee is a
    // property of what gets registered.
    const alias = appCode.match(
      /<Route path=\{TEAM_SIM_DEV_ROUTE\} element=\{teamSimElement\} \/>/g
    );
    expect(alias).toHaveLength(1);
    expect(appCode).toMatch(
      /isTeamSimDevRouteEnabled\(\)\s*\?\s*\(\s*<Route path=\{TEAM_SIM_DEV_ROUTE\}/
    );
  });

  it("leaves production with no unconditional team-sim route at all", () => {
    // Both paths must sit behind a gate. Stated as one assertion because the
    // hole COMBAT0 found was exactly "one of the two forgot".
    for (const constant of ["TEAM_SIM_ROUTE", "TEAM_SIM_DEV_ROUTE"]) {
      const declaration = new RegExp(
        `(isTeamSimPublicRouteEnabled|isTeamSimDevRouteEnabled)\\(\\)\\s*\\?\\s*\\(\\s*<Route path=\\{${constant}\\}`
      );
      expect(appCode, `${constant} must be registered behind a gate`).toMatch(
        declaration
      );
    }
  });

  it("gates the dev alias on the build mode, not on the public flag", () => {
    // Two independent switches, deliberately. Tying the alias to
    // VITE_TEAM_SIM_ENABLED would mean turning the public feature ON also
    // re-opened the unflagged bypass — the opposite of what COMBAT1 closes.
    const gate = readFileSync(
      resolve(process.cwd(), "src/lib/combat-lab/team-sim/featureGate.ts"),
      "utf8"
    );
    const fn = gate.slice(gate.indexOf("export function isTeamSimDevRouteEnabled"));
    expect(fn).toMatch(/import\.meta\.env\?\.DEV === true/);
    expect(fn).not.toMatch(/VITE_TEAM_SIM_ENABLED/);
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
    expect(appSource.match(/path="\/combat-lab"/g) ?? []).toHaveLength(1);
    // The two team-sim paths are declared as constants, never as duplicated
    // string literals that could fall out of step with the links.
    expect(appCode).not.toMatch(/path="\/combat-lab\/team-sim"/);
    expect(appCode).not.toMatch(/path="\/dev\/combat-lab\/team-sim"/);
  });

  it("is not linked from global navigation or the sitemap", () => {
    // Phase 5A adds exactly ONE entry point, on the Combat Lab page itself
    // (asserted below). Global navigation and the sitemap stay out of it: the
    // sitemap in particular must not advertise a route that only exists when a
    // build-time flag is on.
    for (const file of [
      "src/components/hud/GlobalHud.tsx",
      "src/pages/LolHub.tsx",
      "scripts/generate-sitemap.ts",
    ]) {
      expect(read(file), `${file} must not link to a team-sim route`).not.toMatch(
        /combat-lab\/team-sim/
      );
    }
  });

  it("gates the Combat Lab entry point on the same flag as the route", () => {
    const combatLab = stripComments(read("src/pages/CombatLab.tsx"));
    // The link exists…
    expect(combatLab).toMatch(/to=\{TEAM_SIM_ROUTE\}/);
    // …and only inside the flag check, so it can never point at a path that is
    // not registered.
    expect(combatLab).toMatch(
      /isTeamSimPublicRouteEnabled\(\) &&[\s\S]{0,400}to=\{TEAM_SIM_ROUTE\}/
    );
  });

  it("keeps the 1v1 Combat Lab out of the team-sim slice", () => {
    // Phase 4B forbade every mention of the slice here. Phase 5A permits
    // exactly ONE module — featureGate, which is two constants and a boolean
    // and imports nothing else from the feature — so the entry point can be
    // rendered without the 1v1 page taking on the simulator's client, catalog,
    // draft or recovery code, or its failure domain.
    for (const file of ["src/pages/CombatLab.tsx", "src/lib/combat-lab/api.ts"]) {
      const source = stripComments(read(file));
      const teamSimImports =
        source.match(/from "@\/lib\/combat-lab\/team-sim\/[a-zA-Z]+"/g) ?? [];
      expect(
        teamSimImports,
        `${file} may import team-sim/featureGate and nothing else`
      ).toEqual(
        file === "src/pages/CombatLab.tsx"
          ? ['from "@/lib/combat-lab/team-sim/featureGate"']
          : []
      );
      expect(source).not.toMatch(/team-sim\/(client|catalog|hooks|draft|request|recovery|result|contract)/);
    }
  });

  it("never points the team-sim slice at the legacy /api/meta vocabulary", () => {
    for (const file of [
      "src/lib/combat-lab/team-sim/client.ts",
      "src/lib/combat-lab/team-sim/catalog.ts",
      "src/lib/combat-lab/team-sim/contract.ts",
      "src/lib/combat-lab/team-sim/hooks.ts",
    ]) {
      expect(
        stripComments(read(file)),
        `${file} must not reference /api/meta`
      ).not.toMatch(/["'`]\/api\/meta\//);
    }
  });

  it("keeps the billable POST free of any retry configuration", () => {
    // Comments stripped first: when this read the raw file it measured prose
    // distance instead, and every explanatory paragraph added between
    // `mutationFn` and `retry` — exactly what a safety-critical block attracts
    // — pushed the two further apart until the guard failed while the
    // guarantee it protects was still intact.
    const code = stripComments(read("src/lib/combat-lab/team-sim/hooks.ts"));
    expect(code).toMatch(/mutationFn:[\s\S]{0,400}retry:\s*false/);
    expect(code).not.toMatch(/retryDelay|retryOnMount|refetchInterval/);
  });

  it("keeps the error boundary free of any automatic recovery", () => {
    // The boundary must never re-run a simulation, send a recovery POST, or
    // reset itself on a timer: each would be a request the user did not make,
    // on a page where a request can cost a credit.
    const boundary = stripComments(
      read("src/components/combat-lab/TeamSimErrorBoundary.tsx")
    );
    expect(boundary).not.toMatch(/fetch|useMutation|useQuery|setTimeout|setInterval/);
    expect(boundary).not.toMatch(/team-sim\/(client|hooks|recovery)/);
  });
});
