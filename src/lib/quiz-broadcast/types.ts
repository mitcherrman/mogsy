import type { QuizQuestion } from "@/lib/quiz/api";

export type BroadcastPhase = "idle" | "question" | "reveal" | "explanation" | "transition";

export type PlaybackMode =
  | "sequential"
  | "random"
  | "weighted_random"
  | "playlist_order"
  | "random_no_repeat"
  | "loop_playlist"
  | "loop_single"
  | "repeat_n"
  | "forever";

export type AspectRatio = "16:9" | "9:16";

export type BroadcastTiming = {
  questionMs: number;
  revealMs: number;
  explanationMs: number;
  transitionMs: number;
  countdownMs: number;
  delayBeforeNextMs: number;
};

export type BroadcastVisuals = {
  aspect: AspectRatio;
  theme: "hextech" | "midnight" | "classic";
  fontScale: number; // 0.75..1.5
  questionWidth: number; // percentage 50..100
  answerStyle: "cards" | "rows" | "grid";
  countdownStyle: "bar" | "ring" | "digits";
  transitionStyle: "fade" | "slide" | "zoom";
  backgroundAnimation: "none" | "particles" | "pulse";
  showLogo: boolean;
  showWebsite: boolean;
  websiteUrl: string;
  showQrCode: boolean;
  showQuestionNumber: boolean;
  showCategoryBadge: boolean;
  showDifficultyBadge: boolean;
  showChampionPortrait: boolean;
  showChampionSplash: boolean;
  showItemIcons: boolean;
  showRuneIcons: boolean;
  showPatchLabel: boolean;
  showTips: boolean;
  /** Global master switch for explanation/insight cards (both 16:9 and Shorts). */
  showExplanations: boolean;
  /** Shorts-only: hide the pre-reveal dormant insight placeholder panel. */
  hideShortsDormantInsight: boolean;
};

export type BroadcastConfig = {
  timing: BroadcastTiming;
  visuals: BroadcastVisuals;
  playback: PlaybackMode;
  repeatCount: number;
};

export type BroadcastPlaylist = {
  id: string;
  name: string;
  createdAt: number;
  questions: QuizQuestion[];
};

export type EngineSnapshot = {
  phase: BroadcastPhase;
  playing: boolean;
  currentIndex: number;
  currentQuestion: QuizQuestion | null;
  /** Full active playlist. Engine is the authority — Studio derives from this. */
  playlist: QuizQuestion[];
  correctAnswer: string | null;
  explanation: string | null;
  phaseStartedAt: number;
  phaseDurationMs: number;
  playlistLength: number;
  questionsPlayed: number;
  startedAt: number | null;
  config: BroadcastConfig;
  playlistId: string | null;
  playlistName: string | null;
  /** Stable id for the active broadcast session. */
  sessionId: string;
};

export const DEFAULT_TIMING: BroadcastTiming = {
  questionMs: 3000,
  revealMs: 1000,
  explanationMs: 1000,
  transitionMs: 1200,
  countdownMs: 2000,
  delayBeforeNextMs: 600,
};

export const DEFAULT_VISUALS: BroadcastVisuals = {
  aspect: "16:9",
  theme: "hextech",
  fontScale: 1,
  questionWidth: 80,
  answerStyle: "cards",
  countdownStyle: "bar",
  transitionStyle: "fade",
  backgroundAnimation: "pulse",
  showLogo: true,
  showWebsite: true,
  websiteUrl: "mogsy.net/quiz",
  showQrCode: true,
  showQuestionNumber: true,
  showCategoryBadge: true,
  showDifficultyBadge: true,
  showChampionPortrait: true,
  showChampionSplash: false,
  showItemIcons: true,
  showRuneIcons: true,
  showPatchLabel: true,
  showTips: true,
  showExplanations: true,
  hideShortsDormantInsight: true,
};

export const DEFAULT_CONFIG: BroadcastConfig = {
  timing: DEFAULT_TIMING,
  visuals: DEFAULT_VISUALS,
  playback: "sequential",
  repeatCount: 1,
};