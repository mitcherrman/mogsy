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
import { QuizCtaQr, QuizCtaTop } from "./QuizCta";
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
  type RenderQuestion,
  type RenderState,
} from "@/lib/quiz-screenshot/types";

// Must be set BEFORE any motion element mounts, or entry animations freeze at
// their initial (opacity 0) pose. Module scope runs at lazy-import time, so
// this only ever applies when the harness route itself is loaded. The page
// restores the previous value on unmount.
const PREV_SKIP_ANIMATIONS = MotionGlobalConfig.skipAnimations;
MotionGlobalConfig.skipAnimations = true;

/** Native mobile card width the content shell scales up from. */
const BASE_CONTENT_WIDTH = 420;

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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
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
          availW / BASE_CONTENT_WIDTH,
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
  }, [enabled, format, forcedScale]);
  return { stageRef, centerRef, cardRef, scale };
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

  return (
    <Card className="relative bg-card/80 backdrop-blur-sm">
      {/* Screenshot presentation: no category pill — the question text is the
          topmost content of the card. The rank emblem lives above answer A
          (below), so the title keeps its full width and is never reflowed. */}
      <CardHeader className="pb-3">
        <CardTitle className="text-base md:text-lg font-semibold leading-snug">
          {question.question_text}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recipe ? (
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
        <QuizAnswerOptions
          choices={question.choices}
          selectedAnswer={selectedAnswer}
          answerResult={answerResult}
          onSelect={() => {
            /* static render — selection is fixed by the state plan */
          }}
        />
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
                  <span className="tracking-tight text-amber-100 drop-shadow-[0_0_10px_rgba(251,191,36,0.45)]">
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
                  style={{ letterSpacing: "0.3em", color: "hsl(197 65% 66%)" }}
                >
                  Question {challenge.number} of {challenge.total}
                </span>
                <span
                  className="text-base font-extrabold uppercase tracking-tight"
                  style={{
                    backgroundImage:
                      "linear-gradient(92deg, hsl(190 95% 72%), hsl(196 92% 62%) 45%, hsl(43 92% 66%))",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    filter: "drop-shadow(0 0 12px rgba(34,211,238,0.5))",
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
                <div className="flex origin-center scale-[1.45] items-center gap-2.5">
                  <MessageCircle
                    className="h-4 w-4 text-cyan-300"
                    style={{ filter: "drop-shadow(0 0 10px rgba(34,211,238,0.85))" }}
                  />
                  <span
                    className="uppercase tracking-tight"
                    style={{
                      backgroundImage:
                        "linear-gradient(92deg, hsl(190 95% 72%), hsl(196 92% 62%) 45%, hsl(43 92% 66%))",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                      filter: "drop-shadow(0 0 12px rgba(34,211,238,0.5))",
                    }}
                  >
                    Comment A, B, C, or D
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
  state,
  slide,
}: {
  format: RenderFormat;
  children: React.ReactNode;
  stageRef: React.Ref<HTMLDivElement>;
  centerRef: React.Ref<HTMLDivElement>;
  cardRef: React.Ref<HTMLDivElement>;
  scale: number;
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
  // Social content shell: a large premium (brand-neutral) smartphone
  // dominates the frame — clean rounded body, flat top screen, and only a
  // subtle dynamic-island pill as hardware detail. Every element — wordmark/
  // CTA, quiz card, QR and its caption — lives INSIDE the phone screen. The
  // phone shows its top and side bezels and runs off the bottom of the
  // capture (the bottom hardware edge is deliberately cropped). Geometry is
  // identical in every state; the zoom is fitted once per question and forced
  // onto later states (see useRenderReady).
  const showCta = format.cta !== "none";
  const phoneW = Math.round(format.width * 0.86);
  const phoneTop = Math.round(format.height * 0.02);
  const phoneLeft = Math.round((format.width - phoneW) / 2);
  const bezel = 16;
  const screenW = phoneW - bezel * 2;
  const islandW = 128;
  const islandH = 34;
  const islandTop = 18;
  const visibleScreenH = format.height - phoneTop - bezel;
  const shellFill = "linear-gradient(180deg, #232a38 0%, #151b26 55%, #10151f 100%)";
  return (
    <div
      ref={stageRef}
      data-quiz-render-stage
      data-render-state={state}
      data-render-format={format.key}
      data-render-scale={scale}
      className="overflow-hidden relative text-foreground"
      style={{
        width: format.width,
        height: format.height,
        background:
          "radial-gradient(130% 100% at 50% 0%, #0d1526 0%, #070b16 60%, #04070e 100%)",
      }}
    >
      {/* Screenshot-only stabilizers/overrides — scoped to the harness stage,
          never touching live quiz UI:
          1. fixed answer-row floor (reveal styling must not reflow rows)
          2. vivid jade correct-state treatment (row, checkmark, feedback) */}
      <style>{`
        /* Card chrome: tighter internal padding/rhythm so the fitted zoom can
           grow — the card ends up larger on screen with the same balance.
           Scoped to the harness stage; the live quiz card is untouched. */
        [data-quiz-render-stage] [data-quiz-content-card] > div{
          border-radius:14px;
        }
        [data-quiz-render-stage] [data-quiz-content-card] .p-6{
          padding:12px;
        }
        [data-quiz-render-stage] [data-quiz-content-card] .pb-3{
          padding-bottom:4px;
        }
        [data-quiz-render-stage] [data-quiz-content-card] .pt-0{
          padding-top:0;
        }
        /* Question prompt reads centered and intentional in content captures.
           Text alignment only — the card, recipe cluster, and answer grid are
           untouched, so geometry/parity are unaffected. */
        [data-quiz-render-stage] [data-quiz-content-card] h3{
          text-align:center;
        }
        [data-quiz-render-stage] [data-quiz-content-card] .space-y-4 > * + *{
          margin-top:8px;
        }
        /* Recipe cluster: tighter vertical rhythm only — tile sizes and the
           fixed label envelope (anti-drift) are untouched. */
        [data-quiz-render-stage] [data-quiz-recipe]{
          gap:4px;
          padding-top:0;
          padding-bottom:0;
        }
        /* Answer grid: tighter gaps; the row floor stays a real floor (above
           every natural single-line height) so reveal styling cannot reflow. */
        [data-quiz-render-stage] [data-quiz-answer-options]{
          gap:7px;
        }
        [data-quiz-render-stage] [data-quiz-choice]{
          padding-top:8px;
          padding-bottom:8px;
        }
        /* Result panel chrome (both states share these classes → no shift). */
        [data-quiz-render-stage] [data-quiz-result-area] > div{
          padding:10px 12px;
        }
        /* Answer rows: fixed height floor (anti-drift) + stronger typography. */
        [data-quiz-render-stage] [data-quiz-choice]{
          min-height:48px;
          font-size:15px;
          font-weight:600;
          color:hsl(215 30% 93%);
          border-color:hsl(213 35% 30% / 0.9);
          background:linear-gradient(180deg,hsl(215 45% 12% / 0.9) 0%,hsl(216 45% 9% / 0.9) 100%);
        }
        /* A/B/C/D letter chips: slightly stronger. */
        [data-quiz-render-stage] [data-quiz-choice] span.font-bold{
          font-weight:800;
          color:hsl(197 65% 66%);
          letter-spacing:0.02em;
        }
        /* Correct row: luminous jade, dark readable text, premium lift.
           transform/shadow only — never row height or spacing. */
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"]{
          background:linear-gradient(180deg,hsl(158 82% 52%) 0%,hsl(161 86% 44%) 55%,hsl(164 90% 38%) 100%)!important;
          border-color:hsl(155 95% 68%)!important;
          color:hsl(168 95% 7%)!important;
          font-weight:800;
          box-shadow:
            0 6px 26px -6px hsl(160 95% 42% / 0.75),
            0 0 30px hsl(160 90% 48% / 0.4),
            inset 0 1px 0 hsl(145 95% 82% / 0.7),
            inset 0 -8px 18px hsl(168 90% 25% / 0.35)!important;
          transform:translateY(-1px);
          text-shadow:0 1px 0 hsl(150 80% 70% / 0.35);
        }
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"] *{
          color:hsl(168 95% 7%)!important;
        }
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"] span.font-bold{
          color:hsl(170 90% 12%)!important;
        }
        /* Correct! feedback panel: polished jade, still airy and readable. */
        [data-quiz-render-stage] [data-quiz-answer-feedback].text-green-400{
          background:linear-gradient(180deg,hsl(160 85% 45% / 0.2) 0%,hsl(163 85% 40% / 0.12) 100%)!important;
          border-color:hsl(157 92% 55% / 0.85)!important;
          color:hsl(155 96% 62%)!important;
          box-shadow:0 0 22px hsl(160 90% 45% / 0.3), inset 0 1px 0 hsl(150 90% 70% / 0.25)!important;
          text-shadow:0 0 12px hsl(160 90% 50% / 0.45);
        }
      `}</style>
      <div
        data-quiz-phone
        className="absolute"
        style={{
          left: phoneLeft,
          top: phoneTop,
          width: phoneW,
          // Extends far past the capture so the bottom hardware edge is
          // always cropped out of the frame.
          height: Math.round(format.height * 1.2),
          borderRadius: `${bezel * 4}px ${bezel * 4}px 0 0`,
          background: shellFill,
          boxShadow:
            "0 0 0 2px hsl(215 25% 40% / 0.35), 0 30px 80px -20px rgba(0,0,0,0.9), inset 0 1px 0 hsl(215 30% 60% / 0.35)",
        }}
      >
        <div
          data-quiz-phone-screen
          className="absolute overflow-hidden"
          style={{
            left: bezel,
            right: bezel,
            top: bezel,
            bottom: 0,
            borderRadius: `${bezel * 3}px ${bezel * 3}px 0 0`,
            // Premium ambient layers (top to bottom): vignette, cyan bloom
            // behind the card, faint jade echo low down, deep navy base.
            background: [
              "radial-gradient(140% 110% at 50% 105%, transparent 55%, hsl(222 60% 3% / 0.75) 100%)",
              "radial-gradient(85% 42% at 50% 46%, hsl(192 80% 45% / 0.2) 0%, transparent 70%)",
              "radial-gradient(70% 30% at 50% 96%, hsl(160 80% 42% / 0.17) 0%, transparent 72%)",
              "radial-gradient(120% 90% at 50% 0%, #14213b 0%, #0a1022 55%, #060912 100%)",
            ].join(", "),
          }}
        >
          {/* Subtle game-flavored texture: arcane rings, map-like ley lines,
              tiny particles, low-opacity item motifs, and a whisper of noise.
              Pure inline SVG with fixed coordinates/seed — deterministic,
              image-free, and strictly BEHIND the content. */}
          <svg
            data-quiz-phone-bg
            className="absolute inset-0 pointer-events-none"
            width="100%"
            height="100%"
            viewBox={`0 0 ${screenW} 1350`}
            preserveAspectRatio="xMidYMid slice"
            aria-hidden
            style={{ zIndex: 1, opacity: 1 }}
          >
            <defs>
              <filter id="bgNoise">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch" />
                <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.75  0 0 0 0 0.9  0 0 0 0.05 0" />
              </filter>
            </defs>
            {/* magic haze noise */}
            <rect width="100%" height="100%" filter="url(#bgNoise)" opacity="0.85" />
            {/* arcane rings behind the card */}
            <g fill="none" stroke="hsl(190 80% 60%)" opacity="0.1">
              <circle cx={screenW / 2} cy={640} r={330} strokeWidth="1.5" />
              <circle cx={screenW / 2} cy={640} r={395} strokeWidth="1" strokeDasharray="3 14" />
              <circle cx={screenW / 2} cy={640} r={455} strokeWidth="0.8" strokeDasharray="1 22" />
            </g>
            {/* soft map-like ley lines */}
            <g fill="none" stroke="hsl(45 70% 60%)" opacity="0.09" strokeWidth="1.2">
              <path d={`M-20 300 Q ${screenW * 0.3} 250 ${screenW * 0.55} 330 T ${screenW + 20} 290`} />
              <path d={`M-20 1080 Q ${screenW * 0.4} 1130 ${screenW * 0.7} 1050 T ${screenW + 20} 1100`} />
              <path d={`M60 -10 Q 120 320 40 640 T 110 1360`} />
              <path d={`M${screenW - 60} -10 Q ${screenW - 130} 380 ${screenW - 40} 700 T ${screenW - 100} 1360`} />
            </g>
            {/* hex facets (Hextech nod) */}
            <g fill="none" stroke="hsl(197 75% 55%)" opacity="0.11" strokeWidth="1.4">
              <path d="M70 180 l26 -15 26 15 v30 l-26 15 -26 -15 z" />
              <path d={`M${screenW - 120} 240 l22 -13 22 13 v26 l-22 13 -22 -13 z`} />
              <path d={`M${screenW - 88} 1150 l18 -11 18 11 v22 l-18 11 -18 -11 z`} />
              <path d="M96 1210 l16 -9 16 9 v19 l-16 9 -16 -9 z" />
            </g>
            {/* low-opacity item-shape motifs: sword + potion outlines */}
            <g fill="none" stroke="hsl(45 80% 62%)" opacity="0.1" strokeWidth="1.6">
              <path d="M120 880 l38 -38 m-38 10 l28 -28 m-18 38 l-8 8 m4 -14 l10 10" />
              <path d={`M${screenW - 150} 420 q0 -16 12 -16 q12 0 12 16 q10 8 10 24 q0 22 -22 22 q-22 0 -22 -22 q0 -16 10 -24 z`} />
            </g>
            {/* tiny particles */}
            <g fill="hsl(190 85% 70%)">
              <circle cx="104" cy="500" r="1.6" opacity="0.32" />
              <circle cx={screenW - 90} cy="560" r="1.2" opacity="0.28" />
              <circle cx="150" cy="1020" r="1.4" opacity="0.26" />
              <circle cx={screenW - 130} cy="940" r="1.8" opacity="0.24" />
              <circle cx={screenW / 2 - 250} cy="330" r="1.2" opacity="0.24" />
              <circle cx={screenW / 2 + 265} cy="1180" r="1.5" opacity="0.26" />
              <circle cx={screenW / 2 + 180} cy="250" r="1.1" opacity="0.2" />
            </g>
            <g fill="hsl(160 85% 60%)">
              <circle cx={screenW / 2 - 190} cy="1240" r="1.6" opacity="0.28" />
              <circle cx={screenW / 2 + 120} cy="1290" r="1.3" opacity="0.24" />
            </g>
            <g fill="hsl(45 90% 65%)">
              <circle cx="210" cy="230" r="1.3" opacity="0.28" />
              <circle cx={screenW - 200} cy="1250" r="1.4" opacity="0.24" />
            </g>
          </svg>
          {/* Content column spans only the VISIBLE part of the screen so the
              QR + caption sit near the lower edge of the capture. */}
          <div
            className="absolute left-0 right-0 top-0 flex flex-col"
            style={{
              height: visibleScreenH,
              paddingTop: islandTop + islandH + 12,
              paddingLeft: 14,
              paddingRight: 14,
              paddingBottom: 12,
              zIndex: 10,
            }}
          >
            {showCta && (
              <div className="shrink-0 flex justify-center pb-2">
                <QuizCtaTop variant={isEndSlide ? "brand" : "full"} />
              </div>
            )}
            <div ref={centerRef} className="flex-1 min-h-0 flex items-center justify-center">
              <div
                ref={cardRef}
                data-quiz-content-card
                style={{ width: BASE_CONTENT_WIDTH, zoom: scale, flexShrink: 0 }}
              >
                {children}
              </div>
            </div>
            {showCta && (
              <div className="shrink-0 flex flex-col items-center gap-1 pt-2">
                <QuizCtaQr />
                <span
                  data-quiz-cta-scan
                  className="text-[13px] font-semibold tracking-wide"
                  style={{ color: "hsl(42 45% 78%)" }}
                >
                  Scan to play
                </span>
              </div>
            )}
          </div>
          {/* Subtle dynamic-island pill — the only hardware detail on the
              flat top screen. Sits clear of the content (no overlay). */}
          <div
            data-quiz-phone-island
            className="absolute pointer-events-none"
            aria-hidden
            style={{
              left: (screenW - islandW) / 2,
              top: islandTop,
              width: islandW,
              height: islandH,
              borderRadius: islandH / 2,
              background: "#0b0f18",
              boxShadow: "inset 0 0 0 1px hsl(215 25% 30% / 0.55)",
              zIndex: 30,
            }}
          >
            <div
              className="absolute rounded-full"
              style={{
                right: 12,
                top: islandH / 2 - 5,
                width: 10,
                height: 10,
                background: "#141b28",
                boxShadow: "inset 0 0 0 1.5px hsl(215 40% 38% / 0.7), inset 0 0 3px hsl(215 60% 30%)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuizRenderPage() {
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
  // faithful, deterministic styling.
  useEffect(() => {
    const root = document.documentElement;
    const added = ["dark", "theme-lol"].filter((c) => !root.classList.contains(c));
    added.forEach((c) => root.classList.add(c));
    return () => added.forEach((c) => root.classList.remove(c));
  }, []);

  // Remove the index.html boot splash (#initial-shell): it is a fixed,
  // viewport-centered Mogsy wordmark at z-index 9999 whose fade-out lingers
  // in captures and overlaps answer rows.
  useEffect(() => {
    document.getElementById("initial-shell")?.remove();
  }, []);

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

  const { stageRef, centerRef, cardRef, scale } = useRenderReady(!error, format, forcedScale);

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
    >
      {content}
    </FormatShell>
  );
}
