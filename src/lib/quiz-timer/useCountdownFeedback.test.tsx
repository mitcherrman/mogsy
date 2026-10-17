/**
 * MISC W2D (F10) — the countdown sound on VIRTUAL TIME, through the real
 * deadline-anchored tick source (`useCountdownNow`) and the real SFX engine
 * (fake AudioContext). What is asserted is what reaches the speaker.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_AUDIO_STUDIO_CONFIG } from "@/lib/audio/audio-studio-config";
import { mogzyAudio } from "@/lib/audio/engine";
import {
  resetSfxForTests, setSfxConfigForTests, SFX_MUTE_CHANGE_EVENT, SFX_MUTE_STORAGE_KEY,
  sfxController,
} from "@/lib/audio/sfx";
import { useCountdownNow } from "@/lib/ranked-core/flow/useCountdownNow";
import { remainingSeconds } from "@/lib/ranked-core/timerMath";
import { resetCountdownFeedbackForTests, useCountdownSfx, useServerTimeoutSfx } from "./useCountdownFeedback";

const T0 = Date.parse("2026-10-17T12:00:00.000Z");
const DEADLINE = new Date(T0 + 30_000).toISOString();

function installAudio(state: AudioContextState = "running") {
  const counts = { oscillators: 0 };
  const param = () => ({
    value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
  });
  const context = {
    state, currentTime: 0, sampleRate: 48000, destination: {},
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createBuffer: (_c: number, length: number) => ({
      duration: length / 48000, getChannelData: () => new Float32Array(length),
    }),
    createBiquadFilter: () => ({ type: "", Q: param(), frequency: param(), connect: vi.fn() }),
    createOscillator: () => ({
      type: "sine", frequency: param(), connect: vi.fn(),
      start: vi.fn(() => { counts.oscillators += 1; }), stop: vi.fn(),
    }),
    createBufferSource: () => ({
      buffer: null, loop: false, playbackRate: param(), connect: vi.fn(),
      start: vi.fn(), stop: vi.fn(),
    }),
  };
  Object.defineProperty(window, "AudioContext", {
    configurable: true, writable: true, value: function () { return context; },
  });
  return { context, counts };
}

function Clock({ clockKey = "m1:r1", armed = true }: { clockKey?: string; armed?: boolean }) {
  const now = useCountdownNow(DEADLINE, 0);
  const seconds = Math.min(30, remainingSeconds(DEADLINE, 0, now));
  useCountdownSfx({ clockKey, remainingSeconds: seconds, running: true, armed });
  return <span data-testid="clock">{seconds}</span>;
}

const calls = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map(([event, options]) => `${String(event)}@${(options as { eventId?: string })?.eventId}`);

/**
 * Advance virtual time to `msLeft` before the deadline in 100 ms frames, each
 * its own act, so React renders after every timer the way a browser does (one
 * act around the whole span would batch every boundary into one render).
 */
async function advanceTo(msLeft: number) {
  const target = T0 + 30_000 - msLeft;
  while (Date.now() < target) {
    const step = Math.min(100, target - Date.now());
    await act(async () => { vi.advanceTimersByTime(step); });
  }
}

let audio: ReturnType<typeof installAudio>;
let play: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.removeItem(SFX_MUTE_STORAGE_KEY);
  resetSfxForTests();
  resetCountdownFeedbackForTests();
  audio = installAudio();
  setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
  await sfxController.unlock(); // the user's first gesture
  play = vi.spyOn(mogzyAudio, "playSfx");
});

afterEach(() => {
  play.mockRestore();
  vi.useRealTimers();
  resetSfxForTests();
});

describe("F10 — the final five seconds, on virtual time", () => {
  it("knocks once at each of 5, 4, 3, 2, 1 — at the deadline's own boundaries", async () => {
    render(<Clock />);
    await advanceTo(5_100);
    expect(calls(play)).toEqual([]);
    await advanceTo(4_990); // just past the 6→5 boundary (+6 ms scheduling margin)
    expect(calls(play)).toEqual(["quiz.countdown.tick@quiz-countdown:m1:r1:5"]);
    await advanceTo(0);
    expect(calls(play)).toEqual([
      "quiz.countdown.tick@quiz-countdown:m1:r1:5",
      "quiz.countdown.tick@quiz-countdown:m1:r1:4",
      "quiz.countdown.urgent@quiz-countdown:m1:r1:3",
      "quiz.countdown.urgent@quiz-countdown:m1:r1:2",
      "quiz.countdown.final@quiz-countdown:m1:r1:1",
    ]);
    // Rendered: tick 1 voice, urgent 2, final 2 oscillators each.
    expect(audio.counts.oscillators).toBe(1 + 1 + 2 + 2 + 2);
    // Nothing after zero: a local zero is not a beat and not a timeout.
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(play).toHaveBeenCalledTimes(5);
  });

  it("a remount mid-countdown replays nothing and continues", async () => {
    const first = render(<Clock />);
    await advanceTo(2_500); // showing 3
    expect(play).toHaveBeenCalledTimes(3);
    first.unmount();
    render(<Clock />);
    await advanceTo(2_400);
    expect(play).toHaveBeenCalledTimes(3);
    await advanceTo(0);
    expect(calls(play).slice(3)).toEqual([
      "quiz.countdown.urgent@quiz-countdown:m1:r1:2",
      "quiz.countdown.final@quiz-countdown:m1:r1:1",
    ]);
  });

  it("a long task / backgrounded tab snaps to the current second: one knock, no catch-up burst", async () => {
    render(<Clock />);
    await advanceTo(6_500);
    // The page is frozen for 5 s: no timer runs, then the tab becomes visible.
    vi.setSystemTime(T0 + 30_000 - 1_500);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(calls(play)).toEqual(["quiz.countdown.urgent@quiz-countdown:m1:r1:2"]);
  });

  it("two mounted owners of one clock (a presenter mistake, StrictMode) still sound once", async () => {
    render(<><Clock /><Clock /></>);
    await advanceTo(0);
    // Both asked; the cross-clock gap and the engine's eventId dedupe render
    // each second once.
    expect(audio.counts.oscillators).toBe(1 + 1 + 2 + 2 + 2);
  });

  it("is silent for a viewer who has answered", async () => {
    render(<Clock armed={false} />);
    await advanceTo(0);
    expect(play).not.toHaveBeenCalled();
  });

  it("honours mute: asked, but nothing renders", async () => {
    localStorage.setItem(SFX_MUTE_STORAGE_KEY, "1");
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    render(<Clock />);
    await advanceTo(0);
    expect(play).toHaveBeenCalledTimes(5);
    expect(audio.counts.oscillators).toBe(0);
  });

  it("before any user gesture (audio locked) nothing renders", async () => {
    resetSfxForTests(); // forgets the gesture: the context is locked again
    const locked = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    render(<Clock />);
    await advanceTo(0);
    expect(locked.counts.oscillators).toBe(0);
  });

  it("a suspended context never queues a late knock", async () => {
    resetSfxForTests();
    const suspended = installAudio("suspended");
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    suspended.context.state = "suspended";
    render(<Clock />);
    await advanceTo(0);
    expect(play).not.toHaveBeenCalled();
    expect(suspended.counts.oscillators).toBe(0);
  });
});

function Timeout({ settledKey, timedOut }: { settledKey: string | null; timedOut: boolean }) {
  useServerTimeoutSfx({ settledKey, serverTimedOut: timedOut });
  return null;
}

describe("F12 — the server-settled TIME'S UP cue", () => {
  it("sounds once when the settlement arrives, never on a historical mount", async () => {
    const view = render(<Timeout settledKey={null} timedOut={false} />);
    view.rerender(<Timeout settledKey="daily-bank:s2" timedOut />);
    view.rerender(<Timeout settledKey="daily-bank:s2" timedOut />);
    expect(calls(play)).toEqual(["quiz.answer.timeout@quiz-timeout:daily-bank:s2"]);
    expect(audio.counts.oscillators).toBe(3);
    view.unmount();
    render(<Timeout settledKey="daily-bank:s2" timedOut />);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
