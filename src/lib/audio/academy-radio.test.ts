/**
 * Academy Radio store.
 *
 * The load-bearing guarantees: importing the module does nothing, there is only
 * ever one audio element, playback needs a real gesture, a refused play() is a
 * silent non-event, mute and pause are different things, and preferences
 * survive a reload without ever promising audible autoplay.
 *
 * jsdom implements none of HTMLMediaElement's playback, so play/load/pause/
 * paused and the frame loop are stubbed locally in this file only — the shared
 * setup (src/test/setup.ts) is deliberately left alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MUSIC_VOLUME,
  FADE_IN_MS,
  RADIO_PLAYLIST,
  RADIO_STORAGE_KEYS,
  getRadioSnapshot,
  nextRadioTrack,
  pauseRadio,
  playRadio,
  prepareRadio,
  resetRadioForTests,
  setRadioMuted,
  setRadioVolume,
  startRadio,
  subscribeRadio,
  toggleRadioMute,
  toggleRadioPlayback,
} from "./academy-radio";

const STATE_KEY = "__mogzyEntryMusic__";

/* -------------------------------------------------------------------------- */
/* Local media + frame-loop stubs                                             */
/* -------------------------------------------------------------------------- */

/**
 * Node 25 installs its own global `localStorage` whose methods are absent when
 * `--localstorage-file` has no path, and it shadows jsdom's. That is a
 * repo-wide environment problem (it is what fails the pre-existing suites), so
 * it is patched locally here rather than in the shared setup: these specs need
 * a working Storage to assert persistence against, and the store itself already
 * treats a broken Storage as "no saved preference" rather than an error.
 */
const nativeLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function installLocalStorageStub() {
  const entries = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => (entries.has(key) ? entries.get(key)! : null),
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: stub,
  });
}

const nativeCreateElement = document.createElement.bind(document);
const nativePlay = HTMLMediaElement.prototype.play;
const nativePause = HTMLMediaElement.prototype.pause;
const nativeLoad = HTMLMediaElement.prototype.load;
const nativePausedDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "paused",
);

let audios: HTMLAudioElement[] = [];
let audioCreations = 0;
let paused = true;
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let load: ReturnType<typeof vi.fn>;

let clock = 0;
let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextFrameId = 1;

function advanceFrames(ms: number) {
  clock += ms;
  const due = frames;
  frames = [];
  due.forEach((frame) => frame.cb(clock));
}

function theAudio(): HTMLAudioElement {
  expect(audios.length).toBeGreaterThan(0);
  return audios[0];
}

/** Drops the singleton but keeps localStorage, the way a page reload does. */
function simulateReload() {
  delete (globalThis as Record<string, unknown>)[STATE_KEY];
  audios = [];
  audioCreations = 0;
  paused = true;
}

beforeEach(() => {
  installLocalStorageStub();
  resetRadioForTests();

  audios = [];
  audioCreations = 0;
  paused = true;
  clock = 0;
  frames = [];
  nextFrameId = 1;

  vi.spyOn(document, "createElement").mockImplementation(((
    tag: string,
    options?: ElementCreationOptions,
  ) => {
    const el = nativeCreateElement(tag, options);
    if (tag === "audio") {
      audioCreations += 1;
      audios.push(el as HTMLAudioElement);
    }
    return el;
  }) as typeof document.createElement);

  play = vi.fn(async () => {
    paused = false;
  });
  pause = vi.fn(() => {
    paused = true;
  });
  load = vi.fn();

  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = pause as unknown as HTMLMediaElement["pause"];
  HTMLMediaElement.prototype.load = load as unknown as HTMLMediaElement["load"];
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get: () => paused,
  });

  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.push({ id, cb });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames = frames.filter((frame) => frame.id !== id);
  });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  resetRadioForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  HTMLMediaElement.prototype.play = nativePlay;
  HTMLMediaElement.prototype.pause = nativePause;
  HTMLMediaElement.prototype.load = nativeLoad;
  if (nativePausedDescriptor) {
    Object.defineProperty(HTMLMediaElement.prototype, "paused", nativePausedDescriptor);
  }
  if (nativeLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", nativeLocalStorage);
  }
});

/* -------------------------------------------------------------------------- */

describe("Academy Radio — import and mount are inert", () => {
  it("creates no element and no state merely by importing the module", async () => {
    resetRadioForTests();
    vi.resetModules();
    audioCreations = 0;

    await import("./academy-radio");

    expect(audioCreations).toBe(0);
    expect((globalThis as Record<string, unknown>)[STATE_KEY]).toBeUndefined();
  });

  it("prepares exactly one silent element and starts no playback", () => {
    prepareRadio();

    expect(audioCreations).toBe(1);
    expect(play).not.toHaveBeenCalled();
    expect(theAudio().volume).toBe(0);
    expect(theAudio().preload).toBe("auto");
    expect(load).toHaveBeenCalledTimes(1);
    expect(getRadioSnapshot().status).toBe("ready");
    expect(getRadioSnapshot().isPlaying).toBe(false);
  });

  it("keeps one persistent element across repeated preparation", () => {
    prepareRadio();
    prepareRadio();
    prepareRadio();

    expect(audioCreations).toBe(1);
  });

  it("serves Tidecaller WebM-first with an MP3 fallback", () => {
    prepareRadio();

    const sources = Array.from(theAudio().querySelectorAll("source"));
    expect(sources.map((s) => s.type)).toEqual(["audio/webm; codecs=opus", "audio/mpeg"]);
    expect(sources[0].getAttribute("src")).toBe("/audio/music/tidecaller.webm");
    expect(sources[1].getAttribute("src")).toBe("/audio/music/tidecaller.mp3");
  });

  it("loops the element while the playlist holds a single track", () => {
    prepareRadio();
    expect(RADIO_PLAYLIST).toHaveLength(1);
    expect(theAudio().loop).toBe(true);
  });

  it("adopts an element that is already playing after an HMR module swap", async () => {
    prepareRadio();
    await startRadio();
    expect(audioCreations).toBe(1);

    // A changed module gets a fresh scope but must find the live singleton.
    vi.resetModules();
    const reloaded = await import("./academy-radio");
    reloaded.prepareRadio();
    await reloaded.startRadio();

    expect(audioCreations).toBe(1);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("Academy Radio — starting", () => {
  it("plays after a start and reports success", async () => {
    prepareRadio();
    await expect(startRadio()).resolves.toBe(true);

    expect(play).toHaveBeenCalledTimes(1);
    expect(getRadioSnapshot().status).toBe("playing");
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("swallows a rejected play(), reports blocked, and never claims to be playing", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    prepareRadio();

    await expect(startRadio()).resolves.toBe(false);
    expect(getRadioSnapshot().status).toBe("blocked");
    expect(getRadioSnapshot().isPlaying).toBe(false);
  });

  it("never throws synchronously, so `void startRadio()` is safe", () => {
    play.mockImplementation(() => {
      throw new Error("play exploded");
    });
    prepareRadio();

    expect(() => void startRadio()).not.toThrow();
  });

  it("fades from silence to the configured target over the full fade", async () => {
    prepareRadio();
    await startRadio();

    expect(theAudio().volume).toBe(0);
    advanceFrames(FADE_IN_MS / 2);
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME / 2, 5);
    advanceFrames(FADE_IN_MS / 2);
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);

    // The ramp ends itself rather than spinning forever.
    expect(frames).toHaveLength(0);
  });

  it("does not duplicate or restart playback on repeat starts", async () => {
    prepareRadio();
    await startRadio();
    await startRadio();
    await startRadio();

    expect(audioCreations).toBe(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight play() when started twice before it settles", async () => {
    let resolvePlay: () => void = () => undefined;
    play.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePlay = () => {
            paused = false;
            resolve();
          };
        }),
    );
    prepareRadio();

    const first = startRadio();
    const second = startRadio();
    expect(second).toBe(first);
    expect(play).toHaveBeenCalledTimes(1);

    resolvePlay();
    await expect(first).resolves.toBe(true);
  });

  it("never re-buffers a track that is already playing (route remount)", async () => {
    prepareRadio();
    await startRadio();
    advanceFrames(FADE_IN_MS);
    load.mockClear();

    // A route change remounts the controller.
    prepareRadio();
    await startRadio();

    expect(load).not.toHaveBeenCalled();
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
  });

  it("keeps exactly one fade frame alive across rapid repeat starts", async () => {
    prepareRadio();
    await startRadio();
    advanceFrames(FADE_IN_MS / 10);
    expect(frames).toHaveLength(1);

    await startRadio();
    await startRadio();

    expect(frames).toHaveLength(1);
  });

  it("notifies subscribers when the state actually changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRadio(listener);

    prepareRadio();
    await startRadio();
    expect(listener).toHaveBeenCalled();

    const snapshot = getRadioSnapshot();
    // Cached between changes, as useSyncExternalStore requires.
    expect(getRadioSnapshot()).toBe(snapshot);

    listener.mockClear();
    unsubscribe();
    setRadioMuted(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Academy Radio — mute is not pause", () => {
  it("mute silences the output without destroying the remembered volume", async () => {
    prepareRadio();
    await startRadio();
    advanceFrames(FADE_IN_MS);
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);

    setRadioMuted(true);

    expect(theAudio().muted).toBe(true);
    expect(getRadioSnapshot().muted).toBe(true);
    // The level is intact underneath the mute.
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
    expect(getRadioSnapshot().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
    // Mute is not a transport control.
    expect(pause).not.toHaveBeenCalled();
  });

  it("unmuting restores the prior volume and resumes", async () => {
    prepareRadio();
    setRadioVolume(0.5);
    await startRadio();
    advanceFrames(FADE_IN_MS);

    setRadioMuted(true);
    setRadioMuted(false);
    advanceFrames(FADE_IN_MS);

    expect(theAudio().muted).toBe(false);
    expect(theAudio().volume).toBeCloseTo(0.5, 5);
    expect(getRadioSnapshot().volume).toBeCloseTo(0.5, 5);
  });

  it("toggles cleanly and persists the mute preference", () => {
    prepareRadio();

    toggleRadioMute();
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.muted)).toBe("true");

    toggleRadioMute();
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.muted)).toBe("false");
  });

  it("restores a stored mute on reload and stays silent until asked", () => {
    prepareRadio();
    setRadioMuted(true);

    simulateReload();

    expect(getRadioSnapshot().muted).toBe(true);
    prepareRadio();
    expect(theAudio().muted).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });
});

describe("Academy Radio — volume", () => {
  it("defaults to the Tidecaller target", () => {
    expect(getRadioSnapshot().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
  });

  it("applies a live change immediately instead of chasing the fade", async () => {
    prepareRadio();
    await startRadio();
    advanceFrames(FADE_IN_MS / 4);

    setRadioVolume(0.6);

    expect(theAudio().volume).toBeCloseTo(0.6, 5);
    // The in-flight ramp was cancelled rather than left to fight the setting.
    expect(frames).toHaveLength(0);
  });

  it("clamps out-of-range values", () => {
    setRadioVolume(4);
    expect(getRadioSnapshot().volume).toBe(1);
    setRadioVolume(-2);
    expect(getRadioSnapshot().volume).toBe(0);
  });

  it("persists and restores across a reload", () => {
    setRadioVolume(0.42);
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.volume)).toBe("0.42");

    simulateReload();

    expect(getRadioSnapshot().volume).toBeCloseTo(0.42, 5);
  });

  it("does not make a reloaded page audible on its own", () => {
    setRadioVolume(0.42);
    simulateReload();

    prepareRadio();

    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().isPlaying).toBe(false);
  });
});

describe("Academy Radio — pause and explicit play", () => {
  it("explicit pause stops the transport and reports paused", async () => {
    prepareRadio();
    await startRadio();

    pauseRadio();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(getRadioSnapshot().status).toBe("paused");
    expect(getRadioSnapshot().isPlaying).toBe(false);
  });

  it("explicit play resumes after a pause", async () => {
    prepareRadio();
    await startRadio();
    pauseRadio();
    play.mockClear();

    await playRadio();

    expect(play).toHaveBeenCalledTimes(1);
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("explicit play lifts a mute — Mute stays the deliberate silent control", async () => {
    prepareRadio();
    setRadioMuted(true);

    await playRadio();

    expect(getRadioSnapshot().muted).toBe(false);
    expect(theAudio().muted).toBe(false);
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("toggling playback alternates between the two", async () => {
    prepareRadio();

    toggleRadioPlayback();
    await Promise.resolve();
    await Promise.resolve();
    expect(getRadioSnapshot().isPlaying).toBe(true);

    toggleRadioPlayback();
    expect(getRadioSnapshot().isPlaying).toBe(false);
  });

  it("resuming keeps its level rather than dropping back to silence", async () => {
    prepareRadio();
    await startRadio();
    advanceFrames(FADE_IN_MS);
    pauseRadio();

    await playRadio();

    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
  });
});

describe("Academy Radio — one-track playlist", () => {
  it("reports that Next has nowhere to go", () => {
    expect(getRadioSnapshot().trackCount).toBe(1);
    expect(getRadioSnapshot().canGoNext).toBe(false);
    expect(getRadioSnapshot().trackTitle).toBe("Tidecaller");
  });

  it("Next is a safe no-op — no reload, no restart, no track change", async () => {
    prepareRadio();
    await startRadio();
    load.mockClear();
    play.mockClear();

    nextRadioTrack();

    expect(load).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().trackIndex).toBe(0);
  });

  it("a stray ended event cannot strand the radio in silence", async () => {
    prepareRadio();
    await startRadio();
    load.mockClear();

    expect(() => theAudio().dispatchEvent(new Event("ended"))).not.toThrow();

    expect(getRadioSnapshot().trackIndex).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("a media error surfaces as a failed track rather than a fake playing state", () => {
    prepareRadio();

    theAudio().dispatchEvent(new Event("error"));

    expect(getRadioSnapshot().status).toBe("failed");
    expect(getRadioSnapshot().isPlaying).toBe(false);
  });
});
