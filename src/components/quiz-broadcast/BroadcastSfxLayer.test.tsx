import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
  play: vi.fn(async () => "played" as const),
  unlock: vi.fn(async () => true),
}));
vi.mock("@/lib/quiz-broadcast/sfx", () => ({
  playBroadcastSfx: audio.play,
  unlockBroadcastAudio: audio.unlock,
}));

import BroadcastSfxLayer from "./BroadcastSfxLayer";
import { DEFAULT_CONFIG, type BroadcastSfx, type EngineSnapshot } from "@/lib/quiz-broadcast/types";

const activeSfx = (): BroadcastSfx => ({
  enabled: true,
  masterVolume: 0.5,
  sounds: {
    questionStart: { enabled: true, src: "/q.mp3", volume: 1 },
    countdownTick: { enabled: true, src: "/tick.mp3", volume: 1 },
    reveal: { enabled: true, src: "/reveal.mp3", volume: 1 },
    correctAnswer: { enabled: true, src: "/correct.mp3", volume: 1 },
    transition: { enabled: true, src: "/transition.mp3", volume: 1 },
  },
});

function snapshot(patch: Partial<EngineSnapshot> = {}): EngineSnapshot {
  return {
    phase: "idle", playing: false, currentIndex: 0, currentQuestion: null,
    playlist: [], correctAnswer: null, explanation: null,
    phaseStartedAt: 90_000, phaseDurationMs: 0, playlistLength: 0,
    questionsPlayed: 0, startedAt: null,
    config: { ...DEFAULT_CONFIG, sfx: activeSfx() }, playlistId: null,
    playlistName: null, sessionId: "session-1", ...patch,
  };
}

const flush = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.clearAllMocks();
  audio.play.mockResolvedValue("played");
});

afterEach(() => vi.useRealTimers());

describe("BroadcastSfxLayer semantic timing", () => {
  it("baselines restored state, then emits each active phase/tick cue once", async () => {
    const view = render(<BroadcastSfxLayer snapshot={snapshot()} />);
    expect(audio.play).not.toHaveBeenCalled();

    view.rerender(<BroadcastSfxLayer snapshot={snapshot({
      phase: "question", playing: true, phaseStartedAt: 100_000, phaseDurationMs: 4_000,
    })} />);
    await flush();
    expect(audio.play.mock.calls.map(([event]) => event)).toEqual(["questionStart"]);

    await act(async () => { vi.advanceTimersByTime(3_100); });
    expect(audio.play.mock.calls.map(([event]) => event)).toEqual([
      "questionStart", "countdownTick", "countdownTick", "countdownTick",
    ]);

    view.rerender(<BroadcastSfxLayer snapshot={snapshot({
      phase: "reveal", playing: true, phaseStartedAt: 104_000, phaseDurationMs: 1_800,
    })} />);
    await flush();
    view.rerender(<BroadcastSfxLayer snapshot={snapshot({
      phase: "transition", playing: true, phaseStartedAt: 105_800, phaseDurationMs: 700,
    })} />);
    await flush();
    expect(audio.play.mock.calls.map(([event]) => event)).toEqual([
      "questionStart", "countdownTick", "countdownTick", "countdownTick",
      "correctAnswer", "transition",
    ]);
  });

  it("uses one reveal-phase cue: correct highlight when configured, reveal as fallback", async () => {
    const view = render(<BroadcastSfxLayer snapshot={snapshot()} />);
    view.rerender(<BroadcastSfxLayer snapshot={snapshot({ phase: "reveal", phaseStartedAt: 101_000 })} />);
    await flush();
    expect(audio.play.mock.calls.map(([event]) => event)).toEqual(["correctAnswer"]);

    const fallback = activeSfx();
    fallback.sounds.correctAnswer = { ...fallback.sounds.correctAnswer, enabled: false };
    view.rerender(<BroadcastSfxLayer snapshot={snapshot({
      phase: "question", phaseStartedAt: 102_000, phaseDurationMs: 0,
      config: { ...DEFAULT_CONFIG, sfx: fallback },
    })} />);
    view.rerender(<BroadcastSfxLayer snapshot={snapshot({
      phase: "reveal", phaseStartedAt: 103_000,
      config: { ...DEFAULT_CONFIG, sfx: fallback },
    })} />);
    await flush();
    expect(audio.play.mock.calls.map(([event]) => event)).toEqual([
      "correctAnswer", "questionStart", "reveal",
    ]);
  });

  it("does not replay a historical mounted phase or the same phase on rerender", async () => {
    const restored = snapshot({ phase: "reveal", phaseStartedAt: 88_000 });
    const view = render(<BroadcastSfxLayer snapshot={restored} />);
    view.rerender(<BroadcastSfxLayer snapshot={{ ...restored }} />);
    await flush();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("keeps autoplay recovery non-blocking and delegates the unlock gesture", async () => {
    audio.play.mockResolvedValueOnce("blocked");
    const view = render(<BroadcastSfxLayer snapshot={snapshot()} />);
    view.rerender(<BroadcastSfxLayer snapshot={snapshot({ phase: "question", phaseStartedAt: 101_000 })} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /enable broadcast audio/i }));
    await flush();
    expect(audio.unlock).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /enable broadcast audio/i })).toBeNull();
  });
});
