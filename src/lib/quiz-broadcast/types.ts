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

/** One configurable broadcast sound effect. */
export type BroadcastSfxItem = {
  enabled: boolean;
  /** Browser path to the audio file, e.g. "/quiz-broadcast/audio/sfx/reveal.mp3". */
  src: string;
  volume: number; // 0..1, multiplied by masterVolume
};

export type BroadcastSfxEvent =
  | "questionStart"
  | "countdownTick"
  | "reveal"
  | "correctAnswer"
  | "transition";

export type BroadcastSfx = {
  enabled: boolean;
  masterVolume: number; // 0..1
  sounds: Record<BroadcastSfxEvent, BroadcastSfxItem>;
};

/** Partial shape accepted when patching/merging saved SFX configs. */
export type BroadcastSfxPatch = Partial<Omit<BroadcastSfx, "sounds">> & {
  sounds?: Partial<Record<BroadcastSfxEvent, Partial<BroadcastSfxItem>>>;
};

export type BroadcastConfig = {
  timing: BroadcastTiming;
  visuals: BroadcastVisuals;
  playback: PlaybackMode;
  repeatCount: number;
  sfx: BroadcastSfx;
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
  questionMs: 10000,
  revealMs: 1800,
  explanationMs: 2500,
  transitionMs: 700,
  countdownMs: 3000,
  delayBeforeNextMs: 400,
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

export const SFX_EVENTS: BroadcastSfxEvent[] = [
  "questionStart",
  "countdownTick",
  "reveal",
  "correctAnswer",
  "transition",
];

const DEFAULT_SFX_ITEM: BroadcastSfxItem = {
  enabled: false,
  src: "",
  volume: 0.6,
};

export const DEFAULT_SFX: BroadcastSfx = {
  enabled: false,
  masterVolume: 0.5,
  sounds: {
    questionStart: { ...DEFAULT_SFX_ITEM },
    countdownTick: { ...DEFAULT_SFX_ITEM },
    reveal: { ...DEFAULT_SFX_ITEM },
    correctAnswer: { ...DEFAULT_SFX_ITEM },
    transition: { ...DEFAULT_SFX_ITEM },
  },
};

/**
 * Deep-merge an (optionally partial / legacy) SFX config over a base.
 * Old saved configs predate `sfx` entirely — every merge path
 * (localStorage config, durable session, engine patch) goes through this
 * so missing keys always fall back to safe defaults.
 */
export function mergeSfx(base: BroadcastSfx, patch?: BroadcastSfxPatch | null): BroadcastSfx {
  const b = base ?? DEFAULT_SFX;
  if (!patch) return b;
  const sounds = {} as BroadcastSfx["sounds"];
  for (const ev of SFX_EVENTS) {
    sounds[ev] = { ...DEFAULT_SFX_ITEM, ...b.sounds?.[ev], ...(patch.sounds?.[ev] ?? {}) };
  }
  return {
    enabled: patch.enabled ?? b.enabled ?? DEFAULT_SFX.enabled,
    masterVolume: patch.masterVolume ?? b.masterVolume ?? DEFAULT_SFX.masterVolume,
    sounds,
  };
}

export const DEFAULT_CONFIG: BroadcastConfig = {
  timing: DEFAULT_TIMING,
  visuals: DEFAULT_VISUALS,
  playback: "sequential",
  repeatCount: 1,
  sfx: DEFAULT_SFX,
};