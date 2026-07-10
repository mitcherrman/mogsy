import React, { useEffect, useMemo, useState } from "react";
import { continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Sparkles } from "lucide-react";
import type { QuizQuestion } from "@/lib/quiz/api";
import {
  ScenarioCard,
  classifySubject,
  isSpoilerSubject,
  selectScenario,
} from "@/components/quiz-broadcast/scenario-cards";
import {
  AnswerGrid,
  ChromeBadge,
  ExplanationBody,
  QuestionText,
} from "@/components/quiz-broadcast/BroadcastRenderer";
import {
  computeQuestionPose,
  computeRevealPose,
  revealTFor,
  type RevealPose,
} from "@/components/quiz-broadcast/revealTimelineMath";
import { VideoKnowledgeCore } from "./broadcast-fx/VideoKnowledgeCore";
import { VideoOverloadFX } from "./broadcast-fx/VideoOverloadFX";
import { VideoFinalCountdown } from "./broadcast-fx/VideoFinalCountdown";
import { VideoRevealFX } from "./broadcast-fx/VideoRevealFX";
import { corePulse, coreOverload, videoPhaseAt } from "./broadcast-fx/videoPhase";
import type { QuestionTimeline } from "./timing";
import type { QuizVideoQuestion } from "./types";
import { resolveCorrectIndex } from "./types";

/**
 * One quiz question rendered as a deterministic copy of the live broadcast:
 * BroadcastStage's layer stack (backdrop FX → overload FX → chrome → 28/52/20
 * scene row with the Knowledge Core in the right panel → progress → final
 * countdown) and SceneRow's camera choreography, with every animated value
 * derived from the shared timeline via useCurrentFrame.
 *
 * The camera math is the SAME function the live useRevealTimeline uses
 * (revealTimelineMath.computeRevealPose) — the export can't drift from the
 * broadcast. Wall-clock components (useRevealTimeline, rAF countdowns, the
 * live core/overload/FX layers) are replaced by the frame-driven ports in
 * ./broadcast-fx, which reuse the live components' geometry and formulas.
 *
 * QR/CTA intentionally does NOT appear here — the Knowledge Core owns the
 * right panel exactly as in the designed broadcast; the website line lives
 * in the outro card and a small stage-corner footer only.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function toBroadcastQuestion(q: QuizVideoQuestion): QuizQuestion {
  return {
    id: q.id,
    category: q.category ?? "",
    question_text: q.question,
    format: "multiple_choice",
    choices: q.choices,
    difficulty: q.difficulty,
    metadata: q.metadata,
    image_path: q.image_path,
  } as QuizQuestion;
}

function collectUrls(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) for (const v of value) collectUrls(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectUrls(v, out);
}

function usePreloadImages(urls: string[]) {
  const [handle] = useState(() => (urls.length ? delayRender(`preload ${urls.length} image(s)`) : null));
  useEffect(() => {
    if (handle === null) return;
    let remaining = urls.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) continueRender(handle);
    };
    for (const url of urls) {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);
}

export const BroadcastQuestionScene: React.FC<{
  timeline: QuestionTimeline;
  total: number;
  patch?: string;
}> = ({ timeline, total, patch }) => {
  const frame = useCurrentFrame(); // local to the wrapping <Sequence>
  const { fps } = useVideoConfig();
  const q = timeline.question;

  // Milestones relative to sequence start
  const choicesAt = timeline.choicesFrame - timeline.startFrame;
  const revealAt = timeline.revealFrame - timeline.startFrame;
  const outAt = timeline.outFrame - timeline.startFrame;
  const endAt = timeline.endFrame - timeline.startFrame;
  const msOf = (fr: number) => (fr / fps) * 1000;

  const correctIndex = resolveCorrectIndex(q);
  const correctAnswer = correctIndex >= 0 ? q.choices[correctIndex] : null;
  const revealed = frame >= revealAt;
  const choicesVisible = frame >= choicesAt;
  const questionIndex = timeline.index + 1;

  const question = useMemo(() => toBroadcastQuestion(q), [q]);
  const subject = useMemo(() => classifySubject(question), [question]);
  const isSpoiler = useMemo(
    () => isSpoilerSubject(question, subject, correctAnswer),
    [question, subject, correctAnswer],
  );
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const revealName =
    correctAnswer ||
    (typeof meta.champion_name === "string" ? meta.champion_name : undefined) ||
    subject.label;

  // Preload subject art for both card states so no frame catches a half-load.
  const imageUrls = useMemo(() => {
    const urls = new Set<string>();
    collectUrls(selectScenario(question, false, correctAnswer), urls);
    collectUrls(selectScenario(question, true, correctAnswer), urls);
    return [...urls];
  }, [question, correctAnswer]);
  usePreloadImages(imageUrls);

  // ── Broadcast phase + camera pose (shared math) ────────────────────────
  const state = videoPhaseAt(frame, fps, timeline);
  const nowMs = state.localMs;

  let pose: RevealPose;
  if (state.phase === "question") {
    pose = computeQuestionPose({ nowMs, remainingMs: state.remainingToRevealMs });
  } else {
    const t = revealTFor(state.phase, state.phaseElapsedMs, state.phaseDurationMs);
    pose = computeRevealPose({ t, nowMs, isSpoiler, isShorts: false });
  }

  // SceneSlider equivalent: enter (x 80→0, 0.42 s). The exit slide runs over
  // the FINAL 0.42 s of the transition segment — the revealed scene holds on
  // screen until it hands off directly to the next question's slide-in, so
  // there are no dead empty frames between questions (live SceneSlider
  // overlaps exit/enter the same way).
  const enterMs = msOf(frame);
  const enterT = Math.min(1, enterMs / 420);
  const enterEase = 1 - (1 - enterT) ** 3;
  const exitT = interpolate(frame, [Math.max(outAt, endAt - Math.round(0.42 * fps)), endAt], [0, 1], clamp);
  const sliderX = (1 - enterEase) * 80 - exitT * 80;
  const sliderOpacity = enterEase * (1 - exitT);

  // Stable pulse/overload evaluators for the core's deterministic simulation.
  const pulseAt = useMemo(
    () => (ms: number) => corePulse(videoPhaseAt((ms / 1000) * fps, fps, timeline)),
    [fps, timeline],
  );
  const overloadAt = useMemo(
    () => (ms: number) => coreOverload(videoPhaseAt((ms / 1000) * fps, fps, timeline)),
    [fps, timeline],
  );

  // Countdown bar progress (live bar style, frame-driven width)
  const countdownProgress = interpolate(frame, [choicesAt, revealAt], [0, 1], clamp);
  const inCountdown = choicesVisible && !revealed;

  const showExplanation =
    timeline.hasExplanation && state.phase !== "question" && frame >= timeline.explanationFrame - timeline.startFrame && Boolean(q.explanation);

  return (
    <div className="absolute inset-0 text-white">
      {/* Reveal FX layer — coins + sparkles, behind everything (live z-[5]) */}
      <div className="pointer-events-none absolute inset-0 z-[5]">
        <VideoRevealFX sinceRevealMs={state.sinceRevealMs} questionIndex={questionIndex} />
      </div>

      {/* Hextech overload FX — cracks + localized vignette (live z-[6]),
          anchored to the Knowledge Core in the right panel. */}
      <div className="pointer-events-none absolute inset-0 z-[6]">
        <VideoOverloadFX
          state={state}
          questionIndex={questionIndex}
          episodeStartMs={msOf(revealAt) - 5000}
          anchorX={0.88}
          anchorY={0.49}
          aspect={16 / 9}
        />
      </div>

      {/* Top chrome — same badges as the live TopChrome */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/55 via-black/25 to-transparent px-[2%] py-[0.9%] text-white/80">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-[#d4b35a]/35 bg-black/40 px-2 py-1">
            <Sparkles className="h-3 w-3 text-[#e8c97a]" />
            <span className="text-[1.08cqmin] font-bold uppercase tracking-[0.32em] text-[#e8c97a]">Mogsy</span>
          </div>
          {q.category && <ChromeBadge tone="cyan">{String(q.category).replace(/_/g, " ")}</ChromeBadge>}
          {q.difficulty != null && <ChromeBadge tone="amber">Difficulty {q.difficulty}</ChromeBadge>}
        </div>
        <div className="flex items-center gap-2">
          <ChromeBadge tone="gold">
            Q {questionIndex} / {total}
          </ChromeBadge>
          {(q.patch || patch) && <ChromeBadge tone="muted">Patch {q.patch || patch}</ChromeBadge>}
        </div>
      </div>

      {/* Main scene — SceneSlider + SceneRow structure, camera pose applied */}
      <div className="absolute inset-x-0 top-[7.5%] bottom-[9%] z-20 flex px-[2.5%]">
        <div className="relative h-full w-full overflow-hidden">
          <div
            className="absolute inset-0 flex"
            style={{ transform: `translateX(${sliderX}px)`, opacity: sliderOpacity }}
          >
            <div
              className="relative h-full w-full overflow-hidden will-change-transform"
              style={{ transform: `scale(${pose.sceneScale}) translateX(${pose.sceneX}vw)` }}
            >
              {/* Cinematic darkness overlay — camera timeline drive */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[35] bg-black"
                style={{ opacity: pose.darkness }}
              />

              <div className="relative flex h-full w-full gap-[1.6%]">
                {/* Subject column — expands 28% → 88% on spoiler reveal */}
                <div
                  className="relative flex shrink-0 items-center justify-center overflow-hidden h-full"
                  style={{ width: `${pose.subjectWidthPct}%`, transform: `scale(${pose.subjectScale})` }}
                >
                  <ScenarioCard question={question} revealActive={revealed} correctAnswer={revealName ?? correctAnswer} />

                  {/* Name card — same markup as SceneRow, opacity from the timeline */}
                  {revealName && (
                    <div
                      className="pointer-events-none absolute bottom-[5%] left-1/2 z-30 w-[72%] -translate-x-1/2 rounded-2xl border border-[#d4b35a]/55 bg-black/55 px-[5%] py-[2%] text-center shadow-[0_22px_60px_rgba(0,0,0,0.7)] backdrop-blur-md"
                      style={{ opacity: pose.nameOpacity }}
                    >
                      <div className="text-[1.15cqmin] font-bold uppercase tracking-[0.45em] text-[#e8c97a]/90">
                        Correct Answer
                      </div>
                      <div className="mt-2 bg-gradient-to-b from-white via-[#fff2bd] to-[#b8893a] bg-clip-text text-[6cqmin] font-black uppercase leading-none tracking-wide text-transparent drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]">
                        {revealName}
                      </div>
                    </div>
                  )}
                </div>

                {/* Content column — slides off-screen during spoiler reveal */}
                <div
                  className="flex min-w-0 flex-1 flex-col justify-center gap-[2%]"
                  style={{ transform: `translateX(${pose.contentX}vw)`, opacity: pose.contentOpacity }}
                >
                  <div className="flex h-full w-full flex-col justify-center gap-[2.2%] px-[1%]">
                    <QuestionText text={q.question} />

                    <div style={{ opacity: choicesVisible ? 1 : 0 }}>
                      <AnswerGrid choices={q.choices} style="grid" revealActive={revealed} correctAnswer={correctAnswer} />
                    </div>

                    {/* Countdown bar — live CountdownView "bar" styling, frame width */}
                    {inCountdown ? (
                      <div className="relative h-[1.4cqmin] w-full overflow-hidden rounded-full bg-white/8 ring-1 ring-inset ring-[#d4b35a]/20">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#d4b35a] via-[#f3dca0] to-emerald-300 shadow-[0_0_18px_rgba(212,179,90,0.55)]"
                          style={{ width: `${(1 - countdownProgress) * 100}%` }}
                        />
                      </div>
                    ) : (
                      <div className="h-[2.4cqmin]" />
                    )}

                    {/* Explanation — live QuestionPanel reveal overlay markup */}
                    <div className="relative min-h-[12%]">
                      {showExplanation && (
                        <div
                          className="absolute inset-x-0 top-0 rounded-xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/12 via-emerald-300/8 to-cyan-300/8 p-[1.4%] text-[2cqmin] leading-relaxed text-emerald-50 backdrop-blur-md"
                          style={{ opacity: interpolate(state.phaseElapsedMs, [0, 340], [0, 1], clamp) }}
                        >
                          <div className="mb-1 flex items-baseline justify-between gap-3">
                            <div className="text-[1.2cqmin] font-bold uppercase tracking-[0.3em] text-emerald-200/90">
                              Correct Answer
                            </div>
                            {correctAnswer && (
                              <div className="text-[1.95cqmin] font-black uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                                {correctAnswer}
                              </div>
                            )}
                          </div>
                          <ExplanationBody question={question} explanation={q.explanation ?? null} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right panel — the Knowledge Core, exactly as the designed
                    broadcast (showQrCode/showWebsite off → core visible).
                    Exits with the content on spoiler reveals. */}
                <div
                  className="flex h-full w-[20%] shrink-0 items-center justify-center"
                  style={{ transform: `translateX(${pose.qrX}vw)`, opacity: pose.qrOpacity }}
                >
                  <VideoKnowledgeCore
                    state={state}
                    questionIndex={questionIndex}
                    revealAtMs={msOf(revealAt)}
                    pulseAt={pulseAt}
                    overloadAt={overloadAt}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dramatic final 3·2·1 countdown — frame-driven port (live z-[45]) */}
      <VideoFinalCountdown remainingMs={state.remainingToRevealMs} questionIndex={questionIndex} />
    </div>
  );
};
