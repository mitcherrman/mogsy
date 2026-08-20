/**
 * The tome audio's settings gate.
 *
 * The page tests (AcademyWelcomePage.test.tsx) mock this module away and
 * assert WHEN sound is asked for; this suite asserts the other half — that the
 * hook only lets a request through to the engine when the app's sound settings
 * say so. The store itself (Supabase fetch, global mute) is useSoundSettings'
 * business and is stubbed here; what is under test is only the wiring, which
 * is exactly the part a future refactor could silently break.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SOUND_DEFAULTS, type SoundSettings } from "@/hooks/useSoundSettings";

const settings = vi.hoisted(() => ({
  current: {} as Partial<SoundSettings>,
}));

// importOriginal below loads the real useSoundSettings module, which imports
// the supabase client — and the real client's auth bootstrap trips over the
// pinned jsdom's broken Storage (see localStorageStub.ts). Same convention as
// every other suite that would transitively construct the client: mock it.
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

import { ACADEMY_CHAPTERS } from "./academyChapters";
import { tomeAudioEngine, useTomeAudio, MAX_SCRIBBLE_MS } from "./tomeAudio";
import { slotCount, slotWriteMs } from "./useRevealSequence";

beforeEach(() => {
  settings.current = {};
  vi.spyOn(tomeAudioEngine, "scribble").mockImplementation(() => {});
  vi.spyOn(tomeAudioEngine, "stopScribble").mockImplementation(() => {});
  vi.spyOn(tomeAudioEngine, "pageTurn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the scribble's window", () => {
  it("covers the longest slot the sequence can ask it to scratch through", () => {
    // The pen's window IS the slot's write time. HI1-C3 made a slot a whole
    // sentence, roughly tripling the longest window, and a ceiling sized for
    // the old short phrases would silently cut the pen off partway through a
    // sentence still arriving. Held against the real chapters so re-tuning the
    // cadence — or writing a longer line — cannot reintroduce that.
    const longest = Math.max(
      ...ACADEMY_CHAPTERS.flatMap((chapter) =>
        Array.from({ length: slotCount(chapter) }, (_, slot) => slotWriteMs(chapter, slot)),
      ),
    );
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThan(MAX_SCRIBBLE_MS);
  });
});

describe("useTomeAudio", () => {
  it("ships with both welcome sounds in the app's one settings object", () => {
    // No isolated audio preference: the tome's sounds are toggled where every
    // other sound is toggled, and silenced by the same global mute.
    expect(SOUND_DEFAULTS.welcome_scribble).toBe(true);
    expect(SOUND_DEFAULTS.welcome_page_turn).toBe(true);
  });

  it("passes requests through while the settings allow them", () => {
    const { result } = renderHook(() => useTomeAudio());
    result.current.scribble(600);
    result.current.pageTurn();
    expect(tomeAudioEngine.scribble).toHaveBeenCalledWith(600);
    expect(tomeAudioEngine.pageTurn).toHaveBeenCalledTimes(1);
  });

  it("silences the scribble when its setting is off", () => {
    settings.current = { welcome_scribble: false };
    const { result } = renderHook(() => useTomeAudio());
    result.current.scribble(600);
    expect(tomeAudioEngine.scribble).not.toHaveBeenCalled();
  });

  it("silences the page turn when its setting is off", () => {
    settings.current = { welcome_page_turn: false };
    const { result } = renderHook(() => useTomeAudio());
    result.current.pageTurn();
    expect(tomeAudioEngine.pageTurn).not.toHaveBeenCalled();
  });

  it("always lets stopScribble through — silencing must never be gated", () => {
    settings.current = { welcome_scribble: false, welcome_page_turn: false };
    const { result } = renderHook(() => useTomeAudio());
    result.current.stopScribble();
    expect(tomeAudioEngine.stopScribble).toHaveBeenCalledTimes(1);
  });
});
