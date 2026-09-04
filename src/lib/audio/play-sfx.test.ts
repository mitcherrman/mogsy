/**
 * PLAY1's sound engine and the gate in front of it.
 *
 * The surfaces' own suites assert WHEN a cue is asked for — one arrow press,
 * one tick; one join, one queue-start. This one asserts the other half: that a
 * request only becomes a sound when the app's settings allow it, that a
 * duplicate request inside one action cannot double it, and — the property the
 * whole layer is worthless without — that nothing here can ever throw into the
 * click handler that called it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { SOUND_DEFAULTS, type SoundSettings } from "@/hooks/useSoundSettings";

const settings = vi.hoisted(() => ({ current: {} as Partial<SoundSettings> }));

// The real client's auth bootstrap trips over the pinned jsdom's broken
// Storage (see src/test/localStorageStub.ts). Same convention as every other
// suite that would transitively construct it — cf. tomeAudio.test.ts.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  },
}));

vi.mock("@/hooks/useSoundSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSoundSettings")>();
  return {
    ...actual,
    useSoundSettings: () => ({
      soundSettings: { ...actual.SOUND_DEFAULTS, ...settings.current },
      loading: false,
    }),
  };
});

import { PLAY_SFX_CUES, playSfxEngine, resetPlaySfxGuards } from "./play-sfx";
import { PLAY_SFX_SETTING_KEY, usePlaySfx } from "./usePlaySfx";

/* ── A fake Web Audio stack ────────────────────────────────────────────────
 *
 * jsdom has no AudioContext at all, so without this every cue would be dropped
 * by the engine's own fail-soft guard and the render path would never run —
 * the suite would pass just as happily on an engine that could not make a
 * sound if it tried. The stub counts voices, which is enough to say "this cue
 * was actually rendered" without asserting a waveform.
 */
function installFakeAudioContext(state: AudioContextState = "running") {
  const counter = { started: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const ctx = {
    state,
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume: vi.fn(async () => {}),
    createBuffer: (_c: number, len: number) => ({
      getChannelData: () => new Float32Array(len),
    }),
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      playbackRate: param(),
      connect: vi.fn(),
      start: vi.fn(() => { counter.started += 1; }),
      stop: vi.fn(),
    }),
    createBiquadFilter: () => ({
      type: "", Q: param(), frequency: param(), connect: vi.fn(),
    }),
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createOscillator: () => ({
      type: "",
      frequency: param(),
      connect: vi.fn(),
      start: vi.fn(() => { counter.started += 1; }),
      stop: vi.fn(),
    }),
  };
  Object.defineProperty(window, "AudioContext", {
    value: function () { return ctx; },
    configurable: true,
    writable: true,
  });
  return { ctx, get started() { return counter.started; } };
}

function removeAudioContext(): void {
  for (const k of ["AudioContext", "webkitAudioContext"]) {
    Object.defineProperty(window, k, {
      value: undefined, configurable: true, writable: true,
    });
  }
}

/** The engine refuses to sound anything before the visitor has interacted —
 *  a browser would refuse anyway. Every case expecting audio needs this. */
function grantUserGesture(): void {
  window.dispatchEvent(new Event("pointerdown"));
}

beforeEach(() => {
  settings.current = {};
  resetPlaySfxGuards();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeAudioContext();
});

/* ── The registry ─────────────────────────────────────────────────────────── */

describe("the cue registry", () => {
  it("is the same cues everywhere — no cue can sound with no way to turn it off", () => {
    // Ten moments, plus the one FALLBACK that describes a control rather
    // than a moment. A twelfth is a change to this file and to the app's
    // sound settings, never something a component can decide for itself.
    expect(PLAY_SFX_CUES).toHaveLength(11);
    expect([...PLAY_SFX_CUES].sort()).toEqual([
      "bookLand", "bookRuffle", "buttonPress", "error", "mascotReact",
      "modeConfirm", "opponentFound", "queueStart", "roleStep", "scrollClose",
      "scrollOpen",
    ]);
    for (const cue of PLAY_SFX_CUES) {
      const key = PLAY_SFX_SETTING_KEY[cue];
      expect(key, `${cue} has no setting key`).toBeTruthy();
      expect(SOUND_DEFAULTS, `${key} is not in the app's sound settings`).toHaveProperty(key);
    }
    // …and no orphan keys pointing at cues that do not exist.
    expect(Object.keys(PLAY_SFX_SETTING_KEY).sort()).toEqual([...PLAY_SFX_CUES].sort());
  });

  it("gives every cue its own setting, so one can be silenced without the rest", () => {
    const keys = Object.values(PLAY_SFX_SETTING_KEY);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* ── The settings gate ────────────────────────────────────────────────────── */

describe("the settings gate", () => {
  it("lets a cue through when its setting is on", () => {
    const spy = vi.spyOn(playSfxEngine, "play").mockImplementation(() => {});
    const { result } = renderHook(() => usePlaySfx());
    result.current.play("opponentFound");
    expect(spy.mock.calls).toEqual([["opponentFound"]]);
  });

  it("silences a cue whose own setting is off, and only that cue", () => {
    settings.current = { play_role_step: false };
    const spy = vi.spyOn(playSfxEngine, "play").mockImplementation(() => {});
    const { result } = renderHook(() => usePlaySfx());
    result.current.play("roleStep");
    expect(spy).not.toHaveBeenCalled();
    result.current.play("modeConfirm");
    expect(spy.mock.calls).toEqual([["modeConfirm"]]);
  });

  /**
   * THE GLOBAL MUTE. `useSoundSettings` flattens every key to false when the
   * visitor has muted sound in Settings (`mogsy-sounds-muted`), which is the
   * one switch the whole app already obeys. A muted visitor hears nothing from
   * PLAY1 for exactly that reason — there is no second mute here to fall out
   * of step with it.
   */
  it("plays nothing at all for a muted visitor", () => {
    settings.current = Object.fromEntries(
      Object.keys(SOUND_DEFAULTS).map((k) => [k, false]),
    ) as Partial<SoundSettings>;
    const spy = vi.spyOn(playSfxEngine, "play").mockImplementation(() => {});
    const { result } = renderHook(() => usePlaySfx());
    for (const cue of PLAY_SFX_CUES) result.current.play(cue);
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * SOUND IS NEVER LOAD-BEARING.
   *
   * Call sites are click handlers, and most sound the cue BEFORE doing the
   * thing — `sfx.play("buttonPress"); onBack();`. If `play` could throw, that
   * ordering would quietly make audio a precondition of the action: a broken
   * stack would stop Back from going back. This is the guarantee that makes
   * every one of those call sites safe.
   */
  it("never throws into the caller, whatever the audio stack does", () => {
    vi.spyOn(playSfxEngine, "play").mockImplementation(() => {
      throw new Error("audio exploded");
    });
    const { result } = renderHook(() => usePlaySfx());
    for (const cue of PLAY_SFX_CUES) {
      expect(() => result.current.play(cue)).not.toThrow();
    }
  });

  it("never throws even when the settings object is missing a key", () => {
    // Defence in depth: a stored settings blob written by an older client.
    settings.current = undefined as never;
    const { result } = renderHook(() => usePlaySfx());
    for (const cue of PLAY_SFX_CUES) {
      expect(() => result.current.play(cue)).not.toThrow();
    }
  });

  it("hands back a callback that never changes identity", () => {
    const { result, rerender } = renderHook(() => usePlaySfx());
    const first = result.current;
    rerender();
    // The record wires this into effects that watch queue transitions; a new
    // identity per render would re-run them and re-sound a beat that had
    // already happened.
    expect(result.current).toBe(first);
  });
});

/* ── The engine ───────────────────────────────────────────────────────────── */

/**
 * A FRESH engine per case.
 *
 * The module caches its AudioContext and its repeat stamps at module scope —
 * correct in a browser, where there is one page and one audio stack, and fatal
 * in a suite, where a context installed for case two would never be picked up
 * because case one's is still cached. `vi.resetModules()` gives each case the
 * module as a cold page load sees it, including the un-fired first-gesture
 * listener.
 */
async function freshEngine(state: AudioContextState = "running") {
  vi.resetModules();
  const audio = installFakeAudioContext(state);
  const mod = await import("./play-sfx");
  return { engine: mod.playSfxEngine, cues: mod.PLAY_SFX_CUES, audio };
}

describe("the engine", () => {
  it("renders a cue once the visitor has interacted", async () => {
    const { engine, audio } = await freshEngine();
    grantUserGesture();
    engine.play("roleStep");
    expect(audio.started).toBeGreaterThan(0);
  });

  it("renders every one of them — none is a silent stub", async () => {
    const { engine, cues, audio } = await freshEngine();
    grantUserGesture();
    for (const cue of cues) {
      const before = audio.started;
      engine.play(cue);
      expect(audio.started, `${cue} produced no voices`).toBeGreaterThan(before);
      vi.advanceTimersByTime(1000);
    }
  });

  it("makes no sound before the first gesture, so nothing autoplays on a cold load", async () => {
    const { engine, cues, audio } = await freshEngine();
    // No gesture dispatched: this is a page the visitor has just landed on.
    // The one PLAY path that can open the record without a local press —
    // arriving from `/quiz/ranked` with `openPlay` route state — lands here.
    for (const cue of cues) engine.play(cue);
    expect(audio.started).toBe(0);
  });

  it("drops a duplicate request for the same cue inside one action", async () => {
    const { engine, audio } = await freshEngine();
    grantUserGesture();
    engine.play("modeConfirm");
    const afterFirst = audio.started;
    expect(afterFirst).toBeGreaterThan(0);
    // A StrictMode double-invoke, a double click landing in one frame, a
    // transition watcher re-running: same cue, same instant.
    engine.play("modeConfirm");
    expect(audio.started).toBe(afterFirst);
  });

  it("never lets one cue's guard silence a different cue", async () => {
    const { engine, audio } = await freshEngine();
    grantUserGesture();
    engine.play("modeConfirm");
    const afterFirst = audio.started;
    engine.play("queueStart");
    expect(audio.started).toBeGreaterThan(afterFirst);
  });

  /**
   * RAPID ROLE STEPPING STAYS RESPONSIVE. The role tick fires far more often
   * than anything else in the set, and its guard exists only to absorb
   * duplicate TRIGGERS — never to throttle the player. 120ms is about as fast
   * as a hand can work an arrow; every one of those steps has to be heard, or
   * the sound comes adrift from the mascot the player is watching move.
   */
  it("sounds every notch of a hammered role stepper", async () => {
    const { engine, audio } = await freshEngine();
    grantUserGesture();
    let heard = 0;
    for (let i = 0; i < 8; i += 1) {
      const before = audio.started;
      engine.play("roleStep");
      if (audio.started > before) heard += 1;
      vi.advanceTimersByTime(120);
    }
    expect(heard).toBe(8);
  });

  /* ── Failure is silence, never a broken interaction ──────────────────── */

  it("is silent, not broken, when the browser has no Web Audio at all", async () => {
    const { engine, cues } = await freshEngine();
    grantUserGesture();
    removeAudioContext();
    for (const cue of cues) {
      expect(() => engine.play(cue)).not.toThrow();
    }
  });

  it("is silent, not broken, when the context refuses to leave suspended", async () => {
    const { engine, cues, audio } = await freshEngine("suspended");
    grantUserGesture();
    for (const cue of cues) {
      expect(() => engine.play(cue)).not.toThrow();
    }
    expect(audio.started).toBe(0);
  });

  /**
   * A cue dropped because the context was asleep has NOT been heard, so it must
   * not spend the repeat guard — otherwise the first press after an autoplay
   * block would arm the guard and swallow the press that would have worked.
   */
  it("does not spend a cue's repeat guard on a playback that never happened", async () => {
    const { engine, audio } = await freshEngine("suspended");
    grantUserGesture();
    engine.play("opponentFound");
    expect(audio.started).toBe(0);

    // The visitor's gesture woke the stack; the very next press must sound.
    (audio.ctx as { state: AudioContextState }).state = "running";
    engine.play("opponentFound");
    expect(audio.started).toBeGreaterThan(0);
  });

  it("is silent, not broken, when the audio stack throws mid-render", async () => {
    const { engine, cues } = await freshEngine();
    grantUserGesture();
    Object.defineProperty(window, "AudioContext", {
      value: function () {
        const boom = () => { throw new Error("decode exploded"); };
        return {
          state: "running", currentTime: 0, sampleRate: 48000, destination: {},
          createBuffer: boom, createGain: boom, createOscillator: boom,
          createBufferSource: boom, createBiquadFilter: boom,
        };
      },
      configurable: true,
      writable: true,
    });
    for (const cue of cues) {
      expect(() => engine.play(cue)).not.toThrow();
    }
  });

  it("returns nothing, so no caller can be tempted to await it", async () => {
    const { engine } = await freshEngine();
    grantUserGesture();
    expect(engine.play("error")).toBeUndefined();
  });
});


/**
 * THE FALLBACK MUST STAY A FALLBACK.
 *
 * `buttonPress` answers a control being pressed; `modeConfirm` and `queueStart`
 * answer something happening. If the knock ever grew to their weight, an
 * ordinary Back would sound like a decision.
 */
describe("the fallback cue's place in the hierarchy", () => {
  it("is quieter and shorter than the cues it must never be mistaken for", async () => {
    const { engine, audio } = await freshEngine();
    grantUserGesture();
    // Voice count is a proxy for weight the stub can actually see: the knock is
    // two voices, the seal three, the queue rune four, the bell six.
    const count = (cue: Parameters<typeof engine.play>[0]) => {
      const before = audio.started;
      engine.play(cue);
      vi.advanceTimersByTime(1000);
      return audio.started - before;
    };
    const knock = count("buttonPress");
    expect(knock).toBeLessThan(count("modeConfirm"));
    expect(knock).toBeLessThan(count("queueStart"));
    expect(knock).toBeLessThan(count("opponentFound"));
  });

  it("is unthrottled enough for a rapid back-and-forth to stay tactile", async () => {
    const { engine, audio } = await freshEngine();
    grantUserGesture();
    let heard = 0;
    for (let i = 0; i < 6; i += 1) {
      const before = audio.started;
      engine.play("buttonPress");
      if (audio.started > before) heard += 1;
      vi.advanceTimersByTime(120);
    }
    expect(heard).toBe(6);
  });
});
