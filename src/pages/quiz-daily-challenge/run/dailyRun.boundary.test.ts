/**
 * DCMOD-E — source guards for the parent run.
 *
 * The Daily's parent run is a HOST: it must reach gameplay only through the
 * canonical match, never grow a second arena, a second answer path or a
 * second clock, and never close a stage with Ranked's full match ending.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) ? [full] : [];
  });
}
const RUN_FILES = [
  ...files(join(ROOT, "pages", "quiz-daily-challenge", "run")),
  ...files(join(ROOT, "lib", "daily-challenge", "run")),
];
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const source = () => RUN_FILES.map((f) => codeOnly(readFileSync(f, "utf8"))).join("\n");

describe("the Daily parent run hosts the canonical match and nothing else", () => {
  it("mounts gameplay only as QuizRankedMatch, with a MatchHost", () => {
    const page = readFileSync(join(ROOT, "pages/quiz-daily-challenge/run/DailyRunPage.tsx"), "utf8");
    expect(page).toContain("<QuizRankedMatch");
    expect(page).toContain("host");
  });

  it("owns no answer path, no answer renderer and no match clock", () => {
    const src = source();
    for (const banned of [
      "AnswerGrid", "QuestionPanel", "TimerDisplay", "submitAnswer", "submitChallenge",
      "CanonicalArena", "useRankedMatch", "ranked_duel", "/rounds/",
    ]) {
      expect(src, `the Daily run grew its own ${banned}`).not.toContain(banned);
    }
  });

  it("never closes a stage with Ranked's full ending", () => {
    const src = source();
    for (const banned of ["RankedMatchOutro", "MatchOverFrame", "GameResultsBody", "Victory", "Defeat"]) {
      expect(src, `a stage must not end with ${banned}`).not.toContain(banned);
    }
  });

  it("never names survival as health", () => {
    expect(source()).not.toMatch(/\bhp\b|health|damage/i);
  });

  it("offers no manual progression control between stages", () => {
    const src = source();
    for (const banned of ["Next stage", "Next Stage", "Continue", "Skip"]) {
      expect(src, `the Daily run grew a "${banned}" control`).not.toContain(banned);
    }
  });
});
