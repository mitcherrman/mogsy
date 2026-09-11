/**
 * The Stats Explorer's filter controls and its first-load state.
 *
 * THREE OWNER-REPORTED PRODUCTION DEFECTS, one describe block each:
 *
 *   1. a slow first load looked like an empty table rather than a loading one;
 *   2. League was a native <select> over 323 leagues, so opening it covered
 *      the viewport and could not be searched;
 *   3. Player and Team looked like search boxes and produced no suggestions,
 *      so only someone who already knew the canonical spelling could use them.
 *
 * The load-bearing assertions are the ones about IDENTITY: a suggestion must
 * put the canonical `player_lp_page` / `team_key` into the URL, never the
 * display name. Two players in the real corpus share the handle "Doran".
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProStatsExplorer from "./ProStatsExplorer";
import { rankOptions } from "./FilterCombobox";
import type { ProStatsPlayerRow, ProStatsResponse } from "@/lib/pro-play/statsApi";
import type { SearchResult } from "@/lib/pro-play/researchApi";

vi.mock("@/hooks/useChampionAssets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useChampionAssets")>()),
  useChampionAssets: () => ({ data: { ok: true, champions: {} } }),
}));

const getProStats = vi.fn();
const getProStatsFilterOptions = vi.fn();
// MOCK THE FUNCTION THE COMPONENT CALLS, not the one underneath it.
// `searchEntitySuggestions` calls `searchEntities` through a module-internal
// reference, so mocking the latter does nothing at all.
const searchEntitySuggestions = vi.fn();

vi.mock("@/lib/pro-play/statsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pro-play/statsApi")>();
  return {
    ...actual,
    getProStats: (...a: unknown[]) => getProStats(...a),
    getProStatsFilterOptions: (...a: unknown[]) => getProStatsFilterOptions(...a),
  };
});

vi.mock("@/lib/pro-play/researchApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pro-play/researchApi")>();
  return {
    ...actual,
    searchEntitySuggestions: (...a: unknown[]) => searchEntitySuggestions(...a),
  };
});

/** The real corpus holds 323 leagues; enough here to prove ranking and scroll. */
const LEAGUES = [
  "Tencent LoL Pro League",
  "LoL Champions Korea",
  "World Championship",
  "Esports World Cup",
  "Vietnam Championship Series",
  "Arabian League",
];

const ROW: ProStatsPlayerRow = {
  player: "Faker", games: 620, wins: 410, losses: 210, win_rate: 0.66,
  stat_backed_games: 540, kills: 1850, deaths: 1200, assists: 3400,
  kda: 4.37, cs_per_min: 8.9, gold_per_min: 412, damage_per_min: 601,
};

function response(rows: ProStatsPlayerRow[]): ProStatsResponse {
  return {
    schema_version: 1, view: "players", rows, page: 1, page_size: 25,
    total_rows: rows.length, total_pages: 1, sort: "games", dir: "desc",
    filters: { year: 2026, league: null, patch: null, role: null, player: null, team: null, champion: null, min_games: 0 },
    aggregates: { players: rows.length, games: 620, kda: 4.3, cs_per_min: 8.9, gold_per_min: 412 },
    coverage: { games: 620, stat_backed_games: 540, missing_stat_games: 80, stat_coverage_pct: 0.87 },
  };
}

function entity(kind: "player" | "team", key: string, display: string, extra: Partial<SearchResult> = {}): SearchResult {
  return {
    kind, key, display_name: display, handle: display, match_type: "handle",
    matched_on: display, source: "registry_handle", in_registry: true,
    games: 500, last_played_at: null, has_pro_play_facts: true, ...extra,
  } as SearchResult;
}

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function renderExplorer(entry = "/lol/pro-play") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/lol/pro-play" element={<><ProStatsExplorer /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Open one filter by its visible field label.
 *
 *  `fireEvent`, not user-event: it is not a dependency of this repo and the
 *  existing explorer suite drives the same controls this way. Radix opens the
 *  popover on pointerdown, so a bare click() never reaches it. */
function openTrigger(name: string) {
  const trigger = screen.getByRole("combobox", { name: new RegExp(name, "i") });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
}

async function openFilter(name: string) {
  openTrigger(name);
  await screen.findByRole("dialog");
}

/** cmdk items respond to pointer selection the same way. */
function pick(option: HTMLElement) {
  fireEvent.pointerDown(option, { button: 0, pointerType: "mouse" });
  fireEvent.click(option);
}

/** Typing into the cmdk input. */
function typeInto(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

/** cmdk renders the menu in a portal; scope queries to it. */
const menu = () => screen.getByRole("dialog");
const optionTexts = () =>
  within(menu()).getAllByRole("option").map((o) => o.textContent?.trim() ?? "");

beforeEach(() => {
  lastSearch = "";
  getProStats.mockReset();
  getProStatsFilterOptions.mockReset();
  searchEntitySuggestions.mockReset();
  getProStats.mockResolvedValue(response([ROW]));
  getProStatsFilterOptions.mockResolvedValue({
    schema_version: 1, leagues: LEAGUES, patches: ["26.13"],
    champions: ["Ahri"], roles: ["Mid"], years: [2026, 2025],
  });
  searchEntitySuggestions.mockResolvedValue([]);
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// 1. First load
// ---------------------------------------------------------------------------

describe("first load", () => {
  it("shows skeleton rows and a loading strip, never an empty table", async () => {
    // A promise that never settles IS the several-second window the owner saw.
    getProStats.mockReturnValue(new Promise(() => {}));
    renderExplorer();
    await waitFor(() =>
      expect(screen.getAllByTestId("stats-skeleton-row").length).toBeGreaterThan(0),
    );
    expect(screen.getByTestId("stats-strip-loading")).toBeInTheDocument();
    // The defect: "no players match these filters" while nothing had answered.
    expect(screen.queryByText(/No players match/i)).not.toBeInTheDocument();
  });

  it("announces loading to assistive technology", async () => {
    getProStats.mockReturnValue(new Promise(() => {}));
    renderExplorer();
    expect(await screen.findByRole("status")).toHaveTextContent(/Loading players/i);
  });

  it("shows the real empty state only once the request has completed", async () => {
    getProStats.mockResolvedValue(response([]));
    renderExplorer();
    expect(await screen.findByText(/No players match these filters/i)).toBeInTheDocument();
    expect(screen.queryByTestId("stats-skeleton-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stats-strip-loading")).not.toBeInTheDocument();
  });

  it("keeps the previous rows during a refetch instead of flashing empty", async () => {
    renderExplorer();
    expect(await screen.findByText("Faker")).toBeInTheDocument();
    let release: (v: unknown) => void = () => {};
    getProStats.mockReturnValue(new Promise((r) => { release = r; }));
    await openFilter("League");
    pick(within(menu()).getByRole("option", { name: /World Championship/ }));
    // Mid-refetch: the old row is still on screen and no empty state appeared.
    expect(screen.getByText("Faker")).toBeInTheDocument();
    expect(screen.queryByText(/No players match/i)).not.toBeInTheDocument();
    release(response([ROW]));
  });

  it("surfaces an error state distinctly from empty", async () => {
    getProStats.mockRejectedValue(new Error("Statistics are unavailable right now."));
    renderExplorer();
    expect(await screen.findByText(/unavailable right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/No players match/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. League
// ---------------------------------------------------------------------------

describe("league combobox", () => {
  it("ranks prefix matches first — 'wo' surfaces World Championship", () => {
    const options = LEAGUES.map((l) => ({ value: l, label: l }));
    const ranked = rankOptions(options, "wo").map((o) => o.label);
    expect(ranked[0]).toBe("World Championship");
    // A word-start still counts as a prefix to a reader; a mid-word substring
    // would not, and neither belongs above a true prefix.
    expect(ranked).toContain("Esports World Cup");
    expect(ranked).not.toContain("Arabian League");
  });

  it("matches case-insensitively", () => {
    const options = LEAGUES.map((l) => ({ value: l, label: l }));
    expect(rankOptions(options, "WORLD CH")[0].label).toBe("World Championship");
    expect(rankOptions(options, "korea").map((o) => o.label)).toContain("LoL Champions Korea");
  });

  it("opens a searchable menu rather than a native select", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("League");
    expect(within(menu()).getByPlaceholderText(/Search leagues/i)).toBeInTheDocument();
    expect(optionTexts()).toContain("World Championship");
  });

  it("bounds the option list so it can scroll internally", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("League");
    // The cap is what stops 323 leagues covering the viewport.
    const list = menu().querySelector("[cmdk-list]");
    expect(list?.className).toMatch(/max-h-/);
  });

  it("filters live as the user types, without Enter", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("League");
    typeInto(within(menu()).getByPlaceholderText(/Search leagues/i), "wo");
    await waitFor(() => expect(optionTexts()).not.toContain("Arabian League"));
    expect(optionTexts()[1]).toBe("World Championship");
  });

  it("selecting a league writes it to the URL and closes the menu", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("League");
    pick(within(menu()).getByRole("option", { name: /World Championship/ }));
    await waitFor(() => expect(lastSearch).toContain("league=World+Championship"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers All, which clears the league", async () => {
    renderExplorer("/lol/pro-play?league=World%20Championship");
    await screen.findByText("Faker");
    await openFilter("League");
    pick(within(menu()).getByRole("option", { name: /^All$/ }));
    await waitFor(() => expect(lastSearch).not.toContain("league="));
  });

  it("is keyboard navigable", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("League");
    const input = within(menu()).getByPlaceholderText(/Search leagues/i);
    typeInto(input, "wo");
    await waitFor(() => expect(optionTexts()).toContain("World Championship"));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(lastSearch).toMatch(/league=/));
  });

  it("restores the selected league from the URL", async () => {
    renderExplorer("/lol/pro-play?league=World%20Championship");
    await screen.findByText("Faker");
    expect(
      screen.getByRole("combobox", { name: /League/i }),
    ).toHaveTextContent("World Championship");
  });
});

// ---------------------------------------------------------------------------
// 3. Player / Team autocomplete
// ---------------------------------------------------------------------------

describe("entity autocomplete", () => {
  it("asks the canonical entity search, scoped to the kind", async () => {
    searchEntitySuggestions.mockResolvedValue([entity("player", "Doran (Choi Hyeon-joon)", "Doran", { primary_role: "Top", declared_current_team: "T1", games: 893 })]);
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Player");
    typeInto(within(menu()).getByPlaceholderText(/Search player/i), "Do");
    await waitFor(() => expect(searchEntitySuggestions).toHaveBeenCalled());
    expect(searchEntitySuggestions.mock.calls.at(-1)?.[0]).toBe("player");
    expect(searchEntitySuggestions.mock.calls.at(-1)?.[1]).toBe("Do");
  });

  it("typing 'Do' offers Doran, with a line that disambiguates the two of them", async () => {
    searchEntitySuggestions.mockResolvedValue([entity("player", "Doran (Choi Hyeon-joon)", "Doran", { primary_role: "Top", declared_current_team: "T1", games: 893 })]);
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Player");
    typeInto(within(menu()).getByPlaceholderText(/Search player/i), "Do");
    expect(await within(menu()).findByText("Doran")).toBeInTheDocument();
    expect(within(menu()).getByText(/Top · T1 · 893 games/)).toBeInTheDocument();
  });

  it("selecting writes the CANONICAL key, not the display name", async () => {
    searchEntitySuggestions.mockResolvedValue([entity("player", "Doran (Choi Hyeon-joon)", "Doran")]);
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Player");
    typeInto(within(menu()).getByPlaceholderText(/Search player/i), "Do");
    await within(menu()).findByText("Doran");
    pick(within(menu()).getByRole("option", { name: /Doran/ }));
    // THE ASSERTION THIS FILE EXISTS FOR: "Doran" alone is ambiguous and does
    // not match anything in the stats corpus; the lp_page does.
    // Parsed, not string-matched: URLSearchParams encodes a space as "+",
    // so a decodeURIComponent check would compare against the wrong thing.
    await waitFor(() =>
      expect(new URLSearchParams(lastSearch).get("player")).toBe("Doran (Choi Hyeon-joon)"),
    );
    expect(new URLSearchParams(lastSearch).get("player")).not.toBe("Doran");
  });

  it("shows the friendly name on the control once selected", async () => {
    searchEntitySuggestions.mockResolvedValue([entity("player", "Doran (Choi Hyeon-joon)", "Doran")]);
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Player");
    typeInto(within(menu()).getByPlaceholderText(/Search player/i), "Do");
    await within(menu()).findByText("Doran");
    pick(within(menu()).getByRole("option", { name: /Doran/ }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /Player/i })).toHaveTextContent("Doran"),
    );
  });

  it("says 'keep typing' below the contract minimum, never 'none found'", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Player");
    typeInto(within(menu()).getByPlaceholderText(/Search player/i), "D");
    expect(await within(menu()).findByText(/Keep typing/i)).toBeInTheDocument();
    // The search refuses one character; an empty set there is "not asked",
    // and calling it "no players" would be a false claim about 12,000 of them.
    expect(within(menu()).queryByText(/No players found/i)).not.toBeInTheDocument();
    expect(searchEntitySuggestions).not.toHaveBeenCalled();
  });

  it("reports a genuine empty result", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Player");
    typeInto(within(menu()).getByPlaceholderText(/Search player/i), "zzqq");
    expect(await within(menu()).findByText(/No players found/i)).toBeInTheDocument();
  });

  it("a slow early keystroke cannot overwrite a later one", async () => {
    let releaseSlow: (v: unknown) => void = () => {};
    searchEntitySuggestions
      .mockReturnValueOnce(new Promise((r) => { releaseSlow = r; }))
      .mockResolvedValue([entity("player", "Faker", "Faker")]);
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Player");
    const input = within(menu()).getByPlaceholderText(/Search player/i);
    typeInto(input, "Do");
    // Let the first query actually LEAVE. Without this the debounce cancels
    // it and only one request is ever made, so there is no stale response to
    // race and the test proves nothing.
    await waitFor(() => expect(searchEntitySuggestions).toHaveBeenCalledTimes(1));
    typeInto(input, "Fa");
    await waitFor(() => expect(searchEntitySuggestions).toHaveBeenCalledTimes(2));
    await within(menu()).findByRole("option", { name: /Faker/ });
    // The stale response lands last and must be ignored.
    releaseSlow([entity("player", "Doran (Choi Hyeon-joon)", "Doran")]);
    await waitFor(() => expect(within(menu()).queryByText("Doran")).not.toBeInTheDocument());
    expect(within(menu()).getByRole("option", { name: /Faker/ })).toBeInTheDocument();
  });

  it("teams use team_key and offer Gen.G for 'Gen'", async () => {
    searchEntitySuggestions.mockResolvedValue([entity("team", "Gen.G", "Gen.G", { region: "Korea", games: 1035 })]);
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter("Team");
    typeInto(within(menu()).getByPlaceholderText(/Search team/i), "Gen");
    await within(menu()).findByText("Gen.G");
    pick(within(menu()).getByRole("option", { name: /Gen\.G/ }));
    await waitFor(() => expect(lastSearch).toContain("team=Gen.G"));
    expect(searchEntitySuggestions.mock.calls.at(-1)?.[0]).toBe("team");
  });

  it("restores a selected player from the URL, showing the canonical key", async () => {
    renderExplorer("/lol/pro-play?player=Doran%20(Choi%20Hyeon-joon)");
    await screen.findByText("Faker");
    // Cold URL: no remembered label, so the key itself is shown. It is a true
    // name for the entity and unambiguous, which a bare "Doran" would not be.
    expect(screen.getByRole("combobox", { name: /Player/i })).toHaveTextContent(
      "Doran (Choi Hyeon-joon)",
    );
    expect(getProStats.mock.calls[0]?.[1]).toMatchObject({ player: "Doran (Choi Hyeon-joon)" });
  });

  it("restores a selected team from the URL", async () => {
    renderExplorer("/lol/pro-play?team=Gen.G");
    await screen.findByText("Faker");
    expect(screen.getByRole("combobox", { name: /Team/i })).toHaveTextContent("Gen.G");
    expect(getProStats.mock.calls[0]?.[1]).toMatchObject({ team: "Gen.G" });
  });

  it("clearing a selection removes it from the URL", async () => {
    renderExplorer("/lol/pro-play?team=Gen.G");
    await screen.findByText("Faker");
    fireEvent.click(screen.getByRole("button", { name: /^Clear Team$/ }));
    await waitFor(() => expect(lastSearch).not.toContain("team="));
  });
});
