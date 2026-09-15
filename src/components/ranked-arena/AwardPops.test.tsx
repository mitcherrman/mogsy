/**
 * RM1 Pass 2B — the transient payouts.
 *
 * The properties fixed here are the two that matter: an award is shown ONCE
 * whatever the caller re-renders, and the base and the bonus are two separate
 * pops carrying two separate numbers that are never summed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AwardPops, BONUS_DELAY_MS, POP_MS, type AwardEvent } from "./AwardPops";

const award = (over: Partial<AwardEvent> = {}): AwardEvent => ({
  id: "award:userA:3", basePoints: 2, speedBonusPoints: 0, ...over,
});

const pops = () => screen.queryAllByTestId(/^award-pop-/)
  .map((el) => `${el.getAttribute("data-testid")}=${el.getAttribute("data-points")}`);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("a module's payout", () => {
  it("pops the base for a standard correct award", () => {
    render(<AwardPops event={award({ basePoints: 2 })} playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(pops()).toEqual(["award-pop-base-userA=2"]);
  });

  it("pops nothing extra for +0 — a zero award still states itself, once", () => {
    render(<AwardPops event={award({ basePoints: 0 })} playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(pops()).toEqual(["award-pop-base-userA=0"]);
    expect(screen.queryByTestId("award-pop-bonus-userA")).toBeNull();
  });

  it("follows the base with a SEPARATE bonus, and never sums them", () => {
    render(<AwardPops event={award({ basePoints: 2, speedBonusPoints: 1 })}
      playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    // The base lands first, alone.
    expect(pops()).toEqual(["award-pop-base-userA=2"]);
    tick(BONUS_DELAY_MS);
    // Then the premium joins it — as `+1`, not as a `+3` replacing the base.
    expect(pops().sort()).toEqual(["award-pop-base-userA=2", "award-pop-bonus-userA=1"]);
  });

  it("suppresses the base it has already paid out card by card", () => {
    // A Meta Reflex block: five `+1`s have already run, so popping the block's
    // `+4` would show the same points a second time. The BONUS still pops —
    // nothing paid that out incrementally.
    render(<AwardPops event={award({ basePoints: 4, speedBonusPoints: 1,
      baseAlreadyShown: true })} playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.queryByTestId("award-pop-base-userA")).toBeNull();
    expect(pops()).toEqual(["award-pop-bonus-userA=1"]);
  });

  it("clears itself: a payout is feedback, not record", () => {
    render(<AwardPops event={award()} playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(pops()).toHaveLength(1);
    tick(POP_MS + 50);
    expect(pops()).toHaveLength(0);
  });
});

describe("an award cannot be shown twice", () => {
  it("ignores the SAME event re-delivered by a re-render", () => {
    // Every poll hands the arena the same settlement again. A pop layer that
    // replayed on identity rather than on id would flash on every poll.
    const { rerender } = render(
      <AwardPops event={award()} playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    tick(POP_MS + 50);
    for (let i = 0; i < 5; i += 1) {
      rerender(<AwardPops event={{ ...award() }} playerId="userA" mirrored={false} />);
      tick(10);
    }
    expect(pops()).toHaveLength(0);
  });

  it("plays a genuinely NEW award", () => {
    const { rerender } = render(
      <AwardPops event={award({ id: "award:userA:3" })} playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    tick(POP_MS + 50);
    rerender(<AwardPops event={award({ id: "award:userA:4", basePoints: 3 })}
      playerId="userA" mirrored={false} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(pops()).toEqual(["award-pop-base-userA=3"]);
  });

  it("stays silent for a column with no award", () => {
    render(<AwardPops event={null} playerId="userB" mirrored />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(pops()).toHaveLength(0);
  });
});
