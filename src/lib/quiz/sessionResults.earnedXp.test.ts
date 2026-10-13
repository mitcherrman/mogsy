/**
 * MPE — the practice session's EARNED Academy XP: a sum of the backend's own
 * settled per-answer awards, stated only when every answer has one, and never
 * derived from the account total that sits beside it.
 */
import { describe, expect, it } from "vitest";
import { buildSessionResults, sessionXpEarned, type SessionResultAnswer } from "./sessionResults";

const answer = (isCorrect: boolean, xpEarned: number | null | undefined): SessionResultAnswer => ({
  category: "Runes", questionText: "Q", selected: "A", isCorrect, correctAnswer: "A", xpEarned,
});

describe("sessionXpEarned", () => {
  it("sums settled awards when every question has one (zero included)", () => {
    expect(sessionXpEarned([answer(true, 20), answer(false, 0), answer(true, 20)], 3)).toBe(40);
    expect(sessionXpEarned([answer(false, 0), answer(false, 0)], 2)).toBe(0);
  });

  it("is null when any award is unknown — an under-count is not the session's gain", () => {
    expect(sessionXpEarned([answer(true, 20), answer(true, null)], 2)).toBeNull();
    expect(sessionXpEarned([answer(true, 20), answer(true, undefined)], 2)).toBeNull();
  });

  it("is null when a submit failed (fewer settled answers than questions), or for an empty run", () => {
    expect(sessionXpEarned([answer(true, 20), answer(true, 20)], 3)).toBeNull();
    expect(sessionXpEarned([], 0)).toBeNull();
  });

  it("rejects a malformed award rather than summing it", () => {
    expect(sessionXpEarned([answer(true, Number.NaN)], 1)).toBeNull();
    expect(sessionXpEarned([answer(true, -5)], 1)).toBeNull();
  });
});

describe("the result model's XP rows", () => {
  it("puts the GAIN first, with a delta, and the total after it, without one", () => {
    const model = buildSessionResults({
      answers: [answer(true, 20), answer(false, 0), answer(true, 20)],
      score: 2, total: 3, currentXp: 4820,
    });
    expect(model.progress?.map((p) => p.key)).toEqual(["xp-earned", "xp"]);
    expect(model.progress?.[0]).toMatchObject({
      label: "Academy XP earned", value: "+40 XP", delta: 40, icon: "xp",
    });
    expect(model.progress?.[1]).toMatchObject({ label: "Account XP", value: "4,820", icon: "xp" });
    expect(model.progress?.[1].delta).toBeUndefined();
  });

  it("never derives a gain from the account total: no awards, no gain row — even with a total", () => {
    const model = buildSessionResults({
      answers: [answer(true, null), answer(true, null)], score: 2, total: 2, currentXp: 4820,
    });
    expect(model.progress?.map((p) => p.key)).toEqual(["xp"]);
  });

  it("prints no '+0' for a session that earned nothing", () => {
    const model = buildSessionResults({
      answers: [answer(false, 0), answer(false, 0)], score: 0, total: 2, currentXp: 4820,
    });
    expect(model.progress?.map((p) => p.key)).toEqual(["xp"]);
  });

  it("drops the gain when a submit failed, keeping the total the last submit reported", () => {
    const model = buildSessionResults({
      answers: [answer(true, 20)], score: 1, total: 3, currentXp: 4820,
    });
    expect(model.progress?.map((p) => p.key)).toEqual(["xp"]);
  });
});
