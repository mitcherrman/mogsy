/**
 * UX3A — structural guard on the Worlds experience's production route.
 *
 *   1. the published tournament route keeps its exact path and element;
 *   2. the experience's route is registered only behind the build flag, with
 *      the SAME page element (one data read, one set of loading/error states);
 *   3. React Router ranks the experience's static path above `:contextId`, so
 *      it owns the Worlds URL and its screens and nothing else;
 *   4. Layout makes the Worlds URL full-bleed only through the flag.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PRO_PLAY_TOURNAMENT_ROUTE } from "@/lib/pro-play/routes";
import { WORLDS_EXPERIENCE_BASE, WORLDS_EXPERIENCE_ROUTE } from "@/lib/pro-play/worldsExperience/productionGate";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const appCode = stripComments(read("src/App.tsx"));

describe("UX3A route map", () => {
  it("keeps the published tournament route exactly", () => {
    expect(appCode).toMatch(
      /<Route path=\{PRO_PLAY_TOURNAMENT_ROUTE\} element=\{<Suspense fallback=\{<RouteFallback \/>\}><ProPlayTournament \/><\/Suspense>\} \/>/,
    );
    expect(PRO_PLAY_TOURNAMENT_ROUTE).toBe("/lol/pro-play/tournament/:contextId");
  });

  it("registers the experience's route only behind the flag, on the same page element", () => {
    expect(appCode).toMatch(
      /\{isWorldsExperienceEnabled\(\) \? \(\s*<Route path=\{WORLDS_EXPERIENCE_ROUTE\} element=\{<Suspense fallback=\{<RouteFallback \/>\}><ProPlayTournament \/><\/Suspense>\} \/>\s*\) : null\}/,
    );
    expect(appCode.match(/WORLDS_EXPERIENCE_ROUTE/g)).toHaveLength(2); // the import and the gated route
    expect(appCode.match(/isWorldsExperienceEnabled\(\)/g)).toHaveLength(1);
    expect(WORLDS_EXPERIENCE_ROUTE).toBe("/lol/pro-play/tournament/worlds-2026/*");
  });

  it("ranks the static Worlds path above :contextId, for Worlds only", () => {
    const routes = [{ path: PRO_PLAY_TOURNAMENT_ROUTE }, { path: WORLDS_EXPERIENCE_ROUTE }, { path: "*" }];
    const winner = (p: string) => matchRoutes(routes, p)?.[0].route.path;
    expect(winner(WORLDS_EXPERIENCE_BASE)).toBe(WORLDS_EXPERIENCE_ROUTE);
    expect(winner(`${WORLDS_EXPERIENCE_BASE}/`)).toBe(WORLDS_EXPERIENCE_ROUTE);
    for (const p of ["/stages", "/stages/swiss", "/teams", "/schedule", "/discover"]) {
      expect(winner(`${WORLDS_EXPERIENCE_BASE}${p}`)).toBe(WORLDS_EXPERIENCE_ROUTE);
    }
    expect(winner("/lol/pro-play/tournament/dcgi-2026")).toBe(PRO_PLAY_TOURNAMENT_ROUTE);
    expect(winner("/lol/pro-play/tournament/worlds-2025")).toBe(PRO_PLAY_TOURNAMENT_ROUTE);
    expect(winner("/lol/pro-play/tournament/dcgi-2026/teams")).toBe("*");
    // Flag off: the screens are unknown paths, the Worlds URL is the published route.
    const off = [{ path: PRO_PLAY_TOURNAMENT_ROUTE }, { path: "*" }];
    expect(matchRoutes(off, WORLDS_EXPERIENCE_BASE)?.[0].route.path).toBe(PRO_PLAY_TOURNAMENT_ROUTE);
    expect(matchRoutes(off, `${WORLDS_EXPERIENCE_BASE}/teams`)?.[0].route.path).toBe("*");
  });

  it("makes only the flagged Worlds surface full-bleed in Layout", () => {
    const layout = stripComments(read("src/components/Layout.tsx"));
    expect(layout).toMatch(/import \{ isWorldsExperienceSurface \} from "@\/lib\/pro-play\/worldsExperience\/productionGate";/);
    const fullBleed = layout.slice(layout.indexOf("const isFullBleed"), layout.indexOf(";", layout.indexOf("const isFullBleed")));
    expect(fullBleed).toContain("isWorldsExperienceSurface(pathname)");
    expect(layout.match(/isWorldsExperienceSurface\(/g)).toHaveLength(1);
  });

  it("keeps the development prototype's routes development-only", () => {
    const app = read("src/App.tsx");
    expect(app).toMatch(/const WorldsExperienceDev = import\.meta\.env\.DEV\s*\?/);
  });
});
