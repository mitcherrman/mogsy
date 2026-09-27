/**
 * HUB6.3D — History's comparison wording, against the owner's terminology:
 * never "pp", never "settled", "25 / 28 correct", correct plurals.
 */
import { describe, expect, it } from "vitest";
import {
  accuracyComparison,
  correctDelta,
  correctOfPlayed,
  questionsPlayed,
  questionsPlayedDelta,
  recordView,
  seriesOf,
} from "@/components/quiz/workspace/historyComparisons";
import { signedPoints } from "@/components/quiz/workspace/historyFormat";

describe("accuracy comparisons", () => {
  it("reads 89% vs 79%, 10 points higher, Accuracy +10 points", () => {
    const c = accuracyComparison(0.89, 0.79);
    expect(c.versus).toBe("89% vs 79%");
    expect(c.change).toBe("10 points higher");
    expect(c.compact).toBe("Accuracy +10 points");
  });

  it("counts points between the DISPLAYED percentages", () => {
    // 0.894 → 89%, 0.786 → 79%: the reader sees 10, not 10.8 → 11.
    expect(accuracyComparison(0.894, 0.786).points).toBe(10);
  });

  it("singular, lower and unchanged", () => {
    expect(accuracyComparison(0.8, 0.81).change).toBe("1 point lower");
    expect(accuracyComparison(0.8, 0.81).compact).toBe("Accuracy −1 point");
    expect(accuracyComparison(0.8, 0.8).change).toBe("Same accuracy");
  });

  it("no formatter ever prints pp", () => {
    for (const v of [-33, -1, 0, 0.4, 1, 6]) expect(signedPoints(v)).not.toMatch(/pp/);
    expect(signedPoints(6)).toBe("+6 points");
    expect(signedPoints(-1)).toBe("−1 point");
    for (const [a, b] of [[0.9, 0.5], [0.5, 0.9], [0.7, 0.7]]) {
      expect(Object.values(accuracyComparison(a, b)).join(" ")).not.toMatch(/\bpp\b/);
    }
  });
});

describe("counts", () => {
  it("25 / 28 correct; questions played, never settled", () => {
    expect(correctOfPlayed(25, 28)).toBe("25 / 28 correct");
    expect(questionsPlayed(28)).toBe("28 questions played");
    expect(questionsPlayed(1)).toBe("1 question played");
  });

  it("1 fewer question played; 5 more questions played", () => {
    expect(questionsPlayedDelta(-1)).toBe("1 fewer question played");
    expect(questionsPlayedDelta(5)).toBe("5 more questions played");
    expect(questionsPlayedDelta(0)).toBe("Same number of questions played");
    expect(correctDelta(2)).toBe("2 more correct");
    expect(correctDelta(-1)).toBe("1 fewer correct");
  });
});

describe("records and series", () => {
  const rec = (status: "first_attempt" | "new_record" | "tied_record" | "below_record") => ({
    metric: "correct", current: 25, priorBest: status === "first_attempt" ? null : 23, historicalBest: 25,
    status, priorBestRunId: null, priorBestCompletedAt: null, priorAttempts: status === "first_attempt" ? 0 : 3,
  });

  it("first attempt, new, tied, below — only new and tied earn a medal", () => {
    expect(recordView(rec("first_attempt"))).toMatchObject({ statusLabel: "First attempt", medal: null, label: "Most correct" });
    expect(recordView(rec("new_record"))).toMatchObject({ statusLabel: "New record", medal: "new" });
    expect(recordView(rec("tied_record"))).toMatchObject({ statusLabel: "Tied record", medal: "tied" });
    expect(recordView(rec("below_record"))).toMatchObject({ statusLabel: "Below record", medal: null });
  });

  it("a series is read point by point, current last", () => {
    const points = seriesOf(
      [
        { runId: "a", planDate: "2026-09-01", completedAt: "", correct: 23, isCurrent: false },
        { runId: "b", planDate: "2026-09-02", completedAt: "", correct: 25, isCurrent: true },
      ],
      "correct",
    );
    expect(points.map((p) => p.value)).toEqual([23, 25]);
    expect(points.at(-1)!.isCurrent).toBe(true);
  });
});
