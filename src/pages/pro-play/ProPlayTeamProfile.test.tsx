/**
 * THE PUBLIC TEAM PROFILE — the canonical competitive identity page for a team.
 *
 * Same two concerns as the player suite (publicization; composition honesty),
 * plus the one that is Team-only and is the single most dangerous thing on
 * this page:
 *
 *   THE MATCHUP EXPLORER ACTION IS GATED ON THE EXPLORER POOL, NEVER ON
 *   worlds_focus.
 *
 * Those two fields agree on T1 and Gen.G and disagree on 22 of the 38 teams
 * the board actually serves. A suite that only tested a focus-set team would
 * pass under either wiring, so the tests below deliberately use KT Rolster —
 * in the pool, NOT in the focus set — and assert the action appears for a
 * team whose `worlds_focus` is null.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProPlayTeamProfile from "./ProPlayTeamProfile";
import { statsExplorerUrl } from "@/lib/pro-play/entityStats";
import { matchupExplorerUrl } from "@/lib/pro-play/matchupHandoff";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));

const requests: { url: string; init?: RequestInit }[] = [];

function statsResponse(row: Record<string, unknown>) {
  return {
    schema_version: 1,
    view: "teams",
    rows: [row],
    page: 1,
    page_size: 1,
    total_rows: 1,
    total_pages: 1,
    sort: "games",
    dir: "desc",
    // Naming a team suppresses the stats route's latest-year default, so the
    // echoed year is null: career, every competition.
    filters: {
      year: null, league: null, patch: null, role: null,
      player: null, team: null, champion: null, min_games: 0,
    },
    aggregates: {},
    coverage: { games: 0, stat_backed_games: 0, missing_stat_games: 0, stat_coverage_pct: null },
  };
}

const FULL_ROW = {
  team: "KT Rolster",
  games: 900,
  wins: 500,
  losses: 400,
  win_rate: 0.5556,
  stat_backed_games: 740,
  kills_per_game: 13.4,
  deaths_per_game: 12.9,
  gold_per_min: 1985,
  damage_per_min: 2140,
  towers_per_game: 6.2,
  dragons_per_game: 2.41,
  barons_per_game: 0.83,
};

/** Canonical games, no statistics at all — a pre-2014 team record. */
const NO_STATS_ROW = {
  team: "KT Rolster",
  games: 40,
  wins: 22,
  losses: 18,
  win_rate: 0.55,
  stat_backed_games: 0,
  kills_per_game: null,
  deaths_per_game: null,
  gold_per_min: null,
  damage_per_min: null,
  towers_per_game: null,
  dragons_per_game: null,
  barons_per_game: null,
};

/** Partial coverage of a DIFFERENT shape: statistics exist, but one metric
 *  family does not. Each team metric has its own non-null denominator, so an
 *  absent column must not blank its neighbours. */
const PARTIAL_ROW = { ...FULL_ROW, barons_per_game: null, dragons_per_game: null };

function scope(id: string, label: string, games: number) {
  return {
    scope: { scope_id: id, kind: "season", label, bounded: true },
    participation: "participated",
    entity_games_in_scope: games,
    tournaments_in_scope: ["LCK 2026 Rounds 1-2"],
    leagues_in_scope: ["LoL Champions Korea"],
    stats: {
      games, wins: 30, losses: games - 30, win_rate: 0.5,
      first_played_at: null, last_played_at: null,
      champion_pool_size: 1,
      top_champions: [{
        key: "Azir", games: 12, wins: 8, losses: 4, win_rate: 0.667,
        first_played_at: "2026-01-16 10:08:00", last_played_at: "2026-07-08 08:52:00",
        champion_share: 0.2,
      }],
      players: [], roles: [],
    },
  };
}

/**
 * KT Rolster: in the Explorer pool, NOT in the Worlds focus set. The whole
 * point of the fixture — `worlds_focus` is null and the action must still
 * appear.
 */
function teamPayload(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: "pro_profile_v1",
    entity: { kind: "team", key: "KT Rolster", display_name: "KT Rolster" },
    identity: { in_registry: true, registry_available: true, short: "KT", region: "Korea" },
    worlds_focus: null,
    explorer_pool: {
      in_explorer_pool: true,
      pool_version: "explorer_pool_v1",
      meaning: "Whether the Matchup Explorer's five-lane board can be built for this team.",
    },
    roster: null,
    roster_error: null,
    roster_note: "Demonstrated roster.",
    comparison: {
      contract_version: "pro_comparison_v1",
      entity: { kind: "team", id: "KT Rolster", display_name: "KT Rolster" },
      league_filter: "MAJOR_PRO",
      scope_order: ["current_2026", "all_time"],
      // 820 curated games, against the stats block's 900 all-competition.
      scopes: { current_2026: scope("current_2026", "2026", 60), all_time: scope("all_time", "All Time", 820) },
    },
    ...overrides,
  };
}

function installFetch(handlers: Array<[(url: string) => boolean, { status?: number; body: unknown }]>) {
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      const match = handlers.find(([test]) => test(url));
      const handler = match?.[1] ?? { status: 404, body: { detail: "Not found." } };
      const status = handler.status ?? 200;
      return { ok: status >= 200 && status < 300, status, json: async () => handler.body } as Response;
    }),
  );
}

const isProfile = (u: string) => u.includes("/api/pro-play/research/team/");
const isStats = (u: string) => u.includes("/api/pro-play/stats/teams");
const KEY = "KT Rolster";

function renderProfile(key = KEY) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[proPlayProfileUrl("team", key)]}>
        <Routes>
          <Route path="/lol/pro-play/team/:key" element={<ProPlayTeamProfile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ok(profile: unknown = teamPayload(), row: Record<string, unknown> = FULL_ROW) {
  installFetch([[isProfile, { body: profile }], [isStats, { body: statsResponse(row) }]]);
}

const SRC = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Publicization
// ---------------------------------------------------------------------------

describe("publicization", () => {
  it("carries no AdminAuthGate and no noindex", () => {
    const src = SRC("pages/pro-play/ProPlayTeamProfile.tsx");
    expect(src).not.toContain("AdminAuthGate");
    expect(src).not.toMatch(/\bnoindex\b/);
  });

  it("requests the profile with no credentials of any kind", async () => {
    ok();
    renderProfile();
    await screen.findByRole("heading", { name: KEY });
    expect(requests.find((r) => isProfile(r.url))?.init?.headers).toBeUndefined();
  });

  it("shows a public not-found state for an unknown team", async () => {
    installFetch([[isProfile, {
      status: 404,
      body: { detail: "team 'Nope' has no canonical games under league_filter='MAJOR_PRO'" },
    }]]);
    renderProfile("Nope");
    const err = await screen.findByTestId("research-error");
    expect(err).toHaveTextContent(/No professional record/i);
    expect(err.textContent).not.toMatch(/admin|sign in|403|league_filter|MAJOR_PRO/i);
  });
});

// ---------------------------------------------------------------------------
// Canonical record and statistics
// ---------------------------------------------------------------------------

describe("team record and performance", () => {
  it("reuses the public teams endpoint filtered to this one team", async () => {
    ok();
    renderProfile();
    await screen.findByTestId("performance-panel");
    const url = requests.find((r) => isStats(r.url))!.url;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("team")).toBe(KEY);
    expect(params.get("year")).toBeNull();
  });

  it("keeps the canonical W-L, over canonical team-games", async () => {
    ok();
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    // 900 canonical, NOT the 740 stat-backed subset.
    expect(within(panel).getByTestId("metric-Games")).toHaveTextContent("900");
    expect(within(panel).getByTestId("metric-W-L")).toHaveTextContent("500–400");
    expect(within(panel).getByTestId("metric-Win %")).toHaveTextContent("55.6%");
  });

  it("renders every rich team metric the Stats Explorer serves", async () => {
    ok();
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(within(panel).getByTestId("metric-Kills/G")).toHaveTextContent("13.4");
    expect(within(panel).getByTestId("metric-Gold/min")).toHaveTextContent("1985");
    expect(within(panel).getByTestId("metric-Towers/G")).toHaveTextContent("6.2");
    expect(within(panel).getByTestId("metric-Dragons/G")).toHaveTextContent("2.4");
    expect(within(panel).getByTestId("metric-Barons/G")).toHaveTextContent("0.83");
  });

  it("labels its scope as the all-competition slice, distinct from the record", async () => {
    ok();
    renderProfile();
    expect(await screen.findByTestId("performance-scope")).toHaveTextContent("All seasons");
    expect(await screen.findByText(/curated major leagues only/i)).toBeInTheDocument();
    // Two headings, two bases -- never presented as one record.
    expect(await screen.findByText("Career Pro Record")).toBeInTheDocument();
    expect(await screen.findByText("All-Competition Performance")).toBeInTheDocument();
  });

  it("states partial coverage in team-games, not games", async () => {
    ok();
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(panel).toHaveTextContent(/740 of 900 team-games/);
  });

  it("blanks only the absent metric family, never its neighbours", async () => {
    // Each team metric has its OWN non-null denominator on the backend, so a
    // team with no recorded barons must still show its kills and towers.
    ok(teamPayload(), PARTIAL_ROW);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(within(panel).getByTestId("metric-Barons/G")).toHaveTextContent("—");
    expect(within(panel).getByTestId("metric-Dragons/G")).toHaveTextContent("—");
    expect(within(panel).getByTestId("metric-Kills/G")).toHaveTextContent("13.4");
    expect(within(panel).getByTestId("metric-Towers/G")).toHaveTextContent("6.2");
  });

  it("renders em dashes — never zero — when no game carries statistics", async () => {
    ok(teamPayload(), NO_STATS_ROW);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(within(panel).getByTestId("metric-W-L")).toHaveTextContent("22–18");
    for (const label of ["Kills/G", "Gold/min", "Towers/G", "Dragons/G", "Barons/G"]) {
      expect(within(panel).getByTestId(`metric-${label}`)).toHaveTextContent("—");
      expect(within(panel).getByTestId(`metric-${label}`)).not.toHaveTextContent("0");
    }
    expect(panel).toHaveTextContent(/absent rather than zero/);
  });

  it("survives a statistics failure without taking the profile down", async () => {
    installFetch([[isProfile, { body: teamPayload() }], [isStats, { status: 500, body: {} }]]);
    renderProfile();
    expect(await screen.findByRole("heading", { name: KEY })).toBeInTheDocument();
    expect(await screen.findByText("Azir")).toBeInTheDocument();
  });

  it("keeps champion usage, which comes from the profile contract", async () => {
    ok();
    renderProfile();
    expect(await screen.findByText("Azir")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// THE MATCHUP EXPLORER GATE — the Team-only hazard
// ---------------------------------------------------------------------------

describe("matchup explorer — navigation deferred, contract retained", () => {
  it("renders NO Matchup action while the Explorer is admin-gated", async () => {
    // NAVIGATION DEFERRED. The profile is public and the Explorer is not, so
    // the action would have dead-ended every signed-out reader on
    // "Sign in required" -- verified in the browser before it was removed.
    ok(teamPayload());
    renderProfile();
    await screen.findByTestId("performance-panel");
    expect(screen.queryByText("Open in Matchup Explorer")).toBeNull();
    // And not replaced by a disabled teaser either.
    expect(screen.queryByText(/matchup/i)).toBeNull();
  });

  it("still publishes the pool marker, so the eligibility contract stays wired", async () => {
    // THE CONTRACT IS RETAINED, ONLY THE NAVIGATION IS DEFERRED. KT Rolster
    // is in the pool and NOT in the focus set -- the case a worlds_focus gate
    // gets wrong for 22 of 38 pool teams -- and the marker must still say so.
    const payload = teamPayload();
    expect(payload.worlds_focus).toBeNull();
    ok(payload);
    renderProfile();
    const marker = await screen.findByTestId("performance-panel");
    expect(marker.querySelector("[data-explorer-pool]")).toHaveAttribute(
      "data-explorer-pool",
      "true",
    );
  });

  it("publishes false for a team outside the pool", async () => {
    ok(teamPayload({
      explorer_pool: { in_explorer_pool: false, pool_version: "explorer_pool_v1", meaning: "…" },
    }));
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(panel.querySelector("[data-explorer-pool]")).toHaveAttribute(
      "data-explorer-pool",
      "false",
    );
  });

  it("publishes false when a team is in the FOCUS SET but not the pool", async () => {
    // The inverse wiring. If the marker read worlds_focus, this would be true.
    ok(teamPayload({
      worlds_focus: {
        team_key: KEY, owner_label: KEY, group: "LCK", status: "watchlist",
        asserts_qualification: false, qualification_evidence: null,
        target_event: "Worlds 2026", meaning: "On Mogzy's watchlist.",
      },
      explorer_pool: { in_explorer_pool: false, pool_version: "explorer_pool_v1", meaning: "…" },
    }));
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(panel.querySelector("[data-explorer-pool]")).toHaveAttribute(
      "data-explorer-pool",
      "false",
    );
  });

  it("publishes false when the payload carries no marker at all", async () => {
    // An older payload must never guess.
    const payload = teamPayload();
    delete (payload as Record<string, unknown>).explorer_pool;
    ok(payload);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(panel.querySelector("[data-explorer-pool]")).toHaveAttribute(
      "data-explorer-pool",
      "false",
    );
  });

  it("never reads worlds_focus as the gate", () => {
    const src = SRC("pages/pro-play/ProPlayTeamProfile.tsx");
    expect(src).toContain("explorer_pool?.in_explorer_pool");
    expect(src).not.toMatch(/worlds_focus[^\n]*\?[^\n]*Matchup/);
  });

  it("keeps the URL builder and its LIVE4 serializer for when the gate lifts", () => {
    const url = matchupExplorerUrl(KEY);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/lol/pro-play/matchup")).toBe(true);
    expect(params.get("mode")).toBe("team");
    expect(params.get("team_a")).toBe(KEY);
    expect(params.get("team_b")).toBeNull();
  });

  it("builds the destination with LIVE4's own serializer", () => {
    const url = matchupExplorerUrl(KEY);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/lol/pro-play/matchup")).toBe(true);
    expect(params.get("mode")).toBe("team");
    expect(params.get("team_a")).toBe(KEY);
    // One side only: the reader has not chosen an opponent.
    expect(params.get("team_b")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Outbound and inbound navigation
// ---------------------------------------------------------------------------

describe("navigation", () => {
  it("links to the team-filtered public stats table", async () => {
    ok();
    renderProfile();
    const link = await screen.findByText("View in Pro Stats");
    expect(link.closest("a")).toHaveAttribute("href", statsExplorerUrl("teams", KEY));
    expect(statsExplorerUrl("teams", KEY)).toContain("view=teams");
  });

  it("links to a valid Team -> Champions graph with no fabricated scope", async () => {
    ok();
    renderProfile();
    const href = (await screen.findByText("Graph champion pool")).closest("a")!.getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/lol/pro-play/graphs")).toBe(true);
    expect(params.get("focus")).toBe("team");
    expect(params.get("vs")).toBe("champions");
    expect(params.get("e")).toBe(KEY);
    // Career-wide panel: no year, league or patch may be invented.
    for (const key of ["from", "to", "league", "patch"]) expect(params.get(key)).toBeNull();
  });

  it("preserves the one-way link out to the roster wiki", async () => {
    ok();
    renderProfile();
    const link = await screen.findByText(/Roster history/);
    expect(link.closest("a")).toHaveAttribute("href", expect.stringContaining("/lol/docs/pro/teams/"));
  });

  it("ships NO Live/Recent link — the identity contract is disproven", async () => {
    // LIVE1's /history team facet is its upstream name, matched exactly, and
    // it does NOT equal canonical team_key: 'kt Rolster' vs 'KT Rolster',
    // 'Dplus KIA' vs 'Dplus Kia', 'eSuba' vs 'ESuba'. Only 5 of 16 live facet
    // values match. A pass-through link yields a plausible-looking EMPTY
    // archive, so none is rendered. See section O of the handoff.
    ok();
    renderProfile();
    await screen.findByTestId("performance-panel");
    // No link anywhere on the page points at the match centre or its archive.
    // (Matched by href, not by text: "Roster history & aliases" is the League
    // Docs link and must survive.)
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => h.includes("/lol/pro-play/live"))).toEqual([]);
    const src = SRC("pages/pro-play/ProPlayTeamProfile.tsx");
    expect(src).not.toContain("live/archive");
    expect(src).not.toContain("PRO_PLAY_LIVE_ARCHIVE_ROUTE");
  });

  it("the Stats Explorer team cell targets the canonical profile route", () => {
    const explorer = SRC("components/pro-play/ProStatsExplorer.tsx");
    expect(explorer).toContain('proPlayProfileUrl("team", name)');
    // Player's link is untouched.
    expect(explorer).toContain('proPlayProfileUrl("player", name)');
  });

  it("Search resolves a team to the same canonical helper", () => {
    expect(proPlayProfileUrl("team", "Gen.G")).toBe("/lol/pro-play/team/Gen.G");
    expect(SRC("pages/pro-play/ProPlaySearch.tsx")).toContain("profilePath");
  });

  it("the Matchup Explorer and dossier still link INTO the profiles", () => {
    expect(SRC("pages/pro-play/ProPlayMatchup.tsx")).toContain("profilePath");
    expect(SRC("components/pro-play/dossier/MatchDossier.tsx")).toContain("profilePath");
  });
});
