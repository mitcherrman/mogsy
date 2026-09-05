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
  RADIO_INACTIVITY_FADE_MS,
  RADIO_INACTIVITY_TIMEOUT_MS,
  RADIO_PLAYLIST,
  RADIO_RETURN_FADE_MS,
  RADIO_RETURN_GRACE_MS,
  RADIO_PREFERENCE_VERSION,
  RADIO_STORAGE_KEYS,
  adoptAcademyRadioPlaylist,
  attemptRadioAutostart,
  getRadioSnapshot,
  evaluateRadioInactivity,
  installRadioInactivityMonitor,
  migrateRadioPreferences,
  nextRadioTrack,
  pauseRadio,
  playRadio,
  prepareRadio,
  reconcileRadioOnWake,
  resetRadioForTests,
  resolvePlayRadioByDefault,
  setPlayRadioByDefault,
  setAutoMuteWhenInactive,
  setRadioMuted,
  setRadioSuppressedByMode,
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

const nativeVisibility = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "visibilityState",
);

/** Drive real presence transitions rather than poking at store internals. */
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function restoreVisibility() {
  delete (document as unknown as Record<string, unknown>).visibilityState;
  if (nativeVisibility) {
    Object.defineProperty(Document.prototype, "visibilityState", nativeVisibility);
  }
}

/** Give the element a real duration so the live station offset can resolve. */
function installDuration(seconds: number) {
  Object.defineProperty(theAudio(), "duration", { configurable: true, value: seconds });
  Object.defineProperty(theAudio(), "currentTime", { configurable: true, writable: true, value: 0 });
  theAudio().dispatchEvent(new Event("loadedmetadata"));
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
  restoreVisibility();
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
    expect(DEFAULT_MUSIC_VOLUME).toBe(0.15);
    expect(getRadioSnapshot().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
  });

  it("falls back safely when the stored volume is invalid", () => {
    localStorage.setItem(RADIO_STORAGE_KEYS.volume, "not-a-number");
    simulateReload();
    expect(getRadioSnapshot().volume).toBe(0.15);
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

describe("Academy Radio — Play Radio by default migration", () => {
  it("migrates every persisted client once to ON, unmuted, and 15% without moving the epoch", () => {
    const epoch = 1_700_000_000_000;
    localStorage.removeItem(RADIO_STORAGE_KEYS.preferenceVersion);
    localStorage.setItem(RADIO_STORAGE_KEYS.playByDefault, "false");
    localStorage.setItem(RADIO_STORAGE_KEYS.muted, "true");
    localStorage.setItem(RADIO_STORAGE_KEYS.volume, "0.72");
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(epoch));
    simulateReload();

    expect(getRadioSnapshot()).toMatchObject({
      playRadioByDefault: true,
      muted: false,
      muteReason: null,
      volume: DEFAULT_MUSIC_VOLUME,
      stationEpoch: epoch,
    });
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.preferenceVersion)).toBe(
      String(RADIO_PREFERENCE_VERSION),
    );
  });

  it("carries the cohort v1 forced OFF across exactly once", () => {
    // Precisely the state the superseded v1 migration left behind.
    localStorage.setItem(RADIO_STORAGE_KEYS.preferenceVersion, "1");
    localStorage.setItem(RADIO_STORAGE_KEYS.playByDefault, "false");
    localStorage.setItem(RADIO_STORAGE_KEYS.muted, "true");
    localStorage.setItem(RADIO_STORAGE_KEYS.muteReason, "manual");
    simulateReload();

    expect(getRadioSnapshot()).toMatchObject({
      playRadioByDefault: true, muted: false, volume: DEFAULT_MUSIC_VOLUME,
    });

    // ...and their next decision is theirs to keep.
    setPlayRadioByDefault(false);
    setRadioMuted(true);
    simulateReload();
    expect(getRadioSnapshot()).toMatchObject({ playRadioByDefault: false, muted: true });
  });

  it("runs once and never overwrites later listener changes", () => {
    localStorage.removeItem(RADIO_STORAGE_KEYS.preferenceVersion);
    expect(migrateRadioPreferences()).toBe(true);
    setPlayRadioByDefault(true);
    setRadioMuted(false);
    setRadioVolume(0.48);
    expect(migrateRadioPreferences()).toBe(false);
    simulateReload();
    expect(getRadioSnapshot()).toMatchObject({
      playRadioByDefault: true,
      muted: false,
      volume: 0.48,
    });
  });
  it("defaults a genuinely new browser on, with a dismissed notice still not a preference", () => {
    expect(resolvePlayRadioByDefault()).toBe(true);
    localStorage.setItem(RADIO_STORAGE_KEYS.noticeSeen, "true");
    expect(resolvePlayRadioByDefault()).toBe(true);
    // The notice records only that they saw it — never a playback choice.
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.playByDefault)).toBeNull();
  });

  it("starts a default-on visitor at 15% when the browser permits it", async () => {
    prepareRadio();

    await expect(attemptRadioAutostart()).resolves.toBe(true);

    expect(getRadioSnapshot()).toMatchObject({ isPlaying: true, muted: false });
    expect(getRadioSnapshot().volume).toBe(DEFAULT_MUSIC_VOLUME);
    // A swell, not a jump: the ramp has to be walked to reach the target.
    expect(theAudio().volume).toBe(0);
    advanceFrames(FADE_IN_MS);
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
  });

  it("leaves the autostart to the first gesture when the browser refuses it", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    prepareRadio();

    await expect(attemptRadioAutostart()).resolves.toBe(false);

    expect(getRadioSnapshot()).toMatchObject({ isPlaying: false, status: "blocked" });
  });

  it("makes no startup attempt for a visitor who turned Radio off", async () => {
    setPlayRadioByDefault(false);
    prepareRadio();

    await expect(attemptRadioAutostart()).resolves.toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("derives the preference from legacy mute state", () => {
    localStorage.setItem(RADIO_STORAGE_KEYS.muted, "false");
    expect(resolvePlayRadioByDefault()).toBe(true);
    localStorage.setItem(RADIO_STORAGE_KEYS.muted, "true");
    expect(resolvePlayRadioByDefault()).toBe(false);
  });

  it("treats a stored volume as an existing radio user and preserves it", () => {
    localStorage.setItem(RADIO_STORAGE_KEYS.volume, "0.42");
    simulateReload();
    expect(getRadioSnapshot().playRadioByDefault).toBe(true);
    expect(getRadioSnapshot().volume).toBe(0.42);
  });

  it("lets an explicit false preference win over legacy-on state", () => {
    localStorage.setItem(RADIO_STORAGE_KEYS.muted, "false");
    localStorage.setItem(RADIO_STORAGE_KEYS.playByDefault, "false");
    simulateReload();
    expect(getRadioSnapshot().playRadioByDefault).toBe(false);
  });

  it("lets an explicit true preference win over legacy-muted state", () => {
    localStorage.setItem(RADIO_STORAGE_KEYS.muted, "true");
    localStorage.setItem(RADIO_STORAGE_KEYS.playByDefault, "true");
    simulateReload();
    expect(getRadioSnapshot().playRadioByDefault).toBe(true);
  });

  it("persists an explicit change without starting playback", () => {
    prepareRadio();
    setPlayRadioByDefault(true);
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.playByDefault)).toBe("true");
    expect(getRadioSnapshot().playRadioByDefault).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });
});

describe("Academy Radio — live tune and mute", () => {
  it("the legacy pause action mutes without stopping the live transport", async () => {
    prepareRadio();
    await startRadio();

    pauseRadio();

    expect(pause).not.toHaveBeenCalled();
    expect(getRadioSnapshot().status).toBe("playing");
    expect(getRadioSnapshot().isPlaying).toBe(true);
    expect(getRadioSnapshot().isAudible).toBe(false);
    expect(getRadioSnapshot().muteReason).toBe("manual");
  });

  it("explicit Tune In unmutes the continuing transport", async () => {
    prepareRadio();
    await startRadio();
    pauseRadio();
    play.mockClear();

    await playRadio();

    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().isPlaying).toBe(true);
    expect(getRadioSnapshot().isAudible).toBe(true);
  });

  it("explicit play lifts a mute — Mute stays the deliberate silent control", async () => {
    prepareRadio();
    setRadioMuted(true);

    await playRadio();

    expect(getRadioSnapshot().muted).toBe(false);
    expect(theAudio().muted).toBe(false);
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("the compatibility toggle alternates between tuned in and muted", async () => {
    prepareRadio();

    toggleRadioPlayback();
    await Promise.resolve();
    await Promise.resolve();
    expect(getRadioSnapshot().isPlaying).toBe(true);

    toggleRadioPlayback();
    expect(getRadioSnapshot().isPlaying).toBe(true);
    expect(getRadioSnapshot().isAudible).toBe(false);
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

describe("Academy Radio — live station clock", () => {
  it("tunes in at the deterministic station position", async () => {
    const wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock - 250_000));
    prepareRadio();
    installDuration(100);

    await playRadio();

    expect(theAudio().currentTime).toBeCloseTo(50, 5);
    expect(getRadioSnapshot().trackPositionSeconds).toBeCloseTo(50, 5);
    expect(getRadioSnapshot().volume).toBe(DEFAULT_MUSIC_VOLUME);
  });

  it("rejoins at the progressed position after time passes while muted", async () => {
    let wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock - 10_000));
    prepareRadio();
    installDuration(100);
    await playRadio();
    pauseRadio();

    wallClock += 25_000;
    await playRadio();

    expect(pause).not.toHaveBeenCalled();
    expect(theAudio().currentTime).toBeCloseTo(35, 5);
    expect(getRadioSnapshot().isAudible).toBe(true);
  });

  it("persists its epoch so a recreated store rejoins the same broadcast", () => {
    const wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(wallClock);
    prepareRadio();
    const epoch = localStorage.getItem(RADIO_STORAGE_KEYS.stationEpoch);

    simulateReload();
    prepareRadio();

    expect(localStorage.getItem(RADIO_STORAGE_KEYS.stationEpoch)).toBe(epoch);
    expect(getRadioSnapshot().stationEpoch).toBe(Number(epoch));
  });

  it("resumes a browser-suspended singleton on wake from its own position, not the station clock", async () => {
    // Regression: the wake used to force-seek to the wall-clock offset (37s
    // here), which is the audible restart/jump on every tab return. The song
    // resumes from exactly where the browser froze it.
    let wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock - 20_000));
    prepareRadio();
    installDuration(100);
    await playRadio();
    const singleton = theAudio();
    play.mockClear();
    load.mockClear();
    paused = true;
    wallClock += 17_000;

    reconcileRadioOnWake();
    await Promise.resolve();

    expect(theAudio()).toBe(singleton);
    expect(theAudio().currentTime).toBeCloseTo(20, 5);
    expect(play).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it("never hops tracks or re-seeks on a wake, even across a wall-clock track boundary", async () => {
    // The wall-clock station says track two is live after six hidden seconds,
    // but the wake must not touch the transport: the track that was actually
    // playing keeps playing from its own position.
    let wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock - 9_000));
    adoptAcademyRadioPlaylist([
      { id: "one", title: "One", durationMs: 10_000, sources: [{ src: "/one.mp3", type: "audio/mpeg" }] },
      { id: "two", title: "Two", durationMs: 20_000, sources: [{ src: "/two.mp3", type: "audio/mpeg" }] },
    ]);
    prepareRadio();
    Object.defineProperty(theAudio(), "duration", { configurable: true, value: 10 });
    Object.defineProperty(theAudio(), "currentTime", { configurable: true, writable: true, value: 9 });
    await playRadio();
    paused = true;
    play.mockClear();
    load.mockClear();
    wallClock += 6_000;

    reconcileRadioOnWake();

    expect(getRadioSnapshot()).toMatchObject({ trackId: "one", trackIndex: 0 });
    expect(theAudio().currentTime).toBe(9);
    expect(load).not.toHaveBeenCalled();
  });

  it("holds station rather than resetting to zero while a track duration is unknown", async () => {
    let wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock - 7_000));
    // The second track carries no duration: the live offset cannot be resolved.
    adoptAcademyRadioPlaylist([
      { id: "one", title: "One", durationMs: 10_000, sources: [{ src: "/one.mp3", type: "audio/mpeg" }] },
      { id: "two", title: "Two", sources: [{ src: "/two.mp3", type: "audio/mpeg" }] },
    ]);
    prepareRadio();
    Object.defineProperty(theAudio(), "duration", { configurable: true, value: 10 });
    Object.defineProperty(theAudio(), "currentTime", { configurable: true, writable: true, value: 7 });
    await playRadio();
    paused = true;
    wallClock += 30_000;

    reconcileRadioOnWake();

    expect(theAudio().currentTime).toBe(7);
  });

  it("treats routine input as activity, not a wake, and leaves tolerable drift alone", async () => {
    const wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock - 20_000));
    prepareRadio();
    installDuration(100);
    await playRadio();
    const detach = installRadioInactivityMonitor();
    // One second off the 20s live offset: inside RADIO_DRIFT_TOLERANCE_SECONDS.
    theAudio().currentTime = 21;

    window.dispatchEvent(new Event("pointerdown"));

    expect(theAudio().currentTime).toBe(21);
    detach();
  });

  it("never seeks or restarts on ordinary interaction, even far off the live offset", async () => {
    // Regression: in-app clicks/keys used to call rejoinStation(false), which
    // re-seeks past the drift tolerance — every navigation restarted the track.
    // Ordinary activity must only touch the inactivity clock.
    const wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock - 20_000));
    prepareRadio();
    installDuration(100);
    await playRadio();
    const detach = installRadioInactivityMonitor();
    // Sixty seconds off the 20s live offset: far beyond RADIO_DRIFT_TOLERANCE_SECONDS.
    theAudio().currentTime = 80;
    const playCalls = play.mock.calls.length;

    for (const type of ["pointerdown", "keydown", "touchstart"]) {
      window.dispatchEvent(new Event(type));
      expect(theAudio().currentTime).toBe(80);
    }
    expect(play.mock.calls.length).toBe(playCalls);
    detach();
  });

});

const POLICY_TIMERS = {
  toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
} as const;

describe("Academy Radio — inactivity policy", () => {
  // Deliberately NOT the default fake-timer set: it would also fake
  // requestAnimationFrame and take the hand-driven frame loop these specs use
  // to walk a fade frame by frame.
  beforeEach(() => vi.useFakeTimers({ toFake: [...POLICY_TIMERS.toFake] }));
  afterEach(() => vi.useRealTimers());

  it("gives the listener two minutes before deciding nobody is there", () => {
    expect(RADIO_INACTIVITY_TIMEOUT_MS).toBe(2 * 60 * 1000);
  });

  it("mutes on its own two minutes after the last interaction", async () => {
    prepareRadio();
    installRadioInactivityMonitor();
    await playRadio();

    vi.advanceTimersByTime(RADIO_INACTIVITY_TIMEOUT_MS - 1);
    expect(getRadioSnapshot().isAudible).toBe(true);

    vi.advanceTimersByTime(1);
    advanceFrames(RADIO_INACTIVITY_FADE_MS);

    expect(getRadioSnapshot()).toMatchObject({
      muted: true, muteReason: "inactivity", isAudible: false,
      // The transport is untouched: this is a mute, not a stop.
      isPlaying: true,
    });
  });

  it("fades out rather than cutting off, and the fade is what mutes", async () => {
    prepareRadio();
    installRadioInactivityMonitor();
    await playRadio();
    advanceFrames(FADE_IN_MS);
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);

    evaluateRadioInactivity(Date.now() + RADIO_INACTIVITY_TIMEOUT_MS);

    advanceFrames(RADIO_INACTIVITY_FADE_MS / 2);
    // Half way down, and still not muted: the mute lands with the fade.
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME / 2, 5);
    expect(getRadioSnapshot().muted).toBe(false);

    advanceFrames(RADIO_INACTIVITY_FADE_MS / 2);
    expect(getRadioSnapshot()).toMatchObject({ muted: true, muteReason: "inactivity" });
  });

  it("holds the fade-in behind a grace period rather than resuming under their hand", async () => {
    prepareRadio();
    installRadioInactivityMonitor();
    await playRadio();
    evaluateRadioInactivity(Date.now() + RADIO_INACTIVITY_TIMEOUT_MS, 0);

    window.dispatchEvent(new Event("pointerdown"));

    // The click itself must not make noise — the return is deliberately late.
    expect(getRadioSnapshot().muted).toBe(true);
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS - 1);
    expect(getRadioSnapshot().muted).toBe(true);

    vi.advanceTimersByTime(1);
    expect(getRadioSnapshot()).toMatchObject({ muted: false, muteReason: null });
    expect(theAudio().volume).toBe(0);
  });

  it("does nothing when the inactivity preference is disabled", async () => {
    setAutoMuteWhenInactive(false);
    prepareRadio();
    installRadioInactivityMonitor();
    await playRadio();

    vi.advanceTimersByTime(RADIO_INACTIVITY_TIMEOUT_MS + RADIO_INACTIVITY_FADE_MS);
    advanceFrames(RADIO_INACTIVITY_FADE_MS);

    expect(getRadioSnapshot().isAudible).toBe(true);
    expect(getRadioSnapshot().muteReason).toBeNull();
  });

  it("keeps manual mute distinct from inactivity and activity cannot clear it", async () => {
    prepareRadio();
    installRadioInactivityMonitor();
    await playRadio();
    setRadioMuted(true);

    vi.advanceTimersByTime(RADIO_INACTIVITY_TIMEOUT_MS);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS * 4);

    expect(getRadioSnapshot().muteReason).toBe("manual");
    expect(getRadioSnapshot().muted).toBe(true);
  });

  it("never lets an idle mute overwrite a mute the visitor asked for", async () => {
    prepareRadio();
    installRadioInactivityMonitor();
    await playRadio();
    setRadioMuted(true);

    evaluateRadioInactivity(Date.now() + RADIO_INACTIVITY_TIMEOUT_MS, 0);

    expect(getRadioSnapshot().muteReason).toBe("manual");
  });
});

/* -------------------------------------------------------------------------- */

describe("Academy Radio — presence", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: [...POLICY_TIMERS.toFake] }));
  afterEach(() => vi.useRealTimers());

  /** An audible station with the presence monitor running. */
  async function tunedIn() {
    prepareRadio();
    const detach = installRadioInactivityMonitor();
    await playRadio();
    advanceFrames(FADE_IN_MS);
    expect(getRadioSnapshot().isAudible).toBe(true);
    return detach;
  }

  it("mutes the moment the tab is hidden, with no fade to be throttled", async () => {
    const detach = await tunedIn();

    setVisibility("hidden");

    // Immediate: a hidden tab throttles rAF, so a ramp would never land.
    expect(getRadioSnapshot()).toMatchObject({
      muted: true, muteReason: "hidden", isAudible: false,
    });
    expect(pause).not.toHaveBeenCalled();
    detach();
  });

  it("mutes on window blur, which is the only signal an alt-tab produces", async () => {
    const detach = await tunedIn();

    // The page never stops being `visible` when another application takes over.
    window.dispatchEvent(new Event("blur"));

    expect(getRadioSnapshot()).toMatchObject({ muted: true, muteReason: "hidden" });
    detach();
  });

  it("is not a manual mute, and does not churn when blur and hide both fire", async () => {
    const detach = await tunedIn();

    window.dispatchEvent(new Event("blur"));
    setVisibility("hidden");
    window.dispatchEvent(new Event("blur"));

    expect(getRadioSnapshot().muteReason).toBe("hidden");
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.muteReason)).toBe("hidden");
    detach();
  });

  it("keeps the song's own position across a hidden/visible round trip — no jump to the wall clock", async () => {
    // Regression: returning used to force-seek to the live station offset (90s
    // here), restarting the song the visitor was actually hearing. The station
    // clock stays as metadata; the native transport is the truth on return.
    let wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock));
    prepareRadio();
    const detach = installRadioInactivityMonitor();
    installDuration(600);
    await playRadio();
    // Mid-song, deliberately NOT the wall-clock offset, so a seek is observable.
    theAudio().currentTime = 45;
    play.mockClear();
    load.mockClear();

    setVisibility("hidden");
    expect(getRadioSnapshot().stationElapsedSeconds).toBeCloseTo(0, 5);
    wallClock += 90_000;

    setVisibility("visible");
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS);

    expect(getRadioSnapshot().stationElapsedSeconds).toBeCloseTo(90, 5);
    expect(theAudio().currentTime).toBe(45);
    expect(play).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(getRadioSnapshot().muted).toBe(false);
    detach();
  });

  it("never seeks or restarts on blur/focus returns either", async () => {
    // Alt-tabbing between applications fires blur/focus with no visibility
    // change — that path must honour the same no-seek contract.
    const wallClock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(wallClock);
    localStorage.setItem(RADIO_STORAGE_KEYS.stationEpoch, String(wallClock));
    prepareRadio();
    const detach = installRadioInactivityMonitor();
    installDuration(600);
    await playRadio();
    theAudio().currentTime = 45;
    play.mockClear();
    load.mockClear();

    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS * 4);

    expect(theAudio().currentTime).toBe(45);
    expect(play).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(getRadioSnapshot().isAudible).toBe(true);
    detach();
  });

  it("returns by fading in gradually rather than snapping to full volume", async () => {
    const detach = await tunedIn();
    setVisibility("hidden");
    setVisibility("visible");

    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS);
    expect(theAudio().volume).toBe(0);

    advanceFrames(RADIO_RETURN_FADE_MS / 3);
    const partway = theAudio().volume;
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(DEFAULT_MUSIC_VOLUME);

    advanceFrames(RADIO_RETURN_FADE_MS);
    expect(theAudio().volume).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);
    detach();
  });

  it("resumes the running transport instead of restarting the track at zero", async () => {
    const detach = await tunedIn();
    play.mockClear();
    load.mockClear();

    setVisibility("hidden");
    setVisibility("visible");
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS);

    // Muting never paused it, so there is nothing to re-issue and nothing to reload.
    expect(play).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(getRadioSnapshot().isPlaying).toBe(true);
    detach();
  });

  it("does not auto-resume a mute the visitor asked for", async () => {
    const detach = await tunedIn();
    setRadioMuted(true);

    setVisibility("hidden");
    setVisibility("visible");
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS * 4);

    expect(getRadioSnapshot()).toMatchObject({ muted: true, muteReason: "manual" });
    detach();
  });

  it("abandons a scheduled return if the visitor mutes during the grace period", async () => {
    const detach = await tunedIn();
    setVisibility("hidden");
    setVisibility("visible");

    setRadioMuted(true);
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS * 4);

    expect(getRadioSnapshot()).toMatchObject({ muted: true, muteReason: "manual" });
    detach();
  });

  it("abandons a scheduled return if Mogzy is left again before it fires", async () => {
    const detach = await tunedIn();
    setVisibility("hidden");
    setVisibility("visible");

    setVisibility("hidden");
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS * 4);

    expect(getRadioSnapshot()).toMatchObject({ muted: true, muteReason: "hidden" });
    detach();
  });

  it("does not resume a visitor who has turned Radio off", async () => {
    const detach = await tunedIn();
    setVisibility("hidden");
    setPlayRadioByDefault(false);
    setVisibility("visible");
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS * 4);

    expect(getRadioSnapshot().muted).toBe(true);
    detach();
  });

  it("leaves a Mode-owned floor alone in both directions", async () => {
    const detach = await tunedIn();
    setRadioSuppressedByMode(true);

    setVisibility("hidden");
    // Nothing was audible to silence, so no system mute is recorded.
    expect(getRadioSnapshot()).toMatchObject({ muted: false, muteReason: null });

    setVisibility("visible");
    vi.advanceTimersByTime(RADIO_RETURN_GRACE_MS * 4);
    setRadioSuppressedByMode(false);

    expect(getRadioSnapshot()).toMatchObject({ muted: false, isAudible: true });
    detach();
  });

  it("stops watching once detached", async () => {
    const detach = await tunedIn();
    detach();

    setVisibility("hidden");
    window.dispatchEvent(new Event("blur"));

    expect(getRadioSnapshot().muted).toBe(false);
  });
});

describe("Academy Radio — temporary Mode suppression", () => {
  it("restores the existing live state without changing preferences or station epoch", async () => {
    setPlayRadioByDefault(false);
    prepareRadio();
    await playRadio();
    const before = getRadioSnapshot();

    setRadioSuppressedByMode(true);
    expect(getRadioSnapshot()).toMatchObject({
      isPlaying: true, isAudible: false, muted: false, suppressedByMode: true,
      playRadioByDefault: false, stationEpoch: before.stationEpoch,
    });
    setRadioSuppressedByMode(false);
    expect(getRadioSnapshot()).toMatchObject({
      isPlaying: true, isAudible: true, muted: false, suppressedByMode: false,
      playRadioByDefault: false, stationEpoch: before.stationEpoch,
    });
  });

  it.each(["manual", "inactivity"] as const)(
    "preserves an existing %s mute across suppression",
    async (reason) => {
      prepareRadio();
      await playRadio();
      if (reason === "manual") setRadioMuted(true);
      else evaluateRadioInactivity(Date.now() + RADIO_INACTIVITY_TIMEOUT_MS, 0);
      setRadioSuppressedByMode(true);
      setRadioSuppressedByMode(false);
      expect(getRadioSnapshot()).toMatchObject({ muted: true, muteReason: reason });
    },
  );

  it("adopts a valid live playlist immediately while Radio is silent", () => {
    expect(adoptAcademyRadioPlaylist([{ id: "live", title: "Live Track", durationMs: 60000,
      relativeGain: 0.5, sources: [{ src: "/audio/live.mp3", type: "audio/mpeg" }] }])).toBe(true);
    expect(getRadioSnapshot()).toMatchObject({ trackId: "live", trackTitle: "Live Track", trackCount: 1 });
    prepareRadio();
    setRadioVolume(0.8);
    expect(theAudio().volume).toBe(0);
  });

  it("keeps bundled Tidecaller when runtime playlist data is missing or invalid", () => {
    expect(adoptAcademyRadioPlaylist([])).toBe(false);
    expect(adoptAcademyRadioPlaylist([{ id: "invalid", title: "Invalid", sources: [] }])).toBe(false);
    expect(getRadioSnapshot()).toMatchObject({ trackId: "tidecaller", trackTitle: "Tidecaller" });
  });

  it("defers late live config without interrupting an audible Radio session", async () => {
    prepareRadio();
    await playRadio();
    const before = getRadioSnapshot();
    expect(adoptAcademyRadioPlaylist([{ id: "late", title: "Late Track",
      sources: [{ src: "/audio/late.mp3", type: "audio/mpeg" }] }])).toBe(false);
    expect(getRadioSnapshot()).toMatchObject({ trackId: before.trackId, isAudible: true });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
