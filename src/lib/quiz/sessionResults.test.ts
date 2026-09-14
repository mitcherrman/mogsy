import { describe, expect, it } from "vitest";
import { buildSessionResults, practiceVerdict } from "./sessionResults";

const answer = (category: string, isCorrect: boolean, i: number) => ({
  category,
  questionText: `Question ${i}`,
  selected: isCorrect ? "Right" : "Wrong",
  isCorrect,
  correctAnswer: "Right",
});

describe("a practice session's result model", () => {
  it("keeps the product's existing verdict thresholds", () => {
    expect(practiceVerdict(10, 10)).toBe("Perfect Score");
    expect(practiceVerdict(7, 10)).toBe("Great Job");
    expect(practiceVerdict(4, 10)).toBe("Keep Practicing");
    expect(practiceVerdict(1, 10)).toBe("Study Up");
  });

  it("trusts the runner's score rather than recounting the answers", () => {
    // A run whose last submit failed still has an authoritative score.
    const model = buildSessionResults({
      answers: [answer("Runes", true, 1)], score: 2, total: 3,
    });
    expect(model.score).toEqual({ you: 2, outOf: 3 });
    expect(model.snapshot?.find((s) => s.key === "correct")?.value).toBe("2 / 3");
  });

  it("names the strongest and weakest category only when more than one was played", () => {
    const one = buildSessionResults({
      answers: [answer("Runes", true, 1), answer("Runes", false, 2)],
      score: 1, total: 2,
    });
    expect(one.snapshot?.some((s) => s.key === "strongest")).toBe(false);

    const two = buildSessionResults({
      answers: [
        answer("Runes", true, 1), answer("Runes", true, 2),
        answer("Items", false, 3),
      ],
      score: 2, total: 3,
    });
    expect(two.snapshot?.find((s) => s.key === "strongest")?.value).toBe("Runes");
    expect(two.snapshot?.find((s) => s.key === "weakest")?.value).toBe("Items");
  });

  it("draws no points chip — a practice question awards none", () => {
    const model = buildSessionResults({
      answers: [answer("Runes", true, 1)], score: 1, total: 1,
    });
    expect(model.timeline?.entries[0].points).toBeNull();
    expect(model.timeline?.unitLabel).toBe("Questions");
  });

  it("claims no discoveries and no rating — Practice grants neither", () => {
    const model = buildSessionResults({
      answers: [answer("Runes", true, 1)], score: 1, total: 1,
      currentXp: 4200, currentStreak: 3,
    });
    expect(model.standing).toBe("practice");
    const keys = (model.progress ?? []).map((p) => p.key);
    expect(keys).toEqual(["xp", "streak"]);
    expect(JSON.stringify(model)).not.toMatch(/collection|discover|rating/i);
  });

  it("omits XP and streak entirely when no submit reported them", () => {
    const model = buildSessionResults({
      answers: [answer("Runes", true, 1)], score: 1, total: 1,
    });
    expect(model.progress).toEqual([]);
  });

  it("shows the correct answer on a miss, and nothing extra on a hit", () => {
    const model = buildSessionResults({
      answers: [answer("Runes", false, 1), answer("Items", true, 2)],
      score: 1, total: 2,
    });
    expect(model.timeline?.entries[0].detailHint).toBe("Correct answer: Right");
    expect(model.timeline?.entries[1].detailHint).toBeNull();
  });
});
