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

vi.mock("@/hooks/useChampionAssets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useChampionAssets")>()),
  useChampionAssets: () => ({
    data: { ok: true, champions: { Ryze: { icon: "assets/ryze.png" } } },
  }),
}));

const getProStats = vi.fn();
const getProStatsFilterOptions = vi.fn();

/** The component calls getProStats(view, query, signal). These helpers keep
 *  the assertions reading about the QUERY, which is what they are about. */
const lastQuery = () => getProStats.mock.calls.at(-1)?.[1];
const firstQuery = () => getProStats.mock.calls[0]?.[1];
const lastView = () => getProStats.mock.calls.at(-1)?.[0];

vi.mock("@/lib/pro-play/statsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pro-play/statsApi")>();
  return {
    ...actual,
    getProStats: (...args: unknown[]) => getProStats(...args),
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
      min_games: 0,
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
  getProStats.mockReset();
  getProStatsFilterOptions.mockReset();
  getProStats.mockResolvedValue(response([ENRICHED, UNENRICHED]));
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
    getProStats.mockResolvedValue(response([PERFECT, UNENRICHED]));
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
    // Anchored on "Player-games": "Players" is now also the view-switcher
    // button, and "KDA"/"Gold/min" are also column headers.
    const strip = within(
      await screen.findByRole("group", { name: "Players summary" }),
    );
    expect(strip.getByText("Players")).toBeInTheDocument();
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
        player: null, team: null, champion: null, min_games: 0, ...over,
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
    getProStats.mockResolvedValue(withFilters({ year: 2024 }));
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
    getProStats.mockResolvedValue(
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
    getProStats.mockResolvedValue(
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
    getProStats.mockRejectedValue(new Error("Pro Play statistics are unavailable."));
    renderExplorer();
    expect(await screen.findByText(/statistics are unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders a loading skeleton before the first response", () => {
    getProStats.mockReturnValue(new Promise(() => {}));
    const { container } = renderExplorer();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});

describe("url state", () => {
  it("reads its initial query from the URL", async () => {
    renderExplorer("/lol/pro-play?view=players&year=2025&league=LoL%20Champions%20Korea&role=Mid");
    await waitFor(() => expect(getProStats).toHaveBeenCalled());
    expect(firstQuery()).toMatchObject({
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
      expect(lastQuery()).toMatchObject({ sort: "kda", dir: "desc" }),
    );
  });

  it("toggles direction when the active column is clicked again", async () => {
    renderExplorer("/lol/pro-play?sort=kda&dir=desc");
    await screen.findByText("Faker");
    fireEvent.click(screen.getByRole("button", { name: /KDA/i }));
    await waitFor(() => expect(lastSearch).toContain("dir=asc"));
  });

  it("requests the next page without losing the filters", async () => {
    getProStats.mockResolvedValue(
      response([ENRICHED], { total_rows: 60, total_pages: 3, page: 1 }),
    );
    renderExplorer("/lol/pro-play?role=Mid");
    await screen.findByText("Faker");
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(lastSearch).toContain("page=2"));
    expect(lastSearch).toContain("role=Mid");
  });
});


describe("min games", () => {
  it("renders the control and defaults to Any", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    const control = screen.getByLabelText("Min Games");
    expect(control).toBeInTheDocument();
    expect(control).toHaveValue("");
    expect(within(control as HTMLSelectElement).getByText("Any")).toBeInTheDocument();
    // Never a silent floor: the request must carry no minimum.
    expect(firstQuery().minGames).toBeNull();
  });

  it("offers the documented thresholds", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    const control = within(screen.getByLabelText("Min Games") as HTMLSelectElement);
    for (const label of ["5+", "10+", "20+", "50+"]) {
      expect(control.getByText(label)).toBeInTheDocument();
    }
  });

  it("sends the floor and records it in the URL", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    fireEvent.change(screen.getByLabelText("Min Games"), {
      target: { value: "20" },
    });
    await waitFor(() => expect(lastSearch).toContain("min_games=20"));
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ minGames: 20 }),
    );
  });

  it("resets to page 1 when the floor changes", async () => {
    renderExplorer("/lol/pro-play?page=4");
    await screen.findByText("Faker");
    fireEvent.change(screen.getByLabelText("Min Games"), {
      target: { value: "10" },
    });
    await waitFor(() => expect(lastSearch).not.toContain("page=4"));
    expect(lastSearch).toContain("min_games=10");
  });

  it("clears back to Any", async () => {
    renderExplorer("/lol/pro-play?min_games=50");
    await screen.findByText("Faker");
    expect(screen.getByLabelText("Min Games")).toHaveValue("50");
    fireEvent.change(screen.getByLabelText("Min Games"), {
      target: { value: "" },
    });
    await waitFor(() => expect(lastSearch).not.toContain("min_games"));
  });

  it("keeps the other filters when the floor changes", async () => {
    renderExplorer("/lol/pro-play?year=2025&role=Mid&sort=kda&dir=desc");
    await screen.findByText("Faker");
    fireEvent.change(screen.getByLabelText("Min Games"), {
      target: { value: "20" },
    });
    await waitFor(() => expect(lastSearch).toContain("min_games=20"));
    expect(lastSearch).toContain("year=2025");
    expect(lastSearch).toContain("role=Mid");
    expect(lastSearch).toContain("sort=kda");
  });

  it("reads a floor straight out of the URL", async () => {
    renderExplorer("/lol/pro-play?min_games=20&sort=win_rate&dir=desc");
    await waitFor(() => expect(getProStats).toHaveBeenCalled());
    expect(firstQuery()).toMatchObject({
      minGames: 20,
      sort: "win_rate",
    });
  });
});


// ---------------------------------------------------------------- Teams view

const TEAM_ROW = {
  team: "T1",
  games: 101,
  wins: 70,
  losses: 31,
  win_rate: 0.693,
  stat_backed_games: 101,
  kills_per_game: 17.78,
  deaths_per_game: 14.82,
  gold_per_min: 2024.09,
  damage_per_min: 3004.8,
  towers_per_game: 6.9,
  dragons_per_game: 2.45,
  barons_per_game: 0.81,
};

/** A pre-statistics team: canonical record, nothing else. */
const TEAM_BARE = {
  ...TEAM_ROW,
  team: "CGN Esports",
  games: 43,
  wins: 37,
  losses: 6,
  win_rate: 0.86,
  stat_backed_games: 0,
  kills_per_game: null,
  deaths_per_game: null,
  gold_per_min: null,
  damage_per_min: null,
  towers_per_game: null,
  dragons_per_game: null,
  barons_per_game: null,
};

function teamsResponse(rows = [TEAM_ROW, TEAM_BARE], over = {}) {
  return {
    ...response([]),
    view: "teams",
    rows,
    total_rows: rows.length,
    sort: "games",
    aggregates: {
      teams: rows.length,
      games: 144,
      stat_backed_games: 101,
      win_rate: 0.5,
      kills_per_game: 17.8,
      towers_per_game: 6.9,
      gold_per_min: 2024,
    },
    ...over,
  } as never;
}

describe("teams view", () => {
  it("renders the view switcher with every view", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Players",
      "Teams",
      "Champions",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("defaults to Players when the URL names no view", async () => {
    renderExplorer();
    await waitFor(() => expect(getProStats).toHaveBeenCalled());
    expect(lastView()).toBe("players");
  });

  it("selects Teams from the URL and calls the teams endpoint", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    await screen.findByText("T1");
    expect(lastView()).toBe("teams");
    expect(screen.getByRole("tab", { name: "Teams" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders the Teams columns", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    await screen.findByText("T1");
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Team", "Games", "W-L", "Win %", "Kills/G", "Gold/min",
      "Towers/G", "Dragons/G", "Barons/G",
    ]);
  });

  it("renders a team with no statistics as em dashes, never zero", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    await screen.findByText("CGN Esports");
    const cells = within(
      screen.getByText("CGN Esports").closest("tr") as HTMLTableRowElement,
    ).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("43");
    expect(cells[2]).toHaveTextContent("37-6");
    expect(cells[3]).toHaveTextContent("86.0%");
    const rates = cells.slice(4).map((c) => c.textContent);
    expect(rates).toEqual(["—", "—", "—", "—", "—"]);
    expect(rates).not.toContain("0");
  });

  it("shows the Teams strip, not the Players one", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    await screen.findByText("T1");
    const strip = within(
      await screen.findByRole("group", { name: "Teams summary" }),
    );
    expect(strip.getByText("Teams")).toBeInTheDocument();
    expect(strip.getByText("Team-games")).toBeInTheDocument();
    expect(screen.queryByText("Player-games")).not.toBeInTheDocument();
    // Win rate is deliberately absent: both sides of every game sit at 50%.
    expect(strip.queryByText("Win %")).not.toBeInTheDocument();
  });

  it("counts teams, not players, in the pager", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    expect(await screen.findByText(/2 teams/)).toBeInTheDocument();
  });
});

describe("switching views", () => {
  it("writes the view to the URL and resets the page", async () => {
    renderExplorer("/lol/pro-play?page=4");
    await screen.findByText("Faker");
    getProStats.mockResolvedValue(teamsResponse());
    fireEvent.click(screen.getByRole("tab", { name: "Teams" }));
    await waitFor(() => expect(lastSearch).toContain("view=teams"));
    expect(lastSearch).not.toContain("page=4");
  });

  it("keeps filters that mean the same thing on both sides", async () => {
    renderExplorer("/lol/pro-play?year=2025&league=LoL%20Champions%20Korea&min_games=20");
    await screen.findByText("Faker");
    getProStats.mockResolvedValue(teamsResponse());
    fireEvent.click(screen.getByRole("tab", { name: "Teams" }));
    await waitFor(() => expect(lastSearch).toContain("view=teams"));
    expect(lastSearch).toContain("year=2025");
    expect(lastSearch).toContain("league=LoL+Champions+Korea");
    expect(lastSearch).toContain("min_games=20");
  });

  it("drops a sort the new view has no column for", async () => {
    // `kda` is Players-only; sending it to /teams would be a 400.
    renderExplorer("/lol/pro-play?sort=kda&dir=desc");
    await screen.findByText("Faker");
    getProStats.mockResolvedValue(teamsResponse());
    fireEvent.click(screen.getByRole("tab", { name: "Teams" }));
    await waitFor(() => expect(lastSearch).toContain("view=teams"));
    expect(lastSearch).not.toContain("sort=kda");
    await waitFor(() => expect(lastQuery()?.sort).toBe("games"));
  });

  it("keeps a sort both views share", async () => {
    renderExplorer("/lol/pro-play?sort=win_rate&dir=desc");
    await screen.findByText("Faker");
    getProStats.mockResolvedValue(teamsResponse());
    fireEvent.click(screen.getByRole("tab", { name: "Teams" }));
    await waitFor(() => expect(lastSearch).toContain("view=teams"));
    expect(lastSearch).toContain("sort=win_rate");
  });

  it("never sends a Players sort to the teams endpoint", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams&sort=kda");
    await screen.findByText("T1");
    expect(lastQuery()?.sort).toBe("games");
  });

  it("sorts by a Teams column", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    await screen.findByText("T1");
    fireEvent.click(screen.getByRole("button", { name: /Dragons\/G/i }));
    await waitFor(() => expect(lastSearch).toContain("sort=dragons_per_game"));
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ sort: "dragons_per_game", dir: "desc" }),
    );
  });

  it("applies Min Games in the teams request", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    await screen.findByText("T1");
    fireEvent.change(screen.getByLabelText("Min Games"), {
      target: { value: "20" },
    });
    await waitFor(() => expect(lastQuery()).toMatchObject({ minGames: 20 }));
    expect(lastView()).toBe("teams");
  });

  it("shows the effective year the teams endpoint returned", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams");
    await screen.findByText("T1");
    expect(screen.getByLabelText("Year")).toHaveValue("2026");
    expect(screen.getByText(/showing the latest season/i)).toBeInTheDocument();
  });
});


// ----------------------------------------------------------- Champions view

const CHAMP_ROW = {
  champion: "Ryze",
  picks: 1566,
  picked_games: 1566,
  wins: 784,
  losses: 782,
  win_rate: 0.5006,
  stat_backed_games: 1400,
  kills: 4200,
  deaths: 3800,
  assists: 8400,
  kda: 3.32,
  cs_per_min: 8.8,
  gold_per_min: 402.1,
  damage_per_min: 640.5,
  bans: 1586,
  presence_games: 3152,
  draft_games: 6394,
  presence_rate: 0.4930,
};

/** A pre-draft, pre-statistics champion: picks only. */
const CHAMP_BARE = {
  ...CHAMP_ROW,
  champion: "Urgot",
  picks: 4,
  picked_games: 4,
  wins: 3,
  losses: 1,
  win_rate: 0.75,
  stat_backed_games: 0,
  kills: null,
  deaths: null,
  assists: null,
  kda: null,
  cs_per_min: null,
  gold_per_min: null,
  damage_per_min: null,
  bans: 0,
  presence_games: 4,
  draft_games: 0,
  presence_rate: null,
};

function championsResponse(rows = [CHAMP_ROW, CHAMP_BARE], over = {}) {
  return {
    ...response([]),
    view: "champions",
    rows,
    total_rows: rows.length,
    sort: "picks",
    aggregates: {
      champions: rows.length,
      picks: 1570,
      bans: 1586,
      draft_games: 6394,
      stat_backed_games: 1400,
      kda: 3.32,
      cs_per_min: 8.8,
      gold_per_min: 402,
      damage_per_min: 640,
    },
    ...over,
  } as never;
}

describe("champions view", () => {
  it("selects Champions from the URL and calls that endpoint", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    expect(lastView()).toBe("champions");
    expect(screen.getByRole("tab", { name: "Champions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders the Champions columns", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual([
      "Champion", "Picks", "W-L", "Win %", "Bans", "Presence",
      "KDA", "CS/min", "Gold/min", "Dmg/min",
    ]);
  });

  it("keeps picks and bans in separate columns", async () => {
    // The whole point of the view: they have different denominators and are
    // never merged into one "appearances" number.
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    const cells = within(
      screen.getByText("Ryze").closest("tr") as HTMLTableRowElement,
    ).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("1,566");   // picks
    expect(cells[4]).toHaveTextContent("1,586");   // bans
    expect(cells[5]).toHaveTextContent("49.3%");   // presence
  });

  it("renders a champion with no draft or statistics as em dashes", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Urgot");
    const cells = within(
      screen.getByText("Urgot").closest("tr") as HTMLTableRowElement,
    ).getAllByRole("cell");
    expect(cells[3]).toHaveTextContent("75.0%");   // canonical win rate real
    expect(cells[5]).toHaveTextContent("—");       // no draft coverage
    expect(cells.slice(6).map((c) => c.textContent)).toEqual([
      "—", "—", "—", "—",
    ]);
  });

  it("renders champion identity with an icon", async () => {
    getProStats.mockResolvedValue(championsResponse());
    const { container } = renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    const cell = screen.getByText("Ryze").closest("td") as HTMLElement;
    expect(cell).toHaveTextContent("Ryze");
    const img = cell.querySelector("img");
    expect(img).toBeTruthy();
    // Decorative: the name beside it is the accessible content.
    expect(img).toHaveAttribute("alt", "");
    expect(container).toBeTruthy();
  });

  it("shows the Champions strip", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    const strip = within(
      await screen.findByRole("group", { name: "Champions summary" }),
    );
    expect(strip.getByText("Champions")).toBeInTheDocument();
    expect(strip.getByText("Picks")).toBeInTheDocument();
    expect(strip.getByText("Bans")).toBeInTheDocument();
  });

  it("counts champions in the pager", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    expect(await screen.findByText(/2 champions/)).toBeInTheDocument();
  });

  it("shows the effective year the endpoint returned", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    expect(screen.getByLabelText("Year")).toHaveValue("2026");
  });

  it("passes Min Games through", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    fireEvent.change(screen.getByLabelText("Min Games"), {
      target: { value: "20" },
    });
    await waitFor(() => expect(lastQuery()).toMatchObject({ minGames: 20 }));
    expect(lastView()).toBe("champions");
  });

  it("sorts by bans", async () => {
    getProStats.mockResolvedValue(championsResponse());
    renderExplorer("/lol/pro-play?view=champions");
    await screen.findByText("Ryze");
    fireEvent.click(screen.getByRole("button", { name: /^Bans$/i }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: "bans" }));
  });

  it("drops a Teams-only sort when switching to Champions", async () => {
    getProStats.mockResolvedValue(teamsResponse());
    renderExplorer("/lol/pro-play?view=teams&sort=towers_per_game&dir=desc");
    await screen.findByText("T1");
    getProStats.mockResolvedValue(championsResponse());
    fireEvent.click(screen.getByRole("tab", { name: "Champions" }));
    await waitFor(() => expect(lastSearch).toContain("view=champions"));
    expect(lastSearch).not.toContain("towers_per_game");
    await waitFor(() => expect(lastQuery()?.sort).toBe("picks"));
  });

  it("keeps a sort all three views share", async () => {
    renderExplorer("/lol/pro-play?sort=win_rate&dir=desc");
    await screen.findByText("Faker");
    getProStats.mockResolvedValue(championsResponse());
    fireEvent.click(screen.getByRole("tab", { name: "Champions" }));
    await waitFor(() => expect(lastSearch).toContain("view=champions"));
    expect(lastSearch).toContain("sort=win_rate");
  });

  it("keeps filters across a switch to Champions", async () => {
    renderExplorer("/lol/pro-play?year=2025&role=Mid&min_games=10");
    await screen.findByText("Faker");
    getProStats.mockResolvedValue(championsResponse());
    fireEvent.click(screen.getByRole("tab", { name: "Champions" }));
    await waitFor(() => expect(lastSearch).toContain("view=champions"));
    expect(lastSearch).toContain("year=2025");
    expect(lastSearch).toContain("role=Mid");
    expect(lastSearch).toContain("min_games=10");
  });
});

/**
 * "Graph this" — the hand-off into Explore Pro Data.
 *
 * These tests are about the component's CHOICE of scope, not the URL shape
 * (`graphHandoff.test.ts` owns that). The load-bearing one is the last:
 * the link is built from the filters the SERVER echoed, so it can never be
 * scoped to something other than the rows sitting underneath it.
 */
describe("Graph this", () => {
  const link = () => screen.queryByRole("link", { name: /^Graph / });

  it("is absent over a ranking with no single subject", async () => {
    renderExplorer("/lol/pro-play?view=players&year=2026");
    await screen.findByText("Faker");
    expect(link()).toBeNull();
  });

  it("appears once the scope names a player, and carries the scope", async () => {
    getProStats.mockResolvedValue(
      response([ENRICHED], {
        filters: {
          year: 2026,
          league: "LoL Champions Korea",
          patch: null,
          role: null,
          player: "Faker",
          team: null,
          champion: null,
          min_games: 0,
        },
      }),
    );
    renderExplorer("/lol/pro-play?view=players&year=2026&league=LoL%20Champions%20Korea&player=Faker");
    const action = await screen.findByRole("link", { name: "Graph Faker in Explore Pro Data" });
    const href = action.getAttribute("href")!;
    expect(href.startsWith("/lol/pro-play/graphs?")).toBe(true);
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("focus")).toBe("player");
    expect(q.get("e")).toBe("Faker");
    expect(q.get("league")).toBe("LoL Champions Korea");
    expect(q.get("from")).toBe("2026-01-01");
  });

  it("names the filters that stayed with the table", async () => {
    getProStats.mockResolvedValue(
      response([ENRICHED], {
        filters: {
          year: 2026,
          league: null,
          patch: null,
          role: "Mid",
          player: "Faker",
          team: null,
          champion: null,
          min_games: 20,
        },
      }),
    );
    renderExplorer("/lol/pro-play?view=players&player=Faker&role=Mid&min_games=20");
    await screen.findByRole("link", { name: /^Graph Faker/ });
    const note = screen.getByText(/Staying\s+with the table/);
    expect(note.textContent).toContain("Role Mid");
    expect(note.textContent).toContain("Min games 20");
  });

  it("leaves the table in history, so Back returns to the filtered view", async () => {
    getProStats.mockResolvedValue(
      response([ENRICHED], {
        filters: {
          year: 2026, league: null, patch: null, role: null,
          player: "Faker", team: null, champion: null, min_games: 0,
        },
      }),
    );
    renderExplorer("/lol/pro-play?view=players&player=Faker");
    const action = await screen.findByRole("link", { name: /^Graph Faker/ });
    // A plain <Link> pushes. `replace` would consume the table's own entry and
    // strand the reader on the hub with no filters when they went back.
    expect(action.getAttribute("data-replace")).toBeNull();
    expect(action.tagName).toBe("A");
  });

  it("follows the SERVER's filters, not the URL's", async () => {
    // The URL names a player the request has not been made with yet (the text
    // field debounces). Building the link from the URL would offer a graph of
    // someone the table is not showing.
    getProStats.mockResolvedValue(
      response([ENRICHED], {
        filters: {
          year: 2026, league: null, patch: null, role: null,
          player: null, team: null, champion: null, min_games: 0,
        },
      }),
    );
    renderExplorer("/lol/pro-play?view=players&player=Faker");
    await screen.findByText("Faker");
    expect(link()).toBeNull();
  });
});
