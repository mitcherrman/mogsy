import { describe, expect, it } from "vitest";
import { POST_TYPES, expandPost, isPostType, isSlideKind } from "./content-posts";

describe("content post types", () => {
  it("exposes single-question and answer-reveal", () => {
    expect([...POST_TYPES]).toEqual(["single-question", "answer-reveal"]);
  });

  it("single-question expands to [quiz:question, app-cta]", () => {
    const slides = expandPost("single-question");
    expect(slides.map((s) => [s.index, s.slideKind, s.state, s.slug])).toEqual([
      [1, "quiz", "question", "question"],
      [2, "app-cta", "question", "app-cta"],
    ]);
    // Difficulty shows on the question slide, not the app CTA.
    expect(slides.map((s) => s.showDifficulty)).toEqual([true, false]);
  });

  it("answer-reveal expands to [recap, quiz:correct, community]", () => {
    const slides = expandPost("answer-reveal");
    expect(slides.map((s) => [s.index, s.slideKind, s.state, s.slug])).toEqual([
      [1, "recap", "question", "recap"],
      [2, "quiz", "correct", "answer"],
      [3, "community", "question", "community"],
    ]);
    // Difficulty shows on recap + answer, not the community slide.
    expect(slides.map((s) => s.showDifficulty)).toEqual([true, true, false]);
  });

  it("the recap slide never reveals the answer (state is question)", () => {
    const recap = expandPost("answer-reveal")[0];
    expect(recap.slideKind).toBe("recap");
    expect(recap.state).toBe("question");
  });

  it("expandPost returns fresh copies (callers can mutate safely)", () => {
    const a = expandPost("single-question");
    a[0].slug = "mutated";
    expect(expandPost("single-question")[0].slug).toBe("question");
  });

  it("guards reject unknown values", () => {
    expect(isPostType("single-question")).toBe(true);
    expect(isPostType("carousel")).toBe(false);
    expect(isSlideKind("quiz")).toBe(true);
    expect(isSlideKind("banner")).toBe(false);
  });
});
