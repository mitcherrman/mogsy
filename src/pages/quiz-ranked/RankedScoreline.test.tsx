/**
 * RP1 Step 4 — the finished match's scoreline.
 *
 * Two authorities meet on this screen and only one of them decides anything:
 * `outcome` says who won, `scoring.final_scores` says what each player
 * scored. This component renders both and DERIVES neither — which is what the
 * disagreement assertion exists to keep honest.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RankedScoreline, scorelineDisagreesWithOutcome } from "./RankedScoreline";

afterEach(cleanup);

const view = (over: Partial<Parameters<typeof RankedScoreline>[0]> = {}) =>
  render(<RankedScoreline you={21} opponent={18} result="victory"
    modulesPlayed={10} ratingDelta={18} {...over} />);

describe("the scoreline", () => {
  it("states a win as both numbers, plus rating and modules played", () => {
    view();
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("21");
    expect(screen.getByTestId("final-score-opponent")).toHaveTextContent("18");
    expect(screen.getByTestId("ranked-rating-delta")).toHaveTextContent("+18 Rating");
    expect(screen.getByTestId("ranked-modules-played"))
      .toHaveTextContent("10 modules complete");
  });

  it("states a loss the same way, with the negative rating verbatim", () => {
    view({ you: 14, opponent: 22, result: "defeat", ratingDelta: -14 });
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("14");
    expect(screen.getByTestId("final-score-opponent")).toHaveTextContent("22");
    expect(screen.getByTestId("ranked-rating-delta")).toHaveTextContent("-14 Rating");
  });

  it("states a draw as two equal numbers", () => {
    view({ you: 18, opponent: 18, result: "draw", ratingDelta: 0 });
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("18");
    expect(screen.getByTestId("final-score-opponent")).toHaveTextContent("18");
    expect(screen.getByTestId("ranked-rating-delta")).toHaveTextContent("0 Rating");
  });

  /** A bot or otherwise unrated match: no chip, and certainly no invented 0. */
  it("shows NO rating at all when the backend applied none", () => {
    view({ ratingDelta: null });
    expect(screen.queryByTestId("ranked-rating-delta")).toBeNull();
    expect(screen.getByTestId("ranked-modules-played")).toBeInTheDocument();
  });

  it("shows no module count when the result did not state one", () => {
    view({ modulesPlayed: null, ratingDelta: null });
    expect(screen.queryByTestId("ranked-modules-played")).toBeNull();
  });

  it("never says HP, damage or knockout", () => {
    view();
    expect(screen.getByTestId("ranked-final-scoreline").textContent ?? "")
      .not.toMatch(/\bhp\b|damage|knockout/i);
  });
});

describe("the display assertion", () => {
  it("is quiet when the result row and its own scoreline agree", () => {
    for (const c of [
      { you: 21, opponent: 18, result: "victory" as const },
      { you: 14, opponent: 22, result: "defeat" as const },
      { you: 18, opponent: 18, result: "draw" as const },
      { you: 21, opponent: null, result: "victory" as const },
    ]) expect(scorelineDisagreesWithOutcome(c)).toBe(false);
  });

  it("catches every way the two authorities can contradict each other", () => {
    for (const c of [
      { you: 10, opponent: 18, result: "victory" as const },
      { you: 18, opponent: 18, result: "victory" as const },
      { you: 22, opponent: 14, result: "defeat" as const },
      { you: 19, opponent: 18, result: "draw" as const },
    ]) expect(scorelineDisagreesWithOutcome(c)).toBe(true);
  });

  it("still renders the BACKEND's result when they disagree", () => {
    // Never a second winner rule: the numbers are drawn as sent and the
    // result word is the one the backend gave.
    view({ you: 3, opponent: 30, result: "victory" });
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("3");
    expect(screen.getByTestId("final-score-opponent")).toHaveTextContent("30");
  });
});
