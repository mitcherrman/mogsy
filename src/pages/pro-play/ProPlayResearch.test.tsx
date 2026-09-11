/**
 * The Pro Play research surface — the rendering rules that carry meaning.
 *
 * These are not snapshot tests. Each one pins a statement the surface must not
 * make: that an absence is a zero, that an ambiguous name has an answer, that
 * a demonstrated pool is a capability, that a partial roster is a lineup, that
 * a rate over no games is 0%.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProPlaySearch from "./ProPlaySearch";
import ProPlayPlayerProfile from "./ProPlayPlayerProfile";
import ProPlayTeamProfile from "./ProPlayTeamProfile";
import ProPlayChampionProfile from "./ProPlayChampionProfile";
import { formatRate } from "@/lib/pro-play/researchApi";

// NO AdminAuthGate MOCK, AND THAT IS THE POINT. These pages are public; a
// mock here would hide a gate if one were ever reintroduced, which is exactly
// the regression the publicization must not suffer. The adminCredentials mock
// is gone for the same reason — researchApi no longer imports that module at
// all, so stubbing it would prove nothing.
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

const requests: string[] = [];

function installFetch(routes: Array<[(url: string) => boolean, { status?: number; body: unknown }]>) {
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      const match = routes.find(([test]) => test(url));
      const handler = match?.[1] ?? { status: 404, body: { detail: "Not found." } };
      const status = handler.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => handler.body,
      } as Response;
    }),
  );
}

function scope(id: string, label: string, stats: Record<string, unknown> | null) {
  return {
    scope: { scope_id: id, kind: "season", label, bounded: true },
    participation: stats === null ? "did_not_participate" : "participated",
    entity_games_in_scope: stats ? (stats.games as number) : 0,
    tournaments_in_scope: stats ? ["LCK 2026 Rounds 1-2"] : [],
    leagues_in_scope: stats ? ["LoL Champions Korea"] : [],
    stats,
  };
}

const SCOPE_ORDER = ["current_2026", "worlds_2025", "recent_2025_2026", "all_time"];

function playerPayload() {
  return {
    contract_version: "pro_profile_v1",
    entity: { kind: "player", key: "Peyz", display_name: "Peyz", handle: "Peyz" },
    identity: { in_registry: true, registry_available: true, note: null, primary_role: "Bot" },
    roles: { roles: ["Bot"], from_scope: "current_2026" },
    team_context: {
      demonstrated: {
        team_key: "T1",
        games: 101,
        wins: 70,
        last_played_at: "2026-07-08 08:52:00",
        from_scope: "current_2026",
        teams_in_scope: 1,
      },
      declared: { raw: "T1", resolved_team_key: "T1", resolution: "unique", resolution_reason: null },
      agreement: "agree",
      note: null,
    },
    worlds_focus: {
      team_key: "T1",
      owner_label: "T1",
      group: "LCK",
      status: "watchlist",
      asserts_qualification: false,
      qualification_evidence: null,
      target_event: "Worlds 2026",
      meaning:
        "On Mogzy's Worlds watchlist. This is editorial interest, not a statement that the team has qualified.",
    },
    champion_pool_note:
      "Demonstrated champion pool: champions this player has been recorded playing in canonical professional games. It is not a list of the champions they are able to play.",
    comparison: {
      contract_version: "pro_comparison_v1",
      entity: { kind: "player", id: "Peyz", display_name: "Peyz" },
      league_filter: "MAJOR_PRO",
      scope_order: SCOPE_ORDER,
      scopes: {
        current_2026: scope("current_2026", "2026", {
          games: 101,
          wins: 70,
          losses: 31,
          win_rate: 0.693,
          first_played_at: "2026-01-16 10:08:00",
          last_played_at: "2026-07-08 08:52:00",
          champion_pool_size: 2,
          top_champions: [
            {
              key: "Aphelios",
              games: 40,
              wins: 30,
              losses: 10,
              win_rate: 0.75,
              first_played_at: "2026-01-16 10:08:00",
              last_played_at: "2026-07-08 08:52:00",
              champion_share: 0.396,
            },
            // The low-presence row. One game, kept, with its date.
            {
              key: "Vex",
              games: 1,
              wins: 1,
              losses: 0,
              win_rate: 1,
              first_played_at: "2026-03-02 09:00:00",
              last_played_at: "2026-03-02 09:00:00",
              champion_share: 0.0099,
            },
          ],
          teams: [],
          roles: ["Bot"],
        }),
        // THE CASE THIS SUITE EXISTS FOR: absent, not zero.
        worlds_2025: scope("worlds_2025", "Worlds 2025", null),
        recent_2025_2026: scope("recent_2025_2026", "2025–2026", {
          games: 225,
          wins: 135,
          losses: 90,
          win_rate: 0.6,
          first_played_at: null,
          last_played_at: null,
          champion_pool_size: 2,
          top_champions: [],
          teams: [],
          roles: ["Bot"],
        }),
        all_time: scope("all_time", "All Time", {
          games: 493,
          wins: 336,
          losses: 157,
          win_rate: 0.681,
          first_played_at: null,
          last_played_at: null,
          champion_pool_size: 2,
          top_champions: [],
          teams: [],
          roles: ["Bot"],
        }),
      },
    },
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/lol/pro-play/search" element={<ProPlaySearch />} />
        <Route path="/lol/pro-play/player/:key" element={<ProPlayPlayerProfile />} />
        <Route path="/lol/pro-play/team/:key" element={<ProPlayTeamProfile />} />
        <Route path="/lol/pro-play/champion/:key" element={<ProPlayChampionProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("formatRate", () => {
  it("renders null as an em dash, never 0%", () => {
    // A rate over zero games is not a rate. "0%" would read as "never picked"
    // when the truth is "there were no games here at all".
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
    expect(formatRate(0)).toBe("0.0%");
  });
});

describe("player profile", () => {
  beforeEach(() => {
    installFetch([[(u) => u.includes("/research/player/"), { body: playerPayload() }]]);
  });

  it("renders a scope the player missed as 'Did not participate', not 0 games", async () => {
    renderAt("/lol/pro-play/player/Peyz");
    const card = await screen.findByTestId("scope-card-worlds_2025");
    expect(card).toHaveTextContent("Did not participate");
    expect(card).not.toHaveTextContent("0 games");
    expect(card).toHaveTextContent(/not a record of zero games/i);
  });

  it("renders all four scopes in the order the backend sent", async () => {
    renderAt("/lol/pro-play/player/Peyz");
    await screen.findByTestId("scope-grid");
    const labels = screen
      .getAllByTestId(/^scope-card-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(labels).toEqual(SCOPE_ORDER.map((id) => `scope-card-${id}`));
  });

  it("keeps a one-game champion in the pool with its date", async () => {
    renderAt("/lol/pro-play/player/Peyz");
    const table = await screen.findByTestId("champion-pool-table");
    expect(table).toHaveTextContent("Vex");
    expect(table).toHaveTextContent("2026-03-02");
  });

  it("labels the champion pool as demonstrated, not as capability", async () => {
    renderAt("/lol/pro-play/player/Peyz");
    await screen.findByTestId("champion-pool-table");
    expect(
      screen.getByText(/not a list of the champions they are able to play/i),
    ).toBeInTheDocument();
  });

  it("says a watchlist team is not a qualification claim", async () => {
    renderAt("/lol/pro-play/player/Peyz");
    const notice = await screen.findByTestId("worlds-focus-notice");
    expect(notice).toHaveTextContent(/not a statement that the team has qualified/i);
    expect(notice).not.toHaveTextContent(/qualified for/i);
  });

  it("shows demonstrated and declared team side by side", async () => {
    renderAt("/lol/pro-play/player/Peyz");
    const ctx = await screen.findByTestId("team-context");
    expect(ctx).toHaveTextContent("Demonstrated");
    expect(ctx).toHaveTextContent("Declared");
  });

  it("points at the roster wiki as the other half, not as a rival profile", async () => {
    // Two pages about one player look like competing profiles unless each
    // names what the other is for. The label must say "roster history", never
    // just "profile".
    renderAt("/lol/pro-play/player/Peyz");
    await screen.findByTestId("scope-grid");
    const link = screen.getByRole("link", { name: /roster history/i });
    expect(link).toHaveAttribute("href", "/lol/docs/pro/players/Peyz");
    expect(link.textContent).toMatch(/League Docs/i);
  });

  it("explains a 404 as 'no professional record', not a missing page", async () => {
    // SAME INTENT AS BEFORE THE PAGES WENT PUBLIC — a 404 here means the
    // entity has no canonical games, never that the URL is broken. Only the
    // wording moved: a public reader gets notFoundMessage() rather than the
    // server's operator-facing detail.
    installFetch([
      [
        (u) => u.includes("/research/player/"),
        { status: 404, body: { detail: "player 'Nobody' has no canonical games" } },
      ],
    ]);
    renderAt("/lol/pro-play/player/Nobody");
    const err = await screen.findByTestId("research-error");
    expect(err).toHaveTextContent(/No professional record/i);
    expect(err).toHaveTextContent(/no games in the major professional competitions/i);
    expect(err.textContent).not.toMatch(/not found|missing page|404/i);
  });

  it("encodes a punctuation-heavy Leaguepedia page in the request", async () => {
    renderAt("/lol/pro-play/player/Knight%20(Zhuo%20Ding)");
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0]).toContain("Knight");
    expect(requests[0]).not.toContain("Knight (Zhuo Ding)");
  });
});

describe("search", () => {
  const ambiguous = {
    contract_version: "pro_search_v1",
    query: "IG",
    kinds: ["player", "team", "champion"],
    registry_available: true,
    total_matches: 2,
    truncated: false,
    interpretation: null,
    results: [
      {
        kind: "team",
        key: "Invictus Gaming",
        display_name: "Invictus Gaming",
        handle: "Invictus Gaming",
        match_type: "alias",
        matched_on: "iG",
        source: "alias_table:short",
        in_registry: true,
        games: 1261,
        last_played_at: "2026-07-12",
        has_pro_play_facts: true,
        region: "China",
        worlds_focus: { in_focus_set: true, asserts_qualification: false },
      },
    ],
    ambiguity: {
      state: "ambiguous",
      best_match_type: "alias",
      tied_candidates: 2,
      resolved_key: null,
      by_kind: { team: 2 },
      reason: "2 entities match this query by name, handle or recorded alias (2 teams)",
      candidates: [
        {
          kind: "team",
          key: "Invictus Gaming",
          display_name: "Invictus Gaming",
          handle: "Invictus Gaming",
          match_type: "alias",
          matched_on: "iG",
          source: "alias_table:short",
          in_registry: true,
          games: 1261,
          last_played_at: "2026-07-12",
          has_pro_play_facts: true,
          region: "China",
        },
        {
          kind: "team",
          key: "Impact Gaming",
          display_name: "Impact Gaming",
          handle: "Impact Gaming",
          match_type: "alias",
          matched_on: "IG",
          source: "alias_table:short",
          in_registry: true,
          games: 0,
          last_played_at: null,
          has_pro_play_facts: false,
          region: "Europe",
          is_disbanded: true,
        },
      ],
    },
  };

  it("offers both candidates for an ambiguous name and picks neither", async () => {
    installFetch([[(u) => u.includes("/research/search"), { body: ambiguous }]]);
    renderAt("/lol/pro-play/search?q=IG");
    const list = await screen.findByTestId("disambiguation-list", {}, { timeout: 3000 });
    expect(list).toHaveTextContent("Invictus Gaming");
    expect(list).toHaveTextContent("Impact Gaming");
    expect(screen.getByTestId("disambiguation-prompt")).toHaveTextContent(
      /does not choose between them/i,
    );
  });

  it("shows a candidate the ranked result list truncated away", async () => {
    installFetch([[(u) => u.includes("/research/search"), { body: ambiguous }]]);
    renderAt("/lol/pro-play/search?q=IG");
    await screen.findByTestId("disambiguation-list", {}, { timeout: 3000 });
    // Impact Gaming is absent from `results` and present in the prompt.
    expect(screen.getByTestId("disambiguation-list")).toHaveTextContent("Impact Gaming");
  });

  it("says 'no pro games' rather than showing a bare zero", async () => {
    installFetch([[(u) => u.includes("/research/search"), { body: ambiguous }]]);
    renderAt("/lol/pro-play/search?q=IG");
    await screen.findByTestId("disambiguation-list", {}, { timeout: 3000 });
    expect(screen.getByTestId("disambiguation-list")).toHaveTextContent("no pro games");
  });
});

describe("team profile", () => {
  const partial = {
    contract_version: "pro_profile_v1",
    entity: { kind: "team", key: "Bilibili Gaming", display_name: "Bilibili Gaming" },
    identity: { in_registry: true, registry_available: true, region: "China", short: "BLG" },
    worlds_focus: null,
    roster_error: null,
    roster_note: "Completeness is reported, not assumed.",
    roster: {
      team_key: "Bilibili Gaming",
      scope_id: "current_2026",
      scope_label: "2026",
      team_games_in_scope: 126,
      players: [
        {
          player_lp_page: "Bin (Chen Ze-Bin)",
          display_name: "Bin (Chen Ze-Bin)",
          role: "Top",
          games: 125,
          wins: 80,
          first_played_at: null,
          last_played_at: "2026-07-01",
          share_of_team_games: 0.992,
          declared_member: true,
        },
      ],
      by_role: {},
      completeness: {
        state: "partial",
        roles_covered: ["Top"],
        roles_missing: ["Mid"],
        ambiguous_roles: [],
        has_full_five: false,
      },
    },
    comparison: {
      contract_version: "pro_comparison_v1",
      entity: { kind: "team", id: "Bilibili Gaming", display_name: "Bilibili Gaming" },
      league_filter: "MAJOR_PRO",
      scope_order: SCOPE_ORDER,
      scopes: {
        current_2026: scope("current_2026", "2026", {
          games: 126,
          wins: 80,
          losses: 46,
          win_rate: 0.635,
          first_played_at: null,
          last_played_at: null,
          champion_pool_size: 0,
          top_champions: [],
          players: [],
        }),
        worlds_2025: scope("worlds_2025", "Worlds 2025", null),
        recent_2025_2026: scope("recent_2025_2026", "2025–2026", {
          games: 200,
          wins: 120,
          losses: 80,
          win_rate: 0.6,
          first_played_at: null,
          last_played_at: null,
          champion_pool_size: 0,
          top_champions: [],
          players: [],
        }),
        all_time: scope("all_time", "All Time", {
          games: 900,
          wins: 500,
          losses: 400,
          win_rate: 0.555,
          first_played_at: null,
          last_played_at: null,
          champion_pool_size: 0,
          top_champions: [],
          players: [],
        }),
      },
    },
  };

  it("renders a partial roster as partial and names the missing role", async () => {
    installFetch([[(u) => u.includes("/research/team/"), { body: partial }]]);
    renderAt("/lol/pro-play/team/Bilibili%20Gaming");
    const state = await screen.findByTestId("roster-completeness");
    expect(state).toHaveTextContent("partial");
    const gap = screen.getByTestId("roster-gap");
    expect(gap).toHaveTextContent("Mid");
    expect(gap).toHaveTextContent(/incomplete/i);
    expect(gap).toHaveTextContent(/not been filled in from declared/i);
  });

  it("points at the team's roster wiki page as the declared half", async () => {
    installFetch([[(u) => u.includes("/research/team/"), { body: partial }]]);
    renderAt("/lol/pro-play/team/Bilibili%20Gaming");
    await screen.findByTestId("scope-grid");
    const link = screen.getByRole("link", { name: /roster history/i });
    expect(link).toHaveAttribute("href", "/lol/docs/pro/teams/Bilibili%20Gaming");
  });

  it("gives a team outside the Worlds focus set a full profile", async () => {
    installFetch([[(u) => u.includes("/research/team/"), { body: partial }]]);
    renderAt("/lol/pro-play/team/Bilibili%20Gaming");
    await screen.findByTestId("scope-grid");
    expect(screen.queryByTestId("worlds-focus-notice")).toBeNull();
    expect(screen.getByTestId("scope-card-all_time")).toHaveTextContent("900");
  });
});

describe("champion profile", () => {
  const champion = {
    contract_version: "pro_profile_v1",
    entity: { kind: "champion", key: "Azir", display_name: "Azir" },
    identity: {},
    draft_note: "Presence is the share of games in the scope where this champion was picked or banned.",
    comparison_error: null,
    draft: {
      current_2026: {
        games_in_scope: 1553,
        picks: 295,
        wins: 137,
        losses: 158,
        win_rate: 0.4644,
        ban_events: 286,
        games_banned_in: 286,
        pick_rate: 0.19,
        ban_rate: 0.184,
        presence: 0.374,
        participation: "participated",
      },
      worlds_2025: {
        games_in_scope: 84,
        picks: 14,
        wins: 7,
        losses: 7,
        win_rate: 0.5,
        ban_events: 55,
        games_banned_in: 55,
        pick_rate: 0.167,
        ban_rate: 0.655,
        presence: 0.821,
        participation: "participated",
      },
      recent_2025_2026: {
        games_in_scope: 3501,
        picks: 652,
        wins: 311,
        losses: 341,
        win_rate: 0.477,
        ban_events: 1077,
        games_banned_in: 1077,
        pick_rate: 0.186,
        ban_rate: 0.308,
        presence: 0.494,
        participation: "participated",
      },
      all_time: {
        games_in_scope: 22662,
        picks: 3815,
        wins: 1907,
        losses: 1908,
        win_rate: 0.4999,
        ban_events: 4097,
        games_banned_in: 4097,
        pick_rate: 0.168,
        ban_rate: 0.181,
        presence: 0.349,
        participation: "participated",
      },
    },
    comparison: {
      contract_version: "pro_comparison_v1",
      entity: { kind: "champion", id: "Azir", champion_key: "Azir" },
      league_filter: "MAJOR_PRO",
      scope_order: SCOPE_ORDER,
      scopes: {
        current_2026: scope("current_2026", "2026", {
          games: 295,
          wins: 137,
          losses: 158,
          win_rate: 0.4644,
          first_played_at: null,
          last_played_at: null,
          distinct_players: 61,
          distinct_teams: 40,
          top_players: [],
          top_teams: [],
        }),
        worlds_2025: scope("worlds_2025", "Worlds 2025", null),
        recent_2025_2026: scope("recent_2025_2026", "2025–2026", null),
        all_time: scope("all_time", "All Time", null),
      },
    },
  };

  it("shows picks, bans and presence over one stated denominator", async () => {
    installFetch([[(u) => u.includes("/research/champion/"), { body: champion }]]);
    renderAt("/lol/pro-play/champion/Azir");
    const table = await screen.findByTestId("draft-table");
    expect(table).toHaveTextContent("Games in scope");
    expect(table).toHaveTextContent("1553");
    expect(table).toHaveTextContent("82.1%"); // Worlds 2025 presence
    expect(screen.getByText(/picked or banned/i)).toBeInTheDocument();
  });

  it("links out to the champion mechanics page rather than restating it", async () => {
    installFetch([[(u) => u.includes("/research/champion/"), { body: champion }]]);
    renderAt("/lol/pro-play/champion/Azir");
    await screen.findByTestId("draft-table");
    const link = screen.getByRole("link", { name: /abilities and stats/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/lol/docs/champions/"));
  });
});
