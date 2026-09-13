/**
 * InteractiveScenarioSurface (F1) — premium interactive question surface for
 * Base Ranked.
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
import QuizAnswerFeedback, {
  type QuizFeedbackVerdict,
} from "@/components/quiz/QuizAnswerFeedback";
import { EvidenceLine } from "@/components/question-feedback/EvidenceLine";
import { VerdictLine } from "@/components/question-feedback/VerdictLine";
import type { ResolvedFeedback } from "@/lib/question-feedback/model";
import { AnswerGrid } from "@/components/ranked-arena/AnswerGrid";
import { ScenarioMediaBand } from "./ScenarioMediaBand";
import { CompactScenarioBand } from "./CompactScenarioBand";
import { FamilyScenarioBand } from "./family/FamilyScenarioBand";
import { formatCategoryLabel } from "@/lib/question-surface/categoryLabel";
import { selectFamilyLayout, type FamilyLayout } from "@/lib/question-surface/familyLayout";
import {
  resolveBandProfile,
  type ScenarioBandProfile,
} from "@/lib/question-surface/bandProfile";
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

/**
 * Band profile — the ONE rule, now in `@/lib/question-surface/bandProfile` so
 * the Content Factory's completeness gate can ask the same question this
 * component asks, before the page mounts. Moved verbatim (CON1 Step 1D); the
 * rendered result is unchanged.
 */

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
  return (
    <ScenarioMediaBand
      source={scenarioSource!}
      aspect={settings.mediaScale as "hero" | "band"}
      compact={settings.density === "compact"}
      motionLevel={settings.motionLevel}
      revealActive={revealed}
      correctAnswer={correctAnswer}
    />
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
      /**
       * THE THREE REGIONS OF THE QUESTION CARD (ARENA1 Phase 1).
       *
       * `question-surface-stack` replaces the `space-y-3` this section carried,
       * and the three children below are marked `data-surface-region` so ONE
       * canonical rule can reserve each one's height (see index.css, "THE
       * CANONICAL QUESTION STAGE"). That reservation is what stops a media
       * question growing the arena and a short question shrinking it, and it is
       * what pins the answer tablets to one coordinate for every round.
       *
       * The regions are the same three things this stack always rendered, in the
       * same order, with the same contents — the band, the prompt header, the
       * answer grid. Nothing here decides a height; the stage does, and a caller
       * that is not the arena stage sets no tokens and gets the intrinsic stack
       * it always got.
       */
      className="question-surface-stack"
    >
      {/* The MEDIA region. Rendered only when there IS a band, so a text-only
          surface (`mediaScale: "none"`) still stacks prompt-then-answers with no
          empty box between them. */}
      {bandProfile !== "none" && (
        <div data-surface-region="media">
          <HeroBand
            profile={bandProfile}
            scenarioSource={scenarioSource}
            question={question}
            reveal={reveal}
            settings={settings}
            familyLayout={familyLayout}
          />
        </div>
      )}

      <header data-surface-region="prompt" className="space-y-1">
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
      <div data-surface-region="answers" role="group" aria-label="Answer options"
        key={question.questionId}>
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
