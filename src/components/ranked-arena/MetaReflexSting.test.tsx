/**
 * QUIZ1 Phase 11 — the Meta Reflex entry sting.
 *
 * The two things that can go wrong are a sting per CARD, and a sting that
 * eats the server's card window. Both are pinned here.
 */
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaReflexSting, STING_MS, useEntrySting } from "./MetaReflexSting";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useEntrySting", () => {
  it("plays once on block entry and NOT again as the cards advance", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) => useEntrySting(key),
      { initialProps: { key: "4#2" } },
    );
    expect(result.current).toBe(true);
    // Cards 2..5 of the SAME block keep the same key.
    rerender({ key: "4#2" });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(STING_MS); });
    expect(result.current).toBe(false);
    rerender({ key: "4#2" });
    expect(result.current).toBe(false);
  });

  it("plays again for a SECOND block later in the match", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) => useEntrySting(key),
      { initialProps: { key: "4#2" } },
    );
    act(() => { vi.advanceTimersByTime(STING_MS); });
    expect(result.current).toBe(false);
    rerender({ key: "4#8" });
    expect(result.current).toBe(true);
  });

  it("does not play while there is no block in its challenge phase", () => {
    const { result } = renderHook(() => useEntrySting(null));
    expect(result.current).toBe(false);
  });
});

describe("MetaReflexSting", () => {
  it("cannot intercept a click on the card beneath it", () => {
    render(<MetaReflexSting />);
    const sting = screen.getByTestId("mr-sting");
    // The whole reason this is an overlay rather than a curtain: the server
    // starts card 1's deadline when it creates the block, so any element that
    // swallowed clicks would spend the player's own answer window.
    expect(sting.className).toContain("pointer-events-none");
    expect(sting).toHaveAttribute("aria-hidden");
  });

  it("sends META left and REFLEX right, meeting at the centre", () => {
    render(<MetaReflexSting />);
    const sting = screen.getByTestId("mr-sting");
    expect(sting.querySelector(".mr-sting__word--left")).toHaveTextContent("Meta");
    expect(sting.querySelector(".mr-sting__word--right")).toHaveTextContent("Reflex");
  });

  it("is short enough not to overlap a six-second card meaningfully", () => {
    expect(STING_MS).toBeLessThanOrEqual(800);
  });
});
