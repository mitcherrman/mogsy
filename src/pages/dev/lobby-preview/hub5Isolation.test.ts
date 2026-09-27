/**
 * HUB5 — the fixture environment cannot leak into the product, and the
 * product has no fixture-shaped path.
 *
 * Asserted structurally, from source, because every property here is about
 * what code CAN reach rather than what one render happens to do.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../..");
const PREVIEW = resolve(__dirname);
const norm = (p: string) => p.replace(/\\/g, "/");
const read = (p: string) => readFileSync(p, "utf8");
/** Comments explain; they are not call sites. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      sources(full, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f) || norm(f).includes("/src/test/");
const isDevPage = (f: string) => norm(f).includes("/src/pages/dev/");
const production = sources(SRC).filter((f) => !isTest(f) && !isDevPage(f));

describe("no fixture reaches the production runtime", () => {
  it("no production module imports anything from the Timmy preview", () => {
    const offenders = production.filter((f) =>
      /from\s+["'][^"']*(lobby-preview|lobbyPreviewFixtures|syntheticRankedHistory|timmyHistory|dailyFixtureBuilder|questionIdentity|timmyPractice|timmyLibrary)[^"']*["']/.test(read(f)),
    );
    expect(offenders.map(norm)).toEqual([]);
  });

  it("the preview is reached only through App.tsx's lazy, development-gated import", () => {
    const importers = sources(SRC)
      .filter((f) => !isTest(f) && !norm(f).includes("/pages/dev/lobby-preview/"))
      .filter((f) => /["'][^"']*pages\/dev\/lobby-preview\//.test(code(read(f))));
    expect(importers.map((f) => norm(f).split("/src/")[1])).toEqual(["App.tsx"]);
  });

  it("no production History module branches on Timmy, the preview, or a fixture id", () => {
    const history = production.filter((f) =>
      /\/src\/(components\/quiz\/workspace|lib\/history|components\/quiz\/timeline)\//.test(norm(f))
      || /\/src\/components\/quiz\/LeaguecraftHub\.tsx$/.test(norm(f)));
    expect(history.length).toBeGreaterThan(10);
    for (const f of history) {
      expect(code(read(f)), norm(f)).not.toMatch(/timmy|demo-first-daily|FIXTURE_ANCHOR|lobbyPreview/i);
    }
  });

  it("no production module computes History analytics (the backend's job)", () => {
    // The formulas HUB2 owns, by the names and shapes they would take here.
    const history = production.filter((f) => /\/src\/(components\/quiz\/workspace|lib\/history)\//.test(norm(f)));
    for (const f of history) {
      const src = code(read(f));
      // Assignments that would DERIVE a metric — reading a server field (the
      // parser's `fitted_change_pp`) is not computing one.
      expect(src, norm(f)).not.toMatch(
        /\bslope\w*\s*=[^=>]|\bfitted_?[cC]hange\w*\s*=[^=>]|\bhistoricalAverage\s*=[^=>]|\brecurring\w*\s*=\s*\w+\.filter|\breviewRecovery\w*\s*=\s*\w+\s*\//,
      );
    }
  });

  it("the test-only builder is imported by no runtime surface but the preview's own modules", () => {
    const importers = sources(SRC)
      .filter((f) => !isTest(f))
      .filter((f) => /from\s+["'][^"']*dailyFixtureBuilder["']/.test(read(f)))
      .map((f) => norm(f).split("/src/")[1]);
    for (const f of importers) expect(f).toMatch(/^pages\/dev\/lobby-preview\//);
  });
});

describe("the preview renders the REAL product components", () => {
  it("defines no component of its own besides the page shell", () => {
    const tsx = sources(PREVIEW).filter((f) => f.endsWith(".tsx") && !isTest(f)).map((f) => norm(f).split("/").pop());
    expect(tsx).toEqual(["LobbyPreviewPage.tsx"]);
  });

  it("forks no History component under a Timmy name", () => {
    for (const f of sources(PREVIEW).filter((x) => !isTest(x))) {
      expect(code(read(f)), norm(f)).not.toMatch(
        /function\s+(Timmy|Preview|Fixture)\w*(Row|Analysis|Timeline|Ledger|Review|History|Section|Card)\b/,
      );
    }
  });

  it("mounts the production hub, which composes the production History components", () => {
    const page = code(read(join(PREVIEW, "LobbyPreviewPage.tsx")));
    expect(page).toMatch(/import LeaguecraftHub from "@\/components\/quiz\/LeaguecraftHub"/);
    // HUB6.3D: Timmy's sources and the Analytics Lab's, both through the
    // production parser, in one map.
    expect(page).toMatch(/dailyHistorySource=\{HISTORY_SOURCES\[view\.dailyHistory\]\}/);
    expect(page).toMatch(/\.\.\.TIMMY_HISTORY_SOURCES,\s*\.\.\.ANALYTICS_LAB_SOURCES/);
    const hub = code(read(resolve(SRC, "components/quiz/LeaguecraftHub.tsx")));
    for (const component of ["DailyHistorySection", "StudyHistoryLedger", "ReviewPane", "LeaguecraftWorkspace"]) {
      expect(hub).toContain(`<${component}`);
    }
  });

  it("feeds History through the production parser, never a hand-built record", () => {
    const source = code(read(join(PREVIEW, "history/timmyHistorySource.ts")));
    expect(source).toMatch(/import \{ readHistoryPage \} from "@\/lib\/history\/contracts"/);
    expect(source).toMatch(/return readHistoryPage\(pages\[index\]\)/);
  });

  it("performs no fetch, write, storage or auth access from any fixture module", () => {
    for (const f of sources(PREVIEW).filter((x) => !isTest(x))) {
      const src = code(read(f));
      for (const forbidden of ["fetch(", "axios", "supabase", "localStorage", "sessionStorage", "useAuth", "/api/", "XMLHttpRequest"]) {
        expect(src, `${norm(f)} → ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("/dev/lobby-preview route gating", () => {
  const app = code(read(resolve(SRC, "App.tsx")));

  it("imports the preview only in development builds", () => {
    expect(app).toMatch(
      /const LobbyPreviewPage = import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\("\.\/pages\/dev\/lobby-preview\/LobbyPreviewPage"\)\)\s*:\s*null;/,
    );
  });

  it("registers the route only when that import exists, and nowhere else", () => {
    expect(app).toMatch(/\{LobbyPreviewPage \? \(\s*<Route path="\/dev\/lobby-preview"/);
    expect(app.match(/path="\/dev\/lobby-preview"/g)).toHaveLength(1);
  });

  it("is linked from no production navigation; the admin registry lists it as developer-only", () => {
    // Raw source, not comment-stripped; a link needs a navigation construct.
    const link = /(?:to|href)=\{?["'`]\/dev\/lobby-preview|navigate\(\s*["'`]\/dev\/lobby-preview|path(?::\s*|=)["']\/dev\/lobby-preview/;
    const linkers = production
      .filter((f) => link.test(read(f)))
      .map((f) => norm(f).split("/src/")[1]);
    expect(linkers.sort()).toEqual(["App.tsx", "lib/admin/admin-registry.ts"]);
    const registry = read(resolve(SRC, "lib/admin/admin-registry.ts"));
    const entry = registry.slice(registry.indexOf('id: "leaguecraft-lobby-preview"'));
    const block = entry.slice(0, entry.indexOf("},"));
    expect(block).toMatch(/developerOnly: true/);
    expect(block).toMatch(/DEV builds only/);
  });
});
