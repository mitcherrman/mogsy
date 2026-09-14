import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameResultsShell } from "./GameResultsShell";
import type { GameResultsModel } from "./model";

afterEach(cleanup);

const minimal: GameResultsModel = { state: "complete", mode: "Time Trial" };

describe("the shared result shell renders only what the mode supplied", () => {
  it("draws a hero and nothing else for a model with nothing else", () => {
    render(<GameResultsShell model={minimal} />);
    expect(screen.getByTestId("result-hero")).toBeInTheDocument();
    expect(screen.getByTestId("result-headline")).toHaveTextContent("Complete");
    // Every section is absent, not empty: no dashes, no zero rows.
    expect(screen.queryByTestId("game-results-body")).toBeNull();
    expect(screen.queryByTestId("result-snapshot")).toBeNull();
    expect(screen.queryByTestId("result-progress")).toBeNull();
    expect(screen.queryByTestId("result-match-report")).toBeNull();
    expect(screen.queryByTestId("result-timeline")).toBeNull();
    expect(screen.queryByTestId("result-actions")).toBeNull();
  });

  it("names the mode and its standing in the eyebrow", () => {
    render(<GameResultsShell model={{ ...minimal, standing: "practice" }} />);
    expect(screen.getByTestId("result-eyebrow")).toHaveTextContent("Time Trial");
    expect(screen.getByTestId("result-standing")).toHaveTextContent("Practice");
  });

  it("prints a solo score with its denominator and a duel score as two numbers", () => {
    const { unmount } = render(
      <GameResultsShell model={{ ...minimal, score: { you: 7, outOf: 10 } }} />);
    expect(screen.getByTestId("result-score")).toHaveTextContent("7");
    expect(screen.getByTestId("result-score")).toHaveTextContent("/ 10");
    unmount();
    render(<GameResultsShell model={{
      ...minimal, state: "victory", score: { you: 24, opponent: 19 },
    }} />);
    expect(screen.getByTestId("result-score")).toHaveTextContent("24");
    expect(screen.getByTestId("result-score")).toHaveTextContent("19");
  });

  it("does not print a duel's two numbers a second time under the identities", () => {
    render(<GameResultsShell model={{
      ...minimal, state: "victory", score: { you: 24, opponent: 19 },
      contestants: {
        you: { name: "You", score: 24, emphasis: true },
        opponent: { name: "Rival", score: 19 },
      },
    }} />);
    const strip = screen.getByTestId("result-contestants");
    expect(strip).toHaveTextContent("You");
    expect(strip).toHaveTextContent("Rival");
    expect(strip).not.toHaveTextContent("24");
    expect(strip).not.toHaveTextContent("19");
  });

  it("orders the three actions by weight and fires each one", () => {
    const primary = vi.fn(); const secondary = vi.fn(); const tertiary = vi.fn();
    render(<GameResultsShell model={{
      ...minimal,
      actions: {
        primary: { label: "Play Again", onClick: primary },
        secondary: { label: "Review Match", onClick: secondary },
        tertiary: { label: "Back to Leaguecraft", onClick: tertiary },
      },
    }} />);
    fireEvent.click(screen.getByTestId("result-primary"));
    fireEvent.click(screen.getByTestId("result-secondary"));
    fireEvent.click(screen.getByTestId("result-tertiary"));
    expect(primary).toHaveBeenCalledOnce();
    expect(secondary).toHaveBeenCalledOnce();
    expect(tertiary).toHaveBeenCalledOnce();
  });

  it("opens the timeline detail below the strip, one entry at a time", () => {
    render(<GameResultsShell model={{
      ...minimal,
      timeline: {
        unitLabel: "Modules",
        entries: [
          { index: 1, label: "Runes", outcome: "correct", points: 3, detail: "Prompt one" },
          { index: 2, label: "Items", outcome: "incorrect", detail: "Prompt two" },
        ],
      },
    }} />);
    // The whole match is visible immediately; nothing is behind a page.
    expect(screen.getByTestId("timeline-mark-1")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-mark-2")).toBeInTheDocument();
    expect(screen.getByTestId("result-timeline")).toHaveTextContent("1 of 2 won");
    expect(screen.queryByTestId("timeline-detail")).toBeNull();

    fireEvent.click(screen.getByTestId("timeline-mark-1"));
    expect(screen.getByTestId("timeline-detail")).toHaveTextContent("Prompt one");
    fireEvent.click(screen.getByTestId("timeline-mark-2"));
    const detail = screen.getByTestId("timeline-detail");
    expect(detail).toHaveTextContent("Prompt two");
    expect(detail).not.toHaveTextContent("Prompt one");
    // A second click on the open mark closes it.
    fireEvent.click(screen.getByTestId("timeline-mark-2"));
    expect(screen.queryByTestId("timeline-detail")).toBeNull();
  });

  it("draws no points chip for an entry whose award is unknown", () => {
    render(<GameResultsShell model={{
      ...minimal,
      timeline: {
        unitLabel: "Modules",
        entries: [{ index: 4, label: "Runes", outcome: "correct", points: null }],
      },
    }} />);
    // The position, not a fabricated zero.
    expect(screen.getByTestId("timeline-mark-4")).toHaveTextContent("4");
    expect(screen.getByTestId("timeline-mark-4")).not.toHaveTextContent("0");
  });
});
