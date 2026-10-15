/**
 * MPE-D — the main Daily result's REVEAL, keyed on the settle.
 *
 * The rules under test: the pending frame is the same frame (Mogzy thinking,
 * no figure, the slot held); when the result lands on the SAME mount the
 * score counts from zero to exactly `run.mainScore`, a screen reader gets the
 * final value from the first settled frame, Mogzy swaps to cheering without
 * leaving the box, the snapshot enters after the score, and the score cue
 * plays once under the run's event id — once in StrictMode too, and never
 * again on a later re-render. Reduced motion prints the final score at once.
 * A hero that was not asked to reveal is byte-for-byte what it was.
 */
import { StrictMode } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const play = vi.fn();
const SFX_API = { play, stop: vi.fn(), preload: vi.fn() };
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => SFX_API }));
let reduced = false;
vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => reduced,
  readReducedMotionPreference: () => reduced,
  APP_REDUCE_MOTION_CLASS: "reduce-motion",
}));

import { ResultHero, SCORE_REVEAL_BEATS } from "@/components/game-results/ResultHero";
import { V5_ELIGIBLE_DAY, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";
import { DAILY_REVEAL_BEATS, DailyMainResult, dailyScoreSoundEventId } from "./DailyMainResult";

const pendingRun = () => fixtureV5Run(V5_ELIGIBLE_DAY, {},
  { 0: { status: "in_progress", child_match_id: "child-0" } });
const settledRun = (score = 1234) => fixtureV5Run(V5_ELIGIBLE_DAY, {
  current_stage_index: 1, main_completed_at: "2026-10-08T12:00:00Z", main_score: score,
}, { 0: { status: "completed", child_match_id: "child-0",
  result: wireResult({ correct: 9, answered: 10, score: 16, misses: 1 }) } });

const main = () => screen.getByTestId("daily-main-result");
const figure = () => within(main()).getByTestId("daily-main-score-reveal")
  .querySelector(".reward-xp-value__figure") as HTMLElement;
const spoken = () => within(main()).getByTestId("daily-main-score-reveal")
  .querySelector(".sr-only") as HTMLElement;
const digits = (el: HTMLElement) => Number((el.textContent ?? "").replace(/[^\d]/g, ""));
const mascotImg = (id: string) => within(main()).getByTestId(id) as HTMLImageElement;

const COUNT_END = SCORE_REVEAL_BEATS.count + SCORE_REVEAL_BEATS.countDuration;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval",
      "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
  });
  play.mockClear();
  reduced = false;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the main Daily result, pending", () => {
  it("holds the frame with Mogzy thinking and no figure, and plays nothing", () => {
    const run = pendingRun();
    render(<DailyMainResult run={run} stage={run.stages[0]} onDone={() => {}} />);
    expect(main()).toHaveAttribute("data-pending", "true");
    expect(main()).not.toHaveAttribute("data-settled");
    expect(within(main()).getByTestId("result-hero")).toHaveAttribute("data-reveal", "pending");
    expect(within(main()).getByTestId("result-mascot")).toHaveAttribute("data-pose", "thinking");
    expect(mascotImg("result-mascot-pending").getAttribute("src"))
      .toBe("/mascot/mogzy-thinking-transparent-240.webp");
    // The settled plate is already in the box, hidden, so it is loaded in time.
    expect(mascotImg("result-mascot-settled")).toHaveClass("invisible");
    expect(mascotImg("result-mascot-settled").getAttribute("src"))
      .toBe("/mascot/mogzy-cheering-transparent-240.webp");
    expect(within(main()).getByTestId("result-score-reserve")).toBeInTheDocument();
    expect(within(main()).queryByTestId("daily-main-score")).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(play).not.toHaveBeenCalled();
  });
});

describe("the main Daily result, settling on the same mount", () => {
  it("counts the Daily score from zero to exactly the frozen main score, and lands it", () => {
    const pending = pendingRun();
    const { rerender } = render(
      <DailyMainResult run={pending} stage={pending.stages[0]} onDone={() => {}} />);
    const settled = settledRun(1234);
    rerender(<DailyMainResult run={settled} stage={settled.stages[0]} onDone={() => {}} onProceed={() => {}} />);

    expect(main()).toHaveAttribute("data-settled", "true");
    expect(within(main()).getByTestId("result-hero")).toHaveAttribute("data-reveal", "true");
    expect(within(main()).getByTestId("result-subheading")).toHaveTextContent("Complete");
    // From the first settled frame: the true value for a screen reader, zero on screen.
    expect(spoken()).toHaveTextContent("1,234");
    expect(figure()).toHaveTextContent("0");
    expect(within(main()).getByTestId("daily-main-score-reveal")).toHaveAttribute("data-landed", "false");

    act(() => { vi.advanceTimersByTime(SCORE_REVEAL_BEATS.count + SCORE_REVEAL_BEATS.countDuration / 4); });
    const mid = digits(figure());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1234);

    act(() => { vi.advanceTimersByTime(SCORE_REVEAL_BEATS.countDuration + 200); });
    expect(figure()).toHaveTextContent("1,234");
    expect(within(main()).getByTestId("daily-main-score-reveal")).toHaveAttribute("data-landed", "true");
    expect(spoken()).toHaveTextContent("1,234");
  });

  it("swaps Mogzy from thinking to cheering inside the one box, and enters the snapshot after the score", () => {
    const pending = pendingRun();
    const { rerender } = render(
      <DailyMainResult run={pending} stage={pending.stages[0]} onDone={() => {}} />);
    const settled = settledRun();
    rerender(<DailyMainResult run={settled} stage={settled.stages[0]} onDone={() => {}} onProceed={() => {}} />);

    expect(within(main()).getByTestId("result-mascot")).toHaveAttribute("data-pose", "cheering");
    expect(mascotImg("result-mascot-pending")).toHaveClass("reward-mascot-out");
    expect(mascotImg("result-mascot-settled")).toHaveClass("reward-mascot");
    expect(mascotImg("result-mascot-settled")).not.toHaveClass("invisible");

    const summary = within(main()).getByTestId("daily-main-result-summary");
    expect(summary).toHaveClass("reward-enter");
    expect(summary.style.getPropertyValue("--reward-delay")).toBe(`${DAILY_REVEAL_BEATS.snapshot}ms`);
    expect(DAILY_REVEAL_BEATS.snapshot).toBeGreaterThanOrEqual(COUNT_END);
    expect(within(summary).getByTestId("daily-main-correct")).toHaveTextContent("9 / 10");
    // Both ways on are live from the first settled frame: nothing waits on the sequence.
    expect(screen.getByTestId("daily-main-continue")).toBeEnabled();
    expect(screen.getByTestId("daily-done-for-now")).toBeEnabled();
  });

  it("plays the score cue once, as the count begins, under the run's event id — and not again later", () => {
    const pending = pendingRun();
    const { rerender } = render(
      <DailyMainResult run={pending} stage={pending.stages[0]} onDone={() => {}} />);
    const settled = settledRun();
    rerender(<DailyMainResult run={settled} stage={settled.stages[0]} onDone={() => {}} onProceed={() => {}} />);
    expect(play).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(DAILY_REVEAL_BEATS.cue); });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("daily.score.reveal",
      { eventId: dailyScoreSoundEventId(settled.runId) });
    expect(DAILY_REVEAL_BEATS.cue).toBe(SCORE_REVEAL_BEATS.count);

    // A later snapshot of the same settled run (a quiet re-read) is not a second landing.
    const again = settledRun();
    rerender(<DailyMainResult run={again} stage={again.stages[0]} onDone={() => {}} onProceed={() => {}} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays the cue once under StrictMode's double effects", () => {
    const settled = settledRun();
    render(
      <StrictMode>
        <DailyMainResult run={settled} stage={settled.stages[0]} onDone={() => {}} onProceed={() => {}} />
      </StrictMode>);
    act(() => { vi.advanceTimersByTime(DAILY_REVEAL_BEATS.cue + 50); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not play after the player has already left", () => {
    const pending = pendingRun();
    const { rerender, unmount } = render(
      <DailyMainResult run={pending} stage={pending.stages[0]} onDone={() => {}} />);
    const settled = settledRun();
    rerender(<DailyMainResult run={settled} stage={settled.stages[0]} onDone={() => {}} onProceed={() => {}} />);
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(play).not.toHaveBeenCalled();
  });

  it("under reduced motion prints the final score from the first settled frame", () => {
    reduced = true;
    const pending = pendingRun();
    const { rerender } = render(
      <DailyMainResult run={pending} stage={pending.stages[0]} onDone={() => {}} />);
    const settled = settledRun(980);
    rerender(<DailyMainResult run={settled} stage={settled.stages[0]} onDone={() => {}} onProceed={() => {}} />);
    expect(figure()).toHaveTextContent("980");
    expect(within(main()).getByTestId("daily-main-score-reveal")).toHaveAttribute("data-landed", "true");
    expect(spoken()).toHaveTextContent("980");
    // The cue is not motion: it still plays.
    act(() => { vi.advanceTimersByTime(DAILY_REVEAL_BEATS.cue); });
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("a hero that was not asked to reveal", () => {
  it("prints its score plainly, with one mascot and no reveal markup", () => {
    render(<ResultHero model={{
      state: "complete", mode: "Time Trial", headline: "Stage complete",
      score: { you: 17, outOf: 20, label: "correct" },
    }} />);
    const hero = screen.getByTestId("result-hero");
    expect(hero).not.toHaveAttribute("data-reveal");
    expect(within(hero).getByTestId("result-score")).toHaveTextContent("17");
    expect(within(hero).queryByTestId("result-score-reveal")).toBeNull();
    expect(within(hero).queryByTestId("result-mascot-pending")).toBeNull();
    expect(within(hero).queryByTestId("result-mascot-settled")).toBeNull();
    expect(within(hero).getByTestId("result-mascot").querySelectorAll("img")).toHaveLength(1);
    expect(hero.querySelector(".reward-sheen")).toBeNull();
    expect(hero.querySelector(".reward-glow")).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(play).not.toHaveBeenCalled();
  });
});
