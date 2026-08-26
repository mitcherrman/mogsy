import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mogzyAudio } from "./engine";
import type { RadioEngineSnapshot } from "./types";
import {
  DEFAULT_MODE_VOLUME,
  MODE_STORAGE_KEYS,
  acquireModeSoundtrack,
  getModeSoundtrackSnapshot,
  pauseModeSoundtrack,
  playModeSoundtrack,
  releaseModeSoundtrack,
  resetModeSoundtrackForTests,
  setModeSoundtrackConfigForTests,
  setModeSoundtrackMuted,
  setModeSoundtrackVolume,
  setPlayModeMusicAutomatically,
} from "./mode-soundtrack";

const nativeLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const nativePlay = HTMLMediaElement.prototype.play;
const nativePause = HTMLMediaElement.prototype.pause;
const nativeLoad = HTMLMediaElement.prototype.load;
const nativePaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused");
let paused = true;
let play: ReturnType<typeof vi.fn>;
let suppress: ReturnType<typeof vi.fn>;
let audioCreations = 0;
let radioSnapshot: RadioEngineSnapshot;
const nativeCreateElement = document.createElement.bind(document);

const request = (owner = "ranked:m1") => ({
  owner,
  source: "track" as const,
  sourceId: "ranked",
  startBehavior: "restart" as const,
  exitBehavior: "return-to-radio" as const,
});

beforeEach(() => {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return entries.size; }, clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
  } satisfies Storage });
  resetModeSoundtrackForTests();
  setModeSoundtrackConfigForTests("ranked", {
    id: "ranked", title: "Ranked Test Theme",
    sources: [{ src: "/audio/test-ranked.mp3", type: "audio/mpeg" }],
  });
  paused = true;
  audioCreations = 0;
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    if (tag === "audio") audioCreations += 1;
    return nativeCreateElement(tag, options);
  }) as typeof document.createElement);
  play = vi.fn(async () => { paused = false; });
  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = vi.fn(() => { paused = true; });
  HTMLMediaElement.prototype.load = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true, get: () => paused,
  });
  suppress = vi.fn((suppressed: boolean) => {
    radioSnapshot = { ...radioSnapshot, suppressedByMode: suppressed };
  });
  radioSnapshot = {
    isPlaying: true, isAudible: true, muted: false, muteReason: null,
    suppressedByMode: false, volume: 0.15, trackId: "tidecaller",
    playRadioByDefault: true,
  };
  mogzyAudio.registerRadio({
    getSnapshot: () => radioSnapshot, subscribe: () => () => undefined,
    play: async () => true, pause: vi.fn(), setMuted: vi.fn(), setVolume: vi.fn(),
    setPlayByDefault: vi.fn(), setAutoMuteWhenInactive: vi.fn(),
    setSuppressedByMode: suppress,
  });
});

afterEach(() => {
  resetModeSoundtrackForTests();
  vi.restoreAllMocks();
  HTMLMediaElement.prototype.play = nativePlay;
  HTMLMediaElement.prototype.pause = nativePause;
  HTMLMediaElement.prototype.load = nativeLoad;
  if (nativePaused) Object.defineProperty(HTMLMediaElement.prototype, "paused", nativePaused);
  if (nativeLocalStorage) Object.defineProperty(globalThis, "localStorage", nativeLocalStorage);
});

describe("canonical Mode Soundtrack", () => {
  it("uses one player and one owner, with duplicate acquisition idempotent", async () => {
    expect(await acquireModeSoundtrack(request())).toBe(true);
    expect(await acquireModeSoundtrack(request())).toBe(true);
    expect(audioCreations).toBe(1);
    expect(play).toHaveBeenCalledOnce();
    expect(getModeSoundtrackSnapshot()).toMatchObject({
      owner: "ranked:m1", active: true, status: "playing",
    });
  });

  it("protects a replacement owner from a stale release", async () => {
    await acquireModeSoundtrack(request("ranked:old"));
    await acquireModeSoundtrack(request("ranked:new"));
    releaseModeSoundtrack("ranked:old");
    expect(getModeSoundtrackSnapshot().owner).toBe("ranked:new");
    expect(radioSnapshot.suppressedByMode).toBe(true);

    releaseModeSoundtrack("ranked:new");
    expect(getModeSoundtrackSnapshot().active).toBe(false);
    expect(radioSnapshot.suppressedByMode).toBe(false);
  });

  it("keeps Mode preference and volume independent and defaults to on at 15%", () => {
    expect(getModeSoundtrackSnapshot()).toMatchObject({
      playAutomatically: true, volume: DEFAULT_MODE_VOLUME,
    });
    setPlayModeMusicAutomatically(false);
    setModeSoundtrackVolume(0.37);
    expect(localStorage.getItem(MODE_STORAGE_KEYS.playAutomatically)).toBe("false");
    expect(localStorage.getItem(MODE_STORAGE_KEYS.volume)).toBe("0.37");
    expect(radioSnapshot.volume).toBe(0.15);
  });

  it("restores Radio for pause or mute and suppresses it again when audible", async () => {
    await acquireModeSoundtrack(request());
    expect(suppress).toHaveBeenLastCalledWith(true);
    pauseModeSoundtrack();
    expect(suppress).toHaveBeenLastCalledWith(false);
    await playModeSoundtrack();
    expect(suppress).toHaveBeenLastCalledWith(true);
    setModeSoundtrackMuted(true);
    expect(suppress).toHaveBeenLastCalledWith(false);
    setModeSoundtrackMuted(false);
    expect(suppress).toHaveBeenLastCalledWith(true);
  });

  it("does not suppress Radio when playback is blocked", async () => {
    play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    expect(await acquireModeSoundtrack(request())).toBe(false);
    expect(getModeSoundtrackSnapshot().status).toBe("blocked");
    expect(suppress).not.toHaveBeenCalledWith(true);
  });

  it("creates no element and suppresses nothing without a valid Mode source", async () => {
    setModeSoundtrackConfigForTests("ranked", {
      id: "ranked", title: "Ranked Soundtrack", sources: [],
    });
    expect(await acquireModeSoundtrack(request())).toBe(false);
    expect(audioCreations).toBe(0);
    expect(suppress).not.toHaveBeenCalled();
  });

  it("creates no element or suppression when automatic Mode playback is off", async () => {
    setPlayModeMusicAutomatically(false);
    expect(await acquireModeSoundtrack(request())).toBe(false);
    expect(audioCreations).toBe(0);
    expect(suppress).not.toHaveBeenCalled();
  });
});
