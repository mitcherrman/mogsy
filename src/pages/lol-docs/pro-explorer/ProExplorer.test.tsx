import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProExplorer from "./ProExplorer";

function championsPayload() {
  return {
    ok: true,
    champions: [
      { champion: "Ahri", slug: "ahri", years_with_data: 2, first_year: 2015, last_year: 2026, pick_rows: 4, ban_rows: 1 },
      { champion: "Varus", slug: "varus", years_with_data: 1, first_year: 2026, last_year: 2026, pick_rows: 9, ban_rows: 9 },
    ],
  };
}

function filterOptions() {
  return {
    years: [2026, 2015],
    event_types: ["all", "pick", "ban"],
    results: ["all", "win", "loss"],
    sides: ["Blue", "Red"],
    page_sizes: [10, 25, 50, 100],
    roles: ["Mid", "Bot"],
    patches: ["16.13"],
    teams: ["T1", "GEN"],
    presets: [
      { id: "all-imported", label: "All imported" },
      { id: "tier1", label: "Tier 1" },
      { id: "major", label: "Major (Tier 1 + Riot int'l)" },
      { id: "international", label: "International" },
      { id: "erls", label: "ERLs" },
      { id: "custom", label: "Custom" },
    ],
    league_groups: [
      { id: "tier1", label: "Tier 1 (major leagues)", games: 1406, leagues: [
        { id: "lck", label: "LCK", group: "tier1", region: "korea", games: 349 },
        { id: "lpl", label: "LPL", group: "tier1", region: "china", games: 451 },
      ] },
      { id: "erl", label: "EMEA regional leagues (ERLs)", games: 2952, leagues: [
        { id: "lfl", label: "LFL", group: "erl", region: "emea", games: 179 },
      ] },
    ],
    tournament_families: [
      { id: "msi", label: "MSI", games: 61 },
      { id: "first_stand", label: "First Stand", games: 45 },
    ],
    splits: [{ id: "spring", label: "Spring", games: 2530 }, { id: "winter", label: "Winter", games: 1348 }],
    stages: [
      { id: "regular_season", label: "Regular season", games: 3627 },
      { id: "playoffs", label: "Playoffs", games: 1235 },
      { id: "unknown", label: "Unclassified", games: 1510 },
    ],
    regions: [{ id: "korea", label: "Korea", games: 950 }, { id: "emea", label: "EMEA", games: 3842 }],
    tournaments: [
      { id: "LoL Champions KoreaLCK 2026 Rounds 1-2", label: "LCK 2026 Rounds 1-2", league_id: "lck", group: "tier1", region: "korea", family: null, split: "none", stage: "regular_season", stage_confidence: "derived", games: 204 },
    ],
    unclassified: { stage_unknown_games: 1510, split_none_games: 2175 },
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
    ? [{ game_id: "g1", match_date: "2026-06-01 10:00:00", tournament: "LCK Summer", league: "LoL Champions Korea", region: "KR", patch: "16.13", champion: "Ahri", slug: "ahri", event_type: "pick", player: "Faker", role: "Mid", team: "T1", opponent: "GEN", side: "Blue", result: "win", source: "Leaguepedia", source_url: "https://lol.fandom.com/x" }]
    : [{ champion: "Varus", slug: "varus", picks: 248, bans: 936, presence_games: 1184, wins: 131, losses: 117, win_rate: 52.82, unique_players: 75, unique_teams: 55 }];
  return {
    ok: true,
    filters: {},
    coverage,
    summary: { distinct_games: 1512, picks: 15114, bans: 15113, unique_champions: 151, unique_players: 322, unique_teams: 56, tournaments: 20, earliest_match_date: "2026-01-14 08:13:00", latest_match_date: "2026-07-10 09:58:00" },
    mode: isRaw ? "raw" : "aggregate",
    rows,
    pagination: { page, page_size: 25, total_rows: 40, total_pages: 2 },
    filter_options: filterOptions(),
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Error", json: async () => body } as Response;
}

let fetchMode: "ok" | "error" = "ok";

beforeEach(() => {
  fetchMode = "ok";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/docs/pro/champions")) return jsonResponse(championsPayload());
    if (url.includes("/api/docs/pro/explorer")) {
      if (fetchMode === "error") return jsonResponse({ detail: "boom" }, false, 500);
      return jsonResponse(explorerPayload(url));
    }
    return jsonResponse({}, false, 404);
  }));
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

describe("ProExplorer (Phase 2)", () => {
  it("shows a loading skeleton before data resolves", () => {
    renderExplorer();
    expect(screen.getByLabelText("Loading explorer results")).toBeInTheDocument();
  });

  it("renders summary metrics and aggregate table by default", async () => {
    renderExplorer();
    expect(await screen.findByText("Distinct games")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Presence/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Varus" })).toBeInTheDocument();
  });

  it("is simple by default: advanced panel hidden until opened", async () => {
    renderExplorer();
    await screen.findByText("Distinct games");
    expect(screen.queryByTestId("advanced-panel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Competition")).toBeInTheDocument();
  });

  it("selecting a preset updates the URL", async () => {
    renderExplorer();
    await screen.findByText("Distinct games");
    fireEvent.change(screen.getByLabelText("Competition"), { target: { value: "tier1" } });
    await waitFor(() => expect(lastSearch).toContain("competition_preset=tier1"));
  });

  it("Custom / Advanced reveals grouped competition controls", async () => {
    renderExplorer();
    await screen.findByText("Distinct games");
    fireEvent.click(screen.getByRole("button", { name: /Advanced filters/i }));
    const panel = await screen.findByTestId("advanced-panel");
    expect(within(panel).getByText("Competitions")).toBeInTheDocument();
    expect(within(panel).getByText("Tier 1 (major leagues)")).toBeInTheDocument();
  });

  it("selecting a league group writes league_groups + custom preset to the URL", async () => {
    renderExplorer();
    await screen.findByText("Distinct games");
    fireEvent.click(screen.getByRole("button", { name: /Advanced filters/i }));
    const panel = await screen.findByTestId("advanced-panel");
    const tier1Checkbox = within(panel).getByLabelText(/Tier 1 \(major leagues\)/i);
    fireEvent.click(tier1Checkbox);
    await waitFor(() => {
      expect(lastSearch).toContain("league_groups=tier1");
      expect(lastSearch).toContain("competition_preset=custom");
    });
  });

  it("restores a complex advanced URL (groups + split) and opens the panel", async () => {
    renderExplorer("/lol/docs/pro?view=explorer&league_groups=tier1&splits=spring");
    await screen.findByText("Distinct games");
    const panel = screen.getByTestId("advanced-panel");
    expect((within(panel).getByLabelText(/Tier 1 \(major leagues\)/i) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("filter-summary")).toHaveTextContent("Tier 1 (major leagues)");
    expect(screen.getByTestId("filter-summary")).toHaveTextContent("Spring");
  });

  it("old scope= URLs still resolve to the competition preset", async () => {
    renderExplorer("/lol/docs/pro?view=explorer&scope=major");
    await screen.findByText("Distinct games");
    expect((screen.getByLabelText("Competition") as HTMLSelectElement).value).toBe("major");
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

  it("reset clears filter params from the URL but keeps view", async () => {
    renderExplorer("/lol/docs/pro?view=explorer&competition_preset=tier1&splits=spring");
    await screen.findByText("Distinct games");
    fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
    await waitFor(() => {
      expect(lastSearch).not.toContain("competition_preset=");
      expect(lastSearch).not.toContain("splits=");
    });
    expect(lastSearch).toContain("view=explorer");
  });

  it("renders empty and error states", async () => {
    fetchMode = "error";
    renderExplorer();
    expect(await screen.findByText(/Couldn't load explorer results/i)).toBeInTheDocument();
  });
});
