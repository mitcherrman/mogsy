/**
 * Content post structures for the screenshot factory.
 *
 * A "content post" is an ordered sequence of slides (carousel), each rendered
 * as one social capture inside the premium phone composition. Pure module: the
 * runner expands a post type into slide specs and captures each in order.
 *
 * Slide kinds (what fills the phone card):
 *   quiz       — the real quiz card at a given answer state (question/correct)
 *   app-cta    — a clean "play in the app" call-to-action slide
 *   recap      — a suspense/bridge slide that re-shows the question, no answer
 *   community  — a discussion/comments follow-up slide
 *
 * Post types:
 *   single-question — [quiz:question] + [app-cta]
 *   answer-reveal   — [recap] + [quiz:correct] + [community]
 */
import type { RenderState } from "./types";

export const SLIDE_KINDS = ["quiz", "app-cta", "recap", "community"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];

export const POST_TYPES = ["single-question", "answer-reveal"] as const;
export type PostType = (typeof POST_TYPES)[number];

export type SlideSpec = {
  /** 1-based position in the carousel. */
  index: number;
  slideKind: SlideKind;
  /** Quiz answer state for quiz slides; the reference state otherwise. */
  state: RenderState;
  /** Short slug used in the output filename (e.g. "question", "app-cta"). */
  slug: string;
  /** Whether this slide shows the difficulty/rank badge. */
  showDifficulty: boolean;
};

export function isPostType(value: unknown): value is PostType {
  return typeof value === "string" && (POST_TYPES as readonly string[]).includes(value);
}

export function isSlideKind(value: unknown): value is SlideKind {
  return typeof value === "string" && (SLIDE_KINDS as readonly string[]).includes(value);
}

const POST_SLIDES: Record<PostType, SlideSpec[]> = {
  // Single-question post: the engagement question, then an app-CTA push.
  "single-question": [
    { index: 1, slideKind: "quiz", state: "question", slug: "question", showDifficulty: true },
    { index: 2, slideKind: "app-cta", state: "question", slug: "app-cta", showDifficulty: false },
  ],
  // Answer-reveal post: suspense recap, the answer, then a community prompt.
  "answer-reveal": [
    { index: 1, slideKind: "recap", state: "question", slug: "recap", showDifficulty: true },
    { index: 2, slideKind: "quiz", state: "correct", slug: "answer", showDifficulty: true },
    { index: 3, slideKind: "community", state: "question", slug: "community", showDifficulty: false },
  ],
};

/** Ordered slide specs for a post type. */
export function expandPost(postType: PostType): SlideSpec[] {
  return POST_SLIDES[postType].map((s) => ({ ...s }));
}
