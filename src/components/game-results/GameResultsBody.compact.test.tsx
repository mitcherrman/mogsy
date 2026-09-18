/**
 * RE1 — the shared body's COMPACT presentation, and proof that the default did
 * not move. Ranked opts in; every other mode renders `full` exactly as before.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GameResultsBody } from "./GameResultsBody";
import type { GameResultsModel } from "./model";

afterEach(cleanup);

const model: GameResultsModel = {
  state: "victory",
  mode: "Ranked Duel",
  snapshot: [{ key: "accuracy", label: "Accuracy", value: "80%" }],
  progress: [{ key: "rating", label: "Ranked rating", value: "+18 · 1218", delta: 18,
    hint: "Applied" }],
  report: ["You won 8 of 10 modules."],
  timeline: { unitLabel: "Modules", entries: [
    { index: 1, label: "Items", outcome: "correct", points: 3 },
  ] },
  review: <p data-testid="mode-review">discoveries</p>,
  actions: {
    primary: { label: "Play Again", onClick: () => {} },
    secondary: { label: "Review Match", onClick: () => {} },
    tertiary: { label: "Back to Leaguecraft", onClick: () => {} },
  },
};

describe("GameResultsBody", () => {
  it("renders the full stacked body by default — every other mode's layout", () => {
    render(<GameResultsBody model={model} />);
    expect(screen.getByTestId("game-results-body").dataset.variant).toBeUndefined();
    expect(screen.getByTestId("result-snapshot")).toBeTruthy();
    expect(screen.getByTestId("result-progress")).toBeTruthy();
    expect(screen.queryByTestId("result-summary-strip")).toBeNull();
    expect(screen.queryByTestId("result-details")).toBeNull();
    expect(screen.getByTestId("result-actions").dataset.layout).toBe("stacked");
  });

  it("compact: one record strip keeping the item test ids", () => {
    render(<GameResultsBody model={model} variant="compact" />);
    const strip = screen.getByTestId("result-summary-strip");
    expect(within(strip).getByTestId("result-stat-accuracy")).toHaveTextContent("80%");
    expect(within(strip).getByTestId("result-progress-rating")).toHaveTextContent("+18 · 1218");
    expect(screen.queryByTestId("result-snapshot")).toBeNull();
  });

  it("compact: report, timeline and review live in a CLOSED disclosure", () => {
    render(<GameResultsBody model={model} variant="compact" detailsSummary="1 module" />);
    const details = screen.getByTestId("result-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByTestId("result-match-report")).toBeTruthy();
    expect(within(details).getByTestId("result-timeline")).toBeTruthy();
    expect(within(details).getByTestId("mode-review")).toBeTruthy();
    expect(screen.getByTestId("result-details-toggle")).toHaveTextContent("1 module");
  });

  it("compact: the three actions keep their weights, on one row", () => {
    render(<GameResultsBody model={model} variant="compact" />);
    expect(screen.getByTestId("result-actions").dataset.layout).toBe("inline");
    expect(screen.getByTestId("result-primary")).toHaveTextContent("Play Again");
    expect(screen.getByTestId("result-secondary")).toHaveTextContent("Review Match");
    expect(screen.getByTestId("result-tertiary")).toHaveTextContent("Back to Leaguecraft");
  });

  it("compact: no disclosure at all when there is nothing to disclose", () => {
    render(<GameResultsBody model={{ ...model, report: [], timeline: null, review: undefined }}
      variant="compact" />);
    expect(screen.queryByTestId("result-details")).toBeNull();
  });
});
