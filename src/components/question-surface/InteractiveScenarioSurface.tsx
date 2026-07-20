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
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import { CompactScenarioBand } from "./CompactScenarioBand";
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

// Cinematic band aspect ratios. The reused Broadcast cards size their foreground
// in cqmin (min container dimension), which in this inline band is the HEIGHT — so
// a taller band scales the subject art/labels UP. "band" was 16/6; 16/7 gives the
// competitive/tutorial variants a noticeably larger, more legible subject without
// tipping into an over-tall cinematic panel (weak scenarios already go compact).
const BAND_ASPECT: Record<Exclude<SurfaceSettings["mediaScale"], "none">, string> = {
  hero: "16 / 9",
  band: "16 / 7",
};

/**
 * Presentation of the scenario band, chosen by CONTENT CAPABILITY (never mode
 * identity):
 *  - "cinematic": the source resolves to a real premium visual — champion
 *    splash, item/recipe, combat calc, a framed collectible, OR a spoiler-hidden
 *    subject (placeholder card) that will reveal into a rich subject. Keeps the
 *    tall container-query box the Broadcast cards were designed for.
 *  - "compact": no source, or a source that classifies to nothing worth a
 *    cinematic panel ("empty"). Renders the short absolute-sized CompactScenarioBand
 *    instead of reserving a large, mostly-empty cqmin panel.
 *
 * Reusing selectScenario (the exact classifier the cinematic card itself uses,
 * called spoiler-safely with revealActive=false / correctAnswer=null) keeps the
 * decision consistent with what would actually render and avoids a second
 * capability heuristic. A spoiler subject classifies to "placeholder", so it
 * stays cinematic and the band does NOT resize when the reveal arrives.
 */
type ScenarioBandProfile = "cinematic" | "compact" | "none";

function resolveBandProfile(
  scenarioSource: ScenarioSource | null | undefined,
  mediaScale: SurfaceSettings["mediaScale"],
): ScenarioBandProfile {
  if (mediaScale === "none") return "none";
  if (!scenarioSource) return "compact";
  return selectScenario(scenarioSource, false, null).card === "empty" ? "compact" : "cinematic";
}

/** Premium scenario band. Cinematic Broadcast card for rich content; a short,
 * readable CompactScenarioBand for low-content/text-driven scenarios. */
function HeroBand({
  profile,
  scenarioSource,
  question,
  reveal,
  settings,
}: {
  profile: ScenarioBandProfile;
  scenarioSource?: ScenarioSource | null;
  question: QuestionView;
  reveal?: SurfaceReveal | null;
  settings: SurfaceSettings;
}) {
  if (profile === "none") return null;
  if (profile === "compact") return <CompactScenarioBand category={question.category} />;

  const revealed = reveal?.revealed === true;
  // Correct answer is passed to the scenario visual ONLY post-reveal; pre-reveal
  // it is null so spoiler subjects stay hidden (hidden-information safe).
  const correctAnswer =
    revealed && reveal?.correctOptionId != null
      ? (question.options.find((o) => o.id === reveal.correctOptionId)?.label ?? null)
      : null;
  const aspectRatio = BAND_ASPECT[settings.mediaScale as "hero" | "band"];
  const reducedMotion: "never" | "user" = settings.motionLevel === "full" ? "never" : "user";

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div
        data-testid="scenario-hero"
        className="@container relative w-full overflow-hidden rounded-xl bg-black/30"
        // minHeight floors the container-query box on narrow viewports (where the
        // band would otherwise collapse and shrink every cqmin unit into
        // illegibility); maxHeight caps it on ultra-wide columns. Between the two
        // the aspect ratio drives height, so the subject art gets more room and
        // reads larger without an over-tall panel.
        style={{ containerType: "size", aspectRatio, minHeight: "12.5rem", maxHeight: "30rem" }}
      >
        <ScenarioCard question={scenarioSource!} revealActive={revealed} correctAnswer={correctAnswer} />
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
  const bandProfile = resolveBandProfile(scenarioSource, settings.mediaScale);
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
      data-band={bandProfile}
      className="space-y-3"
    >
      <HeroBand
        profile={bandProfile}
        scenarioSource={scenarioSource}
        question={question}
        reveal={reveal}
        settings={settings}
      />

      <header className="space-y-1">
        {/* Category shows once: in the compact band when that is shown, else here. */}
        {question.category && bandProfile !== "compact" && (
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
