/**
 * Deterministic timing model for the quiz video.
 *
 * Single source of truth: the Remotion composition AND the timestamp
 * exporter both consume `buildTimeline`, so the chapters written next to
 * the MP4 always match the rendered frames exactly.
 */
import {
  DEFAULT_INTRO_SECONDS,
  DEFAULT_OUTRO_SECONDS,
  DEFAULT_SEGMENTS,
  type QuizSegmentSeconds,
  type QuizVideoData,
  type QuizVideoQuestion,
} from "./types";

export const FPS = 60;

export type QuestionTimeline = {
  question: QuizVideoQuestion;
  index: number; // 0-based
  /** Absolute frames from video start. */
  startFrame: number;
  choicesFrame: number; // choices + countdown begin
  revealFrame: number;
  explanationFrame: number; // === outFrame when no explanation
  outFrame: number; // transition begins
  endFrame: number; // exclusive
  segments: QuizSegmentSeconds;
  hasExplanation: boolean;
};

export type VideoTimeline = {
  fps: number;
  introFrames: number;
  outroFrames: number;
  outroStartFrame: number;
  totalFrames: number;
  totalSeconds: number;
  questions: QuestionTimeline[];
};

const sec = (s: number) => Math.round(s * FPS);

function segmentsFor(data: QuizVideoData, q: QuizVideoQuestion): QuizSegmentSeconds {
  return { ...DEFAULT_SEGMENTS, ...data.default_durations, ...q.durations };
}

export function buildTimeline(data: QuizVideoData): VideoTimeline {
  const introFrames = sec(data.intro_seconds ?? DEFAULT_INTRO_SECONDS);
  const outroFrames = sec(data.outro_seconds ?? DEFAULT_OUTRO_SECONDS);

  let cursor = introFrames;
  const questions: QuestionTimeline[] = data.questions.map((question, index) => {
    const segments = segmentsFor(data, question);
    const hasExplanation = Boolean(question.explanation?.trim()) && segments.explanation > 0;

    const startFrame = cursor;
    const choicesFrame = startFrame + sec(segments.question);
    const revealFrame = choicesFrame + sec(segments.countdown);
    const explanationFrame = revealFrame + sec(segments.reveal);
    const outFrame = explanationFrame + (hasExplanation ? sec(segments.explanation) : 0);
    const endFrame = outFrame + sec(segments.transition);
    cursor = endFrame;

    return {
      question,
      index,
      startFrame,
      choicesFrame,
      revealFrame,
      explanationFrame,
      outFrame,
      endFrame,
      segments,
      hasExplanation,
    };
  });

  const outroStartFrame = cursor;
  const totalFrames = outroStartFrame + outroFrames;

  return {
    fps: FPS,
    introFrames,
    outroFrames,
    outroStartFrame,
    totalFrames,
    totalSeconds: totalFrames / FPS,
    questions,
  };
}

/* ── Timestamp / chapter metadata ──────────────────────────────────────── */

export type Chapter = {
  seconds: number;
  timestamp: string; // "MM:SS" or "H:MM:SS"
  label: string;
};

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/** YouTube-description-friendly chapter list derived from the timeline. */
export function buildChapters(data: QuizVideoData, timeline = buildTimeline(data)): Chapter[] {
  const chapters: Chapter[] = [{ seconds: 0, timestamp: formatTimestamp(0), label: "Intro" }];
  for (const qt of timeline.questions) {
    const seconds = qt.startFrame / timeline.fps;
    chapters.push({
      seconds,
      timestamp: formatTimestamp(seconds),
      label: `Question ${qt.index + 1} — ${qt.question.question}`,
    });
  }
  if (timeline.outroFrames > 0) {
    const seconds = timeline.outroStartFrame / timeline.fps;
    chapters.push({ seconds, timestamp: formatTimestamp(seconds), label: "Outro" });
  }
  return chapters;
}

/** Full machine-readable metadata written next to the MP4. */
export function buildMetadata(data: QuizVideoData) {
  const timeline = buildTimeline(data);
  return {
    title: data.title,
    fps: timeline.fps,
    total_frames: timeline.totalFrames,
    total_seconds: timeline.totalSeconds,
    chapters: buildChapters(data, timeline),
    questions: timeline.questions.map((qt) => ({
      index: qt.index + 1,
      id: qt.question.id,
      question: qt.question.question,
      start_seconds: qt.startFrame / timeline.fps,
      start_timestamp: formatTimestamp(qt.startFrame / timeline.fps),
      reveal_seconds: qt.revealFrame / timeline.fps,
      reveal_timestamp: formatTimestamp(qt.revealFrame / timeline.fps),
      explanation_seconds: qt.hasExplanation ? qt.explanationFrame / timeline.fps : null,
      end_seconds: qt.endFrame / timeline.fps,
    })),
  };
}
