/**
 * /dev/quiz-render — deterministic screenshot render harness.
 *
 * Renders ONE quiz question in a controlled state and format using the REAL
 * production quiz components (QuizAnswerOptions / QuizAnswerFeedback).
 *
 * Data source: window.__MOGSY_QUIZ_RENDER__ = { questions: RenderQuestion[] },
 * injected locally by the Playwright runner before navigation. The page never
 * fetches question data, never writes anywhere, and holds no credentials. In
 * dev mode with no injected data it falls back to repo fixtures; in
 * production with no injected data it renders an inert notice — so the route
 * exposes nothing when reached directly.
 *
 * Query params:  ?q=<question id>&state=<state>&format=<format>[&answerIndex=<n>]
 *
 * Determinism: framer-motion animations are globally skipped while this page
 * is mounted, no timers run, answer order is never reshuffled, and the root
 * gains data-quiz-render-ready="true" only after fonts and all images have
 * settled.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MotionGlobalConfig } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuizAnswerOptions from "@/components/quiz/QuizAnswerOptions";
import QuizAnswerFeedback from "@/components/quiz/QuizAnswerFeedback";
import ProDataSourceLink from "@/components/quiz/ProDataSourceLink";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import ProPlayQuestionCard from "@/components/pro-play/ProPlayQuestionCard";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  rendersThroughProPlayCard,
  rendersThroughScenarioSurface,
  resolveScenarioPresentation,
} from "@/lib/quiz-screenshot/presentation";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { getFormat } from "@/lib/quiz-screenshot/formats";
import { isRenderState, resolveAnswerPlan } from "@/lib/quiz-screenshot/states";
import { SAMPLE_RENDER_QUESTIONS } from "@/lib/quiz-screenshot/fixtures";
import { deriveRecipe } from "@/lib/quiz-screenshot/recipe";
import {
  resolveDifficulty,
  type DifficultyInfo,
} from "@/lib/quiz-screenshot/difficulty";
import { isSlideKind, type SlideKind } from "@/lib/quiz-screenshot/content-posts";
import {
  isMidCtaVariantId,
  isRepeatVariantId,
  midCtaCopy,
  repeatCopy,
} from "@/lib/quiz-screenshot/challenge";
import { answerPromptCopy } from "@/lib/quiz-screenshot/cta";
import { QuizCtaQr, QuizCtaRail, QuizCtaTop } from "./QuizCta";
import RecipeVisual from "./RecipeVisual";
import DifficultyBadge from "./DifficultyBadge";
import {
  AnswerSummarySlide,
  AppCtaSlide,
  ChallengeEndingSlide,
  ChallengeOpeningSlide,
  CommunitySlide,
} from "./ContentSlides";
import {
  QUIZ_RENDER_WINDOW_KEY,
  type AnswerPlan,
  type QuizRenderInjection,
  type RenderFormat,
  type LayoutFamily,
  type RenderQuestion,
  type RenderState,
} from "@/lib/quiz-screenshot/types";

// Must be set BEFORE any motion element mounts, or entry animations freeze at
// their initial (opacity 0) pose. Module scope runs at lazy-import time, so
// this only ever applies when the harness route itself is loaded. The page
// restores the previous value on unmount.
const PREV_SKIP_ANIMATIONS = MotionGlobalConfig.skipAnimations;
MotionGlobalConfig.skipAnimations = true;

/**
 * The width the folio is LAID OUT at, before the shell's zoom.
 *
 * Portrait and square keep the mobile-native 420: the shape they publish is a
 * phone-shaped reading column, and the production components were designed
 * against it.
 *
 * Landscape needs a genuinely different sheet, and a bigger zoom is not it. A
 * 420-wide card is roughly square once it has a prompt, a band, four answers
 * and a result area, and the landscape content column is 1.42:1 — so height
 * binds first and the card can never fill the frame no matter how far it is
 * scaled. Laying it out WIDE makes it short: the prompt stops wrapping, and
 * the answers go two-up (see the layout-scoped rule in the shell's style
 * block), so the sheet ends up the shape the frame actually is.
 */
const BASE_CONTENT_WIDTH_BY_FAMILY: Record<LayoutFamily, number> = {
  portrait: 420,
  square: 420,
  landscape: 640,
};

/**
 * CON1 Step 4 — the academy visual system, reused rather than reinvented.
 *
 * The stage carries `ranked-academy` and the card carries `ranked-folio`, the
 * two class hooks the LIVE Ranked arena already uses (`ArenaShell`,
 * `CanonicalArena`). Every rule they activate lives in `index.css` and is
 * written against the shared question surface, the shared answer grid and
 * `QuizAnswerFeedback` — the exact components this harness renders. So the
 * card becomes a vellum folio with carved navy answer tablets, a brass
 * scenario-category rule and paper-toned feedback, from production CSS,
 * without a single value being copied into the factory.
 *
 * What the factory still owns, and what the constants below are for: the
 * ground the folio sits on, the brand chrome around it, and the two states
 * Ranked deliberately does not have an opinion about in a STATIC post (the
 * pre-reveal engagement prompt, and a correct answer that has to read as
 * correct on its own — Ranked's own reveal is a separate banner).
 */
const ACADEMY_FACE = '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif';
const ACADEMY_GOLD_BRIGHT = "#e2c987";
/** Brass INK — for factory copy printed on the vellum folio itself, where the
 *  bright gold used on the dark ground reads as a highlight rather than as
 *  writing. Mirrors the folio's own `.scenario-category` colour. */
const ACADEMY_INK_BRASS = "#6d5626";
/** The chamber the Ranked arena is set in — the same painting, so the factory
 *  and the live product are demonstrably the same room. Served from `public/`,
 *  and mounted as a real <img> so it participates in the harness's
 *  image-readiness wait and its missing-asset QA. */
const ACADEMY_GROUND_SRC = "/assets/ranked/ranked-academy-duel-bg.png";

/** Screenshot-only headroom over the format's nominal contentScale, so the
 *  quiz card can grow to fill the phone screen (the fit is still bounded by
 *  the real width/height budget — this only lifts the cap). */
const CONTENT_SCALE_HEADROOM = 1.45;

function readInjectedQuestions(): RenderQuestion[] | null {
  const injected = (window as unknown as Record<string, unknown>)[QUIZ_RENDER_WINDOW_KEY] as
    | QuizRenderInjection
    | undefined;
  if (injected && Array.isArray(injected.questions)) return injected.questions;
  return null;
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      data-quiz-render-error
      className="min-h-screen flex items-center justify-center bg-background text-foreground p-8"
    >
      <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
        <p className="font-semibold mb-1">Quiz render harness</p>
        <p>{message}</p>
      </div>
    </div>
  );
}

/**
 * Waits for fonts + images, then (for social formats) measures the unscaled
 * card and fits the zoom to BOTH the frame width and the height left over by
 * the CTA footer — so no content ever clips or collides with the footer —
 * and only then stamps the ready attribute on the stage.
 */
function useRenderReady(
  enabled: boolean,
  format: RenderFormat | undefined,
  forcedScale?: number,
) {
  const baseWidth = format ? BASE_CONTENT_WIDTH_BY_FAMILY[format.layoutFamily] : 420;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  /**
   * CON1 Step 4 — the card's own height, quantized to an 8px block.
   *
   * The 8px quantization already existed, but only as an INPUT to the zoom fit
   * (see the note below). That kept the two captures' zoom identical while
   * leaving their rects free to differ by whatever the unzoomed layout
   * differed by — and on the longest row in the corpus that was one unzoomed
   * pixel, which the zoom then magnified to two and the geometry gate caught.
   * Quantizing the card's BOX by the same block makes the two rects identical
   * as well, instead of merely nearly so. It only ever grows the box, so it
   * can neither clip content nor change the fit that produced it.
   */
  const [quantizedH, setQuantizedH] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !format) return;
    let cancelled = false;
    (async () => {
      try {
        await document.fonts?.ready;
      } catch {
        /* font API unavailable — proceed */
      }
      const imgs = Array.from(stageRef.current?.querySelectorAll("img") ?? []);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.addEventListener("load", () => res(), { once: true });
                img.addEventListener("error", () => res(), { once: true });
              }),
        ),
      );
      if (cancelled) return;
      if (format.kind === "social" && cardRef.current) {
        // Measured in EVERY state, including the forced-scale ones — a state
        // that skipped this would keep its natural height and defeat the
        // point of quantizing at all.
        setQuantizedH(Math.ceil(cardRef.current.scrollHeight / 8) * 8);
      }
      if (forcedScale !== undefined && format.kind === "social") {
        // State-independent envelope: the runner captures the question state
        // first, reads the fitted scale, and FORCES the same scale onto every
        // other state of the same question/format — the zoom is computed once
        // per question, never independently per state.
        setScale(forcedScale);
      } else if (format.kind === "social" && centerRef.current && cardRef.current) {
        const availH = centerRef.current.clientHeight;
        // Width budget comes from the actual center area (the phone screen
        // interior) — identical in both states by construction.
        const availW = Math.min(format.contentMaxWidth, centerRef.current.clientWidth - 8);
        // Measured at zoom 1, then quantized UP to an 8px block: the question
        // and correct states of one question may differ by a pixel or two of
        // integer scrollHeight noise (reveal styling/subpixel rounding), and
        // the fitted zoom — and therefore every box position — must come out
        // IDENTICAL for both captures. Quantizing the input absorbs that
        // noise without changing the fit meaningfully.
        const cardH = Math.ceil(cardRef.current.scrollHeight / 8) * 8;
        const maxScale = format.contentScale * CONTENT_SCALE_HEADROOM;
        const fit = Math.min(
          maxScale,
          availW / baseWidth,
          cardH > 0 ? availH / cardH : maxScale,
        );
        // Quantize the scale itself too, so equal-block heights can never
        // produce different zooms through float noise.
        setScale(Math.max(0.5, Math.floor(fit * 200) / 200));
      }
      // Two frames so layout from the zoom/font/image swaps settles.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!cancelled) stageRef.current?.setAttribute("data-quiz-render-ready", "true");
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, format, forcedScale, baseWidth]);
  return { stageRef, centerRef, cardRef, scale, quantizedH };
}

/** Per-slide challenge presentation (multi-question posts). */
type ChallengeSlideInfo = {
  number: number;
  total: number;
  repeat?: { line1: string; line2: string };
  midCta?: string;
};

function QuestionCard({
  question,
  plan,
  format,
  variant = "quiz",
  difficulty,
  challenge,
}: {
  question: RenderQuestion;
  plan: AnswerPlan;
  format: RenderFormat;
  /** "quiz" = normal question/answer card; "recap" = suspense bridge slide
   *  (same composition, swipe banner instead of the comment CTA). */
  variant?: "quiz" | "recap";
  difficulty?: DifficultyInfo | null;
  /** When set, this is a challenge question slide: the reserved result area
   *  shows progress + "LOCK IN YOUR ANSWER" instead of the comment CTA
   *  (viewers keep score — we do not ask for a comment per question). */
  challenge?: ChallengeSlideInfo | null;
}) {
  const { selectedIndex, revealed, isCorrectSelection, showExplanation } = plan;
  /**
   * CON1 Step 1C — the scenario premise, resolved through the PRODUCTION path.
   *
   * `resolveScenarioPresentation` reads `question.presentation` (the backend's
   * canonical safe projection) and nothing else, then runs it through the same
   * envelope → adapter → layout-authority chain Admin Review uses. A question
   * with no presentation, or one the layout authority cannot draw, comes back
   * with no model and this card renders exactly as it always did.
   */
  const presentation = resolveScenarioPresentation(question);
  const scenarioModel = rendersThroughScenarioSurface(presentation)
    ? presentation.model
    : null;
  /**
   * CON1 Step 5 — the PRODUCTION Pro Play card, mounted rather than imitated.
   *
   * `ProPlayQuestionCard` is the component `ProPlayQuiz` renders, composing
   * `ProPlayContextRail`, `ProPlayChampionAnchor` and `ProPlaySubjectCards`
   * over the same frozen `pre_answer()` object the server sends a player. The
   * factory supplies the answer grid as its children — which is exactly the
   * contract the card declares — so the tablets stay the shared
   * `QuizAnswerOptions` the rest of the harness draws.
   *
   * Mutually exclusive with `scenarioModel` by construction: the resolver
   * returns `pro-context` or a band status, never both.
   */
  const proContext = rendersThroughProPlayCard(presentation)
    ? presentation.proContext
    : null;
  /**
   * The subject artwork this card expects, or null. See the
   * `data-quiz-expected-image` attribute below for why it exists.
   */
  const proAnchorMedia = proContext?.anchor?.media;
  /**
   * A cinematic band does NOT always intend to draw art. When the subject is
   * the answer, `selectScenario` deliberately returns a `placeholder` card
   * pre-reveal — the "REVEAL INCOMING" plate — and an absent image there is the
   * design, not a failure. Measured: without this, every pre-reveal frozen
   * Daily item card reported an unresolved image.
   *
   * The distinction is the production selector's own, asked with the reveal
   * state this capture is actually in, so the declaration tracks the spoiler
   * rule instead of restating it. `placeholder` is only ever reached through
   * `shouldHide`; it is never a fallback for art that failed to load, which is
   * what makes it safe to treat as "no image expected".
   */
  const cinematicCard =
    presentation.band === "cinematic" && scenarioModel
      ? selectScenario(scenarioModel.scenarioSource, revealed, null).card
      : null;
  const expectedImage =
    cinematicCard && cinematicCard !== "placeholder" && cinematicCard !== "empty"
      ? `cinematic:${cinematicCard}`
      : proAnchorMedia?.kind === "champion" && proAnchorMedia.key
        ? `champion:${proAnchorMedia.key}`
        : null;
  // Item-build questions get a recipe layout in content (social) formats;
  // audit formats keep the plain production-page visual. deriveRecipe never
  // exposes the missing component before reveal.
  const recipe = format.kind === "social" ? deriveRecipe(question, revealed) : null;

  const selectedAnswer = selectedIndex !== null ? question.choices[selectedIndex].label : null;
  const answerResult = revealed
    ? { correct_answer: question.choices[question.correct_index].label }
    : null;
  const feedback = revealed
    ? {
        is_correct: isCorrectSelection,
        correct_answer: question.choices[question.correct_index].label,
        explanation: showExplanation ? question.explanation : undefined,
      }
    : null;
  const mainVisual = resolveQuizAssetUrl(question.image_path);

  /**
   * Screenshot state → the surface's neutral props. The option ids come off
   * the adapted view itself, so the selected and correct tablets can never
   * drift from the options actually rendered. The reveal object carries only
   * what the harness already knows from the render plan; no explanation is
   * passed, because the "competitive" variant leaves the explanation to the
   * card's own reserved result area below (one feedback panel, not two).
   */
  const surfaceOptions = scenarioModel?.question.options ?? [];
  const surfaceSelectedOptionId =
    selectedIndex !== null ? (surfaceOptions[selectedIndex]?.id ?? null) : null;
  const surfaceReveal = revealed
    ? {
        revealed: true,
        isCorrect: isCorrectSelection,
        correctOptionId: surfaceOptions[question.correct_index]?.id ?? null,
      }
    : null;

  return (
    <Card
      /**
       * CON1 Step 4 — the card IS the arena's folio.
       *
       * `ranked-panel ranked-folio` is the exact pair `CanonicalArena` puts on
       * the live question box. Inside the stage's `ranked-academy` ancestor
       * they resolve, from index.css, to the vellum sheet with its brass edge,
       * the navy scenario plate, the brass category rule and the paper-toned
       * feedback box — over these same shared components. Nothing about the
       * skin is authored here; the factory only names it.
       */
      className="ranked-panel ranked-folio relative"
      /**
       * What the presentation path did with this question — "absent",
       * "unreadable", "no-scenario", "text-only", "cinematic" or "family" —
       * together with the production band profile that produced it and, when
       * the premise did not reach the picture, why.
       *
       * This is the capture runner's ONLY input for the Step 1D completeness
       * gate: structured attributes stamped by the page that actually rendered,
       * never a heuristic over the visible text. The page states the fact; the
       * runner decides pass/fail.
       */
      data-quiz-presentation={presentation.status}
      data-quiz-presentation-band={presentation.band ?? undefined}
      data-quiz-presentation-reason={presentation.reason ?? undefined}
      /**
       * CON1 Step 5 — the card DECLARES that it expects subject artwork.
       *
       * The one way the factory could still publish a bad image and call the
       * run clean (recorded as remaining debt at the end of Step 4): a
       * cinematic band and the Pro Play champion anchor both resolve their art
       * at RUNTIME from the champion manifest. When that fetch fails, the
       * component renders no <img> at all — so the broken-image backstop, which
       * only sees images that loaded and measured zero, has nothing to look at,
       * and a black rectangle publishes silently.
       *
       * The declaration is what closes it, and it has to come from here: only
       * the harness knows, before paint, that a subject visual was expected.
       * `capture.ts` then checks the DOM for a real one and FAILS when there is
       * none. Two halves, neither of which can lie about the other — the page
       * states the intent, the browser states the outcome.
       *
       * Derived from the production payloads themselves: a `cinematic` band is
       * the layout authority's own answer, and the Pro Play anchor's
       * `media.kind === "champion"` is the presentation contract's own. No
       * family list, and nothing to keep in sync.
       */
      data-quiz-expected-image={expectedImage ?? undefined}
    >
      {/* Screenshot presentation: no category pill — the question text is the
          topmost content of the card. The rank emblem lives above answer A
          (below), so the title keeps its full width and is never reflowed. */}
      {/* The Pro Play card prints its own stem (after its chips and anchor,
          which is the composition order that IS the product), so the harness
          must not print a second one above it. */}
      {scenarioModel || proContext ? null : (
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg font-semibold leading-snug">
            {question.question_text}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {scenarioModel || proContext ? null : recipe ? (
          <RecipeVisual recipe={recipe} resolveUrl={resolveQuizAssetUrl} />
        ) : mainVisual ? (
          <div className="rounded-lg overflow-hidden border border-border bg-black/20 flex justify-center py-3">
            {/* Item/icon sources are 64px — cap the display size so content
                captures stay sharp instead of upscaling to a blurry hero. */}
            <img
              src={mainVisual}
              alt="Question visual"
              className="object-contain"
              style={{ maxHeight: 96, maxWidth: "100%" }}
            />
          </div>
        ) : null}
        {/* Rank emblem lane: a dedicated fixed-height row of its own between
            the recipe/visual area and answer A. Deterministic reservation —
            the lane height is a constant, present in every state of the same
            question, so parity holds. The emblem never overlaps the question
            text and never shifts it (full-width title above, left-aligned
            emblem here). Emblem only — no words, no border, no chrome. */}
        {difficulty ? (
          <div
            data-quiz-difficulty-lane
            className="flex items-center justify-start"
            style={{ height: 64 }}
          >
            <DifficultyBadge info={difficulty} resolveUrl={resolveQuizAssetUrl} size={60} />
          </div>
        ) : null}
        {scenarioModel ? (
          /* The PRODUCTION surface — prompt, scenario band and answer grid.
             Not a copy of it, and not a second family selector: the surface
             calls `selectFamilyLayout` itself on the same source. Static
             capture, so no interaction is permitted and selection is fixed by
             the render plan. */
          <div data-quiz-scenario-surface>
            <InteractiveScenarioSurface
              question={scenarioModel.question}
              scenarioSource={scenarioModel.scenarioSource}
              selectedOptionId={surfaceSelectedOptionId}
              permissions={NO_INTERACTIONS}
              onSelectOption={() => {
                /* static render — selection is fixed by the state plan */
              }}
              reveal={surfaceReveal}
              variant="competitive"
            />
          </div>
        ) : proContext ? (
          /* The PRODUCTION Pro Play card — chips, champion anchor, stem and
             the symmetric subject cards — with the harness's own answer grid
             as its children, which is the composition `ProPlayQuiz` uses. */
          <div data-quiz-pro-play-surface>
            <ProPlayQuestionCard
              topic={question.category ?? "Pro Play"}
              questionText={question.question_text}
              context={proContext}
            >
              <QuizAnswerOptions
                choices={question.choices}
                selectedAnswer={selectedAnswer}
                answerResult={answerResult}
                onSelect={() => {
                  /* static render — selection is fixed by the state plan */
                }}
              />
            </ProPlayQuestionCard>
          </div>
        ) : (
          <QuizAnswerOptions
            choices={question.choices}
            selectedAnswer={selectedAnswer}
            answerResult={answerResult}
            onSelect={() => {
              /* static render — selection is fixed by the state plan */
            }}
          />
        )}
        {/* Result area is RESERVED in every state so the card keeps one fixed
            height and nothing reflows between the question and correct
            captures. Pre-reveal it shows a quiet engagement panel with the
            EXACT box model of the feedback panel (same classes, one text
            line, same metadata footer) — visually subdued, and it carries no
            answer information. */}
        <div data-quiz-result-area>
          {feedback ? (
            <QuizAnswerFeedback result={feedback} metadata={question.metadata} />
          ) : format.kind === "social" && variant === "recap" ? (
            // Suspense bridge slide: prompts the swipe, reveals nothing.
            <div
              data-quiz-recap-cta
              className="rounded-lg border p-4 text-sm"
              style={{
                borderColor: "hsl(43 60% 44% / 0.6)",
                background: "hsl(43 60% 16% / 0.35)",
                color: "hsl(43 55% 78%)",
              }}
            >
              <div className="flex items-center justify-center gap-2 font-extrabold">
                <div className="flex origin-center scale-[1.2] items-center gap-2">
                  <span
                    className="tracking-tight"
                    style={{ fontFamily: ACADEMY_FACE, color: ACADEMY_INK_BRASS }}
                  >
                    Ready for the answer? Swipe right →
                  </span>
                </div>
              </div>
            </div>
          ) : format.kind === "social" && challenge ? (
            // Challenge question slide: visible progress + lock-in prompt.
            // Same transparent box model as the other placeholders. Optional
            // one-line repeat/mid-CTA copy sits below without stealing the
            // question hierarchy.
            <div
              data-quiz-challenge-cta
              className="rounded-lg border p-4 text-sm"
              style={{ borderColor: "transparent", background: "transparent" }}
            >
              <div className="flex flex-col items-center gap-1">
                <span
                  data-challenge-progress
                  className="text-xs font-extrabold uppercase"
                  style={{ letterSpacing: "0.3em", color: "rgba(58,46,26,0.74)" }}
                >
                  Question {challenge.number} of {challenge.total}
                </span>
                <span
                  className="text-base font-extrabold uppercase"
                  style={{
                    fontFamily: ACADEMY_FACE,
                    letterSpacing: "0.06em",
                    color: ACADEMY_INK_BRASS,
                  }}
                >
                  Lock in your answer
                </span>
                {challenge.repeat ? (
                  <span
                    data-challenge-repeat
                    className="text-xs font-bold"
                    style={{ color: "hsl(43 60% 74%)" }}
                  >
                    {challenge.repeat.line1} {challenge.repeat.line2}
                  </span>
                ) : challenge.midCta ? (
                  <span
                    data-challenge-mid-cta
                    className="text-xs font-bold"
                    style={{ color: "hsl(43 60% 74%)" }}
                  >
                    {challenge.midCta}
                  </span>
                ) : null}
              </div>
            </div>
          ) : format.kind === "social" ? (
            // Question slide: a bold, flashy comment action prompt — NOT a
            // boxed result panel. The outer container keeps the feedback
            // panel's exact box model (rounded-lg border p-4 text-sm + the
            // metadata footer) so the reserved height matches the correct
            // state byte-for-byte, but its border/fill are transparent so it
            // reads as a floating action prompt rather than a textbox bubble.
            // The prompt is enlarged with transform:scale (no layout height
            // change), preserving the ≤1px cross-state parity.
            <div
              data-quiz-result-placeholder
              className="rounded-lg border p-4 text-sm"
              style={{ borderColor: "transparent", background: "transparent" }}
            >
              <div className="flex items-center justify-center gap-2 font-extrabold mb-1">
                <div className="flex origin-center scale-[1.35] items-center gap-2.5">
                  <MessageCircle className="h-4 w-4" style={{ color: ACADEMY_INK_BRASS }} />
                  {/* CON1 Step 4 — the letters come from the OPTION COUNT.
                      This line used to be the constant "Comment A, B, C, or D"
                      and a two-option question shipped asking readers to
                      comment C or D. The copy rule is a pure module, so a
                      wrong ask is a unit-test failure rather than something
                      noticed in a published PNG. */}
                  <span
                    data-quiz-answer-prompt
                    className="uppercase"
                    style={{
                      fontFamily: ACADEMY_FACE,
                      color: ACADEMY_INK_BRASS,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {answerPromptCopy(question.choices.length)}
                  </span>
                </div>
              </div>
              <ProDataSourceLink metadata={question.metadata} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FormatShell({
  format,
  children,
  stageRef,
  centerRef,
  cardRef,
  scale,
  quantizedH,
  state,
  slide,
}: {
  format: RenderFormat;
  children: React.ReactNode;
  stageRef: React.Ref<HTMLDivElement>;
  centerRef: React.Ref<HTMLDivElement>;
  cardRef: React.Ref<HTMLDivElement>;
  scale: number;
  /** The card box's 8px-quantized height — see useRenderReady. */
  quantizedH?: number;
  state: RenderState;
  slide: SlideKind;
}) {
  // End-style slides (app-cta/community + challenge opening/summary/ending)
  // drop the small "Play more…" line in favor of a larger, brand-led
  // wordmark; quiz-family slides keep the full strip.
  const isEndSlide =
    slide === "app-cta" ||
    slide === "community" ||
    slide === "opening" ||
    slide === "summary" ||
    slide === "ending";
  if (format.kind === "audit") {
    // Responsive audit: normal page flow at the device viewport, same
    // container rhythm as the live quiz page.
    return (
      <div
        ref={stageRef}
        data-quiz-render-stage
        data-render-state={state}
        data-render-format={format.key}
        className="min-h-screen bg-background text-foreground"
      >
        <div className="container max-w-2xl mx-auto px-4 py-6">{children}</div>
      </div>
    );
  }

  /**
   * CON1 Step 4 — THE SOCIAL COMPOSITION.
   *
   * What this replaced: one portrait smartphone mock-up that every social
   * format was poured through. It cost the frame twice — the bezel took the
   * outer ~14% and the "screen" interior took more — and because the mock-up
   * is portrait by construction, `landscape` ended up drawing a 334px-wide
   * card into a 1200px frame with empty gutters either side. The card was
   * unreadable at feed scale for reasons that had nothing to do with the card.
   *
   * What replaced it: the frame IS the composition. The stage is the academy
   * chamber — the same painting the live Ranked arena is set in — and the
   * question sits on it as a vellum folio, at the size the format can actually
   * afford. `format.layoutFamily` picks between a stacked column and a real
   * two-column horizontal arrangement; nothing else branches.
   *
   * The stage carries `ranked-academy`, so `index.css` supplies the folio, the
   * carved answer tablets, the scenario band's navy plate and the paper-toned
   * feedback box — all of it already written against these exact shared
   * components. `.ranked-academy::after` (a `position: fixed` room backdrop
   * sized to the VIEWPORT) is suppressed here and the ground is painted inside
   * the stage instead, because a capture stage is not the viewport and a fixed
   * layer would not follow it.
   */
  const showCta = format.cta !== "none";
  const rail = format.ctaPlacement === "rail";
  const pad = format.safeAreaPadding;
  // A reveal has answered the question; it invites the next one instead of
  // asking for a comment it has already spent.
  const tone: "question" | "reveal" = state === "question" ? "question" : "reveal";
  // Rail width is DERIVED, never a second magic number: the format already
  // declares how wide the folio column may be, and the rail is what the frame
  // has left after it.
  const railGap = Math.round(pad * 0.75);
  const railW = rail
    ? Math.max(220, format.width - pad * 2 - railGap - format.contentMaxWidth)
    : 0;
  const qrPx = format.width >= 1600 ? 150 : 108;
  const baseWidth = BASE_CONTENT_WIDTH_BY_FAMILY[format.layoutFamily];

  return (
    <div
      ref={stageRef}
      data-quiz-render-stage
      data-render-state={state}
      data-render-format={format.key}
      data-render-layout={format.layoutFamily}
      data-render-scale={scale}
      /* `ranked-academy` is not decoration here either — see ArenaShell's note.
         It is the ancestor half of every `.ranked-academy .ranked-folio …` and
         `.ranked-academy [data-answers-state] [data-quiz-choice] …` rule in
         index.css, and without it the folio class on the card would be inert. */
      className="ranked-academy overflow-hidden relative text-foreground"
      style={{
        width: format.width,
        height: format.height,
        background: "#050c17",
      }}
    >
      {/* Screenshot-only stabilizers/overrides — scoped to the harness stage,
          never touching live quiz UI. Three jobs only:
            1. suppress the arena's viewport-fixed backdrop (see above);
            2. tighten the card's internal rhythm so the fitted zoom can grow;
            3. supply the two states the academy skin has no static opinion on
               — the plain (non-arena) answer grid, and a correct answer that
               must read as correct without Ranked's separate reveal banner. */}
      <style>{`
        /* 1 — the arena's room backdrop is sized to the viewport; the stage is
           not the viewport. The ground below is painted inside the stage. */
        [data-quiz-render-stage].ranked-academy::after{ display:none; }

        /* 2 — card chrome: tighter internal padding/rhythm so the fitted zoom
           can grow. Scoped to the stage; the live quiz card is untouched. */
        [data-quiz-render-stage] [data-quiz-content-card] > div{
          border-radius:10px;
        }
        [data-quiz-render-stage] [data-quiz-content-card] .p-6{ padding:14px; }
        [data-quiz-render-stage] [data-quiz-content-card] .pb-3{ padding-bottom:6px; }
        [data-quiz-render-stage] [data-quiz-content-card] .pt-0{ padding-top:0; }
        [data-quiz-render-stage] [data-quiz-content-card] .space-y-4 > * + *{
          margin-top:9px;
        }
        /* ONE PROMPT VOICE.
           A scenario question renders its prompt through the production
           surface, whose heading is an h2 and therefore already picks up the
           academy display face from .theme-lol. A plain stored question renders
           through CardTitle, which is an h3 and did not — so the two published
           side by side in different typefaces, which is exactly the "two design
           systems" read this step exists to remove. Same face, same centring,
           same colour as the folio ink. Wrapping changes identically in every
           state, so cross-state parity is unaffected. */
        [data-quiz-render-stage] [data-quiz-content-card] h3{
          text-align:center;
          font-family:"Cinzel","Trajan Pro","EB Garamond",Georgia,serif;
          font-weight:700;
          letter-spacing:0.01em;
          color:#2c2417;
        }
        /* Recipe cluster: tighter vertical rhythm only — tile sizes and the
           fixed label envelope (anti-drift) are untouched. */
        [data-quiz-render-stage] [data-quiz-recipe]{
          gap:4px; padding-top:0; padding-bottom:0;
        }
        [data-quiz-render-stage] [data-quiz-answer-options]{ gap:7px; }
        /* Landscape only: the answers go two-up. This is the other half of the
           wide-sheet decision above — it is what makes the folio short enough
           to fill a 16:9 frame instead of being pinned by its own height. The
           shared grid already supports a two-column mode for compact
           competitive surfaces (QuizAnswerOptions columns="wide-2"); this
           reaches the same layout from the composition side, so no production
           call signature changes and a picture-choice grid — which manages its
           own 2-up columns — is left alone. */
        [data-render-layout="landscape"] [data-quiz-answer-options][data-columns="auto"]{
          grid-template-columns:repeat(2,minmax(0,1fr));
        }
        /* Result panel chrome (both states share these classes → no shift). */
        [data-quiz-render-stage] [data-quiz-result-area] > div{ padding:10px 12px; }

        /* THE BANDS, MOUNTED ON PAPER.
           The scenario bands are built from translucent BLACK — rgba(0,0,0,.55)
           on the family bands, bg-black/30 on the cinematic hero — because they
           were tuned against a dark panel. On the vellum folio those wash out
           to a muddy tan and the gold labels inside them lose their ground.
           index.css already solves exactly this for the low-content compact
           strip, with exactly this reasoning, by giving it an opaque navy
           plate; the family and cinematic bands simply never had a caller that
           put them on paper. Colour only — the bands keep their own height,
           ring, sheen, emblems and internal layout, and the rule is scoped to
           the capture stage so the live arena is untouched. */
        [data-quiz-render-stage] [data-testid^="family-band-"],
        [data-quiz-render-stage] [data-testid="scenario-hero"]{
          background-color:#0b1727;
          background-image:linear-gradient(90deg,
            rgba(8,19,34,0.98) 0%, rgba(15,31,51,0.95) 50%, rgba(8,19,34,0.98) 100%);
          border-color:rgba(185,147,76,0.45);
        }

        /* THE PRO PLAY CONTEXT RAIL, MOUNTED ON PAPER.
           Same defect, same fix, same reasoning as the bands above -- and the
           same one index.css records for the Leaguecraft scroll and Step 4
           recorded for the recipe labels ("pale gold on cream, effectively
           invisible ... they are ink now").

           Every chip in ProPlayContextRail is light-on-dark by construction:
           the competition chips are a pale gold ink over a 10%-gold wash, the
           metric chip is sky-200, the editorial chip is emerald-200. Those are
           correct on the Pro Play surface, which is a dark panel. On vellum
           the ink is lighter than the paper and the chips read as blank
           capsules -- measured on the first Step 5 run: SCOPE -> CHAMPION,
           PICKS and RECENT ESPORTS were all effectively invisible while the
           two muted temporal chips read normally.

           So the INK is darkened and the wash is warmed; the chips keep their
           own hue families (brass for competition identity, a cool tone for
           the metric, green for the current-events marker), their geometry,
           their order and their tooltips. Colour only, scoped to the capture
           stage, so the live Pro Play surface is untouched. */
        /* ...but NOT inside the champion anchor, whose ground is the splash.
           ProPlayChampionAnchor puts the rail and the stem OVER a full-bleed
           champion image with a dark scrim, so there the components' original
           light-on-dark ink is already correct -- and the paper re-tone below
           would put dark ink on a dark splash, which is the same defect in the
           other direction. Measured: on the Ornn anchor the chips and the stem
           were both unreadable before this exclusion. */
        [data-quiz-render-stage]
          [data-pro-play-anchor] [data-pro-play-context-rail] [data-tag-type],
        [data-quiz-render-stage]
          [data-pro-play-anchor] [data-pro-play-context-rail]
          [data-tag-type="metric"],
        [data-quiz-render-stage]
          [data-pro-play-anchor] [data-pro-play-context-rail]
          [data-tag-type="editorial"]{
          border-color:rgba(201,168,76,0.45);
          background-color:rgba(12,20,32,0.72);
          color:#f0dcae;
        }
        /* The stem sits on the splash too, so it takes the light ink there
           rather than the folio ink the h2 rule gives it on paper. */
        [data-quiz-render-stage] [data-pro-play-anchor] [data-pro-play-question]{
          color:#f6ecd2;
          text-shadow:0 2px 10px rgba(0,0,0,0.85);
        }
        /* Three attribute selectors, deliberately. The anchor rules above are
           four, so they out-specify this and the splash keeps its light ink.
           A :not([data-pro-play-anchor]) here would read as belt-and-braces
           and in fact BREAK it: :not() contributes its argument's specificity,
           which would make this rule four as well and let source order win.
           Measured -- the chips published dark-on-dark until it was removed. */
        [data-quiz-render-stage] [data-pro-play-context-rail] [data-tag-type]{
          border-color:rgba(122,92,30,0.45);
          background-color:rgba(201,168,76,0.16);
          color:#5c451a;
        }
        [data-quiz-render-stage] [data-pro-play-context-rail]
          [data-tag-type="metric"]{
          border-color:rgba(30,74,110,0.40);
          background-color:rgba(56,120,168,0.14);
          color:#1d4a6e;
        }
        [data-quiz-render-stage] [data-pro-play-context-rail]
          [data-tag-type="editorial"]{
          border-color:rgba(28,92,60,0.40);
          background-color:rgba(46,140,92,0.14);
          color:#1c5c3c;
        }
        /* The symmetric subject cards. Their ground is a translucent DARK
           background token and their ink the light foreground token; on paper
           the card disappears and the label with it. An opaque warm plate with folio
           ink keeps the two-or-four cards legible as a comparison, which is
           the whole reason they exist. */
        [data-quiz-render-stage] [data-pro-play-subject]{
          background-color:rgba(120,96,52,0.10);
          border-color:rgba(122,92,30,0.35);
          color:#2c2417;
        }
        [data-quiz-render-stage] [data-pro-play-subject] *{
          color:#3a2f1e;
        }
        [data-quiz-render-stage] [data-pro-play-subject] [data-pro-play-team-chip],
        [data-quiz-render-stage] [data-pro-play-subject] [data-pro-play-league-chip]{
          border-color:rgba(122,92,30,0.40);
          background-color:rgba(201,168,76,0.14);
          color:#5c451a;
        }

        /* THE REVEAL GUTTER — a reserved slot for the verdict icon.
           Revealing an answer appends a 16px check/cross INSIDE the row, and
           the label is the flex child that pays for it. On short options that
           is invisible; on a long one it costs a wrapped line, and the correct
           card came out 43px taller than the question card of the same
           question. Every long-option row in the corpus drifted this way, in
           every format, before and after the reshell — it is a property of the
           shared grid, not of this composition, so the fix is a reservation
           rather than a fork: the row keeps a constant right gutter in EVERY
           state and the icon is lifted out of flow into it. Text-mode rows
           only (.justify-start); the picture-choice tiles centre their own
           icon inside a wrapper and are untouched. */
        [data-quiz-render-stage] [data-quiz-choice].justify-start{
          position:relative;
          padding-right:34px;
        }
        [data-quiz-render-stage] [data-quiz-choice].justify-start > svg{
          position:absolute;
          right:10px;
          top:50%;
          margin-left:0;
          transform:translateY(-50%);
        }

        /* 3a — the PLAIN answer grid. QuizAnswerOptions renders the same
           tablets in both paths, but only the arena's AnswerGrid wraps them in
           the [data-answers-state] fieldset the academy rules key on. These
           mirror the academy rule for the arena fieldset, so
           a stored MCQ and a scenario question publish the same object; the
           academy's own rule is more specific and still wins where it applies.
           The row floor is a real floor (above every natural single-line
           height) so reveal styling can never reflow a row. */
        /* THE ANSWER-GEOMETRY LOCK, for the plain grid.
           Revealing an answer swaps the shared quiz button from the "outline"
           variant (1px border) to "default" (no border) — a 2px change to the
           control's border box, which shrinks the revealed row and lifts
           everything under it. index.css already fixes exactly this, as the
           RA1 Phase 1.5 lock, but deliberately scoped to the [data-answers-state]
           fieldset so it can never reach a plain quiz page. The factory's
           stored-question path has no such ancestor, so the same pin is applied
           here at the stage instead: every state carries the same 1px border
           box, and the states that had none get a transparent one. Colour, fill
           and glow still change freely — only the geometry is pinned. */
        /* UN-DIM THE TABLETS.
           A static capture is not a live round, and every tablet in it is
           disabled — twice over. AnswerGrid renders a disabled fieldset
           because the harness passes NO_INTERACTIONS, and a revealed card
           disables every button again. The shared Button dims a disabled
           control to 50% (disabled:opacity-50) and the academy skin eases
           the LOCKED state back to 62%; neither reaches a REVEALED one. The
           result was carved navy publishing as a half-strength wash of navy on
           cream — measured rgb(117,117,109) against a computed rgb(14,28,47) —
           on the reveal card, which is the one whose whole job is to be read.
           Both dims exist to say "you cannot press this", which no reader of a
           PNG was going to try. Opacity only; nothing else about the disabled
           state changes, and the reveal's own colours still do the talking. */
        [data-quiz-render-stage] [data-quiz-choice],
        [data-quiz-render-stage] [data-quiz-choice]:disabled,
        [data-quiz-render-stage] [data-answers-state] [data-quiz-choice]{
          opacity:1;
        }

        [data-quiz-render-stage] [data-quiz-choice]{
          border-width:1px;
          border-style:solid;
        }
        [data-quiz-render-stage] [data-quiz-choice]:not([data-choice-state="idle"]){
          border-color:transparent;
        }
        [data-quiz-render-stage] [data-quiz-choice]{
          min-height:48px;
          padding-top:8px;
          padding-bottom:8px;
          font-size:15px;
          font-weight:600;
          border-color:rgba(185,147,76,0.34);
          background-color:#0e1c2f;
          background-image:linear-gradient(180deg,
            rgba(25,44,69,0.97) 0%, rgba(12,25,42,0.98) 62%, rgba(7,15,28,1) 100%);
          color:#efe8d6;
          box-shadow:
            inset 0 1px 0 rgba(213,182,111,0.16),
            inset 0 -10px 18px -14px rgba(0,0,0,0.9),
            0 6px 16px -12px rgba(0,0,0,0.85);
        }
        [data-quiz-render-stage] [data-quiz-choice] [data-choice-letter]{
          display:inline-flex; align-items:center; justify-content:center;
          min-width:1.5rem; padding:0.1rem 0.2rem; border-radius:4px;
          background:rgba(185,147,76,0.14);
          box-shadow:inset 0 0 0 1px rgba(185,147,76,0.3);
          color:rgba(232,201,122,0.92);
          opacity:1;
        }

        /* 3b — the CORRECT tablet.
           Ranked paints a revealed correct option BLUE, because in the arena
           the verdict is delivered by its own RevealBanner and the tablet is
           only pointing at it. A static post has no banner: this row is the
           entire answer, and blue does not read as "right". So the factory
           keeps a green tablet — retoned out of the neon jade it used to be
           and into the academy's own deep leaf, the same ink family as the
           folio's "positive" verdict tone. Colour, fill and shadow
           only: never height, padding, border-width — and never FONT WEIGHT.
           The jade rule this replaced also set weight 800 on the revealed row,
           and on a long option that re-wrapped the label onto an extra line:
           the correct card came out 43px taller than the question card, which
           tripped the cross-state geometry gate and, at mobile-social, an
           actual collision with the footer. Contrast is gated at >=4.5:1 by
           the capture runner. */
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"]{
          border-color:rgba(122,196,138,0.9)!important;
          background-color:#123b28!important;
          background-image:linear-gradient(180deg,
            rgba(23,79,52,0.99) 0%, rgba(14,52,34,0.99) 60%, rgba(9,38,25,1) 100%)!important;
          color:#d8f2e0!important;
          box-shadow:
            inset 0 1px 0 rgba(168,226,185,0.34),
            0 0 26px -8px rgba(70,168,105,0.62)!important;
          text-shadow:0 1px 0 rgba(4,20,12,0.75);
        }
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"] *{
          color:#d8f2e0!important;
        }
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"] [data-choice-letter]{
          background:rgba(168,226,185,0.9)!important;
          box-shadow:inset 0 0 0 1px rgba(168,226,185,0.45);
          color:#08361f!important;
        }
        /* The feedback panel on vellum, in the same leaf ink. The academy skin
           already tones this box for the folio; this only carries the "correct"
           variant's green through, which the shared component sets as a
           Tailwind text-green class the folio rules do not name. */
        /* THE EXPLANATION IS THE POINT OF THE EXPLANATION CARD, so it is set
           in the folio's own muted ink rather than an 80%-opacity tint of the
           verdict colour, which on cream came out as a pale sage the reader has
           to work at. The verdict line above it keeps the verdict colour. */
        [data-quiz-render-stage] [data-quiz-answer-feedback] p.text-xs{
          color:rgba(45,36,20,0.92)!important;
          opacity:1;
        }
        [data-quiz-render-stage] [data-quiz-answer-feedback].text-green-400{
          background-color:rgba(86,138,92,0.16)!important;
          border-color:rgba(58,110,68,0.6)!important;
          color:#2f5b38!important;
          box-shadow:none!important;
          text-shadow:none;
        }
      `}</style>

      {/* ---- The ground -------------------------------------------------
          The academy chamber, as a real <img> so the readiness wait and the
          missing-asset QA both cover it, under a scrim that keeps it a room
          and not a subject. `object-position` is the only per-family
          difference: a 16:9 painting cropped to 4:5 has to keep the lit floor
          and the banner wall, not the ceiling. */}
      <img
        data-quiz-stage-ground
        src={ACADEMY_GROUND_SRC}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full select-none"
        style={{
          position: "absolute",
          objectFit: "cover",
          objectPosition: rail ? "center 42%" : "center 58%",
          zIndex: 0,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          position: "absolute",
          zIndex: 1,
          background: [
            // vignette — the frame reads as a lit chamber
            "radial-gradient(118% 88% at 50% 44%, rgba(7,17,31,0) 0%, rgba(5,12,23,0.5) 56%, rgba(2,6,13,0.96) 100%)",
            // navy wash — atmosphere sits BEHIND the folio, never competes
            "linear-gradient(180deg, rgba(7,17,31,0.78) 0%, rgba(7,17,31,0.62) 45%, rgba(4,10,20,0.9) 100%)",
          ].join(", "),
        }}
      />
      {/* A single inset brass hairline: the plate edge. The one piece of
          decoration on the stage, and it is a line. */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: Math.round(pad * 0.45),
          right: Math.round(pad * 0.45),
          top: Math.round(pad * 0.45),
          bottom: Math.round(pad * 0.45),
          position: "absolute",
          border: "1px solid rgba(185,147,76,0.26)",
          boxShadow: "inset 0 0 0 1px rgba(2,6,13,0.55)",
          zIndex: 2,
        }}
      />

      {rail ? (
        /* ---- LANDSCAPE: two real columns ------------------------------
           The folio takes the full frame height and everything the rail does
           not, so a 1200×675 post is a question a reader can read at feed
           scale rather than a picture of a phone. The rail sits on the RIGHT
           so the question is what the eye reaches first; the brand is present
           and subordinate, which is the whole rule for these cards. */
        <div
          className="absolute inset-0 flex items-stretch"
          style={{ position: "absolute", padding: pad, gap: railGap, zIndex: 10 }}
        >
          <div ref={centerRef} className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
            <div
              ref={cardRef}
              data-quiz-content-card
              style={{ width: baseWidth, minHeight: quantizedH, zoom: scale, flexShrink: 0 }}
            >
              {children}
            </div>
          </div>
          {showCta && (
            <div
              data-quiz-brand-rail
              className="shrink-0"
              style={{ width: railW }}
            >
              <QuizCtaRail tone={tone} qrPx={qrPx} />
            </div>
          )}
        </div>
      ) : (
        /* ---- PORTRAIT / SQUARE: one stacked column --------------------
           Brand lockup, folio, footer. Same order the gate has always
           enforced (CTA above the card, QR below it) — what changed is that
           there is no device between them and the frame, so the folio gets
           the height the two chrome rows do not use instead of the height a
           phone screen left over. */
        <div
          className="absolute inset-0 flex flex-col"
          style={{ position: "absolute", padding: pad, zIndex: 10 }}
        >
          {showCta && (
            <div className="shrink-0 flex justify-center pb-3">
              <QuizCtaTop variant={isEndSlide ? "brand" : "full"} tone={tone} />
            </div>
          )}
          <div ref={centerRef} className="flex-1 min-h-0 flex items-center justify-center">
            <div
              ref={cardRef}
              data-quiz-content-card
              style={{ width: baseWidth, minHeight: quantizedH, zoom: scale, flexShrink: 0 }}
            >
              {children}
            </div>
          </div>
          {showCta && (
            <div className="shrink-0 flex flex-col items-center gap-1 pt-3">
              <QuizCtaQr px={format.layoutFamily === "square" ? 68 : 80} />
              <span
                data-quiz-cta-scan
                className="text-[13px] font-semibold tracking-wide"
                style={{ color: "#e9dcbe", opacity: 0.8 }}
              >
                Scan to play
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * `renderDocument` — the document this harness is actually rendering INTO.
 *
 * The route mounts into the page's own document and passes nothing. The Admin
 * exporter mounts this component into an offscreen, format-sized iframe, and
 * React renders it from the PARENT realm — so a bare `document` here is
 * Admin's, not the export surface's. The two document-level effects below then
 * themed and stripped the wrong page, and the operator watched
 * `/admin/quiz-content` turn League-dark for the length of an export.
 *
 * Nothing about the composition changes; only which root these two effects
 * address. The route passes nothing and is byte-identical.
 */
export default function QuizRenderPage({ renderDocument }: { renderDocument?: Document } = {}) {
  const [params] = useSearchParams();
  const [questions] = useState<RenderQuestion[] | null>(() => {
    const injected = readInjectedQuestions();
    if (injected) return injected;
    return import.meta.env.DEV ? SAMPLE_RENDER_QUESTIONS : null;
  });

  // Restore animation behavior if the SPA navigates away from the harness.
  useEffect(() => {
    MotionGlobalConfig.skipAnimations = true;
    return () => {
      MotionGlobalConfig.skipAnimations = PREV_SKIP_ANIMATIONS;
    };
  }, []);

  // The live quiz always renders under the dark LoL theme (Layout.tsx applies
  // these classes); the harness mounts outside Layout, so apply them here for
  // faithful, deterministic styling — on the document being RENDERED INTO,
  // which is not always the one this module's `document` refers to.
  useEffect(() => {
    const root = (renderDocument ?? document).documentElement;
    const added = ["dark", "theme-lol"].filter((c) => !root.classList.contains(c));
    added.forEach((c) => root.classList.add(c));
    return () => added.forEach((c) => root.classList.remove(c));
  }, [renderDocument]);

  // Remove the index.html boot splash (#initial-shell): it is a fixed,
  // viewport-centered Mogsy wordmark at z-index 9999 whose fade-out lingers
  // in captures and overlaps answer rows.
  useEffect(() => {
    (renderDocument ?? document).getElementById("initial-shell")?.remove();
  }, [renderDocument]);

  const qId = params.get("q") ?? "";
  const stateParam = params.get("state") ?? "question";
  const formatParam = params.get("format") ?? "mobile-audit";
  const answerIndexParam = params.get("answerIndex");
  const scaleParam = params.get("scale");
  const slideParam = params.get("slide") ?? "quiz";
  const difficultyParam = params.get("difficulty");
  // Challenge params (multi-question posts): progress + optional copy.
  const progressParam = params.get("progress"); // "<number>of<total>"
  const repeatParam = params.get("repeat"); // repeat copy variant id
  const midParam = params.get("mid"); // mid-CTA variant id
  // Summary params: ordered question ids on this page + pagination.
  const qidsParam = params.get("qids");
  const sumStartParam = params.get("sumStart");
  const sumPageParam = params.get("sumPage");
  const sumPagesParam = params.get("sumPages");

  const question = useMemo(
    () => questions?.find((q) => String(q.id) === qId) ?? null,
    [questions, qId],
  );

  const format = getFormat(formatParam);
  const validState = isRenderState(stateParam);
  const validSlide = isSlideKind(slideParam);
  // Difficulty precedence: explicit param, else per-question injected metadata.
  const difficulty: DifficultyInfo | null =
    resolveDifficulty(difficultyParam) ??
    resolveDifficulty(question?.metadata?.content_difficulty);

  let error: string | null = null;
  let answerIndex: number | undefined;
  if (!questions) {
    error =
      "No render data. This internal harness only displays question data injected by the local screenshot runner.";
  } else if (!validSlide) {
    error = `Unknown slide "${slideParam}".`;
  } else if (!validState) {
    error = `Unknown state "${stateParam}".`;
  } else if (!format) {
    error = `Unknown format "${formatParam}".`;
  } else if (!qId) {
    error = "Missing ?q=<question id>.";
  } else if (!question) {
    error = `Question "${qId}" not found in render data.`;
  } else if (difficultyParam !== null && !difficulty) {
    error = `Unknown difficulty "${difficultyParam}" (use iron, gold, or diamond).`;
  } else if (answerIndexParam !== null) {
    answerIndex = Number(answerIndexParam);
    if (!Number.isInteger(answerIndex) || answerIndex < 0) {
      error = `Invalid answerIndex "${answerIndexParam}".`;
    }
  }
  let forcedScale: number | undefined;
  if (!error && scaleParam !== null) {
    forcedScale = Number(scaleParam);
    if (!Number.isFinite(forcedScale) || forcedScale < 0.1 || forcedScale > 4) {
      error = `Invalid scale "${scaleParam}".`;
      forcedScale = undefined;
    }
  }

  // Build the slide composition. Non-quiz slides (app-cta/community) are
  // standalone content cards; quiz/recap slides render the real question
  // composition (recap forces the unanswered state, revealing nothing).
  const slide = slideParam as SlideKind;
  let content: React.ReactNode = null;
  if (!error && question && format && validState && validSlide) {
    try {
      if (slide === "app-cta") {
        content = <AppCtaSlide />;
      } else if (slide === "community") {
        content = <CommunitySlide question={question} />;
      } else if (slide === "opening") {
        content = <ChallengeOpeningSlide />;
      } else if (slide === "ending") {
        content = <ChallengeEndingSlide />;
      } else if (slide === "summary") {
        // Answer blueprint: qids lists THIS page's question ids in challenge
        // order; sumStart is the 0-based global offset for row numbering.
        if (!qidsParam) throw new Error("summary slide requires ?qids=<id,id,...>");
        const ids = qidsParam.split(",").map((s) => s.trim()).filter(Boolean);
        if (!ids.length) throw new Error("summary slide got an empty qids list");
        const rows = ids.map((id) => {
          const found = questions?.find((qq) => String(qq.id) === id);
          if (!found) throw new Error(`summary question "${id}" not found in render data`);
          return found;
        });
        const sumStart = sumStartParam !== null ? Number(sumStartParam) : 0;
        const sumPage = sumPageParam !== null ? Number(sumPageParam) : 1;
        const sumPages = sumPagesParam !== null ? Number(sumPagesParam) : 1;
        for (const [name, v] of [
          ["sumStart", sumStart],
          ["sumPage", sumPage],
          ["sumPages", sumPages],
        ] as const) {
          if (!Number.isInteger(v) || v < 0) throw new Error(`Invalid ${name} "${v}"`);
        }
        content = (
          <AnswerSummarySlide
            questions={rows}
            startIndex={sumStart}
            page={sumPage}
            pageCount={sumPages}
            resolveUrl={resolveQuizAssetUrl}
          />
        );
      } else {
        // quiz + recap: recap is always the unanswered composition.
        const effectiveState = slide === "recap" ? "question" : stateParam;
        const planResult = resolveAnswerPlan(question, effectiveState, answerIndex);
        if (planResult.kind === "skip") {
          error = `State "${effectiveState}" skipped: ${planResult.reason}`;
        } else {
          // Challenge presentation (progress + optional approved copy).
          let challenge: ChallengeSlideInfo | null = null;
          if (progressParam !== null) {
            const m = /^([1-9]\d?)of([1-9]\d?)$/.exec(progressParam);
            if (!m) throw new Error(`Invalid progress "${progressParam}" (use <n>of<total>)`);
            const number = Number(m[1]);
            const total = Number(m[2]);
            if (number > total) throw new Error(`Invalid progress "${progressParam}"`);
            challenge = { number, total };
            if (repeatParam !== null) {
              const rv = Number(repeatParam);
              if (!isRepeatVariantId(rv)) throw new Error(`Unknown repeat variant "${repeatParam}"`);
              challenge.repeat = repeatCopy(rv);
            }
            if (midParam !== null) {
              const mv = Number(midParam);
              if (!isMidCtaVariantId(mv)) throw new Error(`Unknown mid-CTA variant "${midParam}"`);
              challenge.midCta = midCtaCopy(mv).text;
            }
          } else if (repeatParam !== null || midParam !== null) {
            throw new Error("repeat/mid params require a progress param");
          }
          content = (
            <QuestionCard
              question={question}
              plan={planResult.plan}
              format={format}
              variant={slide === "recap" ? "recap" : "quiz"}
              difficulty={difficulty}
              challenge={challenge}
            />
          );
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const { stageRef, centerRef, cardRef, scale, quantizedH } = useRenderReady(
    !error,
    format,
    forcedScale,
  );

  if (error) return <ErrorPanel message={error} />;

  return (
    <FormatShell
      format={format!}
      state={stateParam as RenderState}
      slide={slide}
      stageRef={stageRef}
      centerRef={centerRef}
      cardRef={cardRef}
      scale={scale}
      quantizedH={quantizedH}
    >
      {content}
    </FormatShell>
  );
}
