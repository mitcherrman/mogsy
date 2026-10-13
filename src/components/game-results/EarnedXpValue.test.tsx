/**
 * MPE — the earned-XP figure, through the two surfaces that render it.
 *
 * The rule under test is truthfulness: the count starts at zero, ends on
 * EXACTLY the settled gain, prints the adapter's own text once it lands, and
 * is never applied to an XP total, a level or a non-positive movement. The
 * cue plays once, as the count begins, and reduced motion gets the final
 * figure from the first frame.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const play = vi.fn();
// Stable, as the real `useSfx` is (memoised once): a per-render object would
// be a different hook from the one production renders.
const SFX_API = { play, stop: vi.fn(), preload: vi.fn() };
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => SFX_API,
}));
let reduced = false;
vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => reduced,
  readReducedMotionPreference: () => reduced,
  APP_REDUCE_MOTION_CLASS: "reduce-motion",
}));

import { EARNED_XP_COUNT_MS } from "./EarnedXpValue";
import { EARNED_XP_LEAD_MS, ResultProgress } from "./ResultProgress";
import { ResultSummaryStrip } from "./ResultSummaryStrip";

const EARNED = { key: "earned", label: "Academy XP earned", value: "+80 XP", icon: "xp" as const, delta: 80 };
const TOTAL = { key: "total", label: "Account XP", value: "4,820", icon: "xp" as const };
const LEVEL = { key: "level", label: "Level", value: "Lv 3 · 50 XP", icon: "xp" as const };
const COLLECTION = { key: "discoveries", label: "New questions", value: "+3", icon: "collection" as const, delta: 3 };

const figure = (testId: string) =>
  screen.getByTestId(testId).querySelector(".reward-xp-value__figure") as HTMLElement;
const digits = (el: HTMLElement) => Number((el.textContent ?? "").replace(/[^\d]/g, ""));

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
  });
  play.mockClear();
  reduced = false;
});
afterEach(() => { vi.useRealTimers(); });

describe("the earned-XP count-up", () => {
  it("starts at zero, passes through the middle, and lands on EXACTLY the settled gain", () => {
    render(<ResultProgress items={[EARNED]} />);
    expect(figure("result-progress-earned")).toHaveTextContent("+0 XP");
    // Row 0 enters at 0 ms; the count leads in after EARNED_XP_LEAD_MS.
    act(() => { vi.advanceTimersByTime(EARNED_XP_LEAD_MS + EARNED_XP_COUNT_MS / 4); });
    const mid = digits(figure("result-progress-earned"));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(80);
    act(() => { vi.advanceTimersByTime(EARNED_XP_COUNT_MS + 200); });
    expect(figure("result-progress-earned")).toHaveTextContent("+80 XP");
    expect(screen.getByTestId("result-progress-earned").querySelector("[data-landed=true]"))
      .toBeInTheDocument();
  });

  it("plays the earned-XP cue once, as the count begins — and never for a total or a level", () => {
    render(<ResultProgress items={[EARNED, TOTAL, LEVEL, COLLECTION]} />);
    expect(play).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(EARNED_XP_LEAD_MS + 20); });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0]).toBe("reward.xp.earned");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(play).toHaveBeenCalledTimes(1);
    // The total, the level and the collection delta are never counted.
    expect(screen.getByTestId("result-progress-total").querySelector("[data-earned-xp]")).toBeNull();
    expect(screen.getByTestId("result-progress-level").querySelector("[data-earned-xp]")).toBeNull();
    expect(screen.getByTestId("result-progress-discoveries").querySelector("[data-earned-xp]")).toBeNull();
    expect(screen.getByTestId("result-progress-total")).toHaveTextContent("4,820");
    expect(screen.getByTestId("result-progress-level")).toHaveTextContent("Lv 3 · 50 XP");
  });

  it("under reduced motion prints the final figure from the first frame, and still plays the cue once", () => {
    reduced = true;
    render(<ResultProgress items={[EARNED]} />);
    expect(figure("result-progress-earned")).toHaveTextContent("+80 XP");
    act(() => { vi.advanceTimersByTime(10); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("tells a screen reader the final value only, and reserves the final width", () => {
    render(<ResultProgress items={[EARNED]} />);
    const dd = screen.getByTestId("result-progress-earned").querySelector("dd")!;
    expect(dd.querySelector(".sr-only")).toHaveTextContent("+80 XP");
    expect(figure("result-progress-earned")).toHaveAttribute("aria-hidden", "true");
    expect(figure("result-progress-earned").style.minWidth).toBe(`${"+80 XP".length}ch`);
  });

  it("marks XP and collection rows as knowledge, and nothing else", () => {
    render(<ResultProgress items={[EARNED, COLLECTION,
      { key: "rating", label: "Ranked rating", value: "+18 · 1218", icon: "rating", delta: 18 }]} />);
    expect(screen.getByTestId("result-progress-earned")).toHaveAttribute("data-knowledge", "true");
    expect(screen.getByTestId("result-progress-discoveries")).toHaveAttribute("data-knowledge", "true");
    expect(screen.getByTestId("result-progress-rating")).not.toHaveAttribute("data-knowledge");
  });
});

describe("the compact strip rewards the same gain the same way", () => {
  it("counts the earned cell and leaves the total cell still", () => {
    render(<ResultSummaryStrip stats={[{ key: "accuracy", label: "Accuracy", value: "80%" }]}
      progress={[EARNED, TOTAL, COLLECTION]} />);
    expect(screen.getByTestId("result-progress-earned").querySelector("[data-earned-xp=true]"))
      .toBeInTheDocument();
    expect(screen.getByTestId("result-progress-total").querySelector("[data-earned-xp]")).toBeNull();
    expect(screen.getByTestId("result-progress-earned")).toHaveAttribute("data-knowledge", "true");
    expect(screen.getByTestId("result-progress-discoveries")).toHaveAttribute("data-knowledge", "true");
    expect(screen.getByTestId("result-stat-accuracy")).not.toHaveAttribute("data-knowledge");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(figure("result-progress-earned")).toHaveTextContent("+80 XP");
    expect(play).toHaveBeenCalledTimes(1);
  });
});
