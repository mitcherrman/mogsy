import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingResults } from "./PerfectTimingResults";
import { buildPerfectTimingResultsModel } from "./resultsModel";
import { DEMO_REVEALS, DEMO_ROUNDS, DEMO_SUMMARY } from "./__stories__/demoViewModels";

describe("PerfectTimingResults — the one sum", () => {
  it("sums the reveals' points and prints the run's maximum", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    // 90 + 70 + 100 + (voided) + 0
    expect(screen.getByTestId("pt-results")).toHaveAttribute("data-total-points", "260");
    expect(screen.getByTestId("pt-total-points")).toHaveTextContent("260");
    expect(screen.getByTestId("pt-total-points")).toHaveTextContent("/ 500");
  });

  it("sums from the reveals, not from the summary's own total", () => {
    const summary: PtRunSummary = {
      ...DEMO_SUMMARY,
      rounds: [
        { round: DEMO_ROUNDS[0], reveal: { ...DEMO_REVEALS.early, points: 40 } },
        { round: DEMO_ROUNDS[1], reveal: { ...DEMO_REVEALS.late, points: 25 } },
        { round: DEMO_ROUNDS[2], reveal: null },
      ],
      totalPoints: 999,
    };
    const model = buildPerfectTimingResultsModel(summary, { onPlayAgain: () => {} });
    expect(model.score).toMatchObject({ you: 65, outOf: 300 });
  });

  it("shows the patch label WITH its source", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    expect(screen.getByTestId("result-subheading")).toHaveTextContent("Data: 0.0 (demo) (patch-notes fallback)");
  });

  it("says the patch is unknown rather than inventing one", () => {
    const model = buildPerfectTimingResultsModel({ ...DEMO_SUMMARY, patchLabel: null, patchSource: "unknown" }, { onPlayAgain: () => {} });
    expect(model.subheading).toBe("Data: patch unknown (source unknown)");
  });
});

describe("PerfectTimingResults — the shared end screen", () => {
  it("renders on GameResultsShell as a complete, practice run", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    const shell = screen.getByTestId("game-results");
    expect(shell).toHaveAttribute("data-mode", "Perfect Timing");
    expect(shell).toHaveAttribute("data-state", "complete");
    expect(screen.getByTestId("result-standing")).toHaveTextContent("Practice");
    expect(screen.getByTestId("result-headline")).toHaveTextContent("Run complete");
  });

  it("states the snapshot from the reveals: rounds played, landed, mean and closest error", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    expect(screen.getByTestId("result-stat-rounds")).toHaveTextContent("4 / 5");
    expect(screen.getByTestId("result-stat-rounds")).toHaveTextContent("1 voided");
    expect(screen.getByTestId("result-stat-hits")).toHaveTextContent("3");
    expect(screen.getByTestId("result-stat-hits")).toHaveTextContent("2 perfect");
    // (170 + 8400 + 0 + 1900) / 4 = 2617.5 → 2,618 ms
    expect(screen.getByTestId("result-stat-mean-error")).toHaveTextContent("2,618 ms");
    expect(screen.getByTestId("result-stat-best")).toHaveTextContent("0 ms");
  });

  it("draws every round on the ladder, the voided one included", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    const ladder = screen.getByTestId("pt-ladder");
    expect(within(ladder).getAllByRole("listitem")).toHaveLength(5);
    const voided = screen.getByTestId("pt-ladder-row-4");
    expect(voided).toHaveAttribute("data-tier", "voided");
    expect(voided).toHaveTextContent("Voided");
    const early = screen.getByTestId("pt-ladder-row-1");
    expect(early).toHaveTextContent("6.83 s vs 7.00 s · 170 ms early");
    expect(early.querySelector(".pt-ladder-fill")).toHaveAttribute("data-direction", "early");
    const late = screen.getByTestId("pt-ladder-row-2");
    expect(late.querySelector(".pt-ladder-fill")).toHaveAttribute("data-direction", "late");
  });

  it("puts every round on the shared timeline with the server's outcome", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    expect(screen.getByTestId("timeline-mark-1")).toHaveAttribute("data-outcome", "correct");
    expect(screen.getByTestId("timeline-mark-4")).toHaveAttribute("data-outcome", "unanswered");
    expect(screen.getByTestId("timeline-mark-5")).toHaveAttribute("data-outcome", "incorrect");
  });

  it("offers Play again as the primary action, and the exit only when a host gives one", () => {
    const onPlayAgain = vi.fn();
    const { rerender } = render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={onPlayAgain} />);
    fireEvent.click(screen.getByTestId("pt-play-again"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("pt-exit")).toBeNull();
    const onExit = vi.fn();
    rerender(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={onPlayAgain} onExit={onExit} />);
    fireEvent.click(screen.getByTestId("pt-exit"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
