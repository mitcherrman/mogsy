/**
 * Pure helpers for the Admin → Video Export config panel.
 *
 * Turns a UI config into the exact `npm run video:*` CLI commands the operator
 * pastes into a terminal, and estimates the resulting video length + YouTube
 * chapter timestamps.
 *
 * Timing is NOT re-implemented here: we build a synthetic `QuizVideoData` of
 * placeholder questions and feed it through the real `src/video/timing.ts`
 * model, so the estimate matches what `video:render` will actually produce
 * (frame-for-frame, same FPS and segment constants). The only assumption the
 * UI can't know ahead of time is whether each question carries an explanation;
 * that's exposed as `assumeExplanations` so the estimate is honest about it.
 */
import {
  DEFAULT_INTRO_SECONDS,
  DEFAULT_OUTRO_SECONDS,
  DEFAULT_SEGMENTS,
  type QuizVideoData,
  type QuizVideoQuestion,
} from "@/video/types";
import { buildChapters, buildTimeline, formatTimestamp, type Chapter } from "@/video/timing";

export type VideoFormat = "16:9" | "9:16";

export type VideoExportConfig = {
  numQuestions: number;
  favoritesOnly: boolean;
  category: string; // "" = any
  pack: string; // "" = any
  difficultyMin: string; // "" = unset (kept as string for empty state)
  difficultyMax: string; // "" = unset
  reviewStatus: string; // "" = any
  title: string;
  subtitle: string;
  patch: string;
  website: string;
  outJsonPath: string;
  outMp4Path: string;
  format: VideoFormat;
  /** Estimate-only: assume every question has an explanation card. */
  assumeExplanations: boolean;
};

export const DEFAULT_VIDEO_EXPORT_CONFIG: VideoExportConfig = {
  numQuestions: 10,
  favoritesOnly: true,
  category: "",
  pack: "",
  difficultyMin: "",
  difficultyMax: "",
  reviewStatus: "",
  title: "Mogsy League Quiz",
  subtitle: "",
  patch: "",
  website: "mogsy.net/quiz",
  outJsonPath: "out/quiz-video-input.json",
  outMp4Path: "out/mogsy-quiz.mp4",
  format: "16:9",
  assumeExplanations: true,
};

/**
 * Quote a single CLI argument for a POSIX-ish shell only when needed.
 * Values with spaces or shell-special chars get double-quoted; inner double
 * quotes are escaped. Simple tokens (paths, numbers, flags) pass through.
 */
export function quoteArg(value: string): string {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function pushFlag(args: string[], flag: string, value: string | undefined | null) {
  const v = (value ?? "").trim();
  if (v === "") return;
  args.push(flag, quoteArg(v));
}

/** `npm run video:prepare -- …` — builds the input JSON from real quiz data. */
export function buildPrepareCommand(config: VideoExportConfig): string {
  const args: string[] = [];
  if (config.favoritesOnly) args.push("--favorites");
  args.push("--limit", String(Math.max(1, Math.round(config.numQuestions || 1))));
  pushFlag(args, "--category", config.category);
  pushFlag(args, "--pack", config.pack);
  pushFlag(args, "--difficulty-min", config.difficultyMin);
  pushFlag(args, "--difficulty-max", config.difficultyMax);
  pushFlag(args, "--review-status", config.reviewStatus);
  pushFlag(args, "--title", config.title);
  pushFlag(args, "--subtitle", config.subtitle);
  pushFlag(args, "--patch", config.patch);
  pushFlag(args, "--website", config.website);
  pushFlag(args, "--out", config.outJsonPath);
  return `npm run video:prepare -- ${args.join(" ")}`;
}

/** `npm run video:render -- …` — renders the MP4 from the prepared JSON. */
export function buildRenderCommand(config: VideoExportConfig): string {
  const args: string[] = [];
  pushFlag(args, "--props", config.outJsonPath || DEFAULT_VIDEO_EXPORT_CONFIG.outJsonPath);
  pushFlag(args, "--out", config.outMp4Path);
  return `npm run video:render -- ${args.join(" ")}`;
}

/** `npm run video:timestamps -- …` — regenerate chapter/metadata files only. */
export function buildTimestampsCommand(config: VideoExportConfig): string {
  const args: string[] = [];
  pushFlag(args, "--props", config.outJsonPath || DEFAULT_VIDEO_EXPORT_CONFIG.outJsonPath);
  pushFlag(args, "--out", config.outMp4Path);
  return `npm run video:timestamps -- ${args.join(" ")}`;
}

export type VideoExportCommands = {
  prepare: string;
  render: string;
  timestamps: string;
};

export function buildCommands(config: VideoExportConfig): VideoExportCommands {
  return {
    prepare: buildPrepareCommand(config),
    render: buildRenderCommand(config),
    timestamps: buildTimestampsCommand(config),
  };
}

/**
 * Build a synthetic QuizVideoData matching the config, so the real timing
 * model can estimate the output. Placeholder questions carry an explanation
 * only when `assumeExplanations` is set (that's the one input the UI can't
 * know without fetching the actual rows).
 */
function syntheticData(config: VideoExportConfig): QuizVideoData {
  const n = Math.max(1, Math.round(config.numQuestions || 1));
  const questions: QuizVideoQuestion[] = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    question: `Question ${i + 1}`,
    choices: ["A", "B", "C", "D"],
    correct_index: 0,
    explanation: config.assumeExplanations ? "Estimated explanation card." : undefined,
  }));
  return {
    title: config.title || DEFAULT_VIDEO_EXPORT_CONFIG.title,
    subtitle: config.subtitle || undefined,
    website: config.website || undefined,
    patch: config.patch || undefined,
    questions,
  };
}

export type VideoTimingEstimate = {
  numQuestions: number;
  fps: number;
  introSeconds: number;
  outroSeconds: number;
  /** Length of a single question segment with the default durations. */
  perQuestionSeconds: number;
  totalSeconds: number;
  totalTimestamp: string;
  chapters: Chapter[];
  /** True when the per-question estimate includes an explanation card. */
  includesExplanations: boolean;
};

export function estimateTiming(config: VideoExportConfig): VideoTimingEstimate {
  const data = syntheticData(config);
  const timeline = buildTimeline(data);
  const chapters = buildChapters(data, timeline);

  const first = timeline.questions[0];
  const perQuestionSeconds = first ? (first.endFrame - first.startFrame) / timeline.fps : 0;

  return {
    numQuestions: timeline.questions.length,
    fps: timeline.fps,
    introSeconds: timeline.introFrames / timeline.fps,
    outroSeconds: timeline.outroFrames / timeline.fps,
    perQuestionSeconds,
    totalSeconds: timeline.totalSeconds,
    totalTimestamp: formatTimestamp(timeline.totalSeconds),
    chapters,
    includesExplanations: config.assumeExplanations,
  };
}

/** Reference segment breakdown for display (seconds), from the shared model. */
export const SEGMENT_REFERENCE = {
  intro: DEFAULT_INTRO_SECONDS,
  outro: DEFAULT_OUTRO_SECONDS,
  ...DEFAULT_SEGMENTS,
};
