/**
 * Entry music controller.
 *
 * The load-bearing guarantees are: nothing is audible without a gesture, the
 * element is a true singleton that survives the / -> /lol transition, repeat
 * gestures never stack or restart a track, and a refused play() is a silent
 * non-event rather than an exception.
 *
 * jsdom implements none of HTMLMediaElement's playback, so play/load/paused/
 * currentTime and the frame loop are stubbed locally in this file only — the
 * shared setup (src/test/setup.ts) is deliberately left alone.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EntryMusicController, {
  resetEntryMusicForTests,
  startEntryMusic,
} from "./EntryMusicController";
import { setPlayRadioByDefault } from "@/lib/audio/academy-radio";

const TARGET_VOLUME = 0.15;
const FADE_IN_MS = 2500;
const STATE_KEY = "__mogzyEntryMusic__";

/* -------------------------------------------------------------------------- */
/* Local media + frame-loop stubs                                             */
/* -------------------------------------------------------------------------- */

const nativeCreateElement = document.createElement.bind(document);
const nativePlay = HTMLMediaElement.prototype.play;
const nativeLoad = HTMLMediaElement.prototype.load;
const nativePausedDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "paused",
);
const nativeCurrentTimeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "currentTime",
);

let audios: HTMLAudioElement[] = [];
let audioCreations = 0;
let paused = true;
let play: ReturnType<typeof vi.fn>;
let load: ReturnType<typeof vi.fn>;
let setCurrentTime: ReturnType<typeof vi.fn>;

/** Hand-driven frame loop, so fades are deterministic instead of wall-clock. */
let clock = 0;
let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextFrameId = 1;
let raf: ReturnType<typeof vi.fn>;
let caf: ReturnType<typeof vi.fn>;

/** Advance the clock and flush exactly the frames that were already queued. */
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

beforeEach(() => {
  resetEntryMusicForTests();
  // Existing controller specs exercise the opted-in automatic path.
  setPlayRadioByDefault(true);

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
  load = vi.fn();
  setCurrentTime = vi.fn();

  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.load = load as unknown as HTMLMediaElement["load"];
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get: () => paused,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get: () => 0,
    set: setCurrentTime,
  });

  raf = vi.fn((cb: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.push({ id, cb });
    return id;
  });
  caf = vi.fn((id: number) => {
    frames = frames.filter((frame) => frame.id !== id);
  });
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  cleanup();
  resetEntryMusicForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  HTMLMediaElement.prototype.play = nativePlay;
  HTMLMediaElement.prototype.load = nativeLoad;
  if (nativePausedDescriptor) {
    Object.defineProperty(HTMLMediaElement.prototype, "paused", nativePausedDescriptor);
  }
  if (nativeCurrentTimeDescriptor) {
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", nativeCurrentTimeDescriptor);
  }
});

/* -------------------------------------------------------------------------- */

describe("EntryMusicController — nothing happens without a gesture", () => {
  it("creates no audio element merely by importing the module", async () => {
    resetEntryMusicForTests();
    vi.resetModules();
    audioCreations = 0;

    await import("./EntryMusicController");

    expect(audioCreations).toBe(0);
    expect((globalThis as Record<string, unknown>)[STATE_KEY]).toBeUndefined();
  });

  it("mounting the controller prepares one element and starts no playback", () => {
    render(<EntryMusicController />);

    expect(audioCreations).toBe(1);
    expect(play).not.toHaveBeenCalled();
    // Silent, looping, and pre-buffered — but not sounding.
    expect(theAudio().volume).toBe(0);
    expect(theAudio().loop).toBe(true);
    expect(theAudio().preload).toBe("auto");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("offers WebM/Opus first and MP3 as the fallback", () => {
    render(<EntryMusicController />);

    const sources = Array.from(theAudio().querySelectorAll("source"));
    expect(sources.map((s) => s.type)).toEqual(["audio/webm; codecs=opus", "audio/mpeg"]);
    expect(sources[0].getAttribute("src")).toBe("/audio/music/tidecaller.webm");
    expect(sources[1].getAttribute("src")).toBe("/audio/music/tidecaller.mp3");
  });

  it("mounting twice never creates a second element", () => {
    const first = render(<EntryMusicController />);
    render(<EntryMusicController />);

    expect(audioCreations).toBe(1);

    // Unmounting the entrance-side mount must not silence the shared element.
    first.unmount();
    expect(play).not.toHaveBeenCalled();
  });
});

describe("startEntryMusic — the gesture path", () => {
  it("keeps a genuinely new visitor silent", async () => {
    resetEntryMusicForTests();
    render(<EntryMusicController />);

    await expect(startEntryMusic()).resolves.toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("plays after invocation and reports success", async () => {
    render(<EntryMusicController />);

    await expect(startEntryMusic()).resolves.toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected play() and resolves false instead of throwing", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<EntryMusicController />);

    await expect(startEntryMusic()).resolves.toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("never throws synchronously, so `void startEntryMusic()` is safe", () => {
    play.mockImplementation(() => {
      throw new Error("play exploded");
    });
    render(<EntryMusicController />);

    expect(() => void startEntryMusic()).not.toThrow();
  });

  it("fades from silence to the 0.15 target over 2500ms", async () => {
    render(<EntryMusicController />);
    await startEntryMusic();

    expect(theAudio().volume).toBe(0);

    advanceFrames(FADE_IN_MS / 2);
    expect(theAudio().volume).toBeCloseTo(TARGET_VOLUME / 2, 5);

    advanceFrames(FADE_IN_MS / 2);
    expect(theAudio().volume).toBeCloseTo(TARGET_VOLUME, 5);

    // The ramp ends itself rather than spinning forever.
    expect(frames).toHaveLength(0);
  });
});

describe("startEntryMusic — repeat gestures", () => {
  it("does not create a second element or a second track", async () => {
    render(<EntryMusicController />);

    await startEntryMusic();
    await startEntryMusic();
    await startEntryMusic();

    expect(audioCreations).toBe(1);
    // One play() total: the later calls saw a sounding element and left it be.
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("shares a single in-flight play() when called twice before it settles", async () => {
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
    render(<EntryMusicController />);

    const first = startEntryMusic();
    const second = startEntryMusic();
    expect(second).toBe(first);
    expect(play).toHaveBeenCalledTimes(1);

    resolvePlay();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("never rewinds or re-buffers a track that is already playing", async () => {
    render(<EntryMusicController />);
    await startEntryMusic();
    advanceFrames(FADE_IN_MS);
    load.mockClear();

    await startEntryMusic();

    expect(setCurrentTime).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(theAudio().volume).toBeCloseTo(TARGET_VOLUME, 5);
  });

  it("tops the volume back up when an earlier fade was cut short", async () => {
    render(<EntryMusicController />);
    await startEntryMusic();

    // Interrupt the swell part-way up, the way a cancelled fade would.
    advanceFrames(FADE_IN_MS / 5);
    const interrupted = theAudio().volume;
    frames = [];
    expect(interrupted).toBeGreaterThan(0);
    expect(interrupted).toBeLessThan(TARGET_VOLUME);

    // A second gesture must not drop it back to silence...
    await startEntryMusic();
    expect(theAudio().volume).toBeCloseTo(interrupted, 5);

    // ...and must still carry it the rest of the way to the target.
    advanceFrames(FADE_IN_MS);
    expect(theAudio().volume).toBeCloseTo(TARGET_VOLUME, 5);
  });

  it("keeps exactly one fade frame alive across rapid repeat calls", async () => {
    render(<EntryMusicController />);
    await startEntryMusic();
    advanceFrames(FADE_IN_MS / 10);
    expect(frames).toHaveLength(1);

    await startEntryMusic();
    await startEntryMusic();

    // The earlier frames were cancelled, not left running alongside the new one.
    expect(caf).toHaveBeenCalled();
    expect(frames).toHaveLength(1);
  });
});
