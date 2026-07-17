import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeagueDocsProData from "./LeagueDocsProData";

function coveragePayload() {
  return {
    ok: true,
    total_champions: 170,
    scope_definitions: { "all-imported": "All imported pro games." },
    years: [
      {
        year: 2026,
        coverage_status: "complete",
        jobs: { total: 170, done: 170, pending: 0, failed: 0, skipped_not_released: 0, other: 0 },
        data: {
          game_rows: 146000, pick_rows: 15000, ban_rows: 15000, unique_champions: 151,
          min_match_date: "2026-01-14 08:13:00", max_match_date: "2026-07-10 09:58:00",
          patch_null_rows: 0, patch_null_pct: 0,
        },
        scoped_stats: { "all-imported": 151 },
        caveats: [],
      },
    ],
  };
}

function explorerPayload() {
  return {
    ok: true,
    filters: {},
    coverage: { year: null, coverage_status: null, is_current_year: false, data_as_of: "2026-07-10 09:58:00" },
    summary: {
      distinct_games: 1512, picks: 15114, bans: 15113, unique_champions: 151, unique_players: 322,
      unique_teams: 56, tournaments: 20, earliest_match_date: "2026-01-14 08:13:00", latest_match_date: "2026-07-10 09:58:00",
    },
    mode: "aggregate",
    rows: [{ champion: "Varus", slug: "varus", picks: 248, bans: 936, presence_games: 1184, wins: 131, losses: 117, win_rate: 52.82, unique_players: 75, unique_teams: 55 }],
    pagination: { page: 1, page_size: 25, total_rows: 151, total_pages: 7 },
    filter_options: {
      scopes: [{ name: "all-imported", label: "All imported" }], years: [2026], event_types: ["all"], results: ["all"],
      sides: ["Blue", "Red"], page_sizes: [10, 25, 50, 100], roles: [], patches: [], tournaments: [], teams: [],
    },
  };
}

function linkCoveragePayload() {
  return {
    ok: true,
    schema_version: 1,
    projection_status: "healthy",
    queried_at: "2026-07-17T00:00:00Z",
    active_links: 1150,
    deactivated_links: 0,
    eligible_source_games: 1203,
    linked_games: 1150,
    known_unlinked_games: 53,
    missing_or_inconsistent_games: 0,
    outside_validated_scope_games: 6266,
    coverage_rate: 0.955943,
    league_breakdown: [
      {
        league: "LCK", league_name: "LoL Champions Korea",
        source_games: 349, linked_games: 349, known_unlinked_games: 0, coverage_rate: 1.0,
      },
    ],
    tournament_breakdown: [
      {
        league: "LCS", tournament: "LCS 2026 Lock-In",
        source_games: 59, linked_games: 37, unlinked_games: 22,
      },
    ],
    known_residual_acknowledged: true,
    problems: [],
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body } as Response;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/docs/pro/link-coverage")) return jsonResponse(linkCoveragePayload());
      if (url.includes("/api/docs/pro/coverage")) return jsonResponse(coveragePayload());
      if (url.includes("/api/docs/pro/champions")) return jsonResponse({ ok: true, champions: [] });
      if (url.includes("/api/docs/pro/explorer")) return jsonResponse(explorerPayload());
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function renderPage(initialPath = "/lol/docs/pro") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationProbe />
        <LeagueDocsProData />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LeagueDocsProData view switcher", () => {
  it("opens on the Overview view by default", async () => {
    renderPage();
    const overviewTab = screen.getByRole("tab", { name: /Overview/i });
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
    // Overview content renders once coverage loads.
    expect(await screen.findByText("Data by year")).toBeInTheDocument();
  });

  it("renders the Source verification section on the overview", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Source verification" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/1,150 of 1,203 eligible games cross-verified/),
    ).toBeInTheDocument();
  });

  it("switches to Explorer, updates the URL, and renders the explorer", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /Explorer/i }));
    await waitFor(() => expect(lastSearch).toContain("view=explorer"));
    // Lazy-loaded explorer surfaces its Filters + summary.
    expect(await screen.findByText("Distinct games")).toBeInTheDocument();
  });

  it("restores the Explorer view from ?view=explorer in the URL", async () => {
    renderPage("/lol/docs/pro?view=explorer");
    const explorerTab = screen.getByRole("tab", { name: /Explorer/i });
    expect(explorerTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Distinct games")).toBeInTheDocument();
  });
});
