/**
 * The public Pro Play statistics table.
 *
 * The load-bearing assertion in this file is the null one: a player whose
 * games predate detailed statistics must show a real win rate and an em dash
 * everywhere else. A zero there would be a fabricated statistic sitting beside
 * a true one, which is the single defect this surface can ship.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProStatsExplorer from "./ProStatsExplorer";
import type { ProStatsPlayerRow, ProStatsResponse } from "@/lib/pro-play/statsApi";

const getProPlayerStats = vi.fn();
const getProStatsFilterOptions = vi.fn();

vi.mock("@/lib/pro-play/statsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pro-play/statsApi")>();
  return {
    ...actual,
    getProPlayerStats: (...args: unknown[]) => getProPlayerStats(...args),
    getProStatsFilterOptions: (...args: unknown[]) => getProStatsFilterOptions(...args),
  };
});

const ENRICHED: ProStatsPlayerRow = {
  player: "Faker",
  games: 620,
  wins: 410,
  losses: 210,
  win_rate: 0.6613,
  stat_backed_games: 540,
  kills: 1850,
  deaths: 1200,
  assists: 3400,
  kda: 4.375,
  cs_per_min: 8.9,
  gold_per_min: 412.3,
  damage_per_min: 601.7,
};

/** A pre-statistics record: canonical W-L, nothing else. */
const UNENRICHED: ProStatsPlayerRow = {
  player: "Gogoing",
  games: 28,
  wins: 21,
  losses: 7,
  win_rate: 0.75,
  stat_backed_games: 0,
  kills: null,
  deaths: null,
  assists: null,
  kda: null,
  cs_per_min: null,
  gold_per_min: null,
  damage_per_min: null,
};

/** Real games, zero deaths: null KDA that is "Perfect", not missing. */
const PERFECT: ProStatsPlayerRow = {
  ...ENRICHED,
  player: "Chi",
  stat_backed_games: 4,
  deaths: 0,
  kda: null,
};

function response(rows: ProStatsPlayerRow[], overrides: Partial<ProStatsResponse> = {}) {
  return {
    schema_version: 1,
    view: "players",
    rows,
    page: 1,
    page_size: 25,
    total_rows: rows.length,
    total_pages: 1,
    sort: "games",
    dir: "desc",
    filters: {
      year: 2026,
      league: null,
      patch: null,
      role: null,
      player: null,
      team: null,
      champion: null,
    },
    aggregates: {
      players: rows.length,
      games: 648,
      stat_backed_games: 540,
      kda: 4.375,
      cs_per_min: 8.9,
      gold_per_min: 412.3,
    },
    coverage: {
      games: 648,
      stat_backed_games: 540,
      missing_stat_games: 108,
      stat_coverage_pct: 83.33,
    },
    ...overrides,
  } as ProStatsResponse;
}

let lastSearch = "";

function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function renderExplorer(initialEntry = "/lol/pro-play") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/lol/pro-play"
            element={
              <>
                <ProStatsExplorer />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowFor(player: string) {
  return screen.getByText(player).closest("tr") as HTMLTableRowElement;
}

beforeEach(() => {
  lastSearch = "";
  getProPlayerStats.mockReset();
  getProStatsFilterOptions.mockReset();
  getProPlayerStats.mockResolvedValue(response([ENRICHED, UNENRICHED]));
  getProStatsFilterOptions.mockResolvedValue({
    schema_version: 1,
    leagues: ["LoL Champions Korea", "Tencent LoL Pro League"],
    patches: ["26.13", "26.12"],
    champions: ["Ahri", "Jinx"],
    roles: ["Top", "Jungle", "Mid", "Bot", "Support"],
    years: [2026, 2025, 2024, 2013],
  });
});

afterEach(cleanup);

describe("rendering", () => {
  it("renders a row per returned player", async () => {
    renderExplorer();
    expect(await screen.findByText("Faker")).toBeInTheDocument();
    expect(screen.getByText("Gogoing")).toBeInTheDocument();
  });

  it("shows canonical games and the W-L record", async () => {
    renderExplorer();
    expect(await screen.findByText("Faker")).toBeInTheDocument();
    const row = within(rowFor("Faker"));
    expect(row.getByText("620")).toBeInTheDocument();
    expect(row.getByText("410-210")).toBeInTheDocument();
    expect(row.getByText("66.1%")).toBeInTheDocument();
  });

  it("renders every missing statistic as an em dash and never as zero", async () => {
    renderExplorer();
    await screen.findByText("Gogoing");
    const cells = within(rowFor("Gogoing")).getAllByRole("cell");
    // player, games, W-L, win% are real; the remaining seven are unknown.
    expect(cells[3]).toHaveTextContent("75.0%");
    const missing = cells.slice(4).map((c) => c.textContent);
    expect(missing).toEqual(["—", "—", "—", "—", "—", "—", "—"]);
    expect(missing).not.toContain("0");
    expect(missing).not.toContain("0.00");
  });

  it("keeps the canonical win rate for a player with no statistics", async () => {
    renderExplorer();
    await screen.findByText("Gogoing");
    expect(within(rowFor("Gogoing")).getByText("75.0%")).toBeInTheDocument();
  });

  it("distinguishes a perfect KDA from a missing one", async () => {
    getProPlayerStats.mockResolvedValue(response([PERFECT, UNENRICHED]));
    renderExplorer();
    await screen.findByText("Chi");
    expect(within(rowFor("Chi")).getByText("Perfect")).toBeInTheDocument();
    expect(within(rowFor("Gogoing")).queryByText("Perfect")).not.toBeInTheDocument();
  });

  it("reports partial coverage without claiming the games are missing entirely", async () => {
    renderExplorer();
    expect(await screen.findByText(/detailed stats for 540 of 648 games/i)).toBeInTheDocument();
  });

  it("renders the compact aggregate strip", async () => {
    renderExplorer();
    // Scoped to the strip: "KDA" and "Gold/min" are also column headers.
    const strip = within(
      (await screen.findByText("Players")).closest("div")!
        .parentElement as HTMLElement,
    );
    expect(strip.getByText("Player-games")).toBeInTheDocument();
    expect(strip.getByText("KDA")).toBeInTheDocument();
    expect(strip.getByText("Gold/min")).toBeInTheDocument();
  });

  it("keeps the stat-backed count out of the headline strip", async () => {
    // It is a caveat, not a statistic about players, and the pager already
    // states it in words. As a bare tile it read as a data-quality readout.
    renderExplorer();
    await screen.findByText("Players");
    expect(screen.queryByText("With stats")).not.toBeInTheDocument();
  });
});

describe("default scope is visible", () => {
  const withFilters = (over: Record<string, unknown>) =>
    response([ENRICHED], {
      filters: {
        year: null, league: null, patch: null, role: null,
        player: null, team: null, champion: null, ...over,
      },
    } as never);

  it("shows the year the server actually used when the URL names none", async () => {
    // THE DEFECT THIS GUARDS. An unscoped request is served as the latest
    // season. Reading the select from the URL alone left it saying "All"
    // above rows that were a single season -- the control contradicted the
    // table it sat on.
    renderExplorer();
    await screen.findByText("Faker");
    expect(screen.getByLabelText("Year")).toHaveValue("2026");
    expect(screen.getByText(/showing the latest season/i)).toBeInTheDocument();
  });

  it("says nothing when the caller scoped the year itself", async () => {
    getProPlayerStats.mockResolvedValue(withFilters({ year: 2024 }));
    renderExplorer("/lol/pro-play?year=2024");
    await screen.findByText("Faker");
    expect(screen.getByLabelText("Year")).toHaveValue("2024");
    expect(
      screen.queryByText(/showing the latest season/i),
    ).not.toBeInTheDocument();
  });

  it("shows All when the server did not narrow the year", async () => {
    // Reachable: another filter bounds the query, so no default is applied
    // and every season really is in scope.
    getProPlayerStats.mockResolvedValue(
      withFilters({ league: "LoL Champions Korea" }),
    );
    renderExplorer("/lol/pro-play?league=LoL%20Champions%20Korea");
    await screen.findByText("Faker");
    expect(screen.getByLabelText("Year")).toHaveValue("");
    expect(
      screen.queryByText(/showing the latest season/i),
    ).not.toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows an empty state rather than an empty table", async () => {
    getProPlayerStats.mockResolvedValue(
      response([], {
        total_rows: 0,
        total_pages: 0,
        aggregates: {
          players: 0,
          games: 0,
          stat_backed_games: 0,
          kda: null,
          cs_per_min: null,
          gold_per_min: null,
        },
        coverage: {
          games: 0,
          stat_backed_games: 0,
          missing_stat_games: 0,
          stat_coverage_pct: null,
        },
      }),
    );
    renderExplorer();
    expect(await screen.findByText(/no players match these filters/i)).toBeInTheDocument();
  });

  it("surfaces a failure with a retry", async () => {
    getProPlayerStats.mockRejectedValue(new Error("Pro Play statistics are unavailable."));
    renderExplorer();
    expect(await screen.findByText(/statistics are unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders a loading skeleton before the first response", () => {
    getProPlayerStats.mockReturnValue(new Promise(() => {}));
    const { container } = renderExplorer();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});

describe("url state", () => {
  it("reads its initial query from the URL", async () => {
    renderExplorer("/lol/pro-play?view=players&year=2025&league=LoL%20Champions%20Korea&role=Mid");
    await waitFor(() => expect(getProPlayerStats).toHaveBeenCalled());
    expect(getProPlayerStats.mock.calls[0][0]).toMatchObject({
      year: 2025,
      league: "LoL Champions Korea",
      role: "Mid",
    });
  });

  it("writes a filter change into the URL", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Mid" } });
    await waitFor(() => expect(lastSearch).toContain("role=Mid"));
  });

  it("resets to page 1 when a filter changes", async () => {
    renderExplorer("/lol/pro-play?page=4");
    await screen.findByText("Faker");
    fireEvent.change(screen.getByLabelText("League"), {
      target: { value: "Tencent LoL Pro League" },
    });
    await waitFor(() => expect(lastSearch).not.toContain("page=4"));
  });

  it("sorts by a column and records it in the URL", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    fireEvent.click(screen.getByRole("button", { name: /KDA/i }));
    await waitFor(() => expect(lastSearch).toContain("sort=kda"));
    expect(lastSearch).toContain("dir=desc");
    await waitFor(() =>
      expect(getProPlayerStats).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "kda", dir: "desc" }),
        expect.anything(),
      ),
    );
  });

  it("toggles direction when the active column is clicked again", async () => {
    renderExplorer("/lol/pro-play?sort=kda&dir=desc");
    await screen.findByText("Faker");
    fireEvent.click(screen.getByRole("button", { name: /KDA/i }));
    await waitFor(() => expect(lastSearch).toContain("dir=asc"));
  });

  it("requests the next page without losing the filters", async () => {
    getProPlayerStats.mockResolvedValue(
      response([ENRICHED], { total_rows: 60, total_pages: 3, page: 1 }),
    );
    renderExplorer("/lol/pro-play?role=Mid");
    await screen.findByText("Faker");
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastSearch).toContain("page=2"));
    expect(lastSearch).toContain("role=Mid");
  });
});
