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

/** Waits for fonts + images, then stamps the ready attribute on the stage. */
function useRenderReady(enabled: boolean) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
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
      // Two frames so layout from font/image swaps settles before capture.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!cancelled) stageRef.current?.setAttribute("data-quiz-render-ready", "true");
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return stageRef;
}

function QuestionCard({
  question,
  plan,
}: {
  question: RenderQuestion;
  plan: AnswerPlan;
}) {
  const { selectedIndex, revealed, isCorrectSelection, showExplanation } = plan;

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
        {mainVisual && (
          <div className="rounded-lg overflow-hidden border border-border bg-black/20">
            <img src={mainVisual} alt="Question visual" className="w-full max-h-56 object-contain" />
          </div>
        )}
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
  state,
}: {
  format: RenderFormat;
  children: React.ReactNode;
  stageRef: React.Ref<HTMLDivElement>;
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
  // Social composition shell: exact platform pixel size, safe-area padding,
  // vertically centered content column, stable dark backdrop.
  return (
    <div
      ref={stageRef}
      data-quiz-render-stage
      data-render-state={state}
      data-render-format={format.key}
      className="overflow-hidden flex items-center justify-center text-foreground"
      style={{
        width: format.width,
        height: format.height,
        padding: format.safeAreaPadding,
        background:
          "radial-gradient(120% 90% at 50% 0%, #14213b 0%, #0a1022 55%, #060912 100%)",
      }}
    >
      <div className="w-full" style={{ maxWidth: format.contentMaxWidth }}>
        {children}
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
        content = <QuestionCard question={question} plan={planResult.plan} />;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const stageRef = useRenderReady(!error);

  if (error) return <ErrorPanel message={error} />;

  return (
    <FormatShell format={format!} state={stateParam as RenderState} stageRef={stageRef}>
      {content}
    </FormatShell>
  );
}
