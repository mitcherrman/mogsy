/**
 * Core types for the quiz screenshot content factory.
 *
 * Pure module: no fetch, no fs, no browser globals — shared by the render
 * harness page (/dev/quiz-render), the Playwright runner
 * (scripts/quiz-screenshots), and unit tests.
 */

export type RenderChoice = {
  label: string;
  image_path?: string;
};

/**
 * Deterministic, self-contained question payload for the render harness.
 * Unlike the player-facing QuizQuestion (which never carries the answer),
 * this shape includes correct_index because reveal states need it — it is
 * only ever injected locally by the runner or repo fixtures, never fetched
 * by the page.
 */
export type RenderQuestion = {
  id: number | string;
  /**
   * Stored `question_key` from the review row, when it carried one.
   *
   * Identity for REPORTING only — the completeness gate names the row a
   * failure belongs to. Nothing derives behaviour from it: mapping a key back
   * to a generator family is backend knowledge (`quiz.generator_registry`) and
   * duplicating it here is exactly the family map CON1 must not create.
   */
  question_key?: string;
  question_text: string;
  choices: RenderChoice[];
  /** Index into choices. */
  correct_index: number;
  explanation?: string;
  category?: string;
  difficulty?: number;
  /** Top-level question visual (e.g. "assets/items/3161.png"). */
  image_path?: string;
  /**
   * Raw stored metadata — REVIEW/DEBUG ONLY, and answer-bearing.
   *
   * It drives incidental screenshot chrome (difficulty tier, the Pro data
   * source line, item recipes) and it must NEVER be read as a scenario
   * premise: it is the complete stored blob, solution fields included.
   */
  metadata?: Record<string, unknown>;
  /**
   * CON1 — the canonical SAFE pre-answer premise, projected by the BACKEND
   * (`quiz.premise_projection.build_presentation`) and carried verbatim from
   * the review row's `presentation` field.
   *
   * This, and only this, is what the render harness may draw a scenario from.
   * ABSENT (not empty) when the family — or the row's form within it —
   * declares no safe premise; a missing premise renders as text, never as a
   * premise reconstructed from `metadata`.
   */
  presentation?: Record<string, unknown>;
};

export const RENDER_STATES = [
  "question",
  "selected",
  "correct",
  "incorrect",
  "explanation",
] as const;

export type RenderState = (typeof RENDER_STATES)[number];

export type FormatKind = "social" | "audit";

export type CtaMode = "full" | "compact" | "none";

export type RenderFormat = {
  key: string;
  width: number;
  height: number;
  kind: FormatKind;
  /** Max content column width in px for social composition shells. */
  contentMaxWidth: number;
  /** Safe-area padding in px (social shells keep content away from platform UI). */
  safeAreaPadding: number;
  /**
   * Content shell upscale factor: the card renders at a mobile-native width
   * and is CSS-scaled by this factor so it fills the frame (text stays
   * vector-crisp). 1 = no scaling (audit formats).
   */
  contentScale: number;
  /** CTA footer treatment for this format ("none" on audit formats). */
  cta: CtaMode;
  description: string;
};

/** Resolved per-capture answer plan (derived deterministically from state). */
export type AnswerPlan = {
  /** Index of the visually selected choice, or null (question state). */
  selectedIndex: number | null;
  /** Whether reveal styling (judged answer) is shown. */
  revealed: boolean;
  /** Whether the selected answer is the correct one (only meaningful when revealed). */
  isCorrectSelection: boolean;
  /** Whether explanation text is shown in the feedback panel. */
  showExplanation: boolean;
};

export type PlanResult =
  | { kind: "render"; plan: AnswerPlan }
  | { kind: "skip"; reason: string };

/** Payload the runner injects into the page as window.__MOGSY_QUIZ_RENDER__. */
export type QuizRenderInjection = {
  questions: RenderQuestion[];
};

export const QUIZ_RENDER_WINDOW_KEY = "__MOGSY_QUIZ_RENDER__";
/**
 * Structured presentation outcome the harness stamps on the question card, and
 * the ONLY channel the capture runner reads it through. Attributes, not text:
 * the gate must never be a heuristic over rendered words.
 */
export const PRESENTATION_STATUS_ATTRIBUTE = "data-quiz-presentation";
export const PRESENTATION_BAND_ATTRIBUTE = "data-quiz-presentation-band";
export const PRESENTATION_REASON_ATTRIBUTE = "data-quiz-presentation-reason";
export const READY_ATTRIBUTE = "data-quiz-render-ready";
export const STAGE_SELECTOR = "[data-quiz-render-stage]";
export const ERROR_SELECTOR = "[data-quiz-render-error]";
