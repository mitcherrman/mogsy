import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const canonical = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), preload: vi.fn() }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => canonical }));

import { useAnimationSound } from "./useAnimationSound";
import { useShopSound } from "./useShopSound";
import { useSwipeSound } from "./useSwipeSound";

beforeEach(() => vi.clearAllMocks());

describe("legacy product hooks are canonical adapters", () => {
  it("maps active swipe and Elo moments", () => {
    const { result } = renderHook(() => useSwipeSound());
    result.current.playSwipeSound();
    result.current.playCorrectSound();
    result.current.playWrongSound();
    expect(canonical.play.mock.calls).toEqual([
      ["swipe.action"], ["swipe.elo.correct"], ["swipe.elo.wrong"],
    ]);
  });

  it("maps every active card animation and ignores unknown/dormant names", () => {
    const { result } = renderHook(() => useAnimationSound());
    for (const id of ["slice", "shatter", "burn", "vaporize", "crush", "chop", "mogged", "doakes", "amongus"]) {
      result.current.playAnimationSound(id);
    }
    result.current.playAnimationSound("unused_animation");
    expect(canonical.play.mock.calls.map(([event]) => event)).toEqual([
      "card.animation.paper-rip", "card.animation.shatter", "card.animation.burn",
      "card.animation.vaporize", "card.animation.crush", "card.animation.chop",
      "card.animation.mogged", "card.animation.doakes", "card.animation.amongus",
    ]);
  });

  it("preserves paper-rip preload without another context", () => {
    const { result } = renderHook(() => useAnimationSound());
    result.current.preloadSounds();
    expect(canonical.preload).toHaveBeenCalledWith("card.animation.paper-rip");
  });

  it("maps all active shop moments", () => {
    const { result } = renderHook(() => useShopSound());
    result.current.playPurchaseSound();
    result.current.playDiamondTap();
    result.current.playPowerUpSound();
    expect(canonical.play.mock.calls).toEqual([
      ["shop.purchase"], ["shop.diamond.tap"], ["shop.powerup"],
    ]);
  });
});
