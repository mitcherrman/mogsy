/**
 * DCMOD integration — routing, entry, status, and what must NOT come back.
 *
 * The Daily Challenge is ONE product: a parent run of canonical Ranked child
 * stages (`run/DailyRunPage`). Its route, the Hub's PLAY handoff and the
 * lobby's Daily status all read that one run. The DC2 in-page engine and the
 * standalone Time Trial (`/quiz/daily`, score attack) are retired — Time Trial
 * is now a reusable ruleset played as a Daily stage.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { dailyStatusFrom, readDailyStatus, UNKNOWN_DAILY_STATUS } from "@/lib/daily-challenge/status";
import {
  FOUR_STAGE_DAY, createFixtureTransport, fixtureRun, wireResult, wireRun,
} from "@/lib/daily-challenge/run/fixtures";
import { DailyRunApiError } from "@/lib/daily-challenge/run/client";

/** Source with comments stripped — a mention in prose is not a call. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every .ts/.tsx under `dir`. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const APP = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
const QUIZ = readFileSync(resolve(__dirname, "../Quiz.tsx"), "utf8");

describe("routing", () => {
  it("routes /quiz/daily-challenge to the Daily parent-run page", () => {
    expect(APP).toContain('path="/quiz/daily-challenge"');
    expect(APP).toContain('import("./pages/quiz-daily-challenge/run/DailyRunPage")');
    expect(APP).not.toContain("pages/quiz-daily-challenge/QuizDailyChallengePage");
  });

  it("no longer serves the standalone Time Trial at /quiz/daily", () => {
    expect(APP).not.toContain("QuizDailyScoreAttack");
    // Old links land on the Daily, where Time Trial now lives as a stage.
    expect(APP).toMatch(/path="\/quiz\/daily"[^>]*Navigate to="\/quiz\/daily-challenge"/);
  });
});

describe("the PLAY handoff", () => {
  it("opens the Daily parent run", () => {
    expect(QUIZ).toContain('onPlayDailyChallenge={() => navigate("/quiz/daily-challenge")}');
  });

  it("hands the record the parent run's status", () => {
    expect(QUIZ).toContain("useDailyChallengeStatus");
    expect(QUIZ).toContain("dailyChallenge={dailyStatus}");
  });

  it("has no client for any retired Daily endpoint anywhere in the app", () => {
    const files = sourceFiles(resolve(process.cwd(), "src"));
    const offenders = files.filter((f) => {
      if (f.endsWith("dailyChallengeEntry.test.tsx")) return false;
      const src = codeOnly(readFileSync(f, "utf8"));
      return /["'`]\/api\/quiz\/daily-challenge/.test(src)
        || /["'`]\/api\/daily-challenge\//.test(src)
        || /["'`]\/api\/daily-score-attack/.test(src)
        || /\bquizApi\.getDailyChallenge\b/.test(src);
    }).map((f) => f.replace(resolve(process.cwd()) + "/", ""));
    expect(offenders, "a retired Daily endpoint is reachable again").toEqual([]);
  });
});

describe("the lobby's Daily status (parent run)", () => {
  it("an unread status is playable, never finished", () => {
    expect(UNKNOWN_DAILY_STATUS.known).toBe(false);
    expect(UNKNOWN_DAILY_STATUS.completed).toBe(false);
  });

  it("a day with no run is known, unfinished and not resumable", () => {
    expect(dailyStatusFrom(null)).toMatchObject({
      known: true, completed: false, resumable: false,
    });
  });

  it("a run in progress is resumable, counting finished stages", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 1 }, {
      0: { status: "completed", child_match_id: "m0", result: wireResult() },
      1: { status: "in_progress", child_match_id: "m1" },
    });
    expect(dailyStatusFrom(run)).toMatchObject({
      known: true, completed: false, resumable: true, resolved: 1, total: 4,
    });
  });

  it("a finished day (including a perfect one) is finished", () => {
    const run = fixtureRun(FOUR_STAGE_DAY,
      { status: "completed", outcome: "perfect", current_stage_index: null },
      {
        0: { status: "completed", result: wireResult({ misses: 0 }) },
        1: { status: "completed", result: wireResult({ misses: 0 }) },
        2: { status: "completed", result: wireResult({ misses: 0 }) },
        3: { status: "skipped" },
      });
    expect(dailyStatusFrom(run)).toMatchObject({
      completed: true, resumable: false, resolved: 4, total: 4,
    });
  });

  it("reads GET /today through the run transport and fails closed to unknown", async () => {
    const transport = createFixtureTransport(FOUR_STAGE_DAY, { existing: wireRun(FOUR_STAGE_DAY) });
    expect((await readDailyStatus(undefined, transport)).resumable).toBe(true);
    expect(transport.calls).toEqual(["readToday"]);
    const broken = {
      ...transport,
      readToday: async () => { throw new DailyRunApiError("network", 0, "down"); },
    };
    expect(await readDailyStatus(undefined, broken)).toEqual(UNKNOWN_DAILY_STATUS);
  });
});
