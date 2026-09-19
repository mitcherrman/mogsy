import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const canonical = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), preload: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => canonical }));

import { ACADEMY_CHAPTERS } from "./academyChapters";
import { MAX_SCRIBBLE_MS, useTomeAudio } from "./tomeAudio";
import { slotCount, slotRevealMs } from "./useRevealSequence";

beforeEach(() => vi.clearAllMocks());

describe("the scribble's window", () => {
  it("covers the longest authored welcome slot", () => {
    const longest = Math.max(...ACADEMY_CHAPTERS.flatMap((chapter) =>
      Array.from({ length: slotCount(chapter) }, (_, slot) => slotRevealMs(chapter, slot))));
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThan(MAX_SCRIBBLE_MS);
  });
});

describe("useTomeAudio canonical adapter", () => {
  it("stops the previous pen and starts one semantic scribble for the authored window", () => {
    const { result } = renderHook(() => useTomeAudio());
    result.current.scribble(600);
    expect(canonical.stop).toHaveBeenCalledWith("welcome.scribble");
    expect(canonical.play).toHaveBeenCalledWith("welcome.scribble", { durationMs: 600 });
  });

  it("caps a runaway scribble at the existing ceiling", () => {
    const { result } = renderHook(() => useTomeAudio());
    result.current.scribble(MAX_SCRIBBLE_MS + 5000);
    expect(canonical.play).toHaveBeenCalledWith("welcome.scribble", { durationMs: MAX_SCRIBBLE_MS });
  });

  it("stops without starting for a non-positive window", () => {
    const { result } = renderHook(() => useTomeAudio());
    result.current.scribble(0);
    expect(canonical.stop).toHaveBeenCalledWith("welcome.scribble");
    expect(canonical.play).not.toHaveBeenCalled();
  });

  it("routes stop and page turn through canonical semantics", () => {
    const { result } = renderHook(() => useTomeAudio());
    result.current.stopScribble();
    result.current.pageTurn();
    expect(canonical.stop).toHaveBeenCalledWith("welcome.scribble");
    expect(canonical.play).toHaveBeenCalledWith("welcome.page.turn");
  });

  it("keeps the helper identity stable", () => {
    const { result, rerender } = renderHook(() => useTomeAudio());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
