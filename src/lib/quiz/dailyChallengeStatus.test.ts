/**
 * PLAY1 — the Daily Challenge completion predicate.
 *
 * The defect this closes: a card that offered to play a day with nothing left
 * in it, and bounced the player back to the lobby with no explanation.
 */
import { describe, expect, it } from "vitest";
import { isDailyChallengeComplete } from "./dailyChallengeStatus";
import type { DailyChallengeState } from "@/lib/quiz/featured-mock";

const STATE = (over: Partial<DailyChallengeState> = {}): DailyChallengeState => ({
  date: "2026-08-21", answered: 2, correct: 2, target: 5, xpBonus: 250,
  dailyStreak: 4, lastCompletedDate: null, completed: false, remaining: 3,
  themeTitle: "Item Knowledge", themeBlurb: "Recipes",
  ...over,
});

describe("isDailyChallengeComplete", () => {
  it("is false for a day with questions left", () => {
    expect(isDailyChallengeComplete(STATE())).toBe(false);
  });

  it("is false when there is no daily state at all", () => {
    expect(isDailyChallengeComplete(null)).toBe(false);
    expect(isDailyChallengeComplete(undefined)).toBe(false);
  });

  it("is true on the backend's own completed flag", () => {
    expect(isDailyChallengeComplete(STATE({ completed: true }))).toBe(true);
  });

  it("is true when the backend says nothing remains", () => {
    // `completed` can lag `questions_remaining` — the host filters on what is
    // left, so what is left is what decides.
    expect(isDailyChallengeComplete(STATE({ remaining: 0 }))).toBe(true);
  });

  it("is true when the counts say the set is answered", () => {
    // The payload that carries neither flag nor remainder.
    expect(isDailyChallengeComplete(STATE({ answered: 5, remaining: 3 }))).toBe(true);
    expect(isDailyChallengeComplete(STATE({ answered: 6, remaining: 3 }))).toBe(true);
  });

  it("treats an EMPTY payload as unknown, never as finished", () => {
    // The guard that matters: every count at zero is a backend outage, and
    // `0 >= 0` would otherwise mark every account complete for the day.
    expect(isDailyChallengeComplete(STATE({
      answered: 0, target: 0, remaining: 0, completed: false,
    }))).toBe(false);
  });

  it("still trusts an explicit completed flag on an empty payload", () => {
    // If the backend actually said so, that is not arithmetic — it is a fact.
    expect(isDailyChallengeComplete(STATE({
      answered: 0, target: 0, remaining: 0, completed: true,
    }))).toBe(true);
  });
});
