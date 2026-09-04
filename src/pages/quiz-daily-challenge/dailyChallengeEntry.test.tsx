/**
 * DC1 Phase 5 / ARENA1 Step 5 — routing, entry, status, and what must NOT move.
 *
 * The Daily Challenge is one of three modes on a shared surface, and it sits
 * next to a differently-named mode (`/quiz/daily` is Time Trial) that has its
 * own players. So the route census and the PLAY handoff are pinned here rather
 * than assumed.
 *
 * Step 5 added the third thing: WHICH SERVICE the lobby's Daily clause
 * believes. It used to be the legacy quiz-daily endpoint, which describes a
 * different product from the one the button beside it opens.
 *
 * The Daily answer grid's own suite is gone from this file because the grid
 * is. Every rule it pinned — the backend index is what submits, an eliminated
 * option keeps its place and its letter and leaves the tab order, no
 * correctness before a reveal, every live option keyboard-reachable — is
 * asserted against the CANONICAL grid in `AnswerGrid.elimination.test.tsx`,
 * which is where it belongs now that there is one grid.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { dailyStatusFrom, liveStreak, UNKNOWN_DAILY_STATUS } from "@/lib/daily-challenge/status";
import { readHistory, readToday } from "@/lib/daily-challenge/contracts";
import { DATE, rawToday, rawTodayRun } from "./testFixtures";

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
  it("registers the Daily Challenge at its own path", () => {
    expect(APP).toContain('path="/quiz/daily-challenge"');
    expect(APP).toContain("QuizDailyChallengePage");
  });

  it("leaves Time Trial at /quiz/daily exactly where it was", () => {
    // A DIFFERENT mode with a confusingly similar path. Renaming or reusing it
    // would silently move real players into the wrong game.
    expect(APP).toContain('path="/quiz/daily"');
    expect(APP).toContain("QuizDailyScoreAttack");
    // And the two are separate route entries, not one redirecting to the other.
    expect(APP).not.toMatch(/path="\/quiz\/daily"[^>]*Navigate/);
  });

  it("the two paths are distinct registrations", () => {
    const daily = APP.indexOf('path="/quiz/daily"');
    const challenge = APP.indexOf('path="/quiz/daily-challenge"');
    expect(daily).toBeGreaterThan(-1);
    expect(challenge).toBeGreaterThan(-1);
    expect(daily).not.toBe(challenge);
  });
});

describe("the PLAY handoff", () => {
  it("opens the new arena instead of the legacy in-page Daily", () => {
    expect(QUIZ).toContain('onPlayDailyChallenge={() => navigate("/quiz/daily-challenge")}');
    expect(QUIZ).not.toContain("onPlayDailyChallenge={() => void handlePlayDailyChallenge()}");
  });

  /**
   * THE LEGACY FIVE-QUESTION DAILY IS GONE FROM THE FRONTEND.
   *
   * Step 5 replaced the entry and the AUTHORITY but deliberately left the old
   * implementation in place, because the new surface was not certified in
   * production yet. It is now — DC2 shipped, and the route flip was smoke
   * tested live — so the fallback has been removed rather than left as a
   * second, differently-scored Daily that a stray prop could reach.
   *
   * The BACKEND routes are untouched and still serve their own history; the
   * assertion is that nothing in this app can call them.
   */
  it("no longer carries the legacy in-page Daily at all", () => {
    for (const gone of ["handlePlayDailyChallenge", "isDailyChallenge",
                        "DailyChallengeResult", "QuizDailyChallengeCard",
                        "dailyBonusXpEarned"]) {
      expect(QUIZ, `${gone} should be gone from Quiz.tsx`).not.toContain(gone);
    }
  });

  it("has no client for the legacy Daily endpoints anywhere in the app", () => {
    // The GET also MATERIALISES the day server-side, so a speculative call
    // writes rows for a mode nobody plays. The only Daily client is DC2's.
    const files = sourceFiles(resolve(process.cwd(), "src"));
    const offenders = files.filter((f) => {
      if (f.endsWith("dailyChallengeEntry.test.tsx")) return false;
      const src = codeOnly(readFileSync(f, "utf8"));
      return /["'`]\/api\/quiz\/daily-challenge/.test(src)
        || /\bquizApi\.getDailyChallenge\b/.test(src)
        || /\bquizApi\.submitDailyChallengeAnswer\b/.test(src);
    }).map((f) => f.replace(resolve(process.cwd()) + "/", ""));
    expect(offenders, "the legacy Daily endpoint is reachable again").toEqual([]);
  });

  /**
   * ARENA1 Step 5 §19 — the record's Daily clause reads DC2 now.
   *
   * The legacy `dailyChallenge` state still exists and still drives the legacy
   * in-page flow. What it no longer does is tell the record whether today is
   * finished, because that clause opens a service it knows nothing about.
   */
  it("hands the record DC2's status, not the legacy payload", () => {
    expect(QUIZ).toContain("useDailyChallengeStatus");
    expect(QUIZ).toContain("dailyChallenge={dailyStatus}");
    const hub = QUIZ.slice(QUIZ.indexOf("<LeaguecraftHub"));
    expect(hub.slice(0, hub.indexOf("/>"))).not.toContain("{dailyChallenge}");
  });
});

describe("the lobby's Daily status", () => {
  const today = (over: Record<string, unknown> = {}) => readToday(rawToday(over));
  const history = (entries: Record<string, unknown>[]) =>
    readHistory({ server_now: `${DATE}T12:00:00+00:00`, entries });

  const entry = (over: Record<string, unknown> = {}) => ({
    run_id: "dcr_x", challenge_date: DATE, challenge_version: 1,
    status: "completed", completed_at: `${DATE}T12:30:00+00:00`,
    score: 1150, max_score: 1250, card_count: 12, resolved_count: 12,
    first_attempt_correct_count: 11, score_percent: 92, grade: "A",
    daily_streak: 4, total_xp: 200, ...over,
  });

  it("an unread status is playable, never finished", () => {
    expect(UNKNOWN_DAILY_STATUS.known).toBe(false);
    expect(UNKNOWN_DAILY_STATUS.completed).toBe(false);
  });

  it("a day with no run is known, unfinished and not resumable", () => {
    const status = dailyStatusFrom(today(), null);
    expect(status).toMatchObject({ known: true, completed: false, resumable: false });
    expect(status.total).toBe(12);
  });

  it("reports a finished day as finished", () => {
    const status = dailyStatusFrom(
      today({ run: rawTodayRun({ status: "completed", resumable: false, resolved_count: 12 }) }),
      null);
    expect(status.completed).toBe(true);
    expect(status.resolved).toBe(12);
  });

  it("reports a run in progress as resumable, not finished", () => {
    const status = dailyStatusFrom(
      today({ run: rawTodayRun({ current_sequence: 4, resolved_count: 3 }) }), null);
    expect(status).toMatchObject({ completed: false, resumable: true, resolved: 3 });
  });

  it("claims a streak from a run finished TODAY", () => {
    expect(liveStreak(today(), history([entry()]))).toBe(4);
  });

  it("claims a streak from a run finished YESTERDAY — it is still live", () => {
    expect(liveStreak(today(), history([entry({ challenge_date: "2026-08-19" })]))).toBe(4);
  });

  /**
   * `daily_streak` is the streak AS OF THAT RUN, and the backend only
   * recomputes it on completion. A run three days old carries a number that
   * stopped being true two days ago, and the lobby must not advertise it.
   */
  it("claims NOTHING from a run too old for the streak to have survived", () => {
    expect(liveStreak(today(), history([entry({ challenge_date: "2026-08-17" })]))).toBeNull();
  });

  it("claims nothing from an unfinished run, and nothing from no history", () => {
    expect(liveStreak(today(), history([entry({ status: "active", daily_streak: null })])))
      .toBeNull();
    expect(liveStreak(today(), history([]))).toBeNull();
    expect(dailyStatusFrom(today(), null).streak).toBeNull();
  });
});
