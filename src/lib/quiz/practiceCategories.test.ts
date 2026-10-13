/**
 * PRAC1 — what the lobby's six tiles open.
 *
 * The rules under test are the ones that keep the rail HONEST: every approved
 * tile has an entry, all six name real live question categories, and a
 * subject's session is dealt across all of its categories
 * rather than filled from whichever one is biggest.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUIZ_CATEGORY_ICONS } from "@/components/quiz/QuizCategoryStrip";
import {
  PRACTICE_CATEGORY_SOURCES,
  isPracticeCategoryAvailable,
  loadPracticeCategoryQuestions,
  practiceSourcesFor,
} from "./practiceCategories";
import { quizApi, type QuizQuestion } from "./api";

afterEach(() => vi.restoreAllMocks());

function q(id: string): QuizQuestion {
  return { id, category: "x", format: "multiple_choice", choices: [] };
}

describe("practice category sources", () => {
  it("covers every rail tile — no subject can be a door with no room behind it", () => {
    for (const tile of QUIZ_CATEGORY_ICONS) {
      expect(Object.prototype.hasOwnProperty.call(PRACTICE_CATEGORY_SOURCES, tile.id), tile.id)
        .toBe(true);
    }
    // …and nothing here names a subject the rail does not show.
    const tileIds = new Set(QUIZ_CATEGORY_ICONS.map((t) => t.id));
    for (const id of Object.keys(PRACTICE_CATEGORY_SOURCES)) {
      expect(tileIds.has(id), id).toBe(true);
    }
  });

  it("makes all six content-backed subjects actionable", () => {
    for (const id of ["objectives", "wave-management", "summoner-spells", "itemization", "abilities", "vision"]) {
      expect(isPracticeCategoryAvailable(id), id).toBe(true);
      expect(practiceSourcesFor(id).length, id).toBeGreaterThan(0);
    }
  });

  it("connects Vision to the existing backend category", () => {
    expect(practiceSourcesFor("vision")).toEqual(["Vision"]);
    expect(isPracticeCategoryAvailable("vision")).toBe(true);
  });

  it("treats an unknown subject as unavailable rather than throwing", () => {
    expect(isPracticeCategoryAvailable("teamfighting")).toBe(false);
    expect(practiceSourcesFor("teamfighting")).toEqual([]);
  });

  it("keeps the abilities tile pointed at all four live ability categories", () => {
    // `Champion Ability Costs` and `Mana Management` are not in the backend's
    // stored-category table yet; both families resolve to Abilities, and
    // dropping them would withhold ~1,600 live rows from the tile.
    expect(practiceSourcesFor("abilities")).toContain("Champion Ability Costs");
    expect(practiceSourcesFor("abilities")).toContain("Mana Management");
  });
});

describe("loadPracticeCategoryQuestions", () => {
  it("asks every one of the subject's categories, and deals them round-robin", async () => {
    const spy = vi.spyOn(quizApi, "categoryQuestions").mockImplementation(async (name: string) => ({
      questions: Array.from({ length: 10 }, (_, i) => q(`${name}-${i}`)),
    }));

    const picked = await loadPracticeCategoryQuestions("summoner-spells", 6);

    expect(spy).toHaveBeenCalledTimes(practiceSourcesFor("summoner-spells").length);
    expect(picked).toHaveLength(6);
    // Every source is represented — a straight concatenation would have taken
    // all six from the first category.
    const sources = new Set(picked.map((p) => String(p.id).replace(/-\d+$/, "")));
    expect(sources.size).toBe(3);
  });

  it("survives a category that has gone away", async () => {
    vi.spyOn(quizApi, "categoryQuestions").mockImplementation(async (name: string) =>
      name === "Minion Waves"
        ? { questions: [q("a"), q("b")] }
        : Promise.reject(new Error("410 gone")),
    );
    const picked = await loadPracticeCategoryQuestions("wave-management", 10);
    expect(picked.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("loads Vision through the existing category endpoint", async () => {
    const spy = vi.spyOn(quizApi, "categoryQuestions").mockResolvedValue({
      questions: [q("vision-1"), q("vision-2")],
    });
    const picked = await loadPracticeCategoryQuestions("vision", 10);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("Vision", 10);
    expect(picked.map((question) => question.id).sort()).toEqual(["vision-1", "vision-2"]);
  });

  it("returns nothing for an unknown subject, without fetching", async () => {
    const spy = vi.spyOn(quizApi, "categoryQuestions");
    expect(await loadPracticeCategoryQuestions("teamfighting", 10)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("never repeats a question inside one session", async () => {
    vi.spyOn(quizApi, "categoryQuestions").mockResolvedValue({
      questions: [q("dupe"), q("dupe"), q("other")],
    });
    const picked = await loadPracticeCategoryQuestions("wave-management", 10);
    expect(picked.map((p) => p.id).sort()).toEqual(["dupe", "other"]);
  });
});
