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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import QuizAnswerOptions from "@/components/quiz/QuizAnswerOptions";
import QuizAnswerFeedback from "@/components/quiz/QuizAnswerFeedback";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { getFormat } from "@/lib/quiz-screenshot/formats";
import { isRenderState, resolveAnswerPlan } from "@/lib/quiz-screenshot/states";
import { SAMPLE_RENDER_QUESTIONS } from "@/lib/quiz-screenshot/fixtures";
import { deriveRecipe } from "@/lib/quiz-screenshot/recipe";
import QuizCta from "./QuizCta";
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
function useRenderReady(enabled: boolean, format: RenderFormat | undefined) {
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
      if (format.kind === "social" && centerRef.current && cardRef.current) {
        const availH = centerRef.current.clientHeight;
        const availW = Math.min(
          format.contentMaxWidth,
          format.width - format.safeAreaPadding * 2,
        );
        const cardH = cardRef.current.scrollHeight; // measured at zoom 1
        const fit = Math.min(
          format.contentScale,
          availW / BASE_CONTENT_WIDTH,
          cardH > 0 ? availH / cardH : format.contentScale,
        );
        setScale(Math.max(0.5, fit));
      }
      // Two frames so layout from the zoom/font/image swaps settles.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!cancelled) stageRef.current?.setAttribute("data-quiz-render-ready", "true");
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, format]);
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
      <CardHeader className="pb-3">
        {question.category && (
          <Badge variant="outline" className="w-fit mb-2 text-xs capitalize">
            {question.category.replace(/_/g, " ")}
          </Badge>
        )}
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
        {feedback && <QuizAnswerFeedback result={feedback} metadata={question.metadata} />}
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
  // Social content shell: exact platform pixel size, safe-area padding, and
  // a mobile-native card (~BASE_CONTENT_WIDTH px) zoomed up to fill the frame
  // — text stays vector-crisp. Layout is a column: centered card block, then
  // a fixed CTA footer. The zoom factor is fitted at readiness time to both
  // frame width and remaining height (see useRenderReady), so the card can
  // never clip or collide with the footer. CSS zoom (Chromium) scales layout
  // too, unlike transform:scale.
  const cta = format.cta;
  // Subtler CTA on the unanswered hook, full treatment on reveals.
  const ctaMode = cta === "none" ? null : state === "question" ? "compact" : cta;
  return (
    <div
      ref={stageRef}
      data-quiz-render-stage
      data-render-state={state}
      data-render-format={format.key}
      className="overflow-hidden flex flex-col text-foreground"
      style={{
        width: format.width,
        height: format.height,
        padding: format.safeAreaPadding,
        background:
          "radial-gradient(120% 90% at 50% 0%, #14213b 0%, #0a1022 55%, #060912 100%)",
      }}
    >
      <div ref={centerRef} className="flex-1 min-h-0 flex items-center justify-center">
        <div
          ref={cardRef}
          data-quiz-content-card
          style={{ width: BASE_CONTENT_WIDTH, zoom: scale, flexShrink: 0 }}
        >
          {children}
        </div>
      </div>
      {ctaMode && (
        <div className="shrink-0 flex justify-center pt-3">
          <QuizCta mode={ctaMode} />
        </div>
      )}
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

  const { stageRef, centerRef, cardRef, scale } = useRenderReady(!error, format);

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
