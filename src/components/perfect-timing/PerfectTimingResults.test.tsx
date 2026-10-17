import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingResults } from "./PerfectTimingResults";
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
    render(<PerfectTimingResults summary={summary} onPlayAgain={() => {}} />);
    expect(screen.getByTestId("pt-results")).toHaveAttribute("data-total-points", "65");
    expect(screen.getByTestId("pt-total-points")).toHaveTextContent("/ 300");
  });

  it("shows the patch label WITH its source", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    expect(screen.getByTestId("pt-results-data")).toHaveTextContent("Data: 0.0 (demo) (patch-notes fallback)");
  });

  it("says the patch is unknown rather than inventing one", () => {
    render(<PerfectTimingResults summary={{ ...DEMO_SUMMARY, patchLabel: null, patchSource: "unknown" }} onPlayAgain={() => {}} />);
    expect(screen.getByTestId("pt-results-data")).toHaveTextContent("Data: patch unknown (source unknown)");
  });
});

describe("PerfectTimingResults — one screen", () => {
  it("is a plain section, not the shared scrolling end screen", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    expect(screen.queryByTestId("game-results")).toBeNull();
    expect(screen.getByTestId("pt-results-headline")).toHaveTextContent("Run complete");
  });

  it("states the snapshot from the reveals: landed, mean and closest error", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    expect(screen.getByTestId("pt-stat-landed")).toHaveTextContent("3 / 4");
    expect(screen.getByTestId("pt-stat-landed")).toHaveTextContent("2 perfect");
    expect(screen.getByTestId("pt-stat-landed")).toHaveTextContent("1 voided");
    // (170 + 8400 + 0 + 1900) / 4 = 2617.5 → 2,618 ms
    expect(screen.getByTestId("pt-stat-mean")).toHaveTextContent("2,618 ms");
    expect(screen.getByTestId("pt-stat-best")).toHaveTextContent("0 ms");
  });

  it("draws every round on the ladder with its ability icon, the voided one included", () => {
    render(<PerfectTimingResults summary={DEMO_SUMMARY} onPlayAgain={() => {}} />);
    const ladder = screen.getByTestId("pt-ladder");
    expect(within(ladder).getAllByRole("listitem")).toHaveLength(5);
    const voided = screen.getByTestId("pt-ladder-row-4");
    expect(voided).toHaveAttribute("data-tier", "voided");
    expect(voided).toHaveTextContent("Voided");
    const early = screen.getByTestId("pt-ladder-row-1");
    expect(early).toHaveTextContent("6.83 s vs 7.00 s · 170 ms early");
    expect(early).toHaveTextContent("Vessel (demo)");
    expect(early.querySelector(".pt-ladder-icon")).not.toBeNull();
    expect(early.querySelector(".pt-ladder-fill")).toHaveAttribute("data-direction", "early");
    const late = screen.getByTestId("pt-ladder-row-2");
    expect(late.querySelector(".pt-ladder-fill")).toHaveAttribute("data-direction", "late");
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
