/**
 * Control-surface tests: toggle defaults, top-N, filter interaction, the
 * empty-result recovery state, and the layout rule that playback stays
 * primary while filters and display toggles stay collapsed.
 *
 * The regression lock that matters most is
 * "default toggles reproduce the current production appearance": every layer
 * the live page renders today must still render with no user interaction.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  Graph1ControlSchema,
  VisualizationDataset,
} from "@/graph1/contract";
import { makeDataset, type EventSpec } from "@/graph1/testFixtures";
import RacePlayer from "./RacePlayer";

const SPEC: EventSpec[] = [
  ["player:A", "2020-01-01T10:00:00Z", 1,
   { gameId: "G0", team: "T1", opponent: "GEN", region: "Korea",
     league: "LCK", tournament: "LCK 2020 Spring" }],
  ["player:B", "2021-01-02T10:00:00Z", 0,
   { gameId: "G1", team: "FNC", opponent: "G2", region: "EMEA",
     league: "LEC", tournament: "LEC 2021 Spring" }],
  ["player:C", "2022-01-03T10:00:00Z", 1,
   { gameId: "G2", team: "JDG", opponent: "BLG", region: "China",
     league: "LPL", tournament: "LPL 2022 Spring" }],
  ["player:A", "2022-06-03T10:00:00Z", 1,
   { gameId: "G3", team: "T1", opponent: "DK", region: "Korea",
     league: "LCK", tournament: "LCK 2022 Summer" }],
];

const CONTROLS: Graph1ControlSchema = {
  metrics: [
    { id: "cumulative_games", label: "games", unit: "games",
      accumulation: "sum", default: true },
    { id: "cumulative_wins", label: "wins", unit: "games",
      accumulation: "sum" },
  ],
  filters: [
    { id: "year", kind: "range", source: "occurredAt", label: "Year",
      widget: "range", advanced: false },
    { id: "region", kind: "enum", source: "context.region", label: "Region",
      widget: "select", advanced: false },
    { id: "league", kind: "enum", source: "context.league", label: "League",
      widget: "combobox", advanced: true },
  ],
  topN: { default: 10, options: [5, 10, 15, 20] },
  speed: { default: 1, options: [0.5, 1, 2, 4, 8, 10] },
};

function dataset(overrides: Partial<VisualizationDataset> = {}) {
  const ds = makeDataset(SPEC);
  ds.definition.display = {
    contextMode: "event-header",
    showSecondaryEntityLabel: true,
    defaultToggles: {
      winOverlay: true, eventHeader: true, contextLine: true,
      entityMedia: true, rankNumber: true, valueLabel: true,
      dateLabel: true, secondaryLabel: true,
    },
  };
  ds.definition.controls = CONTROLS;
  return { ...ds, ...overrides };
}

/** A Phase 1 payload: no controls, no display block at all. */
function legacy() {
  const ds = makeDataset(SPEC);
  delete ds.definition.display;
  delete ds.definition.controls;
  return ds;
}

const seekToEnd = () =>
  fireEvent.change(screen.getByRole("slider", { name: "Seek by game" }), {
    target: { value: String(SPEC.length) },
  });

describe("default appearance is the production appearance", () => {
  it("renders every layer with no interaction", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    expect(screen.getByTestId("event-header")).toBeInTheDocument();
    expect(container.querySelector('[data-bar="wins"]')).not.toBeNull();
    expect(container.querySelector('[data-bar="total"]')).not.toBeNull();
    expect(screen.getByText(/wins \(bright inset\)/)).toBeInTheDocument();
    const row = container.querySelector('[data-entity-id="player:A"]')!;
    expect(within(row as HTMLElement).getByText("1")).toBeInTheDocument(); // rank
    expect(row.textContent).toContain("T1 · Korea"); // secondary label
    expect(row.textContent).toContain("2W–0L"); // value label + wins
  });

  it("a Phase 1 payload with no new fields renders identically", () => {
    const { container } = render(<RacePlayer dataset={legacy()} />);
    seekToEnd();
    expect(screen.getByTestId("event-header")).toBeInTheDocument();
    expect(container.querySelector('[data-bar="wins"]')).not.toBeNull();
    expect(container.querySelector('[data-entity-id="player:A"]')).not.toBeNull();
  });

  it("still shows top 10 rows by default", () => {
    render(<RacePlayer dataset={dataset()} />);
    expect(
      screen.getByRole("list", { name: /Top 10 by/ }),
    ).toBeInTheDocument();
  });
});

describe("layout: playback primary, the rest collapsed", () => {
  it("playback controls are not inside a disclosure", () => {
    render(<RacePlayer dataset={dataset()} />);
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.closest("details")).toBeNull();
    expect(
      screen.getByRole("slider", { name: "Seek by game" }).closest("details"),
    ).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Playback speed" }).closest("details"),
    ).toBeNull();
  });

  it("filters and display toggles are collapsed by default", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    const panels = container.querySelectorAll("details");
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect((panel as HTMLDetailsElement).open).toBe(false);
    }
  });

  it("summaries state the current condition without being opened", () => {
    render(<RacePlayer dataset={dataset()} />);
    expect(screen.getByText(/all 4 games/)).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
  });
});

describe("top-N", () => {
  it("offers the declared options and defaults to 10", () => {
    render(<RacePlayer dataset={dataset()} />);
    const rows = screen.getByRole("combobox", { name: "Rows shown" });
    expect(
      Array.from(rows.querySelectorAll("option")).map((o) => o.value),
    ).toEqual(["5", "10", "15", "20"]);
    expect((rows as HTMLSelectElement).value).toBe("10");
  });

  it("changing top-N resizes the board", () => {
    render(<RacePlayer dataset={dataset()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Rows shown" }), {
      target: { value: "5" },
    });
    expect(screen.getByRole("list", { name: /Top 5 by/ })).toBeInTheDocument();
  });

  it("limits rendered rows to top-N", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    fireEvent.change(screen.getByRole("combobox", { name: "Rows shown" }), {
      target: { value: "5" },
    });
    expect(
      container.querySelectorAll("[data-entity-id]").length,
    ).toBeLessThanOrEqual(5);
  });

  it("falls back to the standard options for a payload with no controls", () => {
    render(<RacePlayer dataset={legacy()} />);
    const rows = screen.getByRole("combobox", { name: "Rows shown" });
    expect(
      Array.from(rows.querySelectorAll("option")).map((o) => o.value),
    ).toEqual(["5", "10", "15", "20"]);
  });
});

describe("display toggles", () => {
  const toggle = (name: RegExp | string) =>
    fireEvent.click(screen.getByRole("checkbox", { name }));

  it("turning off the win overlay removes the bar and legend", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    toggle("Win overlay");
    expect(container.querySelector('[data-bar="wins"]')).toBeNull();
    expect(screen.queryByText(/wins \(bright inset\)/)).toBeNull();
    // the total bar — the actual race — is untouched
    expect(container.querySelector('[data-bar="total"]')).not.toBeNull();
  });

  it("turning off the event header removes it", () => {
    render(<RacePlayer dataset={dataset()} />);
    toggle("Event header");
    expect(screen.queryByTestId("event-header")).toBeNull();
  });

  it("turning off the context line keeps the header", () => {
    render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    toggle("Context line");
    const header = screen.getByTestId("event-header");
    expect(header.textContent).not.toContain("vs.");
    expect(header.textContent).toContain("game");
  });

  it("turning off the date label keeps the game counter", () => {
    render(<RacePlayer dataset={dataset()} />);
    toggle("Date label");
    const header = screen.getByTestId("event-header");
    expect(header.textContent).not.toContain("January");
    expect(header.textContent).toContain("game 1 of 4");
  });

  it("turning off entity media removes avatars", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    const row = () => container.querySelector('[data-entity-id="player:A"]')!;
    expect(row().querySelector("div[aria-hidden]")).not.toBeNull();
    toggle("Entity image");
    expect(row().querySelector("div[aria-hidden]")).toBeNull();
  });

  it("turning off rank number and value label removes them", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    toggle("Rank number");
    toggle("Value label");
    const row = container.querySelector('[data-entity-id="player:A"]')!;
    expect(row.textContent).not.toContain("2W–0L");
    // the entity is still rendered and still labelled for assistive tech
    expect(row.getAttribute("aria-label")).toContain("Rank 1");
  });

  it("turning off the secondary label removes team · region", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    expect(container.textContent).toContain("T1 · Korea");
    toggle("Team · region label");
    expect(container.textContent).not.toContain("T1 · Korea");
  });

  it("hides toggles for layers the dataset does not carry", () => {
    const ds = dataset();
    ds.definition.display = {
      contextMode: "latest-entity-context",
      showSecondaryEntityLabel: false,
    };
    render(<RacePlayer dataset={ds} />);
    expect(
      screen.queryByRole("checkbox", { name: "Team · region label" }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Context line" })).toBeNull();
  });

  it("reset restores every default", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    seekToEnd();
    toggle("Win overlay");
    toggle("Rank number");
    expect(screen.getByText("2 changed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset display" }));
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(container.querySelector('[data-bar="wins"]')).not.toBeNull();
  });
});

describe("filters", () => {
  const check = (name: string) =>
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) }));

  it("offers only the declared dimensions", () => {
    render(<RacePlayer dataset={dataset()} />);
    expect(screen.getByRole("combobox", { name: "First year" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Korea/ })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search League" })).toBeTruthy();
    // deferred dimensions are absent
    expect(screen.queryByRole("checkbox", { name: /^T1/ })).toBeNull();
    expect(screen.queryByLabelText(/tournament/i)).toBeNull();
  });

  it("filtering by region narrows the race", () => {
    render(<RacePlayer dataset={dataset()} />);
    check("Korea");
    expect(screen.getByText(/2 of 4 games/)).toBeInTheDocument();
    expect(screen.getByText(/games · 2020-01-01 → 2022-06-03/)).toBeTruthy();
  });

  it("clearing filters restores the full race", () => {
    render(<RacePlayer dataset={dataset()} />);
    check("Korea");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText(/all 4 games/)).toBeInTheDocument();
  });

  it("a year window narrows the race", () => {
    render(<RacePlayer dataset={dataset()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "First year" }), {
      target: { value: "2022" },
    });
    expect(screen.getByText(/2 of 4 games/)).toBeInTheDocument();
  });

  it("an empty result shows a recovery state, not a crash", () => {
    render(<RacePlayer dataset={dataset()} />);
    check("Korea");
    fireEvent.change(screen.getByRole("combobox", { name: "First year" }), {
      target: { value: "2021" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Last year" }), {
      target: { value: "2021" },
    });
    expect(screen.getByTestId("empty-race")).toBeInTheDocument();
    expect(screen.queryByTestId("event-header")).toBeNull();
    // the user can still get out
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("recovers from an empty result when filters are cleared", () => {
    const { container } = render(<RacePlayer dataset={dataset()} />);
    check("Korea");
    fireEvent.change(screen.getByRole("combobox", { name: "First year" }), {
      target: { value: "2021" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Last year" }), {
      target: { value: "2021" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByTestId("empty-race")).toBeNull();
    seekToEnd();
    expect(container.querySelector('[data-entity-id="player:A"]')).not.toBeNull();
  });

  it("is absent entirely for a payload that declares no filters", () => {
    const { container } = render(<RacePlayer dataset={legacy()} />);
    // only the display-toggle disclosure remains
    expect(container.querySelectorAll("details").length).toBe(1);
    expect(screen.queryByText(/all 4 games/)).toBeNull();
  });
});
