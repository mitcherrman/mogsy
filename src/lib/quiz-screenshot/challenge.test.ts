import { describe, expect, it } from "vitest";
import {
  CHALLENGE_MAX_QUESTIONS,
  CHALLENGE_MIN_QUESTIONS,
  DAILY_PREFIX_MAX,
  expandChallenge,
  expandDailyPackage,
  summaryPages,
  SUMMARY_ROWS_PER_SLIDE,
} from "./challenge";

describe("expandChallenge", () => {
  it("expands 5 questions into opening + 5 + summary + ending in order", () => {
    const slides = expandChallenge({ questionCount: 5 });
    expect(slides.map((s) => s.slug)).toEqual([
      "opening", "q01", "q02", "q03", "q04", "q05", "answers", "ending",
    ]);
    expect(slides.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(slides[0].slideKind).toBe("opening");
    expect(slides[6].slideKind).toBe("summary");
    expect(slides[7].slideKind).toBe("ending");
    // Question slides carry progress + question index; end slides don't.
    expect(slides[1].progress).toEqual({ number: 1, total: 5 });
    expect(slides[5].progress).toEqual({ number: 5, total: 5 });
    expect(slides[1].questionIndex).toBe(0);
    expect(slides[0].questionIndex).toBeUndefined();
    // Difficulty shows on question slides only.
    expect(slides.filter((s) => s.showDifficulty).length).toBe(5);
  });

  it("supports the whole 2-10 range and rejects outside it", () => {
    for (let n = CHALLENGE_MIN_QUESTIONS; n <= CHALLENGE_MAX_QUESTIONS; n++) {
      const slides = expandChallenge({ questionCount: n });
      const quiz = slides.filter((s) => s.slideKind === "quiz");
      expect(quiz.length).toBe(n);
      expect(slides[0].slideKind).toBe("opening");
      expect(slides[slides.length - 1].slideKind).toBe("ending");
    }
    expect(() => expandChallenge({ questionCount: 1 })).toThrow(/2-10/);
    expect(() => expandChallenge({ questionCount: 11 })).toThrow(/2-10/);
    expect(() => expandChallenge({ questionCount: 2.5 })).toThrow(/2-10/);
  });

  it("paginates the answer summary beyond the per-slide row cap", () => {
    const slides = expandChallenge({ questionCount: 10 });
    const summaries = slides.filter((s) => s.slideKind === "summary");
    expect(summaries.length).toBe(Math.ceil(10 / SUMMARY_ROWS_PER_SLIDE));
    expect(summaries.map((s) => s.slug)).toEqual(["answers-1", "answers-2"]);
    expect(summaries[0].summary).toEqual({ page: 1, pageCount: 2, startIndex: 0, count: 6 });
    expect(summaries[1].summary).toEqual({ page: 2, pageCount: 2, startIndex: 6, count: 4 });
    // Single page keeps the plain slug.
    const five = expandChallenge({ questionCount: 5 }).filter((s) => s.slideKind === "summary");
    expect(five[0].slug).toBe("answers");
    expect(five[0].summary!.pageCount).toBe(1);
  });

  it("places repeat-opener copy on Q1 only, and the mid CTA at the midpoint", () => {
    const slides = expandChallenge({ questionCount: 5, repeatVariant: 2, midCtaVariant: 3 });
    const quiz = slides.filter((s) => s.slideKind === "quiz");
    expect(quiz[0].repeatVariant).toBe(2);
    expect(quiz.slice(1).every((s) => s.repeatVariant === undefined)).toBe(true);
    expect(quiz[2].midCtaVariant).toBe(3); // ceil(5/2) = Q3
    expect(quiz.filter((s) => s.midCtaVariant).length).toBe(1);
  });

  it("defaults to no repeat copy and no mid CTA", () => {
    const quiz = expandChallenge({ questionCount: 4 }).filter((s) => s.slideKind === "quiz");
    expect(quiz.every((s) => !s.repeatVariant && !s.midCtaVariant)).toBe(true);
  });

  it("rejects unknown copy variants", () => {
    expect(() =>
      expandChallenge({ questionCount: 3, repeatVariant: 9 as never }),
    ).toThrow(/repeat/i);
    expect(() =>
      expandChallenge({ questionCount: 3, midCtaVariant: 9 as never }),
    ).toThrow(/mid/i);
  });
});

describe("summaryPages", () => {
  it("covers every question exactly once", () => {
    for (let n = 2; n <= 10; n++) {
      const pages = summaryPages(n);
      const total = pages.reduce((sum, p) => sum + p.count, 0);
      expect(total).toBe(n);
      expect(pages[0].startIndex).toBe(0);
    }
  });
});

describe("expandDailyPackage", () => {
  const base = {
    featuredQuestionId: "100",
    challengeQuestionIds: ["101", "102", "103", "104"],
    reuseFeaturedAsOpener: true,
  };

  it("expands into three deterministic posts with the featured reused as Q1", () => {
    const posts = expandDailyPackage("daily-2026-07-15", base);
    expect(posts.map((p) => p.key)).toEqual([
      "post-1-single-question",
      "post-2-answer-reveal",
      "post-3-multi-question",
    ]);
    expect(posts[0].runId).toBe("daily-2026-07-15-post-1-single-question");
    expect(posts[0].questionIds).toEqual(["100"]);
    expect(posts[1].questionIds).toEqual(["100"]);
    expect(posts[2].questionIds).toEqual(["100", "101", "102", "103", "104"]);
  });

  it("omits the featured question from the challenge when reuse is off", () => {
    const posts = expandDailyPackage("d1", { ...base, reuseFeaturedAsOpener: false });
    expect(posts[2].questionIds).toEqual(["101", "102", "103", "104"]);
  });

  it("rejects bad prefixes, duplicate questions, and bad counts", () => {
    expect(() => expandDailyPackage("../evil", base)).toThrow(/prefix/i);
    expect(() => expandDailyPackage("a".repeat(DAILY_PREFIX_MAX + 1), base)).toThrow(/prefix/i);
    expect(() =>
      expandDailyPackage("d1", { ...base, challengeQuestionIds: ["100", "101"] }),
    ).toThrow(/duplicates/i);
    expect(() =>
      expandDailyPackage("d1", { ...base, challengeQuestionIds: [] }),
    ).toThrow(/2-10/);
  });
});
