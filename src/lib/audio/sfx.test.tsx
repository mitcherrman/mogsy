import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioStudioConfig } from "./audio-studio-config";
import { EMPTY_AUDIO_STUDIO_CONFIG } from "./audio-studio-config";
import { mogzyAudio } from "./engine";
import { getSfxRegistryEntry } from "./sfx-registry";
import {
  resetSfxForTests,
  setSfxConfigForTests,
  setSfxSettingsForTests,
  SFX_MUTE_CHANGE_EVENT,
  SFX_MUTE_STORAGE_KEY,
  sfxController,
} from "./sfx";
import { publishSoundSettings, SOUND_DEFAULTS } from "./sound-settings-runtime";
import { useSfx } from "./useSfx";

interface FakeAudioOptions {
  state?: AudioContextState;
  refuseResume?: boolean;
  refuseDecode?: boolean;
  throwRenderer?: boolean;
}

function installAudio(options: FakeAudioOptions = {}) {
  const counts = { oscillators: 0, buffers: 0, decoded: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const context = {
    state: options.state ?? "running",
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume: vi.fn(async function (this: { state: AudioContextState }) {
      if (options.refuseResume) throw new Error("blocked");
      this.state = "running";
    }),
    close: vi.fn(async () => {}),
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createBuffer: (_channels: number, length: number) => ({
      duration: length / 48000,
      getChannelData: () => new Float32Array(length),
    }),
    createBiquadFilter: () => ({
      type: "", Q: param(), frequency: param(), connect: vi.fn(),
    }),
    createOscillator: () => {
      if (options.throwRenderer) throw new Error("renderer failed");
      return {
        type: "sine",
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(() => { counts.oscillators += 1; }),
        stop: vi.fn(),
      };
    },
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      playbackRate: param(),
      connect: vi.fn(),
      start: vi.fn(() => { counts.buffers += 1; }),
      stop: vi.fn(),
    }),
    decodeAudioData: vi.fn(async () => {
      counts.decoded += 1;
      if (options.refuseDecode) throw new Error("decode failed");
      return { duration: 0.5 } as AudioBuffer;
    }),
  };
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: function () { return context; },
  });
  return { context, counts };
}

function removeAudio(): void {
  for (const key of ["AudioContext", "webkitAudioContext"]) {
    Object.defineProperty(window, key, { configurable: true, writable: true, value: undefined });
  }
}

function config(patch: Partial<AudioStudioConfig> = {}): AudioStudioConfig {
  return {
    assets: [], playlists: [], eventBindings: [], modeBindings: [], ...patch,
  };
}

function sfxAssetConfig(sourceUrl = "/audio/click.mp3"): AudioStudioConfig {
  return config({
    assets: [{
      id: "click", kind: "sfx", title: "Click", artist: null,
      sourceType: "bundled", storagePath: null, sourceUrl,
      artworkStoragePath: null, artworkUrl: null, mimeType: "audio/mpeg",
      durationMs: 100, enabled: true, relativeGain: 1, tags: [],
      showNowPlayingNotification: false,
    }],
    eventBindings: [{
      eventKey: "ui.button.press", sourceType: "asset", assetId: "click",
      generatorId: null, enabled: true, relativeGain: 0.7,
    }],
  });
}

const flush = async () => {
  // fetch -> arrayBuffer -> decodeAudioData -> render is intentionally async.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
  localStorage.clear();
  resetSfxForTests();
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  removeAudio();
});

describe("canonical registration and API", () => {
  it("registers one SFX controller with mogzyAudio", () => {
    expect(mogzyAudio.getSfx()).toBe(sfxController);
  });

  it("routes React and non-React commands through that same controller", () => {
    const spy = vi.spyOn(sfxController, "play").mockImplementation(() => {});
    const { result, rerender } = renderHook(() => useSfx());
    const first = result.current.play;
    act(() => result.current.play("ui.button.press"));
    mogzyAudio.playSfx("ranked.role.step", { eventId: "round:1" });
    rerender();
    expect(result.current.play).toBe(first);
    expect(spy).toHaveBeenNthCalledWith(1, "ui.button.press", undefined);
    expect(spy).toHaveBeenNthCalledWith(2, "ranked.role.step", { eventId: "round:1" });
  });
});

describe("semantic registry and configuration timing", () => {
  it("registers the authored Hub and Leaguecraft voices", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    const events = [
      "hub.destination.focus",
      "leaguecraft.record.selection",
      "leaguecraft.quiz.start",
      "leaguecraft.answer.lock",
      "leaguecraft.answer.correct",
      "leaguecraft.answer.incorrect",
      "leaguecraft.quiz.complete",
    ] as const;
    for (const event of events) {
      sfxController.play(event);
      vi.advanceTimersByTime(600);
    }
    expect(audio.counts.oscillators).toBeGreaterThanOrEqual(events.length);
  });

  it("keeps migrated legacy UI semantics silent until Audio Studio binds them", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    sfxController.play("ui.navigation.activate");
    sfxController.play("ui.identity.action");
    sfxController.play("hub.application.enter");
    sfxController.play("training.primary.activate");
    expect(audio.counts.oscillators).toBe(0);
    expect(audio.counts.buffers).toBe(0);
  });

  it("applies published setting changes to an already-mounted controller", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    publishSoundSettings({ ...SOUND_DEFAULTS, play_button_press: false });
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(0);
    publishSoundSettings({ ...SOUND_DEFAULTS, play_button_press: true });
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(1);
  });

  it("resolves known semantics and treats unknown input as silence", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    expect(getSfxRegistryEntry("ui.button.press")).toMatchObject({ group: "ui", minReplayMs: 40 });
    expect(getSfxRegistryEntry("not.real")).toBeNull();
    expect(() => sfxController.play("not.real" as never)).not.toThrow();
    expect(audio.counts.oscillators).toBe(0);
  });

  it("stays silent until operator configuration is known, then uses the built-in", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG, false);
    await sfxController.unlock();
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(0);
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG, true);
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(1);
  });
});

describe("global visitor mute", () => {
  it("silences representative new Leaguecraft feedback", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    localStorage.setItem(SFX_MUTE_STORAGE_KEY, "1");
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    sfxController.play("leaguecraft.answer.correct");
    expect(audio.counts.oscillators).toBe(0);
  });

  it("reacts to mute and unmute without a reload", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    localStorage.setItem(SFX_MUTE_STORAGE_KEY, "1");
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(0);
    expect(sfxController.getSnapshot().muted).toBe(true);

    localStorage.removeItem(SFX_MUTE_STORAGE_KEY);
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(1);
    expect(sfxController.getSnapshot().muted).toBe(false);
  });

  it("silences previously ungated sampled card effects", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    localStorage.setItem(SFX_MUTE_STORAGE_KEY, "1");
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    sfxController.play("card.animation.amongus");
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(audio.counts.buffers).toBe(0);

    localStorage.removeItem(SFX_MUTE_STORAGE_KEY);
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    sfxController.play("card.animation.amongus");
    await flush();
    expect(fetch).toHaveBeenCalledWith("/sounds/amongus-death.mp3");
    expect(audio.counts.buffers).toBe(1);
  });

  it("does not alter either music controller", () => {
    const radioSetMuted = vi.fn();
    const modeSetMuted = vi.fn();
    const unregisterRadio = mogzyAudio.registerRadio({
      getSnapshot: () => ({ isPlaying: false, isAudible: false, muted: false,
        muteReason: null, suppressedByMode: false, volume: 0.2, trackId: "radio",
        playRadioByDefault: true }),
      subscribe: () => () => {}, play: async () => true, pause: vi.fn(),
      setMuted: radioSetMuted, setVolume: vi.fn(), setPlayByDefault: vi.fn(),
      setAutoMuteWhenInactive: vi.fn(), setSuppressedByMode: vi.fn(),
    });
    const unregisterMode = mogzyAudio.registerModeSoundtrack({
      getSnapshot: () => ({ owner: null, trackId: null, trackTitle: null,
        active: false, available: false, status: "idle", muted: false, volume: 0.2,
        playAutomatically: true }),
      subscribe: () => () => {}, acquire: async () => false, release: vi.fn(),
      play: async () => false, pause: vi.fn(), setMuted: modeSetMuted,
      setVolume: vi.fn(), setPlayAutomatically: vi.fn(),
    });
    localStorage.setItem(SFX_MUTE_STORAGE_KEY, "1");
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
    expect(radioSetMuted).not.toHaveBeenCalled();
    expect(modeSetMuted).not.toHaveBeenCalled();
    unregisterMode();
    unregisterRadio();
  });
});

describe("legacy operator settings compatibility", () => {
  it("keeps a migrated cue silent until settings are ready and while its old key is off", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    setSfxSettingsForTests(SOUND_DEFAULTS, false);
    sfxController.play("swipe.action");
    setSfxSettingsForTests({ ...SOUND_DEFAULTS, swipe_tap: false });
    sfxController.play("swipe.action");
    expect(audio.counts.oscillators).toBe(0);
    setSfxSettingsForTests(SOUND_DEFAULTS);
    sfxController.play("swipe.action");
    expect(audio.counts.oscillators).toBe(2);
  });
});

describe("Audio Studio binding precedence", () => {
  it("uses an enabled SFX asset instead of the built-in and caches its decode", async () => {
    const audio = installAudio();
    setSfxConfigForTests(sfxAssetConfig());
    await sfxController.unlock();
    sfxController.play("ui.button.press");
    await flush();
    expect(audio.counts.buffers).toBe(1);
    expect(audio.counts.oscillators).toBe(0);
    expect(audio.counts.decoded).toBe(1);
    vi.advanceTimersByTime(50);
    sfxController.play("ui.button.press");
    await flush();
    expect(audio.counts.buffers).toBe(2);
    expect(audio.counts.decoded).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses a valid synthesized binding instead of the built-in generator", async () => {
    const audio = installAudio();
    setSfxConfigForTests(config({ eventBindings: [{
      eventKey: "ui.button.press", sourceType: "synthesized", assetId: null,
      generatorId: "sfx.legacy.mode-confirm", enabled: true, relativeGain: 1,
    }] }));
    await sfxController.unlock();
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(2);
  });

  it("uses the built-in for a missing binding but honors explicit disable", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(1);
    vi.advanceTimersByTime(50);
    setSfxConfigForTests(config({ eventBindings: [{
      eventKey: "ui.button.press", sourceType: "disabled", assetId: null,
      generatorId: null, enabled: true, relativeGain: 1,
    }] }));
    sfxController.play("ui.button.press");
    expect(audio.counts.oscillators).toBe(1);
  });
});

describe("central replay policy", () => {
  it("dedupes a stable eventId but accepts a distinct identity", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    sfxController.play("ui.button.press", { eventId: "settlement:7" });
    vi.advanceTimersByTime(50);
    sfxController.play("ui.button.press", { eventId: "settlement:7" });
    vi.advanceTimersByTime(50);
    sfxController.play("ui.button.press", { eventId: "settlement:8" });
    expect(audio.counts.oscillators).toBe(2);
  });

  it("applies cadence per semantic event, not as one global cooldown", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    sfxController.play("ui.button.press");
    sfxController.play("ui.button.press");
    sfxController.play("ranked.role.step");
    expect(audio.counts.oscillators).toBe(2);
  });
});

describe("fail-soft platform and renderer behavior", () => {
  it("silences a missing AudioContext", async () => {
    removeAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await expect(sfxController.unlock()).resolves.toBe(false);
    expect(() => sfxController.play("ui.button.press")).not.toThrow();
  });

  it("silences a context whose resume is refused", async () => {
    installAudio({ state: "suspended", refuseResume: true });
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await expect(sfxController.unlock()).resolves.toBe(false);
    expect(() => sfxController.play("ui.button.press")).not.toThrow();
  });

  it("resumes an existing suspended context before rendering", async () => {
    const audio = installAudio();
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    audio.context.state = "suspended";
    sfxController.play("ui.button.press");
    await flush();
    expect(audio.context.resume).toHaveBeenCalled();
    expect(audio.counts.oscillators).toBe(1);
  });

  it.each([
    ["fetch", false],
    ["decode", true],
  ])("keeps an explicitly bound asset silent after %s failure", async (kind, refuseDecode) => {
    const audio = installAudio({ refuseDecode });
    if (kind === "fetch") vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    setSfxConfigForTests(sfxAssetConfig());
    await sfxController.unlock();
    expect(() => sfxController.play("ui.button.press")).not.toThrow();
    await flush();
    expect(audio.counts.buffers).toBe(0);
    expect(audio.counts.oscillators).toBe(0);
  });

  it("silences a bad binding instead of falling through", async () => {
    const audio = installAudio();
    setSfxConfigForTests(config({ eventBindings: [{
      eventKey: "ui.button.press", sourceType: "synthesized", assetId: null,
      generatorId: "missing-generator", enabled: true, relativeGain: 1,
    }] }));
    await sfxController.unlock();
    expect(() => sfxController.play("ui.button.press")).not.toThrow();
    expect(audio.counts.oscillators).toBe(0);
  });

  it("contains a built-in renderer exception", async () => {
    installAudio({ throwRenderer: true });
    setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);
    await sfxController.unlock();
    expect(() => sfxController.play("ui.button.press")).not.toThrow();
  });
});
