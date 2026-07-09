import React, { useEffect, useMemo, useState } from "react";
import {
  continueRender,
  delayRender,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Sparkles } from "lucide-react";
import type { QuizQuestion } from "@/lib/quiz/api";
import type { BroadcastVisuals } from "@/lib/quiz-broadcast/types";
import { ScenarioCard, selectScenario } from "@/components/quiz-broadcast/scenario-cards";
import {
  AnswerGrid,
  ChromeBadge,
  ExplanationBody,
  PlayAlongPanel,
  QuestionText,
} from "@/components/quiz-broadcast/BroadcastRenderer";
import type { QuestionTimeline } from "./timing";
import type { QuizVideoQuestion } from "./types";
import { resolveCorrectIndex } from "./types";

/**
 * One quiz question rendered with the REAL quiz-broadcast scene components
 * (ScenarioCard subject panel, AnswerGrid, ChromeBadge, PlayAlongPanel…) so
 * the MP4 export shares the live broadcast's visual source of truth.
 *
 * Remotion is only the controller here: every milestone (choices in, reveal,
 * explanation, slide-out) is derived from the shared deterministic timeline
 * (./timing.ts) via useCurrentFrame — no wall clock, no rAF, no engine state.
 * The broadcast's live-state machinery (useRevealTimeline, rAF countdowns,
 * Knowledge Core, overload FX, particles) is intentionally NOT used: it is
 * wall-clock driven and cannot render deterministically per frame.
 */

/** Map a video question back onto the QuizQuestion shape the broadcast
 *  components consume. metadata is the verbatim source-question metadata. */
function toBroadcastQuestion(q: QuizVideoQuestion): QuizQuestion {
  return {
    id: q.id,
    category: q.category ?? "",
    question_text: q.question,
    format: "multiple_choice",
    choices: q.choices,
    difficulty: q.difficulty,
    metadata: q.metadata,
  } as QuizQuestion;
}

/** Collect every http(s) URL nested in a scenario selection so the render
 *  can wait for the images (splash art, item icons) before capturing. */
function collectUrls(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectUrls(v, out);
  }
}

/** delayRender until the given image URLs have loaded (or errored — a 404
 *  falls back to the cards' gradient/monogram states, which is fine). */
function usePreloadImages(urls: string[]) {
  const [handle] = useState(() =>
    urls.length ? delayRender(`preload ${urls.length} scenario image(s)`) : null,
  );
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

const VIDEO_VISUALS: BroadcastVisuals = {
  aspect: "16:9",
  theme: "hextech",
  fontScale: 1,
  questionWidth: 100,
  answerStyle: "grid",
  countdownStyle: "bar",
  transitionStyle: "slide",
  backgroundAnimation: "particles",
  showLogo: true,
  showWebsite: true,
  websiteUrl: "mogsy.net/quiz",
  showQrCode: false, // QR image is an external fetch — not deterministic-safe
  showQuestionNumber: true,
  showCategoryBadge: true,
  showDifficultyBadge: true,
  showChampionPortrait: true,
  showChampionSplash: true,
  showItemIcons: true,
  showRuneIcons: true,
  showPatchLabel: true,
  showTips: true,
  showExplanations: true,
  hideShortsDormantInsight: false,
};

export const BroadcastQuestionScene: React.FC<{
  timeline: QuestionTimeline;
  total: number;
  website?: string;
  patch?: string;
}> = ({ timeline, total, website, patch }) => {
  const frame = useCurrentFrame(); // local to the wrapping <Sequence>
  const { fps } = useVideoConfig();
  const q = timeline.question;

  const visuals = useMemo(
    () => ({ ...VIDEO_VISUALS, websiteUrl: website || VIDEO_VISUALS.websiteUrl }),
    [website],
  );

  // Milestones relative to sequence start
  const choicesAt = timeline.choicesFrame - timeline.startFrame;
  const revealAt = timeline.revealFrame - timeline.startFrame;
  const explanationAt = timeline.explanationFrame - timeline.startFrame;
  const outAt = timeline.outFrame - timeline.startFrame;
  const endAt = timeline.endFrame - timeline.startFrame;

  const correctIndex = resolveCorrectIndex(q);
  const correctAnswer = correctIndex >= 0 ? q.choices[correctIndex] : null;
  const revealed = frame >= revealAt;
  const choicesVisible = frame >= choicesAt;

  const question = useMemo(() => toBroadcastQuestion(q), [q]);

  // Preload subject art for BOTH the pre-reveal and reveal card states so no
  // frame catches a half-loaded splash. (Manifest-based champion splash URLs
  // resolve inside ChampionScenarioCard; the classify-level URLs cover icons,
  // item components, and combat-calc art.)
  const imageUrls = useMemo(() => {
    const urls = new Set<string>();
    collectUrls(selectScenario(question, false, correctAnswer), urls);
    collectUrls(selectScenario(question, true, correctAnswer), urls);
    return [...urls];
  }, [question, correctAnswer]);
  usePreloadImages(imageUrls);

  // Entrance: slide up + fade. Exit: slide left + fade during transition.
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const exit = interpolate(frame, [outAt, endAt], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const revealName = revealed ? correctAnswer : null;
  const nameOpacity = interpolate(frame, [revealAt + 6, revealAt + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const explanationOpacity = interpolate(frame, [explanationAt, explanationAt + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const countdownProgress = interpolate(frame, [choicesAt, revealAt], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const secondsLeft = Math.max(0, Math.ceil((revealAt - frame) / fps));
  const inCountdown = choicesVisible && !revealed;

  const showExplanation =
    timeline.hasExplanation && frame >= explanationAt && Boolean(q.explanation);

  return (
    <div
      className="absolute inset-0 text-white"
      style={{
        opacity: (1 - exit) * Math.min(1, enter * 1.2),
        transform: `translateX(${exit * -80}px) translateY(${(1 - enter) * 40}px)`,
      }}
    >
      {/* Top chrome — same badges as BroadcastRenderer's TopChrome */}
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
            Q {timeline.index + 1} / {total}
          </ChromeBadge>
          {(q.patch || patch) && <ChromeBadge tone="muted">Patch {q.patch || patch}</ChromeBadge>}
        </div>
      </div>

      {/* Main scene — 28% subject | 52% question | 20% CTA, like SceneRow */}
      <div className="absolute inset-x-0 top-[7.5%] bottom-[9%] z-10 flex px-[2.5%]">
        <div className="relative flex h-full w-full gap-[1.6%]">
          {/* Subject column — the shared ScenarioCard framework */}
          <div className="relative flex h-full w-[28%] shrink-0 items-center justify-center overflow-hidden">
            <ScenarioCard question={question} revealActive={revealed} correctAnswer={correctAnswer} />

            {/* Name card on reveal — same markup as SceneRow's overlay */}
            {revealName && (
              <div
                className="pointer-events-none absolute bottom-[5%] left-1/2 z-30 w-[72%] -translate-x-1/2 rounded-2xl border border-[#d4b35a]/55 bg-black/55 px-[5%] py-[2%] text-center shadow-[0_22px_60px_rgba(0,0,0,0.7)] backdrop-blur-md"
                style={{ opacity: nameOpacity }}
              >
                <div className="text-[1.15cqmin] font-bold uppercase tracking-[0.45em] text-[#e8c97a]/90">
                  Correct Answer
                </div>
                <div className="mt-2 bg-gradient-to-b from-white via-[#fff2bd] to-[#b8893a] bg-clip-text text-[4.5cqmin] font-black uppercase leading-none tracking-wide text-transparent drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]">
                  {revealName}
                </div>
              </div>
            )}
          </div>

          {/* Content column — question, answers, countdown, explanation */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2.2%] px-[1%]">
            <QuestionText text={q.question} />

            <div style={{ opacity: choicesVisible ? 1 : 0 }}>
              <AnswerGrid
                choices={q.choices}
                style="grid"
                revealActive={revealed}
                correctAnswer={correctAnswer}
              />
            </div>

            {/* Countdown bar — broadcast bar styling, frame-driven width */}
            {inCountdown ? (
              <div>
                <div className="mb-[0.5cqmin] flex items-baseline justify-between text-[1.5cqmin] text-white/55">
                  <span className="uppercase tracking-[0.25em]">Lock in your answer</span>
                  <span
                    className={`font-black tabular-nums ${secondsLeft <= 3 ? "text-[#f3dca0]" : "text-white/55"}`}
                  >
                    {secondsLeft}s
                  </span>
                </div>
                <div className="relative h-[1.4cqmin] w-full overflow-hidden rounded-full bg-white/8 ring-1 ring-inset ring-[#d4b35a]/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#d4b35a] via-[#f3dca0] to-emerald-300 shadow-[0_0_18px_rgba(212,179,90,0.55)]"
                    style={{ width: `${(1 - countdownProgress) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="h-[2.4cqmin]" />
            )}

            {/* Explanation — same card markup as QuestionPanel's reveal overlay */}
            <div className="relative min-h-[12%]">
              {showExplanation && (
                <div
                  className="absolute inset-x-0 top-0 rounded-xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/12 via-emerald-300/8 to-cyan-300/8 p-[1.4%] text-[2cqmin] leading-relaxed text-emerald-50 backdrop-blur-md"
                  style={{ opacity: explanationOpacity }}
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

          {/* CTA column — shared PlayAlongPanel (website only; QR is off) */}
          <div className="flex h-full w-[20%] shrink-0 items-center justify-center">
            <PlayAlongPanel visuals={visuals} />
          </div>
        </div>
      </div>
    </div>
  );
};
