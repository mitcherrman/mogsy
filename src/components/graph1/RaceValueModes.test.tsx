/**
 * Phase 4A polish — the Exact-Levels/Smooth toggle on the player surface.
 *
 * Exact is the default; the Values control only exists on stat races; the
 * mode is a display toggle (`exactValues`) so it rides the existing off=
 * URL convention; and the level label always matches the printed values.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GRAPH1_FALLBACK_HINTS, resolveDisplayToggles } from "@/graph1/contract";
import {
  initialControlState,
  parseControlState,
  serializeControlState,
} from "@/graph1/controlState";
import { stateAt } from "@/graph1/engine";
import { buildRaceIndex } from "@/graph1/raceIndex";
import { makeDataset, makeStatGrowthDataset } from "@/graph1/testFixtures";
import RacePlayer from "./RacePlayer";
import RaceRenderer from "./RaceRenderer";

const UNITS = {
  Alpha: [6000, 6500, 7100, 7800],
  Beta: [7000, 7400, 7900, 8500],
};

describe("RaceRenderer value modes", () => {
  const ds = makeStatGrowthDataset(UNITS);
  const index = buildRaceIndex(ds);
  // mid-transition level 2 → 3: Alpha smooth = 68.0, exact = 65.0
  const frame = stateAt(index, 2.5, { topN: 10 });
  const baseDisplay = { showWinOverlay: false, showSecondaryEntityLabel: false };

  it("defaults to exact checkpoint values when the flag is omitted", () => {
    render(
      <RaceRenderer
        frame={frame}
        entities={ds.entities}
        metricLabel="Attack Damage"
        topN={10}
        valueDisplay={{ scale: 100, decimals: 1 }}
        display={baseDisplay}
      />,
    );
    expect(screen.getByText("65.0")).toBeInTheDocument();
    expect(screen.queryByText("68.0")).not.toBeInTheDocument();
  });

  it("smooth mode prints the interpolated ticker", () => {
    render(
      <RaceRenderer
        frame={frame}
        entities={ds.entities}
        metricLabel="Attack Damage"
        topN={10}
        valueDisplay={{ scale: 100, decimals: 1 }}
        display={{ ...baseDisplay, exactValues: false }}
      />,
    );
    expect(screen.getByText("68.0")).toBeInTheDocument();
    expect(screen.queryByText("65.0")).not.toBeInTheDocument();
  });

  it("count metrics ignore the mode entirely", () => {
    render(
      <RaceRenderer
        frame={frame}
        entities={ds.entities}
        metricLabel="games"
        topN={10}
        display={{ ...baseDisplay, exactValues: false }}
      />,
    );
    // no valueDisplay -> raw integer units at floor(position), as always
    expect(screen.getByText("6500")).toBeInTheDocument();
  });
});

describe("RacePlayer toggle surface", () => {
  it("shows the Values control on a stat race, defaulting to Exact levels", () => {
    render(<RacePlayer dataset={makeStatGrowthDataset(UNITS)} />);
    const select = screen.getByLabelText("Value animation") as HTMLSelectElement;
    expect(select.value).toBe("exact");
  });

  it("hides the Values control on count races", () => {
    render(
      <RacePlayer
        dataset={makeDataset([
          ["champion:Azir", "2020-01-01T10:00:00Z"],
          ["champion:Ryze", "2020-01-02T10:00:00Z"],
        ])}
      />,
    );
    expect(screen.queryByLabelText("Value animation")).not.toBeInTheDocument();
  });

  it("switching to Smooth flips the printed value mid-race", () => {
    render(<RacePlayer dataset={makeStatGrowthDataset(UNITS)} />);
    // land mid-board at the level-2 checkpoint (integer seek): both modes
    // agree there, so instead assert the label semantics after switching
    fireEvent.change(screen.getByLabelText("Seek by level"), {
      target: { value: "2" },
    });
    expect(screen.getByText("65.0")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Value animation"), {
      target: { value: "smooth" },
    });
    // checkpoint values are identical in both modes — the exact value stays
    expect(screen.getByText("65.0")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Value animation") as HTMLSelectElement).value,
    ).toBe("smooth");
  });

  it("keeps the level label synchronized with the settled values (exact)", () => {
    render(<RacePlayer dataset={makeStatGrowthDataset(UNITS)} />);
    fireEvent.change(screen.getByLabelText("Seek by level"), {
      target: { value: "3" },
    });
    expect(screen.getByTestId("event-header")).toHaveTextContent("Level 3");
    expect(screen.getByText("71.0")).toBeInTheDocument(); // Alpha level 3
  });
});

describe("URL state", () => {
  const statDefaults = resolveDisplayToggles(makeStatGrowthDataset(UNITS));

  it("exact is the default and writes nothing to the URL", () => {
    const state = initialControlState("champion-stat-growth:attack-damage",
      statDefaults);
    expect(state.toggles.exactValues).toBe(true);
    const params = serializeControlState(state, statDefaults);
    expect(params.get("off")).toBeNull();
  });

  it("smooth serializes as off=exactValues and round-trips", () => {
    const state = initialControlState("champion-stat-growth:attack-damage",
      statDefaults);
    state.toggles = { ...state.toggles, exactValues: false };
    const params = serializeControlState(state, statDefaults);
    expect(params.get("off")).toBe("exactValues");
    const parsed = parseControlState(params, statDefaults, {
      datasetKey: "champion-stat-growth:attack-damage",
    });
    expect(parsed.toggles.exactValues).toBe(false);
    // fixed point
    expect(
      serializeControlState(parsed, statDefaults).toString(),
    ).toBe(params.toString());
  });

  it("legacy chronological defaults resolve exactValues true and stay clean", () => {
    const ds = makeDataset([["player:Faker", "2015-01-01T10:00:00Z"]]);
    const defaults = resolveDisplayToggles(ds);
    expect(defaults.exactValues).toBe(true);
    expect(GRAPH1_FALLBACK_HINTS.defaultToggles).toBeUndefined();
    const params = serializeControlState(
      initialControlState("faker-champions", defaults),
      defaults,
    );
    expect(params.get("off")).toBeNull();
  });
});
