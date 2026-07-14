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
import { QuizCtaQr, QuizCtaTop } from "./QuizCta";
import RecipeVisual from "./RecipeVisual";
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
        const fit = Math.min(
          format.contentScale,
          availW / BASE_CONTENT_WIDTH,
          cardH > 0 ? availH / cardH : format.contentScale,
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

function QuestionCard({
  question,
  plan,
  format,
}: {
  question: RenderQuestion;
  plan: AnswerPlan;
  format: RenderFormat;
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
    <Card className="bg-card/80 backdrop-blur-sm">
      {/* Screenshot presentation: no category pill — the question text is the
          topmost content of the card. */}
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
          ) : format.kind === "social" ? (
            <div
              data-quiz-result-placeholder
              className="rounded-lg border p-4 text-sm"
              style={{
                borderColor: "hsl(215 30% 34% / 0.55)",
                background: "hsl(215 40% 12% / 0.55)",
                color: "hsl(215 20% 72%)",
              }}
            >
              <div className="flex items-center gap-2 font-semibold mb-1">
                <MessageCircle className="h-4 w-4" />
                Comment your answer!
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
}: {
  format: RenderFormat;
  children: React.ReactNode;
  stageRef: React.Ref<HTMLDivElement>;
  centerRef: React.Ref<HTMLDivElement>;
  cardRef: React.Ref<HTMLDivElement>;
  scale: number;
  state: RenderState;
}) {
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
        [data-quiz-render-stage] [data-quiz-choice]{min-height:56px}
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"]{
          background:linear-gradient(180deg,hsl(160 84% 46%) 0%,hsl(163 88% 38%) 100%)!important;
          border-color:hsl(158 95% 62%)!important;
          color:hsl(168 95% 7%)!important;
          box-shadow:0 0 22px hsl(160 90% 45% / 0.55), inset 0 1px 0 hsl(150 90% 75% / 0.55)!important;
        }
        [data-quiz-render-stage] [data-quiz-choice][data-choice-state="correct"] *{
          color:hsl(168 95% 7%)!important;
        }
        [data-quiz-render-stage] [data-quiz-answer-feedback].text-green-400{
          background:hsl(160 85% 45% / 0.16)!important;
          border-color:hsl(159 90% 52% / 0.75)!important;
          color:hsl(157 95% 58%)!important;
          box-shadow:0 0 18px hsl(160 90% 45% / 0.25)!important;
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
            background:
              "radial-gradient(120% 90% at 50% 0%, #14213b 0%, #0a1022 55%, #060912 100%)",
          }}
        >
          {/* Content column spans only the VISIBLE part of the screen so the
              QR + caption sit near the lower edge of the capture. */}
          <div
            className="absolute left-0 right-0 top-0 flex flex-col"
            style={{
              height: visibleScreenH,
              paddingTop: islandTop + islandH + 22,
              paddingLeft: 26,
              paddingRight: 26,
              paddingBottom: 18,
            }}
          >
            {showCta && (
              <div className="shrink-0 flex justify-center pb-3">
                <QuizCtaTop />
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
              <div className="shrink-0 flex flex-col items-center gap-1.5 pt-3">
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

  const question = useMemo(
    () => questions?.find((q) => String(q.id) === qId) ?? null,
    [questions, qId],
  );

  const format = getFormat(formatParam);
  const validState = isRenderState(stateParam);

  let error: string | null = null;
  let answerIndex: number | undefined;
  if (!questions) {
    error =
      "No render data. This internal harness only displays question data injected by the local screenshot runner.";
  } else if (!validState) {
    error = `Unknown state "${stateParam}".`;
  } else if (!format) {
    error = `Unknown format "${formatParam}".`;
  } else if (!qId) {
    error = "Missing ?q=<question id>.";
  } else if (!question) {
    error = `Question "${qId}" not found in render data.`;
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

  // Plan errors (e.g. explanation state without explanation, malformed
  // question) surface as the same inert error panel rather than crashing.
  // A "skip" is only reachable by direct manual navigation — the runner
  // plans skips before navigating — and is never rendered as fabricated text.
  let content: React.ReactNode = null;
  if (!error && question && format && validState) {
    try {
      const planResult = resolveAnswerPlan(question, stateParam, answerIndex);
      if (planResult.kind === "skip") {
        error = `State "${stateParam}" skipped: ${planResult.reason}`;
      } else {
        content = <QuestionCard question={question} plan={planResult.plan} format={format} />;
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
      stageRef={stageRef}
      centerRef={centerRef}
      cardRef={cardRef}
      scale={scale}
    >
      {content}
    </FormatShell>
  );
}
