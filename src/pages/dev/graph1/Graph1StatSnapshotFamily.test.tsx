/**
 * Phase 5 — the stat-snapshot family on /dev/graph1.
 *
 * Choosing "Champion stat ranking" must land on the catalog-declared default
 * stat, render a BOARD rather than a race player, and drive order / rows /
 * level entirely from one payload. The race families must be unaffected.
 *
 * The request log is asserted directly: re-ranking is the whole architectural
 * claim of this phase, so "changing the order issued no request" is a test,
 * not a comment.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Graph1RacePage from "./Graph1RacePage";

const SNAPSHOT_CONTROLS = {
  metrics: [
    {
      id: "champion_stat_value",
      label: "Attack Range",
      unit: "range",
      accumulation: "sum",
      valueDisplay: { scale: 100, decimals: 0 },
      default: true,
    },
  ],
  filters: [],
  topN: { default: 10, options: [5, 10, 15, 20] },
  speed: { default: 1, options: [1] },
};

const CATALOG = {
  schemaVersion: 2,
  datasets: [
    {
      key: "faker-champions",
      title: "Faker — champions",
      rankedEntityType: "champion",
      defaultTopN: 10,
    },
  ],
  families: [
    {
      id: "champion-players",
      label: "Champion → players",
      focusEntityType: "champion",
      rankedEntityType: "player",
      entitySource: "/api/graph1/entities/champions",
      display: { contextMode: "event-header", showSecondaryEntityLabel: true },
      defaultTopN: 10,
    },
    {
      id: "champion-stat-snapshot",
      label: "Champion stat ranking",
      focusEntityType: "stat",
      rankedEntityType: "champion",
      mediaStrategy: "champion-icon",
      keyTemplate: "champion-stat-snapshot:{entity}",
      visualizationType: "ranked-snapshot",
      stats: [
        { id: "armor", label: "Armor", unit: "Armor", snapshotKind: "level" },
        {
          id: "attack-range",
          label: "Attack Range",
          unit: "range",
          snapshotKind: "static",
        },
        {
          id: "move-speed",
          label: "Move Speed",
          unit: "MS",
          snapshotKind: "static",
        },
      ],
      defaultEntity: "attack-range",
      display: {
        contextMode: "event-header",
        showSecondaryEntityLabel: false,
        defaultToggles: { winOverlay: false, dateLabel: false },
      },
      controls: SNAPSHOT_CONTROLS,
      defaultTopN: 10,
    },
  ],
};

function entity(name: string) {
  return {
    id: `champion:${name}`,
    type: "champion",
    displayName: name,
    identityStatus: "canonical",
    media: { kind: "initials", value: name.slice(0, 2).toUpperCase() },
  };
}

/** Attack range: Caitlyn 650, Ashe 600, Annie 625, Aatrox 175 (centi-units). */
const RANGE_UNITS: Record<string, number> = {
  Caitlyn: 65000,
  Annie: 62500,
  Ashe: 60000,
  Aatrox: 17500,
};

/** Armor at levels 1 and 20 (centi-units). */
const ARMOR_UNITS: Record<string, Record<string, number>> = {
  Sejuani: { "1": 3800, "20": 14120 },
  Yuumi: { "1": 2500, "20": 8000 },
  Aatrox: { "1": 3800, "20": 12000 },
};

function makeSnapshot(stat: string) {
  // Both level-independent stats declare a single "base" point, exactly as the
  // backend does — move speed must not grow a phantom level selector.
  const isRange = stat === "attack-range" || stat === "move-speed";
  const names = isRange ? Object.keys(RANGE_UNITS) : Object.keys(ARMOR_UNITS);
  const entities: Record<string, unknown> = {
    [`stat:${stat}`]: {
      id: `stat:${stat}`,
      type: "stat",
      displayName: isRange ? "Attack Range" : "Armor",
      identityStatus: "canonical",
      media: { kind: "neutral", value: "RA" },
    },
  };
  for (const name of names) entities[`champion:${name}`] = entity(name);
  return {
    schemaVersion: 1,
    id: `champion-stat-snapshot:${stat}@base-stats`,
    visualizationType: "ranked-snapshot",
    definition: {
      title: `Champion ${isRange ? "Attack Range" : "Armor"} — ranked`,
      focusEntity: { type: "stat", id: `stat:${stat}` },
      rankedEntityType: "champion",
      metric: {
        id: "champion_stat_value",
        label: isRange ? "Attack Range" : "Armor",
        unit: isRange ? "range" : "Armor",
        accumulation: "none",
        valueDisplay: { scale: 100, decimals: isRange ? 0 : 1 },
      },
      scope: { id: "base-stats", label: "Base stats" },
      snapshots: isRange
        ? {
            kind: "static",
            unitLabel: "Attack Range",
            defaultId: "base",
            points: [{ id: "base", label: "Attack Range" }],
          }
        : {
            kind: "level",
            unitLabel: "Level",
            defaultId: "20",
            points: [
              { id: "1", label: "Level 1" },
              { id: "20", label: "Level 20" },
            ],
          },
      display: { contextMode: "event-header", showSecondaryEntityLabel: false },
      controls: SNAPSHOT_CONTROLS,
    },
    entities,
    rows: names.map((name) => ({
      rankedEntityId: `champion:${name}`,
      values: isRange ? { base: RANGE_UNITS[name] } : ARMOR_UNITS[name],
    })),
    coverage: {
      source: "champion_stats (sheet intake)",
      statId: stat,
      rosterCount: names.length,
      eligibleChampionCount: names.length,
      excludedChampionCount: 0,
      generatedAt: null,
      firstEventAt: null,
      lastEventAt: null,
      eligibleEventCount: 0,
      excludedEventCount: 0,
      distinctRankedEntityCount: names.length,
      snapshotPointCount: isRange ? 1 : 2,
      warnings: [],
    },
  };
}

let locationSearch = "";
let requestedUrls: string[] = [];

function LocationProbe() {
  locationSearch = useLocation().search;
  return null;
}

function mockFetch() {
  return vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    requestedUrls.push(url);
    if (url.endsWith("/api/graph1/datasets")) {
      return { ok: true, status: 200, json: async () => CATALOG } as Response;
    }
    if (url.includes("/datasets/champion-stat-snapshot")) {
      const stat = decodeURIComponent(url.split(":").pop()!);
      return {
        ok: true,
        status: 200,
        json: async () => makeSnapshot(stat),
      } as Response;
    }
    if (url.includes("/entities/champions")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ family: "champion-players", total: 0, entities: [] }),
      } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
}

function renderPage(initialEntry = "/dev/graph1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/dev/graph1"
            element={
              <>
                <Graph1RacePage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  locationSearch = "";
  requestedUrls = [];
  vi.stubGlobal("fetch", mockFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openSnapshotFamily() {
  renderPage();
  fireEvent.click(await screen.findByRole("button", {
    name: "Champion stat ranking",
  }));
  return screen.findByTestId("graph1-stat-board");
}

// ---------------------------------------------------------------------------

describe("stat-snapshot family on /dev/graph1", () => {
  it("lands on the declared default stat and renders a board", async () => {
    await openSnapshotFamily();
    expect(locationSearch).toContain("d=champion-stat-snapshot%3Aattack-range");
    expect(
      await screen.findByRole("heading", {
        name: "Top 10 Highest Attack Range",
      }),
    ).toBeInTheDocument();
  });

  it("ranks the rows highest-first with correct values", async () => {
    const board = await openSnapshotFamily();
    const rows = within(board).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-entity-id"))).toEqual([
      "champion:Caitlyn",
      "champion:Annie",
      "champion:Ashe",
      "champion:Aatrox",
    ]);
    expect(rows[0]).toHaveAttribute("aria-label", expect.stringContaining("650"));
  });

  it("renders NO race player for a snapshot family", async () => {
    await openSnapshotFamily();
    // A board does not play back: the race transport must be entirely absent.
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByLabelText("Play")).toBeNull();
    expect(screen.queryByLabelText("Playback speed")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "GRAPH1 · stat ranking" }),
    ).toBeInTheDocument();
  });

  it("switching to Lowest re-ranks WITHOUT a request", async () => {
    const board = await openSnapshotFamily();
    const before = requestedUrls.length;
    fireEvent.click(within(document.body).getByRole("button", { name: "Lowest" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Top 10 Lowest Attack Range" }),
      ).toBeInTheDocument(),
    );
    expect(requestedUrls.length).toBe(before);
    const rows = within(screen.getByTestId("graph1-stat-board")).getAllByRole(
      "listitem",
    );
    expect(rows[0]).toHaveAttribute("data-entity-id", "champion:Aatrox");
    expect(locationSearch).toContain("order=lowest");
  });

  it("changing the row count re-slices WITHOUT a request", async () => {
    await openSnapshotFamily();
    const before = requestedUrls.length;
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Top 5 Highest Attack Range" }),
      ).toBeInTheDocument(),
    );
    expect(requestedUrls.length).toBe(before);
    expect(locationSearch).toContain("rows=5");
  });

  it("offers no level control for a stat that has no levels", async () => {
    await openSnapshotFamily();
    expect(screen.queryByLabelText("Level")).toBeNull();
  });

  it("offers a level control for a level-scaled stat and re-ranks in place", async () => {
    await openSnapshotFamily();
    fireEvent.change(screen.getByLabelText("Stat"), {
      target: { value: "armor" },
    });
    await screen.findByRole("heading", { name: "Top 10 Highest Armor at Level 20" });

    const before = requestedUrls.length;
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "1" } });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Top 10 Highest Armor at Level 1" }),
      ).toBeInTheDocument(),
    );
    // one payload carries every level: changing it issues no request
    expect(requestedUrls.length).toBe(before);
    expect(locationSearch).toContain("lvl=1");

    // Sejuani and Aatrox tie at level 1 (3800) — alphabetical, so Aatrox first
    const rows = within(screen.getByTestId("graph1-stat-board")).getAllByRole(
      "listitem",
    );
    expect(rows.map((r) => r.getAttribute("data-entity-id"))).toEqual([
      "champion:Aatrox",
      "champion:Sejuani",
      "champion:Yuumi",
    ]);
  });

  it("carries order and rows across a stat change", async () => {
    await openSnapshotFamily();
    fireEvent.click(screen.getByRole("button", { name: "Lowest" }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.change(screen.getByLabelText("Stat"), {
      target: { value: "armor" },
    });
    expect(
      await screen.findByRole("heading", {
        name: "Top 5 Lowest Armor at Level 20",
      }),
    ).toBeInTheDocument();
  });

  it("reproduces a shared board from the URL alone", async () => {
    renderPage(
      "/dev/graph1?d=champion-stat-snapshot%3Aarmor&order=lowest&rows=5&lvl=1",
    );
    expect(
      await screen.findByRole("heading", {
        name: "Top 5 Lowest Armor at Level 1",
      }),
    ).toBeInTheDocument();
  });

  it("fetches a shared board's payload exactly ONCE", async () => {
    // Which kind a family key is cannot be known before the catalog settles.
    // Guessing "race" there costs a wasted round trip on every shared board
    // link — the payload arrives, fails the race gate and is discarded.
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Aarmor");
    await screen.findByTestId("graph1-stat-board");
    const payloadRequests = requestedUrls.filter((u) =>
      u.includes("/datasets/champion-stat-snapshot:armor"),
    );
    expect(payloadRequests).toHaveLength(1);
  });

  it("degrades a stale level from a shared link to the declared default", async () => {
    // ?lvl=20 means nothing to attack range; the board must render, not empty
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Aattack-range&lvl=20");
    expect(
      await screen.findByRole("heading", {
        name: "Top 10 Highest Attack Range",
      }),
    ).toBeInTheDocument();
  });

  it("still renders the race families alongside it", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: "Champion → players" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Champion stat ranking" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Rows = All

describe("Rows = All", () => {
  it("renders every eligible champion, sized from the payload not a constant", async () => {
    const board = await openSnapshotFamily();
    // baseline: the default board is capped
    expect(within(board).getAllByRole("listitem")).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("graph1-stat-board")).getAllByRole(
          "listitem",
        ),
      ).toHaveLength(Object.keys(RANGE_UNITS).length),
    );
    expect(
      screen.getByRole("heading", {
        name: `All ${Object.keys(RANGE_UNITS).length} Champions — Highest Attack Range`,
      }),
    ).toBeInTheDocument();
  });

  it("serializes as rows=all, never as a numeric sentinel", async () => {
    await openSnapshotFamily();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(locationSearch).toContain("rows=all"));
    expect(locationSearch).not.toMatch(/rows=\d/);
  });

  it("hydrates All from the URL", async () => {
    renderPage(
      "/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=all",
    );
    const board = await screen.findByTestId("graph1-stat-board");
    expect(within(board).getAllByRole("listitem")).toHaveLength(
      Object.keys(RANGE_UNITS).length,
    );
  });

  it("keeps All ordering correct in both directions", async () => {
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=all");
    let board = await screen.findByTestId("graph1-stat-board");
    expect(
      within(board)
        .getAllByRole("listitem")
        .map((r) => r.getAttribute("data-entity-id")),
    ).toEqual([
      "champion:Caitlyn",
      "champion:Annie",
      "champion:Ashe",
      "champion:Aatrox",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Lowest" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: /^All 4 Champions — Lowest Attack Range$/,
        }),
      ).toBeInTheDocument(),
    );
    board = screen.getByTestId("graph1-stat-board");
    expect(
      within(board)
        .getAllByRole("listitem")
        .map((r) => r.getAttribute("data-entity-id")),
    ).toEqual([
      "champion:Aatrox",
      "champion:Ashe",
      "champion:Annie",
      "champion:Caitlyn",
    ]);
  });

  it("preserves All and the alphabetical tie rule across a stat switch", async () => {
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=all");
    await screen.findByTestId("graph1-stat-board");
    fireEvent.change(screen.getByLabelText("Stat"), {
      target: { value: "armor" },
    });
    await screen.findByRole("heading", {
      name: "All 3 Champions — Highest Armor at Level 20",
    });
    expect(locationSearch).toContain("rows=all");

    // level 1 ties Sejuani and Aatrox at 3800 -> alphabetical
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "1" } });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "All 3 Champions — Highest Armor at Level 1",
        }),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("graph1-stat-board"))
        .getAllByRole("listitem")
        .map((r) => r.getAttribute("data-entity-id")),
    ).toEqual(["champion:Aatrox", "champion:Sejuani", "champion:Yuumi"]);
  });

  it("works for a static stat with no level selector", async () => {
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Amove-speed&rows=all");
    await screen.findByRole("heading", { name: /^All \d+ Champions — Highest/ });
    expect(screen.queryByLabelText("Level")).toBeNull();
  });

  it("leaves the existing numeric options untouched", async () => {
    for (const n of [5, 15, 20]) {
      const view = renderPage(
        `/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=${n}`,
      );
      expect(
        await screen.findByRole("heading", {
          name: `Top ${n} Highest Attack Range`,
        }),
      ).toBeInTheDocument();
      view.unmount();
    }
  });

  it("keeps 10 the default and out of the URL", async () => {
    await openSnapshotFamily();
    expect(locationSearch).not.toContain("rows=");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(locationSearch).toContain("rows=all"));
    fireEvent.click(screen.getByRole("button", { name: "10" }));
    await waitFor(() => expect(locationSearch).not.toContain("rows="));
  });

  it("degrades a hand-typed numeric sentinel to the default", async () => {
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=9999");
    expect(
      await screen.findByRole("heading", { name: "Top 10 Highest Attack Range" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// champion finder

describe("champion finder", () => {
  async function openAllRows() {
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=all");
    return screen.findByTestId("graph1-stat-board");
  }

  const highlighted = () =>
    [
      ...screen
        .getByTestId("graph1-stat-board")
        .querySelectorAll("[data-highlighted]"),
    ].map((el) => el.getAttribute("data-entity-id"));

  it("highlights a match without removing any other row", async () => {
    const board = await openAllRows();
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "ashe" },
    });
    await waitFor(() => expect(highlighted()).toEqual(["champion:Ashe"]));
    // every champion is still on the board
    expect(within(board).getAllByRole("listitem")).toHaveLength(
      Object.keys(RANGE_UNITS).length,
    );
  });

  it("matches case-insensitively", async () => {
    await openAllRows();
    for (const q of ["ASHE", "Ashe", "aShE"]) {
      fireEvent.change(screen.getByLabelText("Find champion"), {
        target: { value: q },
      });
      await waitFor(() => expect(highlighted()).toEqual(["champion:Ashe"]));
    }
  });

  it("does not change the ranking", async () => {
    await openAllRows();
    const before = within(screen.getByTestId("graph1-stat-board"))
      .getAllByRole("listitem")
      .map((r) => r.getAttribute("data-entity-id"));
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "aatrox" },
    });
    await waitFor(() => expect(highlighted()).toEqual(["champion:Aatrox"]));
    expect(
      within(screen.getByTestId("graph1-stat-board"))
        .getAllByRole("listitem")
        .map((r) => r.getAttribute("data-entity-id")),
    ).toEqual(before);
  });

  it("reports a miss and highlights nothing", async () => {
    await openAllRows();
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "zzzz" },
    });
    await screen.findByText(/No champion on this board matches/);
    expect(highlighted()).toEqual([]);
  });

  it("clearing the query removes the highlight", async () => {
    await openAllRows();
    const input = screen.getByLabelText("Find champion");
    fireEvent.change(input, { target: { value: "ashe" } });
    await waitFor(() => expect(highlighted()).toEqual(["champion:Ashe"]));
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => expect(highlighted()).toEqual([]));
    expect(locationSearch).not.toContain("find=");
  });

  it("states the champion's absolute rank", async () => {
    await openAllRows();
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "aatrox" },
    });
    // Aatrox is last of four by attack range
    await screen.findByText("Aatrox is rank 4 of 4.");
  });

  it("serializes and hydrates the query", async () => {
    await openAllRows();
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "annie" },
    });
    await waitFor(() => expect(locationSearch).toContain("find=annie"));

    cleanup();
    renderPage(
      "/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=all&find=annie",
    );
    await screen.findByTestId("graph1-stat-board");
    await waitFor(() => expect(highlighted()).toEqual(["champion:Annie"]));
  });

  it("scrolls the best match into view", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await openAllRows();
    scrollIntoView.mockClear();
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "aatrox" },
    });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it("ignores a one-character query", async () => {
    await openAllRows();
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "a" },
    });
    await waitFor(() => expect(highlighted()).toEqual([]));
    expect(screen.queryByText(/No champion on this board matches/)).toBeNull();
  });

  it("does not leak the query onto a race family", async () => {
    await openAllRows();
    fireEvent.change(screen.getByLabelText("Find champion"), {
      target: { value: "ashe" },
    });
    await waitFor(() => expect(locationSearch).toContain("find=ashe"));
    fireEvent.click(screen.getByRole("button", { name: "Champion → players" }));
    await waitFor(() =>
      expect(screen.queryByTestId("graph1-stat-board")).toBeNull(),
    );
    expect(screen.queryByLabelText("Find champion")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// the race family's Top N is a separate, still-numeric control

describe("race Top N is unaffected by All", () => {
  it("offers no All option and keeps rows=all out of the race URL", async () => {
    renderPage("/dev/graph1?d=champion-stat-snapshot%3Aattack-range&rows=all");
    await screen.findByTestId("graph1-stat-board");

    fireEvent.click(screen.getByRole("button", { name: "Champion → players" }));
    await waitFor(() =>
      expect(screen.queryByTestId("graph1-stat-board")).toBeNull(),
    );

    // The race surface reads controlState.ts's `top` parameter, which is
    // numeric-only. `rows` belongs to the board and must never reach it.
    const raceRows = screen.queryByLabelText("Rows shown");
    if (raceRows) {
      const values = [...raceRows.querySelectorAll("option")].map(
        (o) => (o as HTMLOptionElement).value,
      );
      expect(values.every((v) => Number.isFinite(Number(v)))).toBe(true);
      expect(values).not.toContain("all");
    }
    expect(locationSearch).not.toContain("top=all");
  });
});
