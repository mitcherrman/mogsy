import type { QuizQuestion } from "@/lib/quiz/api";
import type { BroadcastConfig, BroadcastPhase } from "./types";
import { DEFAULT_CONFIG } from "./types";

/**
 * ActiveBroadcastSession
 * --------------------------------------------------------------------------
 * Durable single-source-of-truth for "what is currently being broadcast."
 * Lives in localStorage so it survives Studio remounts, full refreshes, alt
 * tabs, and auth/layout re-renders. Studio AND Broadcast Window attach to
 * this session; neither owns or destroys it. Only an explicit "Clear
 * Session" action wipes it.
 *
 * Forward-compatibility:
 *   v1 stores the full QuizQuestion array inline. A future v2 can replace
 *   `questions` with `questionRefs: { id, snapshot? }[]` resolved against a
 *   shared question cache. The loader normalises whatever is on disk into
 *   the in-memory `ActiveBroadcastSession` shape used by the engine + UI,
 *   so the UI never needs to know which storage variant is on disk.
 */
export const ACTIVE_SESSION_KEY = "mogsy.quizBroadcast.activeSession.v1";

export type ActiveBroadcastSessionV1 = {
  schemaVersion: 1;
  sessionId: string;
  startedAt: number | null;
  updatedAt: number;

  // Playlist context (v1 inline; v2 → questionRefs)
  playlistId: string | null;
  playlistName: string | null;
  questions: QuizQuestion[];

  // Engine runtime
  currentIndex: number;
  phase: BroadcastPhase;
  playing: boolean;
  questionsPlayed: number;
  repeatsCompleted: number;
  playedHistory: (string | number)[];

  // Timing restore — lets a hydrated engine resume mid-phase instead of
  // restarting the current phase from zero.
  phaseStartedAt: number;
  phaseDurationMs: number;
  phaseEndsAt: number; // denormalised = phaseStartedAt + phaseDurationMs
  lastTickAt: number;

  // Snapshot of the config in effect at session start / latest update.
  config: BroadcastConfig;
};

/** In-memory shape consumers work with. Currently identical to V1. */
export type ActiveBroadcastSession = ActiveBroadcastSessionV1;

export function newSessionId(): string {
  return `bs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyActiveSession(): ActiveBroadcastSession {
  const now = Date.now();
  return {
    schemaVersion: 1,
    sessionId: newSessionId(),
    startedAt: null,
    updatedAt: now,
    playlistId: null,
    playlistName: null,
    questions: [],
    currentIndex: 0,
    phase: "idle",
    playing: false,
    questionsPlayed: 0,
    repeatsCompleted: 0,
    playedHistory: [],
    phaseStartedAt: 0,
    phaseDurationMs: 0,
    phaseEndsAt: 0,
    lastTickAt: now,
    config: DEFAULT_CONFIG,
  };
}

/**
 * Loads + normalises any persisted session shape into the current in-memory
 * representation. Returns null if nothing valid is stored. Designed so a
 * future v2 can be added here without touching callers.
 */
export function loadActiveSession(): ActiveBroadcastSession | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const base = emptyActiveSession();
    const merged: ActiveBroadcastSession = {
      ...base,
      ...parsed,
      config: {
        ...base.config,
        ...(parsed.config ?? {}),
        timing: { ...base.config.timing, ...((parsed.config?.timing) ?? {}) },
        visuals: { ...base.config.visuals, ...((parsed.config?.visuals) ?? {}) },
      },
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      playedHistory: Array.isArray(parsed.playedHistory) ? parsed.playedHistory : [],
      schemaVersion: 1,
    };
    return merged;
  } catch {
    return null;
  }
}

export function saveActiveSession(session: ActiveBroadcastSession): void {
  try {
    if (typeof localStorage === "undefined") return;
    const payload: ActiveBroadcastSessionV1 = {
      ...session,
      schemaVersion: 1,
      updatedAt: Date.now(),
      phaseEndsAt: session.phaseStartedAt + session.phaseDurationMs,
    };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota — best-effort */
  }
}

export function clearActiveSession(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {}
}