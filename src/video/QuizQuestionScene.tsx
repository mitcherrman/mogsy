import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  CHOICE_LETTERS,
  COLORS,
  FONT_STACK,
  categoryLabel,
  difficultyLabel,
  subjectLabel,
} from "./format";
import { resolveCorrectIndex, type QuizVideoQuestion } from "./types";
import type { QuestionTimeline } from "./timing";

/**
 * One quiz question, fully frame-driven (no wall clock, no RAF):
 *   question in → choices in → countdown → reveal → explanation → slide out.
 * All milestones come from the shared timing model so on-screen events
 * match the exported timestamps exactly.
 */
export const QuizQuestionScene: React.FC<{
  timeline: QuestionTimeline;
  total: number;
}> = ({ timeline, total }) => {
  const frame = useCurrentFrame(); // local to the wrapping <Sequence>
  const { fps } = useVideoConfig();
  const q = timeline.question;

  // Milestones relative to sequence start
  const choicesAt = timeline.choicesFrame - timeline.startFrame;
  const revealAt = timeline.revealFrame - timeline.startFrame;
  const explanationAt = timeline.explanationFrame - timeline.startFrame;
  const outAt = timeline.outFrame - timeline.startFrame;
  const endAt = timeline.endFrame - timeline.startFrame;

  const correctIndex = resolveCorrectIndex(q);
  const revealed = frame >= revealAt;

  // Entrance: slide up + fade
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  // Exit: slide left + fade during transition segment
  const exit = interpolate(frame, [outAt, endAt], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const countdownProgress = interpolate(frame, [choicesAt, revealAt], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const secondsLeft = Math.ceil(((revealAt - frame) / fps) * 1) ;
  const inCountdown = frame >= choicesAt && frame < revealAt;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        fontFamily: FONT_STACK,
        color: COLORS.text,
        opacity: 1 - exit,
        transform: `translateX(${exit * -80}px) translateY(${(1 - enter) * 60}px)`,
      }}
    >
      {/* Header row: question number + badges */}
      <div
        style={{
          position: "absolute",
          top: 70,
          left: 120,
          right: 120,
          display: "flex",
          alignItems: "center",
          gap: 24,
          opacity: enter,
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: 4,
            color: COLORS.gold,
            border: `2px solid ${COLORS.panelBorder}`,
            borderRadius: 12,
            padding: "10px 24px",
            background: COLORS.panel,
          }}
        >
          QUESTION {timeline.index + 1} / {total}
        </div>
        {q.category && (
          <Badge>{categoryLabel(q.category)}</Badge>
        )}
        {q.difficulty ? <Badge color={COLORS.cyan}>{difficultyLabel(q.difficulty)}</Badge> : null}
        {q.patch && <Badge>Patch {q.patch}</Badge>}
        <div style={{ marginLeft: "auto", fontSize: 28, color: COLORS.textDim }}>
          {subjectLabel(q)}
        </div>
      </div>

      {/* Question text */}
      <div
        style={{
          position: "absolute",
          top: 190,
          left: 120,
          right: 120,
          opacity: enter,
        }}
      >
        <div
          style={{
            background: COLORS.panel,
            border: `2px solid ${COLORS.panelBorder}`,
            borderRadius: 20,
            padding: "44px 56px",
            fontSize: q.question.length > 90 ? 46 : 54,
            fontWeight: 700,
            lineHeight: 1.25,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {q.question}
        </div>
      </div>

      {/* Choices */}
      <div
        style={{
          position: "absolute",
          top: 470,
          left: 120,
          right: 120,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28,
        }}
      >
        {q.choices.map((choice, i) => {
          const choiceIn = spring({
            frame: frame - choicesAt - i * 6,
            fps,
            config: { damping: 200 },
            durationInFrames: 24,
          });
          const isCorrect = revealed && i === correctIndex;
          const isWrong = revealed && correctIndex >= 0 && i !== correctIndex;
          const revealPop = isCorrect
            ? spring({ frame: frame - revealAt, fps, config: { damping: 12, stiffness: 120 }, durationInFrames: 40 })
            : 0;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                background: isCorrect ? COLORS.correctBg : COLORS.panel,
                border: `2px solid ${isCorrect ? COLORS.correct : COLORS.panelBorder}`,
                borderRadius: 16,
                padding: "26px 32px",
                fontSize: 40,
                fontWeight: 600,
                opacity: frame < choicesAt ? 0 : choiceIn * (isWrong ? 0.45 : 1),
                transform: `translateY(${(1 - choiceIn) * 40}px) scale(${1 + revealPop * 0.03})`,
                boxShadow: isCorrect
                  ? `0 0 ${30 + revealPop * 20}px rgba(34,197,94,0.45)`
                  : "0 4px 20px rgba(0,0,0,0.35)",
                color: isWrong ? COLORS.wrongDim : COLORS.text,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 58,
                  height: 58,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: isCorrect ? COLORS.correct : "rgba(200,170,110,0.15)",
                  color: isCorrect ? "#06210f" : COLORS.gold,
                  fontWeight: 800,
                }}
              >
                {isCorrect ? "✓" : CHOICE_LETTERS[i] ?? "•"}
              </span>
              {choice}
            </div>
          );
        })}
      </div>

      {/* Countdown bar */}
      {inCountdown && (
        <div style={{ position: "absolute", left: 120, right: 120, bottom: 110 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 30,
              color: COLORS.textDim,
              marginBottom: 12,
            }}
          >
            <span>Lock in your answer…</span>
            <span style={{ color: secondsLeft <= 3 ? COLORS.gold : COLORS.textDim, fontWeight: 800 }}>
              {secondsLeft}s
            </span>
          </div>
          <div style={{ height: 14, borderRadius: 7, background: "rgba(255,255,255,0.08)" }}>
            <div
              style={{
                height: "100%",
                width: `${countdownProgress * 100}%`,
                borderRadius: 7,
                background: `linear-gradient(90deg, ${COLORS.cyan}, ${COLORS.gold})`,
              }}
            />
          </div>
        </div>
      )}

      {/* Explanation card */}
      {timeline.hasExplanation && frame >= explanationAt && (
        <ExplanationCard text={q.explanation!} frame={frame - explanationAt} fps={fps} />
      )}
    </div>
  );
};

const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <span
    style={{
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      color: color ?? COLORS.textDim,
      border: `1px solid ${COLORS.panelBorder}`,
      borderRadius: 999,
      padding: "8px 20px",
      background: "rgba(0,0,0,0.35)",
    }}
  >
    {children}
  </span>
);

const ExplanationCard: React.FC<{ text: string; frame: number; fps: number }> = ({
  text,
  frame,
  fps,
}) => {
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        bottom: 90,
        background: "rgba(10, 200, 185, 0.10)",
        border: `2px solid rgba(10, 200, 185, 0.45)`,
        borderRadius: 16,
        padding: "26px 36px",
        fontSize: 34,
        lineHeight: 1.4,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 40}px)`,
      }}
    >
      <span style={{ color: COLORS.cyan, fontWeight: 800, marginRight: 16 }}>WHY:</span>
      {text}
    </div>
  );
};
