import type { EngineSnapshot } from "./types";
import { loadActiveSession } from "./session";

/**
 * Studio <-> Broadcast Window bridge. The Studio owns the engine and
 * publishes snapshots; the Window subscribes and only renders.
 *
 * Hardening:
 * - Latest snapshot is mirrored to localStorage so a freshly-mounted Window
 *   (e.g. after the browser discarded the background tab) can restore state
 *   immediately, before any new BroadcastChannel message arrives.
 * - Subscribers re-request the latest snapshot on visibility/focus, so a
 *   reconnect never requires restarting the broadcast.
 */
const CHANNEL_NAME = "mogsy-quiz-broadcast";
const REQUEST_KEY = "mogsy.quizBroadcast.request.v1";
export const LATEST_SNAPSHOT_KEY = "mogsy.quizBroadcast.latestSnapshot.v1";

type Message =
  | { kind: "snapshot"; snapshot: EngineSnapshot; ts: number }
  | { kind: "request_snapshot" };

function persist(snapshot: EngineSnapshot) {
  try {
    localStorage.setItem(
      LATEST_SNAPSHOT_KEY,
      JSON.stringify({ ts: Date.now(), snapshot }),
    );
  } catch {}
}

export function readPersistedSnapshot(): { ts: number; snapshot: EngineSnapshot } | null {
  try {
    const raw = localStorage.getItem(LATEST_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { ts: number; snapshot: EngineSnapshot };
  } catch {
    return null;
  }
}

/**
 * Build a minimal EngineSnapshot from the durable ActiveBroadcastSession.
 * Used by the Broadcast Window as a last-resort fallback when no live
 * snapshot cache is present (cold popup). READ-ONLY: this never mutates or
 * persists session/engine state — the Window stays passive.
 */
export function synthesizeSnapshotFromSession(): EngineSnapshot | null {
  const s = loadActiveSession();
  if (!s) return null;
  const current = s.questions[s.currentIndex] ?? null;
  return {
    phase: s.phase,
    playing: s.playing,
    currentIndex: s.currentIndex,
    currentQuestion: current,
    playlist: s.questions,
    correctAnswer: null,
    explanation: null,
    phaseStartedAt: s.phaseStartedAt,
    phaseDurationMs: s.phaseDurationMs,
    playlistLength: s.questions.length,
    questionsPlayed: s.questionsPlayed,
    startedAt: s.startedAt,
    config: s.config,
    playlistId: s.playlistId,
    playlistName: s.playlistName,
    sessionId: s.sessionId,
  };
}

export function createPublisher() {
  if (typeof BroadcastChannel === "undefined") {
    return {
      post: (s: EngineSnapshot) => persist(s),
      close: () => {},
      onRequest: () => () => {},
    };
  }
  const ch = new BroadcastChannel(CHANNEL_NAME);
  return {
    post(snapshot: EngineSnapshot) {
      persist(snapshot);
      ch.postMessage({ kind: "snapshot", snapshot, ts: Date.now() } satisfies Message);
    },
    onRequest(fn: () => void) {
      const handler = (e: MessageEvent<Message>) => {
        if (e.data?.kind === "request_snapshot") fn();
      };
      ch.addEventListener("message", handler);
      return () => ch.removeEventListener("message", handler);
    },
    close() {
      ch.close();
    },
  };
}

export type SubscriberDiagnostics = {
  lastMessageAt: number | null;
  lastVisibilityChangeAt: number | null;
  lastRestoreAt: number | null;
  reconnectCount: number;
  restoreFromCache: boolean;
};

export type SubscribeCallbacks = {
  onSnapshot: (s: EngineSnapshot) => void;
  onDiagnostics?: (d: SubscriberDiagnostics) => void;
  onLog?: (level: "info" | "warn" | "success", msg: string) => void;
};

export function createSubscriber(cb: SubscribeCallbacks | ((s: EngineSnapshot) => void)) {
  const callbacks: SubscribeCallbacks = typeof cb === "function" ? { onSnapshot: cb } : cb;
  const diag: SubscriberDiagnostics = {
    lastMessageAt: null,
    lastVisibilityChangeAt: null,
    lastRestoreAt: null,
    reconnectCount: 0,
    restoreFromCache: false,
  };
  const emitDiag = () => callbacks.onDiagnostics?.({ ...diag });

  // Try to restore immediately from persisted snapshot — keeps the window
  // visually stable while we wait for a fresh BroadcastChannel message.
  const cached = readPersistedSnapshot();
  if (cached) {
    diag.restoreFromCache = true;
    diag.lastRestoreAt = Date.now();
    callbacks.onSnapshot(cached.snapshot);
    callbacks.onLog?.("info", `Restored snapshot from cache (${new Date(cached.ts).toLocaleTimeString()})`);
    emitDiag();
  } else {
    // No live cache — fall back to the durable ActiveBroadcastSession so a
    // cold popup still paints the current question. Read-only.
    const synth = synthesizeSnapshotFromSession();
    if (synth) {
      diag.restoreFromCache = true;
      diag.lastRestoreAt = Date.now();
      callbacks.onSnapshot(synth);
      callbacks.onLog?.("info", "Restored snapshot from ActiveBroadcastSession");
      emitDiag();
    }
  }

  if (typeof BroadcastChannel === "undefined") {
    return () => {};
  }

  const ch = new BroadcastChannel(CHANNEL_NAME);
  const handler = (e: MessageEvent<Message>) => {
    if (e.data?.kind === "snapshot") {
      diag.lastMessageAt = Date.now();
      diag.restoreFromCache = false;
      callbacks.onSnapshot(e.data.snapshot);
      emitDiag();
    }
  };
  ch.addEventListener("message", handler);
  const requestNow = () => {
    try {
      ch.postMessage({ kind: "request_snapshot" } satisfies Message);
      diag.reconnectCount += 1;
      emitDiag();
    } catch {}
  };
  requestNow();

  const onVisibility = () => {
    diag.lastVisibilityChangeAt = Date.now();
    emitDiag();
    if (document.visibilityState === "visible") {
      callbacks.onLog?.("info", "Visibility → visible; re-requesting snapshot");
      requestNow();
    } else {
      callbacks.onLog?.("info", "Visibility → hidden (state preserved)");
    }
  };
  const onFocus = () => {
    diag.lastVisibilityChangeAt = Date.now();
    emitDiag();
    requestNow();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);

  return () => {
    ch.removeEventListener("message", handler);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    ch.close();
  };
}

export const BROADCAST_REQUEST_KEY = REQUEST_KEY;