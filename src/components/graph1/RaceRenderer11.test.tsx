/**
 * Phase 1.1 renderer/player tests — win overlay, event-header context,
 * latest-entity secondary labels, neutral fallbacks, 8x/10x speeds.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stateAt } from "@/graph1/engine";
import { buildRaceIndex } from "@/graph1/raceIndex";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";
import RacePlayer from "./RacePlayer";
import RaceRenderer from "./RaceRenderer";

const SPEC: EventSpec[] = [
  ["player:A", "2015-01-01T10:00:00Z", 1,
   { gameId: "G0", team: "T1", opponent: "BLG", region: "Korea",
     tournament: "2023 World Championship" }],
  ["player:A", "2015-01-02T10:00:00Z", 0,
   { gameId: "G1", team: "T1", opponent: "GEN", region: "Korea",
     tournament: "LCK 2024 Spring" }],
  ["player:B", "2015-01-03T10:00:00Z", 1,
   { gameId: "G2", team: "Fnatic", opponent: "G2", region: "Europe",
     tournament: "LEC 2024 Spring" }],
];

const DISPLAY_FULL = { showWinOverlay: true, showSecondaryEntityLabel: true };

function fullFrame(spec: EventSpec[] = SPEC) {
  const ds = makeDataset(spec);
  const index = buildRaceIndex(ds);
  return { ds, frame: stateAt(index, index.eventCount, { topN: 10 }) };
}

describe("win overlay rendering", () => {
  it("renders the total bar with a nested win segment and W-L text", () => {
    const { ds, frame } = fullFrame();
    const { container } = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={DISPLAY_FULL} />,
    );
    const rowA = container.querySelector('[data-entity-id="player:A"]')!;
    const total = rowA.querySelector('[data-bar="total"]') as HTMLElement;
    const wins = rowA.querySelector('[data-bar="wins"]') as HTMLElement;
    expect(total).not.toBeNull();
    expect(wins).not.toBeNull();
    // A: 2 games, 1 win, leader value 2 -> total 100%, wins 50%
    expect(total.style.width).toBe("100%");
    expect(wins.style.width).toBe("50%");
    // losses stay visually represented: total extends beyond the win segment
    expect(parseFloat(total.style.width)).toBeGreaterThan(
      parseFloat(wins.style.width),
    );
    expect(screen.getByLabelText(/player:A|Rank .*A, 2 games, 1 wins, 1 losses/)).toBeTruthy();
    expect(rowA.textContent).toContain("1W–1L");
    // legend present
    expect(screen.getByText(/wins \(bright inset\)/)).toBeInTheDocument();
    expect(screen.getByText(/losses \(dim remainder\)/)).toBeInTheDocument();
  });

  it("overlay off keeps Phase 1 presentation (no wins bar, no legend)", () => {
    const { ds, frame } = fullFrame();
    const { container } = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={{ showWinOverlay: false, showSecondaryEntityLabel: false }} />,
    );
    expect(container.querySelector('[data-bar="wins"]')).toBeNull();
    expect(screen.queryByText(/wins \(bright inset\)/)).toBeNull();
  });
});

describe("secondary entity context (latest counted event)", () => {
  it("shows team · region from each row's latest event", () => {
    const { ds, frame } = fullFrame();
    render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={DISPLAY_FULL} />,
    );
    expect(screen.getByText("T1 · Korea")).toBeInTheDocument();
    expect(screen.getByText("Fnatic · Europe")).toBeInTheDocument();
  });

  it("missing team/region degrades to a neutral absence, never a dropped row", () => {
    const { ds, frame } = fullFrame([
      ["player:A", "2015-01-01T10:00:00Z", 1, { gameId: "G0" }],
    ]);
    const { container } = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games"
        topN={10} display={DISPLAY_FULL} />,
    );
    expect(container.querySelectorAll("[data-entity-id]")).toHaveLength(1);
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toContain("·");
  });
});

describe("event-header context mode", () => {
  it("shows tournament, long date and Team vs. Opponent for the current event", () => {
    const ds = makeDataset(SPEC);
    ds.definition.display = {
      contextMode: "event-header",
      showSecondaryEntityLabel: false,
    };
    render(<RacePlayer dataset={ds} />);
    const slider = screen.getByRole("slider", { name: "Seek by game" });
    fireEvent.change(slider, { target: { value: "0" } });
    const header = screen.getByTestId("event-header");
    expect(header.textContent).toContain("2023 World Championship");
    expect(header.textContent).toContain("January 1, 2015");
    expect(header.textContent).toContain("T1 vs. BLG");
    // deterministic update on seek
    fireEvent.change(slider, { target: { value: "3" } });
    expect(header.textContent).toContain("LEC 2024 Spring");
    expect(header.textContent).toContain("Fnatic vs. G2");
  });
});

describe("8x and 10x speeds", () => {
  it("controls expose 8x and 10x and selecting them never alters seeked state", () => {
    const ds = makeDataset(SPEC);
    render(<RacePlayer dataset={ds} />);
    const speed = screen.getByRole("combobox", { name: "Playback speed" });
    const values = Array.from(speed.querySelectorAll("option")).map(
      (o) => o.getAttribute("value"),
    );
    expect(values).toEqual(["0.5", "1", "2", "4", "8", "10"]);
    const slider = screen.getByRole("slider", { name: "Seek by game" });
    fireEvent.change(slider, { target: { value: "2" } });
    const before = screen.getByLabelText(/Rank 1:/).getAttribute("aria-label");
    fireEvent.change(speed, { target: { value: "10" } });
    expect(screen.getByLabelText(/Rank 1:/).getAttribute("aria-label")).toBe(before);
    fireEvent.change(speed, { target: { value: "8" } });
    expect(screen.getByLabelText(/Rank 1:/).getAttribute("aria-label")).toBe(before);
  });
});
