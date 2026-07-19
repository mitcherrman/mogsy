/**
 * Neutral presentation contract for the InteractiveScenarioSurface (F1).
 *
 * This is a BOUNDED, promotable contract — deliberately NOT "the universal
 * question model". It reuses the mode-neutral ranked-core view types for
 * interaction (QuestionView / AnswerOptionView / InteractionPermissions) and
 * accepts an OPTIONAL, question-safe rich-visual source so premium art can be
 * derived via Broadcast intelligence WITHOUT the temporary placeholder fixture
 * schema (or any backend schema) leaking into components.
 *
 * Hidden-information rule (inherited from ranked-core): pre-reveal inputs
 * carry NO correctness and NO opponent-private content. The correct answer and
 * explanation live only in `SurfaceReveal`, which a controller may populate
 * ONLY from a backend-authoritative resolved round. `scenarioSource` must be
 * question-safe: it must never carry the correct answer.
 *
 * Convergence note (Path A): these fields are a strict, smaller cousin of
 * Mastery's `MasteryPlayerQuestion`. `answerType` here is implicitly
 * "single_choice"; numeric/boolean would become future interaction adapters.
 * See docs/f1-question-surface-convergence.md.
 */
import type { QuizQuestion } from "@/lib/quiz/api";
import type {
  AnswerOptionView,
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";

export type { AnswerOptionView, InteractionPermissions, QuestionView };

/** Layout/density presets. Variants affect PRESENTATION only, never behaviour. */
export type SurfaceVariant = "standard" | "competitive" | "tutorial" | "speed";

/** Neutral presentation settings — never mode identity (no isTutorial/isBot). */
export interface SurfaceSettings {
  density: "comfortable" | "compact";
  emphasis: "question" | "balanced";
  showExplanation: boolean;
  /** Premium visual band: "hero" (tall), "band" (compact), "none" (text-only). */
  mediaScale: "hero" | "band" | "none";
  motionLevel: "full" | "restrained" | "none";
}

/** Resolved variant → default settings. A controller may override per field. */
export const VARIANT_DEFAULTS: Record<SurfaceVariant, SurfaceSettings> = {
  standard: { density: "comfortable", emphasis: "balanced", showExplanation: true, mediaScale: "hero", motionLevel: "full" },
  competitive: { density: "compact", emphasis: "question", showExplanation: false, mediaScale: "band", motionLevel: "restrained" },
  tutorial: { density: "comfortable", emphasis: "question", showExplanation: false, mediaScale: "band", motionLevel: "restrained" },
  speed: { density: "compact", emphasis: "question", showExplanation: true, mediaScale: "none", motionLevel: "restrained" },
};

export function resolveSettings(
  variant: SurfaceVariant,
  overrides?: Partial<SurfaceSettings>,
): SurfaceSettings {
  return { ...VARIANT_DEFAULTS[variant], ...(overrides ?? {}) };
}

/**
 * Backend-authoritative reveal facts. Populate ONLY after a round resolves.
 * `correctOptionId` is the resolved-round correct option; never set it before
 * the backend has revealed the round.
 */
export interface SurfaceReveal {
  revealed: boolean;
  isCorrect?: boolean | null;
  correctOptionId?: string | null;
  explanation?: string | null;
}

/**
 * Optional question-safe rich-visual source. When present, the surface derives
 * premium scenario art through Broadcast's `selectScenario` (spoiler-gated).
 * When absent (e.g. the text-only placeholder bank), the surface renders a
 * polished text fallback. Must never carry the correct answer.
 */
export type ScenarioSource = QuizQuestion;
