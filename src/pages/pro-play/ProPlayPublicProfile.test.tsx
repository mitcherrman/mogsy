/**
 * THE PUBLIC PLAYER PROFILE — the canonical public Pro Play identity page.
 *
 * Two things are under test and they are different in kind:
 *
 * 1. PUBLICIZATION. These pages were admin-gated and are not any more. The
 *    tests below assert that structurally (no AdminAuthGate, no noindex, no
 *    admin credential module in the request path), because a gate that creeps
 *    back turns every inbound link — from the Stats Explorer, from Search —
 *    into a 403 for a signed-out reader.
 *
 * 2. COMPOSITION HONESTY. The profile now renders numbers from TWO public
 *    contracts with DIFFERENT denominators: the comparison contract's four
 *    curated product scopes, and the statistics contract's career-across-every-
 *    competition slice. The tests pin that each block states its own scope and
 *    that a null rate stays an em dash. A KDA printed under a W-L it was not
 *    computed over is the one defect this composition can produce.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProPlayPlayerProfile from "./ProPlayPlayerProfile";
import { statsExplorerUrl } from "@/lib/pro-play/entityStats";
import { graphHandoff } from "@/lib/pro-play/graphHandoff";
import { proPlayProfileUrl } from "@/lib/pro-play/routes";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));

const KEY = "Faker (Lee Sang-hyeok)";

const requests: { url: string; init?: RequestInit }[] = [];

/** A statistics row shaped exactly like `/api/pro-play/stats/players`. */
function statsResponse(
  row: Record<string, unknown>,
  filters: Record<string, unknown> = {},
) {
  return {
    schema_version: 1,
    view: "players",
    rows: [row],
    page: 1,
    page_size: 1,
    total_rows: 1,
    total_pages: 1,
    sort: "games",
    dir: "desc",
    // The EFFECTIVE filters the server used. Naming a player suppresses the
    // route's latest-year default, so `year` comes back null: career.
    filters: {
      year: null,
      league: null,
      patch: null,
      role: null,
      player: KEY,
      team: null,
      champion: null,
      min_games: 0,
      ...filters,
    },
    aggregates: {},
    coverage: {
      games: 0,
      stat_backed_games: 0,
      missing_stat_games: 0,
      stat_coverage_pct: null,
    },
  };
}

const FULL_ROW = {
  player: KEY,
  games: 1000,
  wins: 640,
  losses: 360,
  win_rate: 0.64,
  stat_backed_games: 820,
  kills: 3400,
  deaths: 2100,
  assists: 6200,
  kda: 4.57,
  cs_per_min: 9.12,
  gold_per_min: 412,
  damage_per_min: 731,
};

/** A pre-2014 career: a real canonical record, and no statistics at all. */
const NO_STATS_ROW = {
  player: KEY,
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

function profilePayload() {
  const s = (id: string, label: string, games: number) => ({
    scope: { scope_id: id, kind: "season", label, bounded: true },
    participation: "participated",
    entity_games_in_scope: games,
    tournaments_in_scope: ["LCK 2026 Rounds 1-2"],
    leagues_in_scope: ["LoL Champions Korea"],
    stats: {
      games,
      wins: Math.round(games * 0.6),
      losses: games - Math.round(games * 0.6),
      win_rate: 0.6,
      first_played_at: null,
      last_played_at: null,
      champion_pool_size: 1,
      top_champions: [
        {
          key: "Azir",
          games: 12,
          wins: 8,
          losses: 4,
          win_rate: 0.667,
          first_played_at: "2026-01-16 10:08:00",
          last_played_at: "2026-07-08 08:52:00",
          champion_share: 0.2,
        },
      ],
      teams: [],
      roles: ["Mid"],
    },
  });
  return {
    contract_version: "pro_profile_v1",
    entity: { kind: "player", key: KEY, display_name: "Faker", handle: "Faker" },
    identity: { in_registry: true, registry_available: true, note: null },
    roles: { roles: ["Mid"], from_scope: "current_2026" },
    team_context: {
      demonstrated: {
        team_key: "T1",
        games: 60,
        wins: 40,
        last_played_at: "2026-07-08 08:52:00",
        from_scope: "current_2026",
        teams_in_scope: 1,
      },
      declared: null,
      agreement: "demonstrated_only",
      note: null,
    },
    worlds_focus: null,
    champion_pool_note: "Demonstrated champion pool.",
    comparison: {
      contract_version: "pro_comparison_v1",
      entity: { kind: "player", id: KEY, display_name: "Faker" },
      league_filter: "MAJOR_PRO",
      // DELIBERATELY DIFFERENT from the statistics row's 1000 games: the
      // comparison counts curated major leagues only. The profile must not
      // present these two totals as the same number.
      scope_order: ["current_2026", "all_time"],
      scopes: { current_2026: s("current_2026", "2026", 60), all_time: s("all_time", "All Time", 880) },
    },
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

const isProfile = (u: string) => u.includes("/api/pro-play/research/player/");
const isStats = (u: string) => u.includes("/api/pro-play/stats/players");

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[proPlayProfileUrl("player", KEY)]}>
        <Routes>
          <Route path="/lol/pro-play/player/:key" element={<ProPlayPlayerProfile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// 1. Publicization
// ---------------------------------------------------------------------------

const SRC = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

describe("publicization", () => {
  const PAGES = [
    "pages/pro-play/ProPlaySearch.tsx",
    "pages/pro-play/ProPlayPlayerProfile.tsx",
    "pages/pro-play/ProPlayTeamProfile.tsx",
    "pages/pro-play/ProPlayChampionProfile.tsx",
  ];

  it.each(PAGES)("%s carries no AdminAuthGate", (page) => {
    expect(SRC(page)).not.toContain("AdminAuthGate");
  });

  it.each(PAGES)("%s is indexable — no noindex", (page) => {
    // These pages were noindex ONLY because they were private research
    // surfaces. They are public now, so the directive must be gone.
    expect(SRC(page)).not.toMatch(/\bnoindex\b/);
  });

  it.each(PAGES)("%s still sets a page title", (page) => {
    expect(SRC(page)).toContain("SEOHead");
  });

  it("the research client sends no admin credentials", () => {
    const client = SRC("lib/pro-play/researchApi.ts");
    // The import is gone, not merely unused: a public page must not pull the
    // admin credential module into its bundle. (The words still appear in the
    // file's comment explaining why, so match the import and the call.)
    expect(client).not.toMatch(/^import .*adminCredentials/m);
    expect(client).not.toMatch(/await buildAdminHeaders\(/);
  });

  it("issues the profile request with no headers at all", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    await screen.findByRole("heading", { name: "Faker" });
    const profileCall = requests.find((r) => isProfile(r.url));
    expect(profileCall).toBeDefined();
    // No Authorization, no X-Admin-Key — a signed-out reader gets the same
    // request a signed-in one does.
    expect(profileCall?.init?.headers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Canonical identity and the record
// ---------------------------------------------------------------------------

describe("canonical player identity", () => {
  it("loads the profile for the canonical key, encoded", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    await screen.findByRole("heading", { name: "Faker" });
    const url = requests.find((r) => isProfile(r.url))!.url;
    // player_lp_page is punctuation-heavy and must arrive intact.
    expect(decodeURIComponent(url)).toContain(KEY);
  });

  it("keeps the canonical W-L over canonical games, not over stat-backed games", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    // 1000 canonical games and 640-360 -- NOT the 820 stat-backed subset.
    expect(within(panel).getByTestId("metric-W-L")).toHaveTextContent("640–360");
    expect(within(panel).getByTestId("metric-Games")).toHaveTextContent("1,000");
  });

  it("shows a clean public not-found state for an unknown player", async () => {
    installFetch([
      [
        isProfile,
        {
          status: 404,
          // The server's real detail, written for an operator audience.
          body: { detail: "player 'Nope' has no canonical games under league_filter='MAJOR_PRO'" },
        },
      ],
    ]);
    renderProfile();
    const err = await screen.findByTestId("research-error");
    expect(err).toHaveTextContent(/No professional record/i);
    // Not an auth prompt, not a sign-in wall.
    expect(err.textContent).not.toMatch(/admin|sign in|403|forbidden/i);
    // AND no internal vocabulary: these pages are public now, so the
    // operator-facing detail string must not be what a reader sees.
    expect(err.textContent).not.toMatch(/league_filter|MAJOR_PRO|registry/i);
  });

  it("still surfaces the server's message for a real failure", async () => {
    // Only the clean 404 is rewritten. A 500 keeps the accurate detail.
    installFetch([[isProfile, { status: 500, body: { detail: "Upstream unavailable." } }]]);
    renderProfile();
    expect(await screen.findByTestId("research-error")).toHaveTextContent("Upstream unavailable.");
  });
});

// ---------------------------------------------------------------------------
// 3. Statistics enrichment — semantics and coverage
// ---------------------------------------------------------------------------

describe("performance statistics", () => {
  it("reuses the public stats endpoint filtered to this one player", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    await screen.findByTestId("performance-panel");
    const url = requests.find((r) => isStats(r.url))!.url;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("player")).toBe(KEY);
    // No year: a request naming a player must not be narrowed to one season.
    expect(params.get("year")).toBeNull();
  });

  it("renders every rate from the statistics contract", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(within(panel).getByTestId("metric-KDA")).toHaveTextContent("4.57");
    expect(within(panel).getByTestId("metric-CS/min")).toHaveTextContent("9.12");
    expect(within(panel).getByTestId("metric-Gold/min")).toHaveTextContent("412");
    expect(within(panel).getByTestId("metric-Dmg/min")).toHaveTextContent("731");
    expect(within(panel).getByTestId("metric-Win %")).toHaveTextContent("64.0%");
  });

  it("states the partial coverage rather than implying rates cover every game", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    expect(panel).toHaveTextContent(/820 of 1,000 games that carry detailed statistics/);
  });

  it("renders an em dash — never zero — when no game carries statistics", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(NO_STATS_ROW) }]]);
    renderProfile();
    const panel = await screen.findByTestId("performance-panel");
    // The canonical record survives...
    expect(within(panel).getByTestId("metric-W-L")).toHaveTextContent("21–7");
    expect(within(panel).getByTestId("metric-Win %")).toHaveTextContent("75.0%");
    // ...and every stat-backed metric is absent, not zero.
    for (const label of ["KDA", "CS/min", "Gold/min", "Dmg/min"]) {
      expect(within(panel).getByTestId(`metric-${label}`)).toHaveTextContent("—");
      expect(within(panel).getByTestId(`metric-${label}`)).not.toHaveTextContent("0");
    }
    // ...and the reason is stated, so four em dashes do not read as a defect.
    expect(panel).toHaveTextContent(/absent rather than zero/);
    expect(panel).toHaveTextContent(/record is real and covers all 28 games/);
  });

  it("labels its own scope, which is NOT the comparison block's scope", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    const scopeLine = await screen.findByTestId("performance-scope");
    // Career, every competition -- built from the server's echoed filters.
    expect(scopeLine).toHaveTextContent("All seasons");
    expect(scopeLine).toHaveTextContent("all competitions");
    // And the comparison block states its own, different, basis.
    expect(await screen.findByText(/curated major leagues only/i)).toBeInTheDocument();
  });

  it("survives a statistics failure without taking the profile down", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { status: 500, body: {} }]]);
    renderProfile();
    // Identity and champion pool still render.
    expect(await screen.findByRole("heading", { name: "Faker" })).toBeInTheDocument();
    expect(await screen.findByText("Azir")).toBeInTheDocument();
  });

  it("keeps the champion pool, which comes from the profile contract", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    expect(await screen.findByText("Azir")).toBeInTheDocument();
    expect(await screen.findByText(/Demonstrated champion pool/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Outbound navigation
// ---------------------------------------------------------------------------

describe("outbound actions", () => {
  it("links to the player-filtered public stats table", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    const link = await screen.findByText("View in Pro Stats");
    expect(link.closest("a")).toHaveAttribute("href", statsExplorerUrl("players", KEY));
  });

  it("builds the stats URL on the explorer's own query contract", () => {
    const url = statsExplorerUrl("players", KEY);
    expect(url.startsWith("/lol/pro-play?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("view")).toBe("players");
    expect(params.get("player")).toBe(KEY);
  });

  it("links to a valid Player -> Champions graph", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    const link = await screen.findByText("Graph champion pool");
    const href = link.closest("a")!.getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/lol/pro-play/graphs")).toBe(true);
    expect(params.get("focus")).toBe("player");
    expect(params.get("vs")).toBe("champions");
    // The entity id IS the lp_page, verbatim -- same identity, no conversion.
    expect(params.get("e")).toBe(KEY);
  });

  it("carries no scope to the graph, because the panel is career-wide", () => {
    const handoff = graphHandoff({
      view: "players", year: null, league: null, patch: null, role: null,
      player: KEY, team: null, champion: null, minGames: null,
    })!;
    const params = new URLSearchParams(handoff.href.split("?")[1]);
    // A year, league or patch here would scope the graph to a span the panel
    // beside it was not computed over.
    for (const key of ["from", "to", "league", "patch"]) {
      expect(params.get(key)).toBeNull();
    }
    expect(handoff.dropped).toEqual([]);
  });

  it("preserves the one-way link out to the roster wiki", async () => {
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    const link = await screen.findByText(/Roster history/);
    expect(link.closest("a")).toHaveAttribute("href", expect.stringContaining("/lol/docs/pro/players/"));
  });

  it("does NOT fabricate a Matchup Explorer link for a player", async () => {
    // LIVE4 exposes no one-player entry point, and the Explorer's team pool is
    // a strict subset of the profile universe. A link here would 404 for most
    // players. Inbound links from the Explorer keep working; the relationship
    // stays one-way.
    installFetch([[isProfile, { body: profilePayload() }], [isStats, { body: statsResponse(FULL_ROW) }]]);
    renderProfile();
    await screen.findByTestId("performance-panel");
    expect(screen.queryByText(/Matchup Explorer/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Inbound links from the other public surfaces
// ---------------------------------------------------------------------------

describe("inbound identity links", () => {
  it("the Stats Explorer player cell targets the canonical profile route", () => {
    const explorer = SRC("components/pro-play/ProStatsExplorer.tsx");
    expect(explorer).toContain('proPlayProfileUrl("player", name)');
    // The identity itself, not a separate per-row button.
    expect(explorer).not.toMatch(/View profile/);
  });

  it("Search resolves a result to the same canonical URL helper", () => {
    // Search already links via profilePath -> proPlayProfileUrl. The point of
    // this assertion is that there is ONE helper, so Search and the Stats
    // Explorer cannot drift to different public profile paths.
    expect(SRC("lib/pro-play/researchApi.ts")).toContain("proPlayProfileUrl(kind, key)");
    expect(SRC("pages/pro-play/ProPlaySearch.tsx")).toContain("profilePath");
  });

  it("the Matchup Explorer and dossier still link into the profiles", () => {
    // LIVE4 was not modified; these inbound links must keep resolving.
    expect(SRC("pages/pro-play/ProPlayMatchup.tsx")).toContain("profilePath");
    expect(SRC("components/pro-play/dossier/MatchDossier.tsx")).toContain("profilePath");
  });

  it("every public profile path comes from one helper", () => {
    expect(proPlayProfileUrl("player", KEY)).toBe(`/lol/pro-play/player/${encodeURIComponent(KEY)}`);
    expect(proPlayProfileUrl("team", "Gen.G")).toBe("/lol/pro-play/team/Gen.G");
    expect(proPlayProfileUrl("champion", "Lee Sin")).toBe("/lol/pro-play/champion/Lee%20Sin");
  });
});
