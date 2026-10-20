/**
 * PT5.2 — the chronometer's sound through the REAL SFX controller (registry,
 * mute, unlock, eventId dedupe, minReplayMs) over a fake AudioContext, driven
 * by a hand-cranked frame clock. Counts what the engine actually renders.
 */
import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_AUDIO_STUDIO_CONFIG } from "@/lib/audio/audio-studio-config";
import { SFX_REGISTRY } from "@/lib/audio/sfx-registry";
import { resetSfxForTests, setSfxConfigForTests, SFX_MUTE_CHANGE_EVENT, SFX_MUTE_STORAGE_KEY, sfxController } from "@/lib/audio/sfx";
import { installFakeFrames, type FakeFrames } from "@/lib/perfect-timing/fakeFrames.testutil";
import type { PtClockReading, PtPhase, PtStageModel } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingArena } from "./PerfectTimingArena";
import { DEMO_ROUNDS, demoPress } from "./__stories__/demoViewModels";

function installAudio(state: AudioContextState = "running") {
  const counts = { oscillators: 0, buffers: 0, resumes: 0 };
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const context = {
    state, currentTime: 0, sampleRate: 48000, destination: {},
    resume: vi.fn(async () => { counts.resumes += 1; }),
    close: vi.fn(async () => {}),
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createBuffer: (_c: number, length: number) => ({ duration: length / 48000, getChannelData: () => new Float32Array(length) }),
    createBiquadFilter: () => ({ type: "", Q: param(), frequency: param(), connect: vi.fn() }),
    createOscillator: () => ({ type: "sine", frequency: param(), connect: vi.fn(), start: vi.fn(() => { counts.oscillators += 1; }), stop: vi.fn() }),
    createBufferSource: () => ({ buffer: null, loop: false, playbackRate: param(), connect: vi.fn(), start: vi.fn(() => { counts.buffers += 1; }), stop: vi.fn() }),
  };
  Object.defineProperty(window, "AudioContext", { configurable: true, writable: true, value: function () { return context; } });
  return { context, counts };
}

const ROUND = DEMO_ROUNDS[1];
const model = (phase: PtPhase, clock: PtClockReading | null, round = ROUND): PtStageModel => ({
  round, phase, press: demoPress("seal"), reveal: null, onNext: () => {}, clock,
});
const RUNNING: PtClockReading = { t0: 1_000, elapsedMs: null };

let ff: FakeFrames;
let play: ReturnType<typeof vi.spyOn>;
const ticks = () => play.mock.calls.filter((c) => String(c[0]).startsWith("perfect-timing.clock."));

async function ready(state: AudioContextState = "running") {
  // Unlock while running (the player's first gesture), then let the context fall into `state`.
  const audio = installAudio("running");
  setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
  await sfxController.unlock();
  if (state !== "running") (audio.context as { state: AudioContextState }).state = state;
  return audio;
}

beforeEach(() => {
  localStorage.clear();
  resetSfxForTests();
  ff = installFakeFrames(1_000);
  play = vi.spyOn(sfxController, "play");
});
afterEach(() => {
  cleanup();
  ff.restore();
  vi.restoreAllMocks();
  Object.defineProperty(window, "AudioContext", { configurable: true, writable: true, value: undefined });
});

describe("Perfect Timing chronometer — sound", () => {
  it("registers built-in voices for the cast, the tick, the mark and the lock, quieter than the quiz countdown", () => {
    for (const e of ["perfect-timing.cast", "perfect-timing.clock.tick", "perfect-timing.clock.mark", "perfect-timing.lock"] as const) {
      expect(SFX_REGISTRY[e].builtInGeneratorId, e).toMatch(/^sfx\.perfect-timing\./);
    }
    expect(SFX_REGISTRY["perfect-timing.clock.tick"].relativeGain).toBeLessThan(SFX_REGISTRY["quiz.countdown.tick"].relativeGain);
  });

  it("cast → exactly one tick per elapsed second (a mark on the fifth) → lock, each rendered once", async () => {
    const audio = await ready();
    const { rerender } = render(<PerfectTimingArena model={model("armed", { t0: null, elapsedMs: null })} />);
    rerender(<PerfectTimingArena model={model("running", RUNNING)} />);
    ff.run(1_000 + 6_300);
    rerender(<PerfectTimingArena model={model("stopped", { t0: 1_000, elapsedMs: 6_301 })} />);
    ff.run(1_000 + 9_000);
    const names = play.mock.calls.map((c) => [c[0], (c[1] as { eventId?: string } | undefined)?.eventId]);
    expect(names).toEqual([
      ["ranked.module.start", `perfect-timing:${ROUND.roundId}:start`],
      ["perfect-timing.cast", `perfect-timing:${ROUND.roundId}:cast`],
      ...[1, 2, 3, 4, 5, 6].map((n) => [n === 5 ? "perfect-timing.clock.mark" : "perfect-timing.clock.tick", `perfect-timing:${ROUND.roundId}:tick:${n}`]),
      ["perfect-timing.lock", `perfect-timing:${ROUND.roundId}:lock`],
    ]);
    // The engine rendered every one of them (none was refused as a replay).
    expect(audio.counts.oscillators).toBeGreaterThanOrEqual(9);
  });

  it("muted: the cues are asked for, nothing is rendered", async () => {
    const audio = await ready();
    localStorage.setItem(SFX_MUTE_STORAGE_KEY, "1");
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    const { rerender } = render(<PerfectTimingArena model={model("armed", { t0: null, elapsedMs: null })} />);
    rerender(<PerfectTimingArena model={model("running", RUNNING)} />);
    ff.run(1_000 + 3_100);
    expect(ticks()).toHaveLength(3);
    expect(audio.counts).toEqual({ oscillators: 0, buffers: 0, resumes: 0 });
  });

  it("a suspended context gets no tick at all (never queued, never played late)", async () => {
    const audio = await ready("suspended");
    render(<PerfectTimingArena model={model("running", RUNNING)} />);
    ff.run(1_000 + 3_100);
    // Whether the engine's snapshot has noticed the suspension or not, nothing
    // renders, nothing asks the context to resume, nothing waits to play.
    expect(ticks().every((c) => (c[1] as { dropIfNotRunning?: boolean }).dropIfNotRunning === true)).toBe(true);
    expect(audio.counts).toEqual({ oscillators: 0, buffers: 0, resumes: 0 });
    // The context comes back: only seconds from now on sound, none from the past.
    (audio.context as { state: AudioContextState }).state = "running";
    ff.run(1_000 + 4_100);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(audio.counts.oscillators).toBe(1); // second 4 only
    expect(audio.counts.resumes).toBe(0);
  });

  it("two presenters of the same round never double a tick", async () => {
    const audio = await ready();
    render(<><PerfectTimingArena model={model("running", RUNNING)} /><PerfectTimingArena model={model("running", RUNNING)} /></>);
    ff.run(1_000 + 2_100);
    expect(ticks()).toHaveLength(4); // asked twice per second …
    const per = audio.counts.oscillators;
    // … rendered once per second: tick voice = 1 oscillator + 1 noise buffer.
    expect(per).toBe(2);
    expect(audio.counts.buffers).toBe(2);
  });

  it("StrictMode renders each second once", async () => {
    const audio = await ready();
    render(<StrictMode><PerfectTimingArena model={model("running", RUNNING)} /></StrictMode>);
    ff.run(1_000 + 3_100);
    expect(audio.counts.oscillators).toBe(3);
  });

  it("no tick after an interruption, and none after the stop", async () => {
    await ready();
    const { rerender } = render(<PerfectTimingArena model={model("running", RUNNING)} />);
    ff.run(1_000 + 1_500);
    rerender(<PerfectTimingArena model={model("interrupted", { t0: null, elapsedMs: null })} />);
    ff.run(1_000 + 4_000);
    expect(ticks()).toHaveLength(1);
  });

  it("a new round's seconds are its own: no carry-over from the last round", async () => {
    await ready();
    const { rerender } = render(<PerfectTimingArena model={model("running", RUNNING)} />);
    ff.run(1_000 + 2_100);
    rerender(<PerfectTimingArena model={model("armed", { t0: null, elapsedMs: null }, DEMO_ROUNDS[2])} />);
    rerender(<PerfectTimingArena model={model("running", { t0: ff.now, elapsedMs: null }, DEMO_ROUNDS[2])} />);
    ff.run(ff.now + 1_100);
    expect(ticks().map((c) => (c[1] as { eventId: string }).eventId)).toEqual([
      `perfect-timing:${ROUND.roundId}:tick:1`, `perfect-timing:${ROUND.roundId}:tick:2`, `perfect-timing:${DEMO_ROUNDS[2].roundId}:tick:1`,
    ]);
  });
});
