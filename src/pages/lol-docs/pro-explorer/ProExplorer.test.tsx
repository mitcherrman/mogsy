import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProExplorer from "./ProExplorer";

// --- Fake API payloads ------------------------------------------------------

function championsPayload() {
  return {
    ok: true,
    champions: [
      { champion: "Ahri", slug: "ahri", years_with_data: 2, first_year: 2015, last_year: 2026, pick_rows: 4, ban_rows: 1 },
      { champion: "Varus", slug: "varus", years_with_data: 1, first_year: 2026, last_year: 2026, pick_rows: 9, ban_rows: 9 },
    ],
  };
}

function explorerPayload(url: string) {
  const isRaw = url.includes("mode=raw");
  const year = /year=(\d{4})/.exec(url)?.[1] ?? null;
  const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? "1");
  const coverage = year
    ? { year: Number(year), coverage_status: "complete", is_current_year: year === "2026", data_as_of: "2026-07-10 09:58:00" }
    : { year: null, coverage_status: null, is_current_year: false, data_as_of: "2026-07-10 09:58:00" };

  const rows = isRaw
    ? [
        {
          game_id: "g1", match_date: "2026-06-01 10:00:00", tournament: "LCK Summer", league: "LoL Champions Korea",
          region: "KR", patch: "16.13", champion: "Ahri", slug: "ahri", event_type: "pick", player: "Faker",
          role: "Mid", team: "T1", opponent: "GEN", side: "Blue", result: "win", source: "Leaguepedia",
          source_url: "https://lol.fandom.com/x",
        },
      ]
    : [
        {
          champion: "Varus", slug: "varus", picks: 248, bans: 936, presence_games: 1184, wins: 131,
          losses: 117, win_rate: 52.82, unique_players: 75, unique_teams: 55,
        },
      ];

  return {
    ok: true,
    filters: {},
    coverage,
    summary: {
      distinct_games: 1512, picks: 15114, bans: 15113, unique_champions: 151, unique_players: 322,
      unique_teams: 56, tournaments: 20, earliest_match_date: "2026-01-14 08:13:00", latest_match_date: "2026-07-10 09:58:00",
    },
    mode: isRaw ? "raw" : "aggregate",
    rows,
    pagination: { page, page_size: 25, total_rows: 40, total_pages: 2 },
    filter_options: {
      scopes: [
        { name: "all-imported", label: "All imported" },
        { name: "major", label: "Major leagues" },
        { name: "international", label: "International" },
      ],
      years: [2026, 2015],
      event_types: ["all", "pick", "ban"],
      results: ["all", "win", "loss"],
      sides: ["Blue", "Red"],
      page_sizes: [10, 25, 50, 100],
      roles: ["Mid", "Bot"],
      patches: ["16.13"],
      tournaments: ["LCK Summer"],
      teams: ["T1", "GEN"],
    },
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Error", json: async () => body } as Response;
}

type FetchMode = "ok" | "error";
let fetchMode: FetchMode = "ok";

beforeEach(() => {
  fetchMode = "ok";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/docs/pro/champions")) return jsonResponse(championsPayload());
      if (url.includes("/api/docs/pro/explorer")) {
        if (fetchMode === "error") return jsonResponse({ detail: "boom" }, false, 500);
        return jsonResponse(explorerPayload(url));
      }
      return jsonResponse({}, false, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// --- Render helper ----------------------------------------------------------

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function renderExplorer(initialPath = "/lol/docs/pro?view=explorer"): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationProbe />
        <ProExplorer />
      </MemoryRouter>
    </QueryClientProvider>
  );
  render(ui);
}

// --- Tests ------------------------------------------------------------------

describe("ProExplorer", () => {
  it("shows a loading skeleton before data resolves", () => {
    renderExplorer();
    expect(screen.getByLabelText("Loading explorer results")).toBeInTheDocument();
  });

  it("renders summary metrics and the aggregate table by default", async () => {
    renderExplorer();
    expect(await screen.findByText("Distinct games")).toBeInTheDocument();
    // aggregate-only column header
    expect(screen.getByRole("button", { name: /Presence/i })).toBeInTheDocument();
    // champion cell is a link (distinct from the "Varus" champion-filter option)
    expect(await screen.findByRole("link", { name: "Varus" })).toBeInTheDocument();
  });

  it("restores filters from the URL (year + scope + raw mode)", async () => {
    renderExplorer("/lol/docs/pro?view=explorer&year=2026&scope=major&mode=raw");
    await screen.findByText("Distinct games");
    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe("2026");
    expect((screen.getByLabelText("Scope") as HTMLSelectElement).value).toBe("major");
    // raw-only column
    expect(screen.getByText("Opponent")).toBeInTheDocument();
  });

  it("toggling to Raw events updates the URL and shows raw columns", async () => {
    renderExplorer();
    await screen.findByText("Distinct games");
    fireEvent.click(screen.getByRole("button", { name: "Raw events" }));
    await waitFor(() => expect(lastSearch).toContain("mode=raw"));
    expect(await screen.findByText("Opponent")).toBeInTheDocument();
  });

  it("paginates: Next advances the page in the URL", async () => {
    renderExplorer();
    await screen.findByText("Distinct games");
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => expect(lastSearch).toContain("page=2"));
  });

  it("shows the live-snapshot banner for the current year", async () => {
    renderExplorer("/lol/docs/pro?view=explorer&year=2026");
    expect(await screen.findByText("Live snapshot")).toBeInTheDocument();
  });

  it("renders an empty state when no rows match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/docs/pro/champions")) return jsonResponse(championsPayload());
        const payload = explorerPayload(url);
        payload.rows = [];
        payload.pagination = { page: 1, page_size: 25, total_rows: 0, total_pages: 0 };
        return jsonResponse(payload);
      }),
    );
    renderExplorer();
    expect(await screen.findByText("No rows match these filters.")).toBeInTheDocument();
  });

  it("renders an error state when the request fails", async () => {
    fetchMode = "error";
    renderExplorer();
    expect(await screen.findByText(/Couldn't load explorer results/i)).toBeInTheDocument();
  });

  it("reset filters clears filter params from the URL", async () => {
    renderExplorer("/lol/docs/pro?view=explorer&year=2026&scope=major");
    await screen.findByText("Distinct games");
    fireEvent.click(screen.getByRole("button", { name: /Reset filters/i }));
    await waitFor(() => {
      expect(lastSearch).not.toContain("year=");
      expect(lastSearch).not.toContain("scope=");
    });
    // view is preserved
    expect(lastSearch).toContain("view=explorer");
  });
});
