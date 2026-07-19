/**
 * InteractiveScenarioSurface (F1) — premium interactive question surface for
 * Base Ranked and the Ranked Tutorial.
 *
 * "The original League Quiz evolved into a premium competitive battle."
 *
 * It COMPOSES (never duplicates) three shared systems:
 *  - Broadcast intelligence + visual primitives (ScenarioCard / ScenarioCardFrame,
 *    driven by the pure selectScenario/spoiler logic) for premium subject art;
 *  - Quiz interaction (AnswerGrid → QuizAnswerOptions) + QuizAnswerFeedback;
 *  - Ranked-controlled InteractionPermissions + backend-authoritative reveal.
 *
 * It does NOT: mount BroadcastRenderer, duplicate QuizAnswerOptions, compute
 * correctness/damage/XP, or read the correct answer pre-reveal. The combat shell
 * (HP/XP/timer/abilities/submission lifecycle/settlement) stays OUTSIDE this
 * component — the surface owns only the question hero + answer selection (+ an
 * optional reveal treatment that never conflicts with Ranked's RevealPanel).
 *
 * Variants change layout/density ONLY — there are no isTutorial/isRanked/isBot
 * branches. A mode passes `variant` and optional neutral `settings`.
 */
import { MotionConfig } from "framer-motion";
import QuizAnswerFeedback from "@/components/quiz/QuizAnswerFeedback";
import { AnswerGrid } from "@/components/ranked-arena/AnswerGrid";
import { ScenarioCard } from "@/components/quiz-broadcast/scenario-cards/ScenarioCard";
import { ScenarioCardFrame } from "@/components/quiz-broadcast/scenario-cards/ScenarioCardFrame";
import {
  AnswerOptionView,
  InteractionPermissions,
  QuestionView,
  resolveSettings,
  ScenarioSource,
  SurfaceReveal,
  SurfaceSettings,
  SurfaceVariant,
} from "@/lib/question-surface/contract";

export interface InteractiveScenarioSurfaceProps {
  /** Neutral interaction data (prompt/options/category); carries no correctness. */
  question: QuestionView;
  selectedOptionId: string | null;
  permissions: InteractionPermissions;
  onSelectOption: (option: AnswerOptionView) => void;
  /** Presentation preset; defaults to "standard". */
  variant?: SurfaceVariant;
  /** Per-field overrides of the variant defaults (density/emphasis/media/motion). */
  settings?: Partial<SurfaceSettings>;
  /** Optional question-safe rich-visual source → premium scenario art. */
  scenarioSource?: ScenarioSource | null;
  /** Backend-authoritative reveal facts; omit/null pre-reveal. */
  reveal?: SurfaceReveal | null;
  /** Optional short context line under the prompt. */
  context?: string | null;
}

const BAND_ASPECT: Record<Exclude<SurfaceSettings["mediaScale"], "none">, string> = {
  hero: "16 / 9",
  band: "16 / 6",
};

/** Premium hero band. Rich scenario art when a source exists, else a polished
 * text-frame fallback (reuses ScenarioCardFrame with no background — never a
 * broken empty media area). Sized as a container-query box so the reused
 * cqmin-based Broadcast cards resolve correctly inline. */
function HeroBand({
  scenarioSource,
  question,
  reveal,
  settings,
}: {
  scenarioSource?: ScenarioSource | null;
  question: QuestionView;
  reveal?: SurfaceReveal | null;
  settings: SurfaceSettings;
}) {
  if (settings.mediaScale === "none") return null;
  const revealed = reveal?.revealed === true;
  // Correct answer is passed to the scenario visual ONLY post-reveal; pre-reveal
  // it is null so spoiler subjects stay hidden (hidden-information safe).
  const correctAnswer =
    revealed && reveal?.correctOptionId != null
      ? (question.options.find((o) => o.id === reveal.correctOptionId)?.label ?? null)
      : null;
  const aspectRatio = BAND_ASPECT[settings.mediaScale];
  const reducedMotion: "never" | "user" = settings.motionLevel === "full" ? "never" : "user";

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div
        data-testid="scenario-hero"
        className="@container relative w-full overflow-hidden rounded-xl bg-black/30"
        style={{ containerType: "size", aspectRatio }}
      >
        {scenarioSource ? (
          <ScenarioCard question={scenarioSource} revealActive={revealed} correctAnswer={correctAnswer} />
        ) : (
          // Polished DECORATIVE text fallback: the shared cinematic frame with
          // no splash. The prompt itself stays in the readable header (never
          // duplicated here) so it is never overpowered by the band.
          <div className="flex h-full w-full items-center justify-center" data-testid="scenario-hero-fallback">
            <ScenarioCardFrame
              backgroundUrl={null}
              backgroundAlt=""
              gradientClass="bg-gradient-to-t from-black/70 via-black/30 to-transparent"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1.4cqmin] px-[6%] text-center">
                <span className="text-[1.9cqmin] font-bold uppercase tracking-[0.34em] text-[#e8c97a]/85">
                  {question.category || "Ranked"}
                </span>
                <span className="text-[1.5cqmin] font-medium uppercase tracking-[0.3em] text-white/45">
                  Knowledge Battle
                </span>
              </div>
            </ScenarioCardFrame>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

export function InteractiveScenarioSurface({
  question,
  selectedOptionId,
  permissions,
  onSelectOption,
  variant = "standard",
  settings: overrides,
  scenarioSource = null,
  reveal = null,
  context = null,
}: InteractiveScenarioSurfaceProps) {
  const settings = resolveSettings(variant, overrides);
  const revealed = reveal?.revealed === true;
  const revealedCorrectOptionId = revealed ? (reveal?.correctOptionId ?? null) : null;
  const correctLabel =
    revealedCorrectOptionId != null
      ? (question.options.find((o) => o.id === revealedCorrectOptionId)?.label ?? undefined)
      : undefined;
  const promptSize = settings.density === "compact" ? "text-base" : "text-lg";

  return (
    <section
      aria-label="Question"
      data-testid="scenario-surface"
      data-variant={variant}
      data-media={settings.mediaScale}
      className="space-y-3"
    >
      <HeroBand scenarioSource={scenarioSource} question={question} reveal={reveal} settings={settings} />

      <header className="space-y-1">
        {/* Category shows once: in the decorative fallback hero if present, else here. */}
        {question.category && !(settings.mediaScale !== "none" && !scenarioSource) && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {question.category}
          </span>
        )}
        <h2 className={`${promptSize} font-semibold leading-snug`}>{question.prompt}</h2>
        {context && <p className="text-sm text-muted-foreground">{context}</p>}
      </header>

      {/* Answer interaction is the shared, reveal-safe AnswerGrid (→ QuizAnswerOptions,
          reused unchanged). role="group" keeps existing accessible native-button
          interaction; strict radiogroup is deferred to avoid changing Quiz-owned
          QuizAnswerOptions (see convergence doc). */}
      <div role="group" aria-label="Answer options">
        <AnswerGrid
          options={question.options}
          selectedOptionId={selectedOptionId}
          permissions={permissions}
          onSelectOption={onSelectOption}
          revealedCorrectOptionId={revealedCorrectOptionId}
        />
      </div>

      {revealed && settings.showExplanation && (
        <QuizAnswerFeedback
          result={{
            is_correct: reveal?.isCorrect === true,
            correct_answer: correctLabel,
            explanation: reveal?.explanation ?? undefined,
          }}
        />
      )}
    </section>
  );
}
