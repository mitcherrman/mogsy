import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the quiz API before importing the engine.
const submitAnswer = vi.fn();
vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    baseUrl: "",
    submitAnswer: (...args: unknown[]) => submitAnswer(...args),
    sets: vi.fn(),
    questions: vi.fn(),
  },
}));

import { BroadcastEngine } from "./engine";
import { DEFAULT_TIMING } from "./types";
import type { QuizQuestion } from "@/lib/quiz/api";

/** Question with inline reveal metadata → fetchReveal resolves synchronously. */
function inlineQ(id: string): QuizQuestion {
  return {
    id,
    question: `Q ${id}`,
    choices: ["A", "B", "C", "D"],
    metadata: { correct_answer: "A", explanation: `because ${id}` },
  } as unknown as QuizQuestion;
}

/** Question with no inline answer → forces the async reveal fetch path. */
function apiQ(id: string): QuizQuestion {
  return { id, question: `Q ${id}`, choices: ["A", "B"] } as unknown as QuizQuestion;
}

const T = DEFAULT_TIMING;
const FULL_CYCLE_MS =
  T.questionMs + T.revealMs + T.explanationMs + T.transitionMs + T.delayBeforeNextMs;

describe("BroadcastEngine reliability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    submitAnswer.mockReset();
    submitAnswer.mockResolvedValue({ correct_answer: "A", explanation: "x" });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("loops through many consecutive question transitions without stalling", () => {
    const engine = new BroadcastEngine();
    const advances: number[] = [];
    engine.subscribe((s) => {
      // record index each time we (re)enter the question phase
      if (s.phase === "question") advances.push(s.currentIndex);
    });
    engine.setPlaylist([inlineQ("1"), inlineQ("2"), inlineQ("3")]);
    engine.setConfig({ playback: "sequential" });
    engine.start();

    // Run ~10 full question cycles.
    vi.advanceTimersByTime(FULL_CYCLE_MS * 10 + 50);

    // Sequential mode wraps 0,1,2,0,1,2,... — we should have seen the cursor
    // advance many times and cycle back to 0 repeatedly.
    expect(engine.snapshot().questionsPlayed).toBeGreaterThanOrEqual(9);
    expect(advances.filter((i) => i === 0).length).toBeGreaterThanOrEqual(3);
    expect(advances.filter((i) => i === 2).length).toBeGreaterThanOrEqual(3);
    // Still actively playing (not stuck / not stopped).
    expect(engine.snapshot().playing).toBe(true);
    engine.destroy();
  });

  it("keeps progressing even when a subscriber throws on every snapshot", () => {
    const engine = new BroadcastEngine();
    engine.subscribe(() => {
      throw new Error("boom in listener");
    });
    engine.setPlaylist([inlineQ("1"), inlineQ("2")]);
    engine.start();
    const startIndexPlayed = engine.snapshot().questionsPlayed;

    vi.advanceTimersByTime(FULL_CYCLE_MS * 5 + 50);

    expect(engine.snapshot().questionsPlayed).toBeGreaterThan(startIndexPlayed);
    expect(engine.snapshot().playing).toBe(true);
    engine.destroy();
  });

  it("keeps progressing when the reveal fetch rejects", async () => {
    submitAnswer.mockRejectedValue(new Error("api down"));
    const engine = new BroadcastEngine();
    engine.setPlaylist([apiQ("1"), apiQ("2")]);
    engine.start();

    vi.advanceTimersByTime(FULL_CYCLE_MS * 4 + 50);
    // Flush any pending reveal retry microtasks/timers.
    await vi.runOnlyPendingTimersAsync().catch(() => {});

    expect(engine.snapshot().questionsPlayed).toBeGreaterThanOrEqual(3);
    expect(engine.snapshot().playing).toBe(true);
    engine.destroy();
  });

  it("does not start or crash on an empty playlist", () => {
    const engine = new BroadcastEngine();
    engine.start();
    expect(engine.snapshot().playing).toBe(false);
    expect(engine.snapshot().phase).toBe("idle");
    vi.advanceTimersByTime(FULL_CYCLE_MS * 2);
    expect(engine.snapshot().playing).toBe(false);
    engine.destroy();
  });

  it("does not fire the watchdog during normal (on-time) playback", () => {
    const engine = new BroadcastEngine();
    engine.setPlaylist([inlineQ("1"), inlineQ("2")]);
    engine.start();
    // Normal advance keeps Date.now and phaseStartedAt in lockstep, so no stall.
    vi.advanceTimersByTime(FULL_CYCLE_MS * 6 + 50);
    // watchdogStrikes is an internal counter; it must stay at zero.
    expect((engine as unknown as { watchdogStrikes: number }).watchdogStrikes).toBe(0);
    engine.destroy();
  });

  it("a stale queued phase-timer callback cannot advance a newly entered phase", () => {
    const engine = new BroadcastEngine();
    engine.setPlaylist([inlineQ("1"), inlineQ("2"), inlineQ("3")]);
    engine.setConfig({ playback: "sequential" });
    engine.start(); // enters "question" (generation A)

    const internal = engine as unknown as {
      progressSeq: number;
      onPhaseTimer: (seq?: number) => void;
    };
    // Capture the generation the FIRST question-phase timer was scheduled with.
    const staleSeq = internal.progressSeq;
    expect(engine.snapshot().phase).toBe("question");

    // A manual control supersedes that phase: skip() clears the old timer and
    // enters a fresh "question" phase (generation B > A). This mimics the race
    // where the old timer had already fired and its callback is still queued.
    engine.skip();
    expect(engine.snapshot().phase).toBe("question");
    const seqAfterSkip = internal.progressSeq;
    const phaseAfterSkip = engine.snapshot().phase;
    const playedAfterSkip = engine.snapshot().questionsPlayed;
    const indexAfterSkip = engine.snapshot().currentIndex;
    expect(seqAfterSkip).toBeGreaterThan(staleSeq);

    // Fire the STALE callback (generation A) against the new phase.
    internal.onPhaseTimer(staleSeq);

    // It must no-op: no phase change, no generation bump, no advance.
    expect(engine.snapshot().phase).toBe(phaseAfterSkip);
    expect(internal.progressSeq).toBe(seqAfterSkip);
    expect(engine.snapshot().questionsPlayed).toBe(playedAfterSkip);
    expect(engine.snapshot().currentIndex).toBe(indexAfterSkip);

    // Sanity: a CURRENT-generation callback still advances normally.
    internal.onPhaseTimer(seqAfterSkip);
    expect(engine.snapshot().phase).toBe("reveal");
    engine.destroy();
  });

  it("watchdog recovers a dead phase-timer chain", () => {
    const engine = new BroadcastEngine();
    engine.setPlaylist([inlineQ("1"), inlineQ("2")]);
    engine.start();
    expect(engine.snapshot().phase).toBe("question");

    // Simulate a dead chain: kill the scheduled phase timer without firing it.
    const internal = engine as unknown as { timer: ReturnType<typeof setTimeout> | null };
    if (internal.timer) clearTimeout(internal.timer);
    internal.timer = null;

    // Jump wall-clock past the question phase end + grace WITHOUT firing timers.
    vi.setSystemTime(Date.now() + T.questionMs + 6001);
    engine.runWatchdogCheck();

    // Watchdog forced the transition the dead timer owed us.
    expect(engine.snapshot().phase).toBe("reveal");
    expect((engine as unknown as { transitionLock: boolean }).transitionLock).toBe(false);
    engine.destroy();
  });

  it("watchdog escalates to a hard reinit after repeated strikes", () => {
    const engine = new BroadcastEngine();
    engine.setPlaylist([inlineQ("1"), inlineQ("2")]);
    engine.start();

    const internal = engine as unknown as {
      timer: ReturnType<typeof setTimeout> | null;
      transitionLock: boolean;
    };
    if (internal.timer) clearTimeout(internal.timer);
    internal.timer = null;
    // Latch the lock so soft recovery no-ops and strikes accumulate.
    internal.transitionLock = true;

    vi.setSystemTime(Date.now() + T.questionMs + 6001);
    engine.runWatchdogCheck(); // strike 1 (locked → no advance)
    engine.runWatchdogCheck(); // strike 2
    engine.runWatchdogCheck(); // strike 3 → fallback

    // Fallback cleared the stuck lock and reinitialised a clean question scene.
    expect(internal.transitionLock).toBe(false);
    expect(engine.snapshot().phase).toBe("question");
    expect(engine.snapshot().playing).toBe(true);
    engine.destroy();
  });

  it("watchdog fallback stops cleanly if the queue is empty", () => {
    const engine = new BroadcastEngine();
    engine.setPlaylist([inlineQ("1")]);
    engine.start();

    const internal = engine as unknown as {
      timer: ReturnType<typeof setTimeout> | null;
      transitionLock: boolean;
      playlist: QuizQuestion[];
      watchdogStrikes: number;
    };
    if (internal.timer) clearTimeout(internal.timer);
    internal.timer = null;
    internal.transitionLock = true;
    internal.playlist = []; // queue drained out from under the engine

    vi.setSystemTime(Date.now() + T.questionMs + 6001);
    engine.runWatchdogCheck();
    engine.runWatchdogCheck();
    engine.runWatchdogCheck(); // → fallback → empty → stop()

    expect(engine.snapshot().playing).toBe(false);
    expect(engine.snapshot().phase).toBe("idle");
    engine.destroy();
  });
});
