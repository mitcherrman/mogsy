/**
 * UX1 — the Worlds experience prototype cannot become a second public
 * production experience, and the published tournament page is untouched.
 *
 * Asserted from source, like HUB5's isolation test: what code CAN reach.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../..");
const norm = (p: string) => p.replace(/\\/g, "/");
const read = (p: string) => readFileSync(p, "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") sources(full, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f) || norm(f).includes("/src/test/");
const all = sources(SRC).filter((f) => !isTest(f));

describe("UX1 isolation", () => {
  it("the prototype page is reached only through App.tsx's development-gated lazy import", () => {
    const importers = all
      .filter((f) => !norm(f).includes("/pages/dev/worlds-experience/"))
      .filter((f) => /["'][^"']*pages\/dev\/worlds-experience\//.test(code(read(f))));
    expect(importers.map((f) => norm(f).split("/src/")[1])).toEqual(["App.tsx"]);
    // Raw source: the route path's "/*" would read as a comment opener.
    const app = read(join(SRC, "App.tsx"));
    expect(app).toMatch(/const WorldsExperienceDev = import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\("\.\/pages\/dev\/worlds-experience\/WorldsExperienceDev"\)\)\s*:\s*null;/);
    // Both its paths are registered only inside the gate.
    const routes = [...app.matchAll(/path="([^"]*worlds-experience[^"]*)"/g)].map((m) => m[1]);
    expect(routes).toEqual(["/lol/dev/worlds-experience/*", "/dev/worlds-experience"]);
    const gate = app.indexOf("{WorldsExperienceDev ? (");
    for (const r of routes) expect(app.indexOf(`path="${r}"`)).toBeGreaterThan(gate);
    expect(app.indexOf(") : null}", gate)).toBeGreaterThan(app.indexOf('path="/dev/worlds-experience"'));
  });

  it("no production module imports the scenarios or the shell", () => {
    const production = all.filter((f) => !norm(f).includes("/src/pages/dev/"));
    const scen = production.filter((f) => /worlds-experience\/scenarios|__fixtures__\/worldsScenarios/.test(code(read(f))));
    expect(scen.map(norm)).toEqual([]);
    const shell = production
      .filter((f) => !norm(f).includes("/components/pro-play/worlds-experience/"))
      .filter((f) => /components\/pro-play\/worlds-experience\//.test(code(read(f))));
    expect(shell.map(norm)).toEqual([]);
  });

  it("the published tournament route and page are as they were", () => {
    const app = read(join(SRC, "App.tsx"));
    expect(app).toMatch(/<Route path=\{PRO_PLAY_TOURNAMENT_ROUTE\} element=\{<Suspense fallback=\{<RouteFallback \/>\}><ProPlayTournament \/><\/Suspense>\} \/>/);
    const page = code(read(join(SRC, "pages/pro-play/ProPlayTournament.tsx")));
    expect(page).toMatch(/import TournamentV2 from "@\/components\/pro-play\/tournament\/TournamentV2";/);
    expect(page).not.toMatch(/worlds-experience|BracketSelectContext/);
    const v2 = code(read(join(SRC, "components/pro-play/tournament/TournamentV2.tsx")));
    expect(v2).not.toMatch(/BracketSelectContext|worlds-experience/);
  });

  it("the hub's featured link and its switching policy are not touched by the prototype", () => {
    const featured = code(read(join(SRC, "lib/pro-play/featuredTournament.ts")));
    expect(featured).not.toMatch(/worlds-experience|\/dev\//);
    const hub = all.filter((f) => /components\/pro-play\/hub\/|pages\/pro-play\/ProPlayHub/.test(norm(f)));
    for (const f of hub) expect(code(read(f)), norm(f)).not.toMatch(/worlds-experience/);
  });
});
