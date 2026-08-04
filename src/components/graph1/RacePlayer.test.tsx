/**
 * Renderer + player tests: one shared component serves both launch
 * configurations; controls drive playback; media fallbacks never drop rows.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stateAt } from "@/graph1/engine";
import { buildRaceIndex } from "@/graph1/raceIndex";
import { makeDataset } from "@/graph1/testFixtures";
import RacePlayer from "./RacePlayer";
import RaceRenderer from "./RaceRenderer";

function championStyleDataset() {
  return makeDataset(
    [
      ["champion:Azir", "2015-01-01T10:00:00Z"],
      ["champion:Ryze", "2015-01-02T10:00:00Z"],
      ["champion:Azir", "2015-01-03T10:00:00Z"],
    ],
    {
      "champion:Azir": {
        type: "champion",
        media: {
          kind: "image",
          src: "https://example.test/assets/champions/Azir/icon.png",
          fallbackText: "AZ",
        },
      },
      "champion:Ryze": {
        type: "champion",
        media: {
          kind: "image",
          src: "https://example.test/assets/champions/Ryze/icon.png",
          fallbackText: "RY",
        },
      },
    },
  );
}

function playerStyleDataset() {
  return makeDataset(
    [
      ["player:Faker", "2015-01-01T10:00:00Z"],
      ["raw-player:mid", "2015-01-02T10:00:00Z"],
      ["ambiguous-player:hydra", "2015-01-03T10:00:00Z"],
    ],
    {
      "raw-player:mid": { identityStatus: "unmatched" },
      "ambiguous-player:hydra": { identityStatus: "ambiguous" },
    },
  );
}

describe("RaceRenderer (shared across configurations)", () => {
  it("renders champion image rows", () => {
    const ds = championStyleDataset();
    const index = buildRaceIndex(ds);
    const frame = stateAt(index, index.eventCount, { topN: 10 });
    render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games" topN={10} display={{ showWinOverlay: false, showSecondaryEntityLabel: false }} />,
    );
    const img = screen.getByAltText("Azir") as HTMLImageElement;
    expect(img.src).toContain("/assets/champions/Azir/icon.png");
    expect(screen.getByLabelText(/Rank 1: Azir, 2 games/)).toBeInTheDocument();
  });

  it("renders initials fallbacks and NEVER drops media-less entities", () => {
    const ds = playerStyleDataset();
    const index = buildRaceIndex(ds);
    const frame = stateAt(index, index.eventCount, { topN: 10 });
    const { container } = render(
      <RaceRenderer frame={frame} entities={ds.entities} metricLabel="games" topN={10} display={{ showWinOverlay: false, showSecondaryEntityLabel: false }} />,
    );
    const rows = container.querySelectorAll("[data-entity-id]");
    expect(rows).toHaveLength(3); // all three, incl. unmatched + ambiguous
    expect(screen.getByText("Faker")).toBeInTheDocument();
    // identity status disclosed, not hidden
    expect(screen.getByText("unmatched")).toBeInTheDocument();
    expect(screen.getByText("ambiguous")).toBeInTheDocument();
  });

  it("keys rows by stable entity id, not rank or array position", () => {
    const ds = championStyleDataset();
    const index = buildRaceIndex(ds);
    const { container, rerender } = render(
      <RaceRenderer
        frame={stateAt(index, 1, { topN: 10 })}
        entities={ds.entities}
        metricLabel="games"
        topN={10}
        display={{ showWinOverlay: false, showSecondaryEntityLabel: false }}
      />,
    );
    const azirBefore = container.querySelector('[data-entity-id="champion:Azir"]');
    expect(azirBefore).not.toBeNull();
    rerender(
      <RaceRenderer
        frame={stateAt(index, index.eventCount, { topN: 10 })}
        entities={ds.entities}
        metricLabel="games"
        topN={10}
        display={{ showWinOverlay: false, showSecondaryEntityLabel: false }}
      />,
    );
    // same DOM node persists across rank movement (id-keyed)
    expect(
      container.querySelector('[data-entity-id="champion:Azir"]'),
    ).toBe(azirBefore);
  });
});

describe("RacePlayer controls", () => {
  it("mounts both configurations through the same component", () => {
    const { unmount } = render(<RacePlayer dataset={championStyleDataset()} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    unmount();
    render(<RacePlayer dataset={playerStyleDataset()} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("play/pause toggles and restart resets to the beginning", () => {
    render(<RacePlayer dataset={championStyleDataset()} />);
    const play = screen.getByRole("button", { name: "Play" });
    fireEvent.click(play);
    expect(
      screen.getByRole("button", { name: "Pause playback" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause playback" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Restart/ }));
    // restart puts the clock at 0 and plays
    expect(
      screen.getByRole("button", { name: "Pause playback" }),
    ).toBeInTheDocument();
  });

  it("seek updates the visible state immediately without replay animation", () => {
    render(<RacePlayer dataset={championStyleDataset()} />);
    const slider = screen.getByRole("slider", { name: "Seek by game" });
    fireEvent.change(slider, { target: { value: "3" } });
    expect(screen.getByText(/game 3 of 3/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rank 1: Azir, 2 games/)).toBeInTheDocument();
    // and back
    fireEvent.change(slider, { target: { value: "1" } });
    expect(screen.getByLabelText(/Rank 1: Azir, 1 games/)).toBeInTheDocument();
  });

  it("changing speed does not change logical state", () => {
    render(<RacePlayer dataset={championStyleDataset()} />);
    const slider = screen.getByRole("slider", { name: "Seek by game" });
    fireEvent.change(slider, { target: { value: "2" } });
    const before = screen.getByLabelText(/Rank 1:/).getAttribute("aria-label");
    fireEvent.change(screen.getByRole("combobox", { name: "Playback speed" }), {
      target: { value: "4" },
    });
    expect(screen.getByLabelText(/Rank 1:/).getAttribute("aria-label")).toBe(
      before,
    );
  });
});
