import { describe, expect, it } from "vitest";
import { deriveProfileStats, pickBestCategory } from "./view-model";
import type { QuizHistoryEntry, QuizProgress } from "@/lib/quiz/api";

const HISTORY_ENTRY: QuizHistoryEntry = {
  session_id: 1,
  date: "2026-07-15",
  completed_at: "2026-07-15 20:11:00",
  mode: "quiz",
  score: 7,
  total_questions: 10,
  accuracy: 70,
};

describe("deriveProfileStats", () => {
  it("reports the genuine no-activity state", () => {
    const vm = deriveProfileStats(
      { total_attempts: 0, accuracy: 0, current_streak: 0, best_streak: 0 },
      [],
      [],
    );
    expect(vm.totalQuestionsAnswered).toBe(0);
    expect(vm.hasAnyQuizActivity).toBe(false);
    expect(vm.hasDetailedStoredHistory).toBe(false);
    expect(vm.activityState).toBe("none");
  });

  it("uses the backend's total_attempts as the Answered total (the screenshot bug)", () => {
    // The backend progress payload uses total_attempts; the old UI read
    // `attempts` and showed 0 next to a real accuracy.
    const progress: QuizProgress = {
      total_attempts: 31,
      correct_attempts: 21,
      accuracy: 67.74,
      current_streak: 8,
      best_streak: 8,
    };
    const vm = deriveProfileStats(progress, [], null);
    expect(vm.totalQuestionsAnswered).toBe(31);
    expect(vm.accuracy).toBe(67.74);
    expect(vm.currentStreak).toBe(8);
    expect(vm.bestStreak).toBe(8);
    expect(vm.hasAnyQuizActivity).toBe(true);
  });

  it("classifies aggregate activity without stored sessions as aggregate-only", () => {
    const vm = deriveProfileStats(
      { total_attempts: 31, accuracy: 67.74, best_streak: 8 },
      [{ category: "items", accuracy: 70, attempts: 20 }],
      [],
    );
    expect(vm.activityState).toBe("aggregate-only");
    expect(vm.hasDetailedStoredHistory).toBe(false);
  });

  it("classifies stored sessions as detailed", () => {
    const vm = deriveProfileStats({ total_attempts: 31, accuracy: 67.74 }, [], [HISTORY_ENTRY]);
    expect(vm.activityState).toBe("detailed");
    expect(vm.recentHistory).toHaveLength(1);
  });

  it("never shows Answered=0 when category totals prove questions were answered", () => {
    const vm = deriveProfileStats(
      { total_attempts: 0, accuracy: 67.74 },
      [
        { category: "items", accuracy: 70, attempts: 20 },
        { category: "cooldowns", accuracy: 60, attempts: 11 },
      ],
      null,
    );
    expect(vm.totalQuestionsAnswered).toBe(31);
    expect(vm.categoryAnsweredTotal).toBe(31);
    expect(vm.hasAnyQuizActivity).toBe(true);
    expect(vm.activityState).toBe("aggregate-only");
  });

  it("treats accuracy or best streak alone as activity (contradiction guard)", () => {
    const vm = deriveProfileStats({ total_attempts: 0, accuracy: 67.74, best_streak: 8 }, [], []);
    expect(vm.hasAnyQuizActivity).toBe(true);
    expect(vm.activityState).toBe("aggregate-only");
  });

  it("handles missing inputs without fabricating history", () => {
    const vm = deriveProfileStats(null, null, null);
    expect(vm.totalQuestionsAnswered).toBe(0);
    expect(vm.recentHistory).toEqual([]);
    expect(vm.activityState).toBe("none");
    expect(vm.rankName).toBe("Unranked");
  });

  it("is tolerant of the backend's category_name field", () => {
    const vm = deriveProfileStats(
      { total_attempts: 0 },
      [{ category_name: "champions", accuracy: 100, attempts: 15 }],
      null,
    );
    expect(vm.totalQuestionsAnswered).toBe(15);
  });

  it("extracts rank name from the backend's nested rank object", () => {
    const vm = deriveProfileStats(
      { total_attempts: 5, rank: { rank_name: "Bronze", small_icon_path: "assets/ranks/small/bronze.png" } },
      [],
      null,
    );
    expect(vm.rankName).toBe("Bronze");
    expect(vm.rankIconUrl).toContain("bronze");
  });
});

describe("pickBestCategory", () => {
  it("returns null when nothing has been answered", () => {
    expect(pickBestCategory([])).toBeNull();
    expect(pickBestCategory(null)).toBeNull();
    // A 0-attempt category is never "best", even if others are worse.
    expect(pickBestCategory([{ category_name: "items", accuracy: 0, attempts: 0 }])).toBeNull();
  });

  it("picks the highest accuracy among played categories", () => {
    const best = pickBestCategory([
      { category_name: "items", accuracy: 50, attempts: 2 },
      { category_name: "champions", accuracy: 100, attempts: 15 },
      { category_name: "cooldowns", accuracy: 0, attempts: 1 },
    ]);
    expect(best?.category_name).toBe("champions");
  });

  it("breaks accuracy ties by higher answered count", () => {
    const best = pickBestCategory([
      { category_name: "items", accuracy: 100, attempts: 3 },
      { category_name: "champions", accuracy: 100, attempts: 15 },
    ]);
    expect(best?.category_name).toBe("champions");
  });

  it("keeps stable original ordering on full ties", () => {
    const best = pickBestCategory([
      { category_name: "items", accuracy: 100, attempts: 5 },
      { category_name: "champions", accuracy: 100, attempts: 5 },
    ]);
    expect(best?.category_name).toBe("items");
  });

  it("ignores unplayed categories when picking best", () => {
    const best = pickBestCategory([
      { category_name: "esports", accuracy: 0, attempts: 0 },
      { category_name: "items", accuracy: 40, attempts: 5 },
    ]);
    expect(best?.category_name).toBe("items");
  });
});
