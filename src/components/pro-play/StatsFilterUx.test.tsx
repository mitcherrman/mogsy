/**
 * The Stats Explorer's filter controls and its first-load state.
 *
 * OWNER-REPORTED PRODUCTION DEFECTS, one describe block each:
 *
 *   1. a slow first load looked like an empty table rather than a loading one,
 *      with filters reading "All" before they could be used;
 *   2. League was a native <select> over 323 leagues keyed by formal names
 *      ("LoL Champions Korea") nobody types;
 *   3. finding a player, team, champion, league or event meant knowing which
 *      control to open first (PSE-UNIFY: one universal search now).
 *
 * The load-bearing assertions are the ones about IDENTITY: a search result
 * must put the canonical `player_lp_page` / `team_key` / `league_slug` into
 * the URL, never the display name. Two players in the real corpus share the
 * handle "Doran", and "LCK" is not a stored league.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProStatsExplorer from "./ProStatsExplorer";
import { rankOptions } from "./FilterCombobox";
import type { ProStatsPlayerRow, ProStatsResponse } from "@/lib/pro-play/statsApi";
import type {
  ExplorerGroup,
  ExplorerResult,
  ProStatsCompetition,
} from "@/lib/pro-play/explorerSearch";

vi.mock("@/hooks/useChampionAssets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useChampionAssets")>()),
  useChampionAssets: () => ({ data: { ok: true, champions: {} } }),
}));

const getProStats = vi.fn();
const getProStatsFilterOptions = vi.fn();
// MOCK THE FUNCTION THE COMPONENT CALLS, not the fetch underneath it.
const lookupExplorer = vi.fn();

vi.mock("@/lib/pro-play/statsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pro-play/statsApi")>();
  return {
    ...actual,
    getProStats: (...a: unknown[]) => getProStats(...a),
    getProStatsFilterOptions: (...a: unknown[]) => getProStatsFilterOptions(...a),
  };
});

vi.mock("@/lib/pro-play/explorerSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pro-play/explorerSearch")>();
  return {
    ...actual,
    lookupExplorer: (...a: unknown[]) => lookupExplorer(...a),
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

function result(
  kind: ExplorerResult["kind"],
  key: string,
  label: string,
  filters: ExplorerResult["filters"],
  extra: Partial<ExplorerResult> = {},
): ExplorerResult {
  return {
    kind, key, label, filters, match_type: "exact",
    has_profile: kind === "player" || kind === "team" || kind === "champion",
    ...extra,
  };
}

const GROUP_LABEL: Record<ExplorerResult["kind"], string> = {
  player: "Players", team: "Teams", champion: "Champions", league: "Leagues", event: "Events",
};

function lookupOf(...results: ExplorerResult[]) {
  const groups: ExplorerGroup[] = [];
  for (const r of results) {
    let g = groups.find((x) => x.kind === r.kind);
    if (!g) {
      g = { kind: r.kind, label: GROUP_LABEL[r.kind], results: [] };
      groups.push(g);
    }
    g.results.push(r);
  }
  return { schema_version: 1, query: "", groups };
}

const COMPETITIONS: ProStatsCompetition[] = [
  { slug: "Tencent LoL Pro League", code: "LPL", name: "Tencent LoL Pro League", region: "China", kind: "league", tier: 0, note: null, curated: true, games: 9000, first_year: 2013, last_year: 2026 },
  { slug: "LoL Champions Korea", code: "LCK", name: "LoL Champions Korea", region: "Korea", kind: "league", tier: 0, note: null, curated: true, games: 8000, first_year: 2015, last_year: 2026 },
  { slug: "World Championship", code: "Worlds", name: "World Championship", region: "International", kind: "event", tier: 0, note: null, curated: true, games: 1200, first_year: 2011, last_year: 2025 },
];

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

let navigateTo: (delta: number) => void = () => {};
function HistoryProbe() {
  const navigate = useNavigate();
  navigateTo = (delta) => navigate(delta);
  return null;
}

function renderExplorer(entry = "/lol/pro-play") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/lol/pro-play"
            element={<><ProStatsExplorer /><LocationProbe /><HistoryProbe /></>}
          />
          <Route path="/lol/pro-play/player/:key" element={<div>player profile page</div>} />
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
  const trigger = screen.getByRole("combobox", { name });
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
  lookupExplorer.mockReset();
  getProStats.mockResolvedValue(response([ROW]));
  getProStatsFilterOptions.mockResolvedValue({
    schema_version: 1, leagues: LEAGUES, patches: ["26.13"],
    champions: ["Ahri"], roles: ["Mid"], years: [2026, 2025],
  });
  lookupExplorer.mockResolvedValue(lookupOf());
});

const LEAGUE = "League / Event";

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
    expect(await screen.findByRole("status")).toHaveTextContent(/Loading player statistics/i);
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
    await openFilter(LEAGUE);
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
    await openFilter(LEAGUE);
    expect(within(menu()).getByPlaceholderText(/LCK, LPL, Worlds/i)).toBeInTheDocument();
    expect(optionTexts()).toContain("World Championship");
  });

  it("bounds the option list so it can scroll internally", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter(LEAGUE);
    // The cap is what stops 323 leagues covering the viewport.
    const list = menu().querySelector("[cmdk-list]");
    expect(list?.className).toMatch(/max-h-/);
  });

  it("filters live as the user types, without Enter", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter(LEAGUE);
    typeInto(within(menu()).getByPlaceholderText(/LCK, LPL, Worlds/i), "wo");
    await waitFor(() => expect(optionTexts()).not.toContain("Arabian League"));
    expect(optionTexts()[1]).toBe("World Championship");
  });

  it("selecting a league writes it to the URL and closes the menu", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter(LEAGUE);
    pick(within(menu()).getByRole("option", { name: /World Championship/ }));
    await waitFor(() => expect(lastSearch).toContain("league=World+Championship"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers All, which clears the league", async () => {
    renderExplorer("/lol/pro-play?league=World%20Championship");
    await screen.findByText("Faker");
    await openFilter(LEAGUE);
    pick(within(menu()).getByRole("option", { name: /^All$/ }));
    await waitFor(() => expect(lastSearch).not.toContain("league="));
  });

  it("is keyboard navigable", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter(LEAGUE);
    const input = within(menu()).getByPlaceholderText(/LCK, LPL, Worlds/i);
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
      screen.getByRole("combobox", { name: LEAGUE }),
    ).toHaveTextContent("World Championship");
  });
});

// ---------------------------------------------------------------------------
// 3. Loading model — never "ready" before it is
// ---------------------------------------------------------------------------

const searchBox = () => screen.getByTestId("explorer-search-input");

function typeSearch(text: string) {
  fireEvent.focus(searchBox());
  fireEvent.change(searchBox(), { target: { value: text } });
}

async function searchAndPick(text: string, label: RegExp) {
  typeSearch(text);
  const panel = await screen.findByTestId("explorer-search-panel");
  const option = await within(panel).findByRole("option", { name: label });
  fireEvent.click(option);
}

describe("loading model", () => {
  it("says Loading… on filters whose options have not arrived, and disables them", async () => {
    getProStatsFilterOptions.mockReturnValue(new Promise(() => {}));
    renderExplorer();
    await screen.findByText("Faker");
    for (const label of ["Patch", "Role"]) {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      expect(select).toBeDisabled();
      expect(select.options[0].textContent).toBe("Loading…");
      expect(within(select).queryByText("All")).not.toBeInTheDocument();
    }
    expect(screen.getByRole("combobox", { name: LEAGUE })).toHaveTextContent("Loading…");
    // Min. games has a fixed list: usable at once.
    expect(screen.getByLabelText("Min. games")).not.toBeDisabled();
  });

  it("shows a value already in the URL while its option list loads", async () => {
    getProStatsFilterOptions.mockReturnValue(new Promise(() => {}));
    renderExplorer("/lol/pro-play?patch=26.13");
    await screen.findByText("Faker");
    expect(screen.getByLabelText("Patch")).toHaveValue("26.13");
  });

  it("the Year control never says All while the table is still loading", async () => {
    getProStats.mockReturnValue(new Promise(() => {}));
    getProStatsFilterOptions.mockReturnValue(new Promise(() => {}));
    renderExplorer();
    const year = (await screen.findByLabelText("Year")) as HTMLSelectElement;
    expect(year.options[year.selectedIndex].textContent).toBe("Loading…");
  });

  it("the filter controls come alive once options arrive", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    await waitFor(() => expect(screen.getByLabelText("Patch")).not.toBeDisabled());
    expect((screen.getByLabelText("Patch") as HTMLSelectElement).options[0].textContent).toBe("All");
  });

  it("marks the table loading, then ready, then empty — never confusing them", async () => {
    let release: (v: unknown) => void = () => {};
    getProStats.mockReturnValueOnce(new Promise((r) => { release = r; }));
    renderExplorer();
    const table = await screen.findByTestId("stats-table");
    expect(table).toHaveAttribute("data-state", "loading");
    expect(screen.getByTestId("stats-table-loading")).toHaveTextContent(/Loading player statistics/i);
    expect(screen.queryByTestId("stats-table-empty")).not.toBeInTheDocument();
    release(response([ROW]));
    await waitFor(() => expect(table).toHaveAttribute("data-state", "ready"));
  });

  it("zero results is its own state, with a way out", async () => {
    getProStats.mockResolvedValue(response([]));
    renderExplorer("/lol/pro-play?patch=26.13");
    const empty = await screen.findByTestId("stats-table-empty");
    expect(empty).toHaveTextContent(/No players match these filters/);
    expect(empty).toHaveTextContent(/The data loaded/);
    expect(screen.getByTestId("stats-table")).toHaveAttribute("data-state", "empty");
    fireEvent.click(within(empty).getByRole("button", { name: /Clear all filters/i }));
    await waitFor(() => expect(lastSearch).not.toContain("patch="));
  });

  it("an error is its own state, distinct from loading and from empty", async () => {
    getProStats.mockRejectedValue(new Error("Statistics are unavailable right now."));
    renderExplorer();
    const err = await screen.findByTestId("stats-table-error");
    expect(err).toHaveTextContent(/Couldn’t load player statistics/);
    expect(screen.getByTestId("stats-table")).toHaveAttribute("data-state", "error");
    expect(screen.queryByTestId("stats-table-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stats-skeleton-row")).not.toBeInTheDocument();
    expect(within(err).getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("marks stale rows as updating while a new filter loads", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    getProStats.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("Min. games"), { target: { value: "10" } });
    expect(await screen.findByTestId("stats-table-updating")).toBeInTheDocument();
    expect(screen.getByTestId("stats-table")).toHaveAttribute("data-state", "updating");
    expect(screen.getByText("Faker")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Universal search
// ---------------------------------------------------------------------------

describe("universal search", () => {
  it("is usable before the statistics table has answered", async () => {
    getProStats.mockReturnValue(new Promise(() => {}));
    getProStatsFilterOptions.mockReturnValue(new Promise(() => {}));
    lookupExplorer.mockResolvedValue(
      lookupOf(result("player", "Faker", "Faker", { player: "Faker" }, { hint: "Mid · T1 · 1,400 games" })),
    );
    renderExplorer();
    expect(screen.getByTestId("stats-table")).toHaveAttribute("data-state", "loading");
    expect(searchBox()).not.toBeDisabled();
    await searchAndPick("Faker", /Faker/);
    await waitFor(() => expect(new URLSearchParams(lastSearch).get("player")).toBe("Faker"));
  });

  it("is the page's only search box, with the universal placeholder", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    expect(screen.getAllByTestId("explorer-search-input")).toHaveLength(1);
    expect(searchBox()).toHaveAttribute(
      "placeholder",
      "Search players, teams, champions, leagues, events…",
    );
    // The old per-field entity pickers are gone.
    expect(screen.queryByRole("combobox", { name: "Player" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Team" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Champion")).not.toBeInTheDocument();
  });

  it("asks nothing for an empty box", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    fireEvent.focus(searchBox());
    await new Promise((r) => setTimeout(r, 200));
    expect(lookupExplorer).not.toHaveBeenCalled();
  });

  it("groups results by kind and labels each group", async () => {
    lookupExplorer.mockResolvedValue(
      lookupOf(
        result("league", "LoL Champions Korea", "LCK", { league: "LoL Champions Korea" }, { hint: "Korea · LoL Champions Korea · 2015–2026" }),
        result("player", "Faker", "Faker", { player: "Faker" }),
      ),
    );
    renderExplorer();
    await screen.findByText("Faker");
    typeSearch("LCK");
    const panel = await screen.findByTestId("explorer-search-panel");
    expect(await within(panel).findByText("Leagues")).toBeInTheDocument();
    expect(within(panel).getByText("Players")).toBeInTheDocument();
    expect(within(panel).getByText(/Korea · LoL Champions Korea/)).toBeInTheDocument();
    expect(lookupExplorer.mock.calls.at(-1)?.[0]).toBe("LCK");
  });

  it.each([
    ["Faker", result("player", "Faker", "Faker", { player: "Faker" }), "player", "Faker"],
    ["Gen.G", result("team", "Gen.G", "Gen.G", { team: "Gen.G" }), "team", "Gen.G"],
    ["Ahri", result("champion", "Ahri", "Ahri", { champion: "Ahri" }), "champion", "Ahri"],
    ["LCK", result("league", "LoL Champions Korea", "LCK", { league: "LoL Champions Korea" }), "league", "LoL Champions Korea"],
    ["LPL", result("league", "Tencent LoL Pro League", "LPL", { league: "Tencent LoL Pro League" }), "league", "Tencent LoL Pro League"],
    ["Worlds", result("event", "World Championship", "Worlds", { league: "World Championship" }), "league", "World Championship"],
  ])("%s applies its canonical filter", async (query, hit, param, value) => {
    lookupExplorer.mockResolvedValue(lookupOf(hit));
    renderExplorer();
    await screen.findByText("Faker");
    await searchAndPick(query, new RegExp(hit.label.replace(".", "\\.")));
    await waitFor(() => expect(new URLSearchParams(lastSearch).get(param)).toBe(value));
    await waitFor(() =>
      expect(getProStats.mock.calls.at(-1)?.[1]).toMatchObject({ [param]: value }),
    );
    expect(new URLSearchParams(lastSearch).get("page")).toBeNull();
  });

  it("an event edition applies the event AND its year", async () => {
    lookupExplorer.mockResolvedValue(
      lookupOf(result("event", "World Championship|2025", "Worlds 2025", { league: "World Championship", year: 2025 })),
    );
    getProStatsFilterOptions.mockResolvedValue({
      schema_version: 1, leagues: LEAGUES, patches: [], champions: [], roles: [], years: [2026, 2025],
      competitions: COMPETITIONS,
    });
    renderExplorer();
    await screen.findByText("Faker");
    await searchAndPick("Worlds 2025", /Worlds 2025/);
    await waitFor(() => {
      const params = new URLSearchParams(lastSearch);
      expect(params.get("league")).toBe("World Championship");
      expect(params.get("year")).toBe("2025");
    });
    expect(await screen.findByTestId("active-filter-league")).toHaveTextContent(/Event\s*Worlds/);
    expect(screen.getByTestId("active-filter-year")).toHaveTextContent(/Year\s*2025/);
  });

  it("writes the CANONICAL key and shows the friendly name on the chip", async () => {
    lookupExplorer.mockResolvedValue(
      lookupOf(result("player", "Doran (Choi Hyeon-joon)", "Doran", { player: "Doran (Choi Hyeon-joon)" }, { hint: "Top · T1 · 893 games" })),
    );
    renderExplorer();
    await screen.findByText("Faker");
    await searchAndPick("Do", /Doran/);
    await waitFor(() =>
      expect(new URLSearchParams(lastSearch).get("player")).toBe("Doran (Choi Hyeon-joon)"),
    );
    expect(screen.getByTestId("active-filter-player")).toHaveTextContent(/Player\s*Doran/);
  });

  it("is keyboard operable: arrows move, Enter applies", async () => {
    lookupExplorer.mockResolvedValue(
      lookupOf(
        result("player", "Faker", "Faker", { player: "Faker" }),
        result("player", "Fate (Yoo Su-hyeok)", "Fate", { player: "Fate (Yoo Su-hyeok)" }),
      ),
    );
    renderExplorer();
    await screen.findByText("Faker");
    typeSearch("Fa");
    await screen.findByRole("option", { name: /Fate/ });
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    await waitFor(() =>
      expect(new URLSearchParams(lastSearch).get("player")).toBe("Fate (Yoo Su-hyeok)"),
    );
  });

  it("offers each entity's profile without forcing navigation", async () => {
    lookupExplorer.mockResolvedValue(
      lookupOf(
        result("player", "Faker", "Faker", { player: "Faker" }),
        result("league", "LoL Champions Korea", "LCK", { league: "LoL Champions Korea" }, { has_profile: false }),
      ),
    );
    renderExplorer();
    await screen.findByText("Faker");
    typeSearch("F");
    const panel = await screen.findByTestId("explorer-search-panel");
    await within(panel).findByRole("option", { name: /Faker/ });
    const profiles = within(panel).getAllByTestId("explorer-search-profile");
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toHaveAttribute("href", "/lol/pro-play/player/Faker");
    expect(within(panel).getByTestId("explorer-search-all")).toHaveAttribute(
      "href",
      "/lol/pro-play/search?q=F",
    );
  });

  it("says so when nothing matches", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    typeSearch("zzqq");
    expect(await screen.findByTestId("explorer-search-empty")).toHaveTextContent(/zzqq/);
  });

  it("says so when search is down, and the table is unaffected", async () => {
    lookupExplorer.mockRejectedValue(new Error("down"));
    renderExplorer();
    await screen.findByText("Faker");
    typeSearch("Faker");
    expect(await screen.findByTestId("explorer-search-error")).toBeInTheDocument();
    expect(screen.getByTestId("stats-table")).toHaveAttribute("data-state", "ready");
  });
});

// ---------------------------------------------------------------------------
// 5. Active filters, URL, history
// ---------------------------------------------------------------------------

describe("active filters", () => {
  beforeEach(() => {
    getProStatsFilterOptions.mockResolvedValue({
      schema_version: 1, leagues: LEAGUES, patches: ["26.13"],
      champions: ["Ahri"], roles: ["Top", "Jungle", "Mid", "Bot", "Support"], years: [2026, 2025],
      competitions: COMPETITIONS,
    });
  });

  it("shows every filter in the URL as a chip, leagues by their common name", async () => {
    renderExplorer("/lol/pro-play?league=LoL%20Champions%20Korea&year=2026&player=Faker&role=Bot&min_games=10");
    await screen.findByText("Faker", { selector: "a[data-testid='player-profile-link']" });
    expect(await screen.findByTestId("active-filter-league")).toHaveTextContent(/League\s*LCK/);
    expect(screen.getByTestId("active-filter-year")).toHaveTextContent(/Year\s*2026/);
    expect(screen.getByTestId("active-filter-player")).toHaveTextContent(/Player\s*Faker/);
    expect(screen.getByTestId("active-filter-role")).toHaveTextContent(/Role\s*Bot \(ADC\)/);
    expect(screen.getByTestId("active-filter-min_games")).toHaveTextContent(/10\+/);
    // Refresh-safe: the request carries the canonical values.
    expect(getProStats.mock.calls.at(-1)?.[1]).toMatchObject({
      league: "LoL Champions Korea", year: 2026, player: "Faker", role: "Bot", minGames: 10,
    });
  });

  it("the defaulted season is visible but not a removable filter", async () => {
    renderExplorer();
    expect(await screen.findByTestId("active-filter-default-year")).toHaveTextContent(/Latest season · 2026/);
    expect(screen.queryByTestId("active-filter-year")).not.toBeInTheDocument();
  });

  it("removing a chip removes exactly that filter", async () => {
    renderExplorer("/lol/pro-play?league=LoL%20Champions%20Korea&player=Faker");
    const chip = await screen.findByTestId("active-filter-player");
    fireEvent.click(within(chip).getByRole("button", { name: /Remove Player Faker/ }));
    await waitFor(() => {
      const params = new URLSearchParams(lastSearch);
      expect(params.get("player")).toBeNull();
      expect(params.get("league")).toBe("LoL Champions Korea");
    });
  });

  it("Clear all removes every filter and keeps the view", async () => {
    renderExplorer("/lol/pro-play?view=teams&league=LoL%20Champions%20Korea&team=T1");
    await screen.findByTestId("active-filter-team");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(lastSearch).toBe("?view=teams"));
  });

  it("an entity chip links to that entity's profile", async () => {
    renderExplorer("/lol/pro-play?player=Faker");
    const chip = await screen.findByTestId("active-filter-player");
    expect(within(chip).getByRole("link", { name: "Faker" })).toHaveAttribute(
      "href",
      "/lol/pro-play/player/Faker",
    );
  });

  it("Back and Forward walk the search-applied filters", async () => {
    lookupExplorer.mockImplementation(async (q: string) =>
      q.startsWith("F")
        ? lookupOf(result("player", "Faker", "Faker", { player: "Faker" }))
        : lookupOf(result("league", "LoL Champions Korea", "LCK", { league: "LoL Champions Korea" })),
    );
    renderExplorer();
    await screen.findByText("Faker");
    await searchAndPick("Faker", /Faker/);
    await waitFor(() => expect(lastSearch).toContain("player=Faker"));
    await searchAndPick("LCK", /LCK/);
    await waitFor(() => expect(lastSearch).toContain("league="));
    act(() => navigateTo(-1));
    await waitFor(() => {
      expect(lastSearch).toContain("player=Faker");
      expect(lastSearch).not.toContain("league=");
    });
    act(() => navigateTo(1));
    await waitFor(() => expect(lastSearch).toContain("league="));
  });
});

// ---------------------------------------------------------------------------
// 6. One View selector, League-native names
// ---------------------------------------------------------------------------

describe("view and naming", () => {
  it("has exactly one Players / Teams / Champions control", async () => {
    renderExplorer();
    await screen.findByText("Faker");
    const tablists = screen.getAllByRole("tablist");
    expect(tablists).toHaveLength(1);
    expect(within(tablists[0]).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Players",
      "Teams",
      "Champions",
    ]);
    expect(screen.getByTestId("stats-view-selector")).toBe(tablists[0]);
  });

  it("lists leagues by the name a reader uses, and still matches the official one", async () => {
    getProStatsFilterOptions.mockResolvedValue({
      schema_version: 1, leagues: LEAGUES, patches: [], champions: [], roles: [], years: [2026],
      competitions: COMPETITIONS,
    });
    renderExplorer();
    await screen.findByText("Faker");
    await openFilter(LEAGUE);
    expect(within(menu()).getByRole("option", { name: /^LCK/ })).toHaveTextContent(
      /Korea · LoL Champions Korea · 2015–2026/,
    );
    typeInto(within(menu()).getByPlaceholderText(/LCK, LPL, Worlds/i), "champions korea");
    await waitFor(() => expect(optionTexts().some((t) => t.startsWith("LCK"))).toBe(true));
    pick(within(menu()).getByRole("option", { name: /^LCK/ }));
    await waitFor(() =>
      expect(new URLSearchParams(lastSearch).get("league")).toBe("LoL Champions Korea"),
    );
  });

  it("labels Bot as Bot (ADC) and still sends Bot", async () => {
    getProStatsFilterOptions.mockResolvedValue({
      schema_version: 1, leagues: [], patches: [], champions: [],
      roles: ["Top", "Jungle", "Mid", "Bot", "Support"], years: [2026],
    });
    renderExplorer();
    await screen.findByText("Faker");
    const role = await screen.findByLabelText("Role");
    await waitFor(() => expect(within(role).getByText("Bot (ADC)")).toBeInTheDocument());
    fireEvent.change(role, { target: { value: "Bot" } });
    await waitFor(() => expect(new URLSearchParams(lastSearch).get("role")).toBe("Bot"));
  });
});
