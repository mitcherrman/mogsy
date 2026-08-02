/**
 * Static route registration for the public Pro roster wiki.
 *
 * Asserted against the App.tsx source for the same reason as
 * App.routing-contract.test.ts: App mounts BrowserRouter and every provider
 * itself, so it cannot be rendered at an arbitrary path in jsdom. The route
 * declaration IS the contract.
 *
 * The load-bearing guarantee here is the split between the PAID product page
 * at /lol/pro and the PUBLIC documentation at /lol/docs/pro/*. Repointing or
 * renaming either one is exactly the regression worth catching.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const prefetchSource = readFileSync(
  resolve(__dirname, "lib/route-prefetch.ts"),
  "utf8",
);

function routeLine(path: string): string {
  const line = appSource
    .split("\n")
    .find((l) => l.includes(`path="${path}"`) && l.includes("<Route"));
  if (!line) throw new Error(`no <Route> declared for ${path}`);
  return line;
}

const ROSTER_ROUTES: Array<[string, string]> = [
  ["/lol/docs/pro/rosters", "ProRosterLanding"],
  ["/lol/docs/pro/players", "ProRosterPlayers"],
  ["/lol/docs/pro/players/:lpPage", "ProRosterPlayerProfile"],
  ["/lol/docs/pro/teams", "ProRosterTeams"],
  ["/lol/docs/pro/teams/:lpPage", "ProRosterTeamProfile"],
];

describe("public roster route registration", () => {
  it.each(ROSTER_ROUTES)("registers %s to %s", (path, component) => {
    expect(routeLine(path)).toContain(`<${component} />`);
  });

  it("binds every roster page component lazily via the prefetch registry", () => {
    for (const [, component] of ROSTER_ROUTES) {
      expect(appSource).toContain(`const ${component} = R.${component}.Component;`);
      expect(prefetchSource).toContain(`${component}: lazyWithRetry(`);
    }
  });

  it("names the dynamic segment lpPage, not a slug", () => {
    expect(routeLine("/lol/docs/pro/players/:lpPage")).toContain(":lpPage");
    expect(routeLine("/lol/docs/pro/teams/:lpPage")).toContain(":lpPage");
    expect(appSource).not.toContain('path="/lol/docs/pro/players/:slug"');
    expect(appSource).not.toContain('path="/lol/docs/pro/teams/:slug"');
  });

  it("leaves the roster routes public — no ProtectedRoute or AdminRoute wrapper", () => {
    for (const [path] of ROSTER_ROUTES) {
      expect(routeLine(path)).not.toContain("<ProtectedRoute");
      expect(routeLine(path)).not.toContain("<AdminRoute");
    }
  });
});

describe("paid /lol/pro is untouched", () => {
  it("still renders the paid product page, not a roster page", () => {
    const line = routeLine("/lol/pro");
    expect(line).toContain("<LolPro />");
    expect(line).not.toContain("ProRoster");
  });

  it("keeps the public wiki under /lol/docs/pro, never under /lol/pro", () => {
    for (const [path] of ROSTER_ROUTES) {
      expect(path.startsWith("/lol/docs/pro/")).toBe(true);
    }
    expect(appSource).not.toContain('path="/lol/pro/players"');
    expect(appSource).not.toContain('path="/lol/pro/teams"');
    expect(appSource).not.toContain('path="/lol/pro/rosters"');
  });

  it("does not disturb the pre-existing Pro Data routes", () => {
    expect(routeLine("/lol/docs/pro")).toContain("<LeagueDocsProData />");
    expect(routeLine("/lol/docs/pro/champions")).toContain("<LeagueDocsProChampionIndex />");
    expect(routeLine("/lol/docs/pro/years/:year")).toContain("<LeagueDocsProYear />");
  });
});
