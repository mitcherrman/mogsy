/**
 * GUARD — there is no leveling system, so no ACTIVE source may speak of the
 * Level 2 choice or call its retired route.
 *
 * "Active" means the live app's Ranked, Bot Ranked and Daily paths: the
 * directories below, minus test files and test fixtures. The dev/staff
 * prototypes under `src/pages/dev/**` still model the retired progression
 * layer and are deliberately out of scope.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ACTIVE_DIRS = [
  "src/components/ranked-arena",
  "src/pages/quiz-ranked",
  "src/lib/ranked-core",
  "src/lib/ranked-public",
  "src/pages/quiz-daily-challenge",
];

const FORBIDDEN = /\blevel[ -]?2\b|level-two-choice|chooseLevelTwo|LevelUpPanel/i;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__fixtures__" || name === "__tests__") continue;
      out.push(...sources(path));
    } else if (/\.(ts|tsx)$/.test(name)
      && !/\.test\.(ts|tsx)$/.test(name)
      && !/fixtures?\.(ts|tsx)$/i.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe("no active source references the retired Level 2 choice", () => {
  const files = ACTIVE_DIRS.flatMap((d) => sources(resolve(ROOT, d)));

  it("scans a real set of files", () => {
    // A guard that silently scans nothing would pass forever.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith("QuizRankedMatch.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("CanonicalArena.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("client.ts"))).toBe(true);
  });

  it("finds no Level 2 / level-two-choice reference", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (FORBIDDEN.test(line)) {
          offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("the Level 2 panel no longer lives among the arena components", () => {
    const arena = readdirSync(resolve(ROOT, "src/components/ranked-arena"));
    expect(arena.some((n) => /^LevelUpPanel\./.test(n))).toBe(false);
  });
});
