/**
 * Phase 4A — the SAME RacePlayer/RaceRenderer serve the stat-growth race:
 * level header instead of dates, scaled stat values instead of counts,
 * level-unit seeking, no wins surface.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stateAt } from "@/graph1/engine";
import { buildRaceIndex } from "@/graph1/raceIndex";
import { makeStatGrowthDataset } from "@/graph1/testFixtures";
import RacePlayer from "./RacePlayer";
import RaceRenderer from "./RaceRenderer";

const UNITS = {
  Alpha: [6000, 6360, 7100, 8000],
  Beta: [7000, 7100, 7250, 7450],
};

describe("RacePlayer with a level progression", () => {
  it("shows Level 1 initially with the champion/level summary line", () => {
    render(<RacePlayer dataset={makeStatGrowthDataset(UNITS)} />);
    expect(screen.getByTestId("event-header")).toHaveTextContent("Level 1");
    expect(screen.getByTestId("event-header")).toHaveTextContent("1 of 4");
    expect(screen.getByText(/2 champions · 4 levels/)).toBeInTheDocument();
    // no calendar dates anywhere: the synthetic level stamps must not leak
    expect(screen.queryByText(/0001-01-01/)).not.toBeInTheDocument();
  });

  it("seeks by level and reaches the last level", () => {
    render(<RacePlayer dataset={makeStatGrowthDataset(UNITS)} />);
    const slider = screen.getByLabelText("Seek by level");
    expect(slider).toHaveAttribute("max", "4");
    fireEvent.change(slider, { target: { value: "4" } });
    expect(screen.getByTestId("event-header")).toHaveTextContent("Level 4");
    // final standings: Alpha 80.0 leads Beta 74.5
    expect(
      screen.getByLabelText(/Rank 1: Alpha, 80.0 Attack Damage/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Rank 2: Beta, 74.5 Attack Damage/),
    ).toBeInTheDocument();
  });

  it("prints scaled stat values, not raw display units", () => {
    render(<RacePlayer dataset={makeStatGrowthDataset(UNITS)} />);
    // position 0 is the empty pre-race board (as every race starts); seek to
    // the level-1 checkpoint to see values
    fireEvent.change(screen.getByLabelText("Seek by level"), {
      target: { value: "1" },
    });
    // level 1: Beta leads with 70.0 AD (units 7000, scale 100, 1 decimal)
    expect(screen.getByText("70.0")).toBeInTheDocument();
    expect(screen.queryByText("7000")).not.toBeInTheDocument();
  });

  it("declares no wins surface: no overlay legend, no W–L", () => {
    render(<RacePlayer dataset={makeStatGrowthDataset(UNITS)} />);
    expect(screen.queryByText(/wins \(bright inset\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0W–0L/)).not.toBeInTheDocument();
  });
});

describe("RaceRenderer value formatting", () => {
  it("keeps integer rendering when valueDisplay is absent (count metrics)", () => {
    const ds = makeStatGrowthDataset(UNITS);
    const index = buildRaceIndex(ds);
    const frame = stateAt(index, index.stepCount, { topN: 10 });
    render(
      <RaceRenderer
        frame={frame}
        entities={ds.entities}
        metricLabel="games"
        topN={10}
        display={{ showWinOverlay: false, showSecondaryEntityLabel: false }}
      />,
    );
    // raw display units — proves the scaled path is opt-in via valueDisplay
    expect(screen.getByText("8000")).toBeInTheDocument();
  });
});
