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
import QuizAnswerFeedback, {
  type QuizFeedbackVerdict,
} from "@/components/quiz/QuizAnswerFeedback";
import { EvidenceLine } from "@/components/question-feedback/EvidenceLine";
import { VerdictLine } from "@/components/question-feedback/VerdictLine";
import type { ResolvedFeedback } from "@/lib/question-feedback/model";
import { AnswerGrid } from "@/components/ranked-arena/AnswerGrid";
import { ScenarioCard } from "@/components/quiz-broadcast/scenario-cards/ScenarioCard";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import { CompactScenarioBand } from "./CompactScenarioBand";
import { FamilyScenarioBand } from "./family/FamilyScenarioBand";
import { formatCategoryLabel } from "@/lib/question-surface/categoryLabel";
import { selectFamilyLayout, type FamilyLayout } from "@/lib/question-surface/familyLayout";
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
  /**
   * RG3 — the whole resolved-feedback model, for a surface whose card can be
   * JUDGED WITHOUT BEING DISCLOSED.
   *
   * `reveal` above cannot express that state: its `revealed` flag is both "the
   * player has been judged" and "the answer may be shown", and the Daily
   * Challenge's retry mechanic lives exactly in the gap between them. A first
   * miss is `verdict: "incorrect", scoreLocked: true, disclosureAllowed:
   * false` — a verdict, a struck-out option, and no answer.
   *
   * When supplied it is the authority for the correct option, the eliminated
   * set and the evidence, and the surface ALSO draws a verdict line, because a
   * surface that needs this model is one with no result strip of its own.
   * Ranked passes `reveal` instead and keeps its verdict where it already
   * resolves — in the arena's top strip — so there is never a second verdict
   * beside the first.
   */
  feedback?: ResolvedFeedback | null;
  /**
   * ARENA1 Step 5 — the MODE'S WORD for this resolution, or absent.
   *
   * Presentation copy and nothing else: it changes the explanation box's
   * headline and colour, and it changes nothing about what is disclosed. The
   * correct-answer line and the explanation are still gated on the
   * backend-authoritative fields above, so a mode cannot use this to reveal
   * anything or to claim a resolution that did not happen.
   *
   * It exists for the one state the shared two-word vocabulary cannot name: a
   * retry-until-correct card SOLVED after its scored attempt was spent. That
   * is neither "Correct!" nor "Incorrect", and shouting "Incorrect" in red at
   * the moment a learner finally gets it right is the loudest thing this
   * surface could say wrong about that mode. The words are the mode's because
   * only the mode has them — Ranked has no such state and passes nothing.
   */
  verdict?: QuizFeedbackVerdict | null;
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
 *  - "family": the payload describes a premise the subject-shaped cards cannot
 *    express — a combat RELATION (attacker → ability → target, with the stated
 *    quantities) or an item TRANSACTION (started with / kept / bought / sold).
 *    Renders the absolute-sized family band (RA7). Chosen FIRST, and only when
 *    `selectFamilyLayout` can support the payload completely.
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
 *
 * The family tier is decided from pre-reveal premise fields only and is
 * therefore reveal-invariant by construction: nothing it reads can change when
 * a round resolves, so the band cannot swap profile — or resize — mid-question.
 */
type ScenarioBandProfile = "family" | "cinematic" | "compact" | "none";

function resolveBandProfile(
  scenarioSource: ScenarioSource | null | undefined,
  mediaScale: SurfaceSettings["mediaScale"],
  familyLayout: FamilyLayout | null,
): ScenarioBandProfile {
  if (mediaScale === "none") return "none";
  if (familyLayout) return "family";
  if (!scenarioSource) return "compact";
  return selectScenario(scenarioSource, false, null).card === "empty" ? "compact" : "cinematic";
}

/** Premium scenario band. Family band for relation/transaction premises;
 * cinematic Broadcast card for rich subject content; a short, readable
 * CompactScenarioBand for low-content/text-driven scenarios. */
function HeroBand({
  profile,
  scenarioSource,
  question,
  reveal,
  settings,
  familyLayout,
}: {
  profile: ScenarioBandProfile;
  scenarioSource?: ScenarioSource | null;
  question: QuestionView;
  reveal?: SurfaceReveal | null;
  settings: SurfaceSettings;
  familyLayout: FamilyLayout | null;
}) {
  if (profile === "none") return null;
  if (profile === "family" && familyLayout) {
    return <FamilyScenarioBand layout={familyLayout} />;
  }
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
  // Compact density (competitive/speed) trades band size for above-the-fold
  // room: an active Ranked round must fit question + answers + HUD in a
  // desktop viewport, so the cinematic band is capped hard while comfortable
  // surfaces keep the tall presentation.
  const compactBand = settings.density === "compact";
  const bandMinHeight = compactBand ? "8rem" : "12.5rem";
  // QUIZ1 Phase 11 — the compact cap was set when a Ranked round had to fit
  // question + answers + ABILITY TRAY + status panel above the fold. R1
  // removed the tray and Phase 11 removed the XP row, so ~200px of that budget
  // came back and the band was left artificially short in the middle of a
  // half-empty viewport.
  //
  // The replacement is still self-limiting, and deliberately so: the cap is
  // whichever is SMALLER of a fixed ceiling and a fraction of the viewport, so
  // a short laptop screen keeps roughly the old height and only a tall desktop
  // spends the reclaimed room. The "must fit above the fold" rule the original
  // cap encoded is therefore intact — it is the fold that moved.
  const bandMaxHeight = compactBand ? "min(22rem, 34vh)" : "30rem";

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
        style={{ containerType: "size", aspectRatio, minHeight: bandMinHeight, maxHeight: bandMaxHeight }}
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
  feedback = null,
  verdict = null,
  context = null,
}: InteractiveScenarioSurfaceProps) {
  const settings = resolveSettings(variant, overrides);
  // Pre-reveal premise fields only — see resolveBandProfile. Recomputed per
  // render like the existing selectScenario call; both are pure and cheap.
  const familyLayout = selectFamilyLayout(scenarioSource);
  const bandProfile = resolveBandProfile(scenarioSource, settings.mediaScale, familyLayout);
  // ONE disclosure decision, whichever channel supplied it. `feedback` wins
  // where both are present, because it is the richer statement of the same
  // fact and a caller that passes it has said this surface's state is more
  // than "revealed or not".
  const revealed = feedback ? feedback.disclosureAllowed : reveal?.revealed === true;
  const revealedCorrectOptionId = revealed
    ? (feedback ? feedback.correctOptionId : (reveal?.correctOptionId ?? null))
    : null;
  const evidence = revealed
    ? (feedback ? feedback.evidence : (reveal?.evidence ?? null))
    : null;
  const eliminatedOptionIds = feedback?.eliminatedOptionIds ?? [];
  const correctLabel =
    revealedCorrectOptionId != null
      ? (question.options.find((o) => o.id === revealedCorrectOptionId)?.label ?? undefined)
      : undefined;
  const promptSize = settings.density === "compact" ? "text-base" : "text-lg";
  // 2-up answers on desktop for compact surfaces, but only when every label is
  // short enough to stay readable side by side; long-form answers keep the
  // single column. Image choices already manage their own 2-up grid.
  const wideTwoColumn =
    settings.density === "compact"
    && question.options.length >= 4
    && question.options.every((o) => o.label.length <= 44);

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
        familyLayout={familyLayout}
      />

      <header className="space-y-1">
        {/* Category shows once: in the compact band when that is shown, else here. */}
        {question.category && bandProfile !== "compact" && (
          // `scenario-category` is a styling HOOK, not new behaviour: the label
          // is the same backend category, formatted exactly the way the compact
          // band already formats it (underscores → spaces; the uppercasing is
          // the CSS that was always here). Presentation layers scope their own
          // treatment to this class.
          <span className="scenario-category text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {formatCategoryLabel(question.category)}
          </span>
        )}
        <h2 className={`${promptSize} font-semibold leading-snug`}>{question.prompt}</h2>
        {context && <p className="text-sm text-muted-foreground">{context}</p>}
      </header>

      {/* Answer interaction is the shared, reveal-safe AnswerGrid (→ QuizAnswerOptions,
          reused unchanged). role="group" keeps existing accessible native-button
          interaction; strict radiogroup is deferred to avoid changing Quiz-owned
          QuizAnswerOptions (see convergence doc). */}
      {/* Keyed on the QUESTION, so the grid's staggered entrance plays exactly
          once per question and never replays on an incidental rerender (a poll
          snapshot, a timer tick). QuizAnswerOptions keys its options by index,
          so without this the stagger would have run on unrelated remounts of
          this surface and NOT on the one thing that should trigger it. The
          scenario band deliberately sits outside this boundary: it keeps its own
          crossfade and its ambient loop is never interrupted. */}
      <div role="group" aria-label="Answer options" key={question.questionId}>
        <AnswerGrid
          options={question.options}
          selectedOptionId={selectedOptionId}
          permissions={permissions}
          onSelectOption={onSelectOption}
          revealedCorrectOptionId={revealedCorrectOptionId}
          wideTwoColumn={wideTwoColumn}
          eliminatedOptionIds={eliminatedOptionIds}
        />
      </div>

      {/* RG3 — the concise evidence beat.
          Rendered in EVERY variant, and deliberately NOT behind
          `showExplanation`: that flag governs the study-surface prose panel
          below, whereas this is one short line (or a two-row comparison) that
          says WHY the highlighted tablet is the right one. It is null for most
          questions and renders nothing at all then — no placeholder, no empty
          box — so a question with no authoritative evidence resolves to a
          verdict and a highlighted answer, which is complete and honest.
          It sits under the grid rather than over it so the tablets never
          move when a round settles. */}
      {/* The verdict, for a surface with no result strip of its own. Drawn
          from `feedback` ONLY — see the prop's note. It renders on an
          unresolved card too, which is the Daily's first miss: judged, score
          spent, answer withheld. */}
      {feedback?.verdict && (
        <VerdictLine
          verdict={feedback.verdict}
          // Short enough to survive the narrowest realistic column. The
          // longer wording ("…for this question") truncated to "SCORE LOCKED
          // FOR T…" at 340px, which reads as a broken string rather than as a
          // shortened one — and the card it sits on is the only question on
          // screen, so the qualifier was saying nothing anyway.
          note={
            feedback.scoreLocked && !feedback.resolved ? "score locked" : null
          }
        />
      )}

      {revealed && evidence && <EvidenceLine evidence={evidence} />}

      {revealed && settings.showExplanation && (
        <QuizAnswerFeedback
          result={{
            // The SAME channel precedence the disclosure decision above uses.
            // Reading `reveal` here while `feedback` decided the disclosure is
            // how a resolved card ends up drawn as an unanswered one.
            is_correct: feedback
              ? feedback.verdict === "correct"
              : reveal?.isCorrect === true,
            correct_answer: correctLabel,
            explanation: (feedback
              ? feedback.explanationOptional
              : reveal?.explanation) ?? undefined,
            // Absent for Ranked, the Tutorial and the quiz: the box keeps its
            // two-state verdict and its two colours.
            verdict,
          }}
        />
      )}
    </section>
  );
}
