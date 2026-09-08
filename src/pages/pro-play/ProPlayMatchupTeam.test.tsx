/**
 * Team mode — the five-lane board.
 *
 * Not snapshot tests. Multiplying one lane by ten sides multiplies every way
 * the lane explorer could mislead, so each test below pins a statement the
 * board must not make, or a behaviour the requirement turns on:
 *
 *  - five lanes, in canonical order, including the ones that resolved to
 *    nothing;
 *  - a timeshared lane never names a starter, and never pre-fills one;
 *  - an uncovered lane renders uncovered rather than borrowing a player;
 *  - ten records are never labelled head-to-head;
 *  - a watchlist team is never presented as qualified;
 *  - a demonstrated pool is never a capability, and the low-presence tail is
 *    always reachable — the collapse is a display toggle, not a filter;
 *  - a ban is one set difference applied to every lane;
 *  - the URL is the selection, in both modes, and crossing between them
 *    carries what the other board can hold;
 *  - lane mode still works, and is still the default.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MatchupBody } from "./ProPlayMatchup";
import {
  EMPTY_TEAM_SELECTION,
  LANE_CLEAR_STARTER,
  LANE_TIMESHARE,
  LANE_UNCOVERED,
  drilldownUrl,
  modeFromParams,
  teamSelectionFromLane,
  teamSelectionFromParams,
  teamSelectionToParams,
  withTeamBanToggled,
  withTeamScope,
  withTeamSide,
  withTeamsSwapped,
  type TeamSelection,
} from "@/lib/pro-play/matchupApi";

vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "https://backend.test",
  buildAdminHeaders: async () => ({}),
}));

const requests: string[] = [];

// --- fixtures ---------------------------------------------------------------

const LANES = ["Top", "Jungle", "Mid", "Bot", "Support"];
const SCOPE_ORDER = ["current_2026", "worlds_2025", "recent_2025_2026", "all_time"];
const SCOPE_LABELS: Record<string, string> = {
  current_2026: "2026",
  worlds_2025: "Worlds 2025",
  recent_2025_2026: "2025–2026",
  all_time: "All Time",
};

const NOTES = {
  focus:
    "Team selection is limited to Mogzy's curated Worlds 2026 focus set — an editorial watchlist, not a qualification claim.",
  pool: "Demonstrated picks: champions this player actually played in the selected scope. Not a statement of what they are able to play, and not filtered by a minimum number of games.",
  side_by_side:
    "Side-by-side record: each player's own results against the whole field over the same scopes. This is not a head-to-head record and does not restrict to games these two played against each other.",
  bans: "Bans remove a champion from what can be selected. They are a plain set difference over the demonstrated picks — no draft model, no inferred opponent bans, and no claim that what remains is a good pick.",
  team_mode:
    "A demonstrated matchup context, not a prediction. Each lane shows who actually played it for this team in the selected scope. It does not state who will start, what will be drafted, who will be banned, or who will win.",
  pool_bound:
    "Champion pools are fetched for the top 3 candidates per lane by games played. Every candidate is still listed with their record; a candidate marked pool_omitted has their full, unfiltered pool available in the lane view. No minimum-game floor is applied anywhere.",
  team_summary:
    "The team's own most-played champions in the selected scope, across all players. Not a meta read and not a draft expectation.",
};

const FOCUS_TEAMS = [
  {
    team_key: "T1",
    owner_label: "T1",
    group: "LCK",
    status: "watchlist",
    asserts_qualification: false,
    qualification_evidence: null,
    note: null,
  },
  {
    team_key: "Bilibili Gaming",
    owner_label: "BLG",
    group: "LPL",
    status: "watchlist",
    asserts_qualification: false,
    qualification_evidence: null,
    note: null,
  },
];

const CONTRACT = {
  contract_version: "pro_matchup_v1",
  comparison_contract_version: "pro_comparison_v1",
  semantics: "independent_side_by_side",
  head_to_head: false,
  lanes: LANES,
  scopes: SCOPE_ORDER.map((id) => ({ scope_id: id, label: SCOPE_LABELS[id], kind: "season" })),
  default_scope_ids: SCOPE_ORDER,
  default_pool_scope_id: "current_2026",
  league_filters: { curated: "MAJOR", every_competition: "ALL" },
  focus_set: {
    focus_set_version: "worlds_2026_v1",
    target_event: "Worlds 2026",
    statuses: ["watchlist", "qualified", "confirmed", "removed"],
    qualification_claim_statuses: ["confirmed", "qualified"],
    groups: ["LCK", "LPL"],
    teams: FOCUS_TEAMS,
    pending_slots: [],
    teams_asserting_qualification: [],
  },
  team_mode: {
    modes: ["lane", "team"],
    lane_states: [LANE_CLEAR_STARTER, LANE_TIMESHARE, LANE_UNCOVERED],
    warning_codes: [
      "lane_uncovered",
      "lane_timeshare",
      "roster_partial",
      "team_absent_from_scope",
      "same_team_selected",
    ],
    pool_preview: 2,
    pool_candidates_per_lane: 3,
    team_summary_champions: 10,
  },
  notes: NOTES,
};

function champ(key: string, games: number, wins: number, banned = false) {
  return {
    key,
    games,
    wins,
    losses: games - wins,
    win_rate: games ? wins / games : null,
    first_played_at: "2026-01-10 00:00:00",
    last_played_at: "2026-07-06 06:00:00",
    champion_share: games / 100,
    banned,
  };
}

function pool(champs: ReturnType<typeof champ>[]) {
  return {
    scope_id: "current_2026",
    scope_label: "2026",
    participation: "participated",
    player_games_in_scope: 100,
    pool_size: champs.length,
    champions: champs,
    selectable: champs.filter((c) => !c.banned).map((c) => c.key),
    banned_from_pool: champs.filter((c) => c.banned).map((c) => c.key),
    note: NOTES.pool,
  };
}

function candidate(
  page: string,
  games: number,
  {
    isStarter = false,
    champs,
    omitted = false,
  }: { isStarter?: boolean; champs?: ReturnType<typeof champ>[]; omitted?: boolean } = {},
) {
  return {
    player_lp_page: page,
    display_name: page,
    games,
    wins: Math.floor(games * 0.6),
    share_of_team_games: games / 100,
    first_played_at: "2026-01-10 00:00:00",
    last_played_at: "2026-07-08 08:52:00",
    is_starter: isStarter,
    declared_member: true,
    record: omitted
      ? null
      : {
          scope_id: "current_2026",
          scope_label: "2026",
          participation: "participated",
          games,
          wins: Math.floor(games * 0.6),
          losses: games - Math.floor(games * 0.6),
          win_rate: 0.6,
          champion_pool_size: (champs ?? []).length,
          note: NOTES.side_by_side,
        },
    pool: omitted ? null : pool(champs ?? [champ("Ornn", games, 6)]),
    pool_omitted: omitted,
  };
}

function laneSide(
  teamKey: string,
  lane: string,
  state: string,
  candidates: ReturnType<typeof candidate>[],
  { reason = null as string | null } = {},
) {
  const starter = candidates.find((c) => c.is_starter)?.player_lp_page ?? null;
  return {
    team_key: teamKey,
    lane,
    state,
    starter,
    ambiguous: state === LANE_TIMESHARE,
    ambiguous_reason: reason,
    lane_covered: candidates.length > 0,
    candidates,
    candidates_total: candidates.length,
    candidates_with_pool: candidates.filter((c) => !c.pool_omitted).length,
    unambiguous_player: state === LANE_CLEAR_STARTER ? starter : null,
  };
}

function teamHeader(teamKey: string, { missing = [] as string[], champs = [champ("Ornn", 40, 24)] } = {}) {
  const focus = FOCUS_TEAMS.find((t) => t.team_key === teamKey)!;
  return {
    team_key: teamKey,
    display_name: teamKey,
    focus,
    roster: {
      team_key: teamKey,
      scope_id: "current_2026",
      scope_label: "2026",
      team_games_in_scope: 100,
      players: [],
      by_role: {},
      completeness: {
        state: missing.length ? "partial" : "complete",
        roles_covered: LANES.filter((l) => !missing.includes(l)),
        roles_missing: missing,
        ambiguous_roles: [],
        has_full_five: !missing.length,
      },
      declared_corroboration: null,
    },
    completeness: {
      state: missing.length ? "partial" : "complete",
      roles_covered: LANES.filter((l) => !missing.includes(l)),
      roles_missing: missing,
      ambiguous_roles: [],
      has_full_five: !missing.length,
    },
    team_games_in_scope: 100,
    declared_corroboration: null,
    champion_summary: {
      team_key: teamKey,
      scope_id: "current_2026",
      scope_label: "2026",
      participation: "participated",
      team_games_in_scope: 100,
      wins: 60,
      losses: 40,
      win_rate: 0.6,
      champion_pool_size: champs.length,
      top_champions: champs,
      competitions: [],
      note: NOTES.team_summary,
    },
  };
}

/**
 * A board shaped like the real corpus: one clear lane, one timeshare, one
 * uncovered lane (BLG Mid before the identity rebuild), one lane with a
 * low-presence bench and one with a bounded pool fetch.
 */
function teamResponse(bans: string[] = []) {
  const mark = (c: ReturnType<typeof champ>) => ({ ...c, banned: bans.includes(c.key) });
  const withBans = (cs: ReturnType<typeof champ>[]) => {
    const marked = cs.map(mark);
    return marked;
  };
  const poolOf = (cs: ReturnType<typeof champ>[]) => {
    const marked = withBans(cs);
    return {
      ...pool(marked),
      selectable: marked.filter((c) => !c.banned).map((c) => c.key),
      banned_from_pool: marked.filter((c) => c.banned).map((c) => c.key),
    };
  };
  const cand = (page: string, games: number, cs: ReturnType<typeof champ>[], isStarter: boolean) => ({
    ...candidate(page, games, { isStarter, champs: cs }),
    pool: poolOf(cs),
  });

  const t1Top = cand("Doran", 101, [champ("Ornn", 30, 18), champ("Jayce", 20, 12), champ("Rumble", 1, 1)], true);
  const blgTop = cand("Bin", 125, [champ("Ambessa", 40, 25)], true);

  return {
    contract_version: "pro_matchup_v1",
    comparison_contract_version: "pro_comparison_v1",
    mode: "team",
    comparison_kind: "players_side_by_side",
    semantics: "independent_side_by_side",
    head_to_head: false,
    selection: {
      mode: "team",
      team_a: "T1",
      team_b: "Bilibili Gaming",
      bans,
      scope_id: "current_2026",
      league_filter: "MAJOR",
    },
    scope: { scope_id: "current_2026", scope_label: "2026" },
    lane_order: LANES,
    lanes: [
      {
        lane: "Top",
        a: laneSide("T1", "Top", LANE_CLEAR_STARTER, [t1Top]),
        b: laneSide("Bilibili Gaming", "Top", LANE_CLEAR_STARTER, [blgTop]),
        drilldown: {
          lane: "Top",
          selection: {
            team_a: "T1",
            team_b: "Bilibili Gaming",
            lane: "Top",
            player_a: "Doran",
            player_b: "Bin",
            champion_a: null,
            champion_b: null,
            bans,
            pool_scope_id: "current_2026",
            league_filter: "MAJOR",
          },
          player_a_prefilled: true,
          player_b_prefilled: true,
        },
      },
      {
        lane: "Jungle",
        a: laneSide(
          "T1",
          "Jungle",
          LANE_TIMESHARE,
          [cand("Oner", 52, [champ("Vi", 20, 12)], false), cand("Guma", 43, [champ("Sejuani", 15, 9)], false)],
          { reason: "Jungle: no clear starter: Oner 52g vs Guma 43g" },
        ),
        b: laneSide("Bilibili Gaming", "Jungle", LANE_CLEAR_STARTER, [
          cand("Xun", 126, [champ("Vi", 30, 18)], true),
        ]),
        drilldown: {
          lane: "Jungle",
          selection: {
            team_a: "T1",
            team_b: "Bilibili Gaming",
            lane: "Jungle",
            player_a: null,
            player_b: "Xun",
            champion_a: null,
            champion_b: null,
            bans,
            pool_scope_id: "current_2026",
            league_filter: "MAJOR",
          },
          player_a_prefilled: false,
          player_b_prefilled: true,
        },
      },
      {
        lane: "Mid",
        a: laneSide("T1", "Mid", LANE_CLEAR_STARTER, [
          cand("Faker", 101, [champ("Azir", 25, 15), champ("Orianna", 20, 12), champ("Zoe", 1, 0)], true),
        ]),
        // BLG Mid before the identity rebuild: quarantined, so uncovered.
        b: laneSide("Bilibili Gaming", "Mid", LANE_UNCOVERED, []),
        drilldown: {
          lane: "Mid",
          selection: {
            team_a: "T1",
            team_b: "Bilibili Gaming",
            lane: "Mid",
            player_a: "Faker",
            player_b: null,
            champion_a: null,
            champion_b: null,
            bans,
            pool_scope_id: "current_2026",
            league_filter: "MAJOR",
          },
          player_a_prefilled: true,
          player_b_prefilled: false,
        },
      },
      {
        lane: "Bot",
        a: laneSide("T1", "Bot", LANE_CLEAR_STARTER, [cand("Peyz", 101, [champ("Kalista", 30, 18)], true)]),
        b: laneSide("Bilibili Gaming", "Bot", LANE_CLEAR_STARTER, [
          cand("Viper", 126, [champ("Ezreal", 30, 18)], true),
        ]),
        drilldown: {
          lane: "Bot",
          selection: {
            team_a: "T1",
            team_b: "Bilibili Gaming",
            lane: "Bot",
            player_a: "Peyz",
            player_b: "Viper",
            champion_a: null,
            champion_b: null,
            bans,
            pool_scope_id: "current_2026",
            league_filter: "MAJOR",
          },
          player_a_prefilled: true,
          player_b_prefilled: true,
        },
      },
      {
        lane: "Support",
        // A bounded pool fetch: three candidates, the third with no pool.
        a: laneSide("T1", "Support", LANE_CLEAR_STARTER, [
          cand("Keria", 101, [champ("Bard", 30, 18)], true),
          cand("Sub1", 5, [champ("Nami", 5, 3)], false),
          candidate("Sub2", 2, { omitted: true }),
        ]),
        b: laneSide("Bilibili Gaming", "Support", LANE_CLEAR_STARTER, [
          cand("ON", 126, [champ("Alistar", 30, 18)], true),
        ]),
        drilldown: {
          lane: "Support",
          selection: {
            team_a: "T1",
            team_b: "Bilibili Gaming",
            lane: "Support",
            player_a: "Keria",
            player_b: "ON",
            champion_a: null,
            champion_b: null,
            bans,
            pool_scope_id: "current_2026",
            league_filter: "MAJOR",
          },
          player_a_prefilled: true,
          player_b_prefilled: true,
        },
      },
    ],
    teams: {
      a: teamHeader("T1"),
      b: teamHeader("Bilibili Gaming", { missing: ["Mid"], champs: [champ("Ambessa", 40, 25)].map(mark) }),
    },
    bans: { champions: bans, note: NOTES.bans },
    warnings: [
      { code: "roster_partial", team_key: "Bilibili Gaming", detail: "roster is partial: missing ['Mid']" },
      {
        code: "lane_uncovered",
        team_key: "Bilibili Gaming",
        lane: "Mid",
        detail: "no player demonstrated in this lane in scope",
      },
      {
        code: "lane_timeshare",
        team_key: "T1",
        lane: "Jungle",
        detail: "Jungle: no clear starter: Oner 52g vs Guma 43g",
      },
    ],
    resolved: true,
    pool_preview: 2,
    pool_candidates_per_lane: 3,
    notes: NOTES,
  };
}

const LANE_RESPONSE = {
  contract_version: "pro_matchup_v1",
  comparison_contract_version: "pro_comparison_v1",
  comparison_kind: "players_side_by_side",
  semantics: "independent_side_by_side",
  head_to_head: false,
  selection: {
    team_a: null,
    team_b: null,
    lane: null,
    player_a: null,
    player_b: null,
    champion_a: null,
    champion_b: null,
    bans: [],
    pool_scope_id: "current_2026",
    scope_ids: SCOPE_ORDER,
    league_filter: "MAJOR",
  },
  lanes: LANES,
  scope_order: SCOPE_ORDER,
  scope_labels: SCOPE_LABELS,
  bans: { champions: [], note: NOTES.bans },
  sides: {
    a: {
      team: null,
      focus: null,
      roster: null,
      lane: null,
      lane_candidates: null,
      player: null,
      pool: null,
      champion_key: null,
      comparison: null,
      needs: ["team_not_selected"],
      conflicts: [],
    },
    b: {
      team: null,
      focus: null,
      roster: null,
      lane: null,
      lane_candidates: null,
      player: null,
      pool: null,
      champion_key: null,
      comparison: null,
      needs: ["team_not_selected"],
      conflicts: [],
    },
  },
  resolved: false,
  notes: NOTES,
};

let team = teamResponse();

beforeEach(() => {
  requests.length = 0;
  team = teamResponse();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      let body: unknown = { detail: "Not found." };
      let status = 404;
      if (url.includes("/matchup/contract")) {
        body = CONTRACT;
        status = 200;
      } else if (url.includes("/matchup/team")) {
        // Reflect the requested bans back, the way the server does, so a test
        // that toggles a ban sees every lane follow it.
        const params = new URLSearchParams(url.split("?")[1] ?? "");
        body = teamResponse(params.getAll("ban"));
        status = 200;
      } else if (url.includes("/matchup/explore")) {
        body = LANE_RESPONSE;
        status = 200;
      }
      return {
        ok: status === 200,
        status,
        json: async () => body,
      } as Response;
    }),
  );
});

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/lol/pro-play/matchup${search}`]}>
      <Routes>
        <Route path="/lol/pro-play/matchup" element={<MatchupBody />} />
      </Routes>
    </MemoryRouter>,
  );
}

const TEAM_URL = "?mode=team&team_a=T1&team_b=Bilibili+Gaming";

async function renderBoard(search = TEAM_URL) {
  renderAt(search);
  await waitFor(() => expect(screen.getByTestId("lane-board")).toBeInTheDocument());
}

// --- URL state --------------------------------------------------------------

describe("mode and URL state", () => {
  it("opens on the five-lane board when the URL names no lane", () => {
    // Phase 3 made the board the flagship: a bare URL, and one carrying only
    // teams, must land on the dossier rather than an empty form.
    expect(modeFromParams(new URLSearchParams(""))).toBe("team");
    expect(modeFromParams(new URLSearchParams("team_a=T1"))).toBe("team");
    expect(modeFromParams(new URLSearchParams("mode=team"))).toBe("team");
  });

  it("still opens every Phase 1 lane link in lane mode", () => {
    // Each of these was shareable before Phase 3 and must be unchanged by it.
    for (const qs of [
      "team_a=T1&team_b=Gen.G&lane=Mid",
      "player_a=Faker",
      "player_b=Chovy",
      "champion_a=Azir",
      "champion_b=Azir",
      "mode=lane",
    ]) {
      expect(modeFromParams(new URLSearchParams(qs))).toBe("lane");
    }
  });

  it("round-trips a team selection through the query string", () => {
    const selection: TeamSelection = {
      team_a: "T1",
      team_b: "Bilibili Gaming",
      bans: ["Azir", "Vi"],
      scope_id: "all_time",
    };
    expect(teamSelectionFromParams(teamSelectionToParams(selection))).toEqual(selection);
  });

  it("sorts and dedupes bans so one board is one URL", () => {
    const params = teamSelectionToParams({
      ...EMPTY_TEAM_SELECTION,
      bans: ["Vi", "Azir", "Vi"],
    });
    expect(params.getAll("ban")).toEqual(["Azir", "Vi"]);
  });

  it("repeats bans rather than comma-joining them", () => {
    // A champion key may contain punctuation; splitting on a separator that
    // can appear in a key is how "Kai'Sa" becomes two champions.
    const params = teamSelectionToParams({ ...EMPTY_TEAM_SELECTION, bans: ["Kai'Sa", "Vi"] });
    expect(params.getAll("ban")).toEqual(["Kai'Sa", "Vi"]);
    expect(teamSelectionFromParams(params).bans).toEqual(["Kai'Sa", "Vi"]);
  });

  it("omits mode from the API request but keeps it in the address bar", () => {
    expect(teamSelectionToParams(EMPTY_TEAM_SELECTION, true).get("mode")).toBe("team");
    expect(teamSelectionToParams(EMPTY_TEAM_SELECTION, false).get("mode")).toBeNull();
  });

  it("calls the team endpoint in team mode and the lane endpoint otherwise", async () => {
    await renderBoard();
    expect(requests.some((u) => u.includes("/matchup/team"))).toBe(true);
    expect(requests.some((u) => u.includes("/matchup/explore"))).toBe(false);
  });

  it("restores a pasted board from the URL alone", async () => {
    await renderBoard();
    const request = requests.find((u) => u.includes("/matchup/team"))!;
    const params = new URLSearchParams(request.split("?")[1]);
    expect(params.get("team_a")).toBe("T1");
    expect(params.get("team_b")).toBe("Bilibili Gaming");
  });

  it("carries teams, bans and scope from a lane selection to a board", () => {
    expect(
      teamSelectionFromLane({
        team_a: "T1",
        team_b: "Bilibili Gaming",
        lane: "Mid",
        player_a: "Faker",
        player_b: null,
        champion_a: "Azir",
        champion_b: null,
        bans: ["Vi"],
        pool_scope_id: "all_time",
      }),
    ).toEqual({ team_a: "T1", team_b: "Bilibili Gaming", bans: ["Vi"], scope_id: "all_time" });
  });
});

// --- selection edits --------------------------------------------------------

describe("selection edits", () => {
  it("changing a team clears nothing, because a board holds no downstream choice", () => {
    const before: TeamSelection = { ...EMPTY_TEAM_SELECTION, team_a: "T1", bans: ["Vi"] };
    expect(withTeamSide(before, "b", "Bilibili Gaming")).toEqual({
      ...before,
      team_b: "Bilibili Gaming",
    });
  });

  it("swapping sides is symmetric and keeps the bans", () => {
    const before: TeamSelection = {
      ...EMPTY_TEAM_SELECTION,
      team_a: "T1",
      team_b: "Bilibili Gaming",
      bans: ["Vi"],
    };
    const after = withTeamsSwapped(before);
    expect(after.team_a).toBe("Bilibili Gaming");
    expect(after.team_b).toBe("T1");
    expect(after.bans).toEqual(["Vi"]);
    expect(withTeamsSwapped(after)).toEqual(before);
  });

  it("toggling a ban adds and removes it, sorted", () => {
    const one = withTeamBanToggled(EMPTY_TEAM_SELECTION, "Vi");
    expect(one.bans).toEqual(["Vi"]);
    expect(withTeamBanToggled(one, "Azir").bans).toEqual(["Azir", "Vi"]);
    expect(withTeamBanToggled(one, "Vi").bans).toEqual([]);
  });

  it("changing the scope keeps the teams and the bans", () => {
    const before: TeamSelection = { ...EMPTY_TEAM_SELECTION, team_a: "T1", bans: ["Vi"] };
    expect(withTeamScope(before, "all_time")).toEqual({ ...before, scope_id: "all_time" });
  });
});

// --- the board --------------------------------------------------------------

describe("the five-lane board", () => {
  it("renders all five lanes in canonical order", async () => {
    await renderBoard();
    const cards = screen.getAllByTestId(/^lane-card-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(
      LANES.map((l) => `lane-card-${l}`),
    );
  });

  it("keeps the row for a lane that resolved to nothing", async () => {
    await renderBoard();
    const mid = screen.getByTestId("lane-card-Mid");
    expect(within(mid).getByText(/Nobody played this lane/i)).toBeInTheDocument();
  });

  it("names the two teams and the scope", async () => {
    await renderBoard();
    const heading = screen.getByTestId("team-heading");
    expect(heading).toHaveTextContent("T1");
    expect(heading).toHaveTextContent("Bilibili Gaming");
    expect(heading).toHaveTextContent("2026");
  });

  it("offers only focus-set teams", async () => {
    // Phase 3 moved the pickers behind "Change teams": once two teams are
    // chosen they are how you change the subject, not how you read it.
    await renderBoard();
    fireEvent.click(screen.getByTestId("dossier-team-picker-toggle"));
    const select = screen.getByTestId("team-select-a");
    const values = [...select.querySelectorAll("option")].map((o) => o.getAttribute("value")).filter(Boolean);
    expect(values).toEqual(["T1", "Bilibili Gaming"]);
  });
});

// --- roster semantics -------------------------------------------------------

describe("roster semantics", () => {
  it("badges a demonstrated starter and says 'demonstrated'", async () => {
    await renderBoard();
    const top = screen.getByTestId("lane-card-Top");
    const badge = within(top).getAllByTestId("starter-badge")[0];
    expect(badge).toHaveTextContent("demonstrated starter");
  });

  it("never badges a starter in a timeshared lane", async () => {
    await renderBoard();
    const jungle = screen.getByTestId("lane-card-Jungle");
    const t1 = within(jungle).getByTestId("lane-Jungle-T1");
    expect(within(t1).queryByTestId("starter-badge")).toBeNull();
  });

  it("shows every candidate of a timeshare and says why", async () => {
    await renderBoard();
    const jungle = screen.getByTestId("lane-card-Jungle");
    expect(within(jungle).getByTestId("candidate-Oner")).toBeInTheDocument();
    expect(within(jungle).getByTestId("candidate-Guma")).toBeInTheDocument();
    expect(within(jungle).getByTestId("lane-timeshare-Jungle-T1")).toHaveTextContent(
      "no clear starter",
    );
  });

  it("chips only the two lane states worth flagging", async () => {
    await renderBoard();
    // A clear lane carries no chip — the candidate's badge already says it,
    // and the same words twice in one card read as two claims.
    expect(screen.queryByTestId("lane-state-Top-T1")).toBeNull();
    expect(screen.getByTestId("lane-state-Jungle-T1")).toHaveTextContent("timeshare");
    expect(screen.getByTestId("lane-state-Mid-Bilibili Gaming")).toHaveTextContent("unresolved");
  });

  it("never fills an uncovered lane from the other team", async () => {
    await renderBoard();
    const mid = screen.getByTestId("lane-card-Mid");
    expect(within(mid).getByTestId("candidate-Faker")).toBeInTheDocument();
    const blg = within(mid).getByTestId("lane-Mid-Bilibili Gaming");
    expect(within(blg).queryByTestId(/^candidate-/)).toBeNull();
  });

  it("surfaces the roster warnings rather than smoothing them over", async () => {
    await renderBoard();
    const warnings = screen.getByTestId("team-warnings");
    expect(within(warnings).getByTestId("team-warning-roster_partial")).toBeInTheDocument();
    expect(within(warnings).getByTestId("team-warning-lane_uncovered")).toBeInTheDocument();
    expect(within(warnings).getByTestId("team-warning-lane_timeshare")).toBeInTheDocument();
  });
});

// --- side-by-side, never head-to-head ---------------------------------------

describe("side-by-side semantics", () => {
  it("names the comparison accurately and never 'head-to-head'", async () => {
    // Phase 3 leads with what this IS. The server's denial still prints, as
    // the note under the plates — see the next test.
    await renderBoard();
    expect(screen.getByText("Independent performance comparison")).toBeInTheDocument();
    expect(screen.queryByText(/head-to-head record of/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/versus record|series score/i);
  });

  it("prints the server's side-by-side sentence", async () => {
    await renderBoard();
    expect(screen.getAllByText(NOTES.side_by_side).length).toBeGreaterThan(0);
  });

  it("renders no records at all if the server ever stopped asserting it", async () => {
    // The flag is asserted, not assumed.
    team = { ...teamResponse(), head_to_head: true } as never;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/matchup/contract") ? CONTRACT : team;
        return { ok: true, status: 200, json: async () => body } as Response;
      }),
    );
    renderAt(TEAM_URL);
    await waitFor(() => expect(screen.getByTestId("team-heading")).toBeInTheDocument());
    expect(screen.queryByTestId("lane-board")).toBeNull();
  });

  it("shows each side's own record", async () => {
    await renderBoard();
    const top = screen.getByTestId("lane-card-Top");
    const records = within(top).getAllByTestId("candidate-record");
    expect(records[0]).toHaveTextContent("Games");
    expect(records[0]).toHaveTextContent("101");
    expect(records[1]).toHaveTextContent("125");
  });
});

// --- qualification wording --------------------------------------------------

describe("qualification wording", () => {
  it("prints the focus status verbatim and never 'qualified'", async () => {
    await renderBoard();
    expect(screen.getByTestId("team-focus-T1")).toHaveTextContent("watchlist");
    expect(screen.getByTestId("team-focus-T1")).not.toHaveTextContent("slot claimed");
    expect(document.body.textContent).not.toMatch(/qualified for|has qualified/i);
  });

  it("prints the server's focus note", async () => {
    await renderBoard();
    expect(screen.getByTestId("matchup-focus-note")).toHaveTextContent(
      "not a qualification claim",
    );
  });
});

// --- no prediction ----------------------------------------------------------

describe("no prediction", () => {
  it("prints the server's team-mode note denying every prediction", async () => {
    await renderBoard();
    const body = document.body.textContent ?? "";
    expect(body).toContain("not a prediction");
    expect(body).toContain("who will start");
    expect(body).toContain("what will be drafted");
    expect(body).toContain("who will win");
  });

  it("never says a lineup is expected, projected or likely", async () => {
    await renderBoard();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/expected lineup|projected|likely to start|predicted/i);
  });
});

// --- champion pools ---------------------------------------------------------

describe("demonstrated picks", () => {
  it("labels the pool 'Demonstrated picks'", async () => {
    await renderBoard();
    const top = screen.getByTestId("lane-card-Top");
    expect(within(top).getAllByText(/Demonstrated picks/i).length).toBeGreaterThan(0);
  });

  it("prints the server's pool note and never 'can play'", async () => {
    await renderBoard();
    expect(screen.getAllByText(NOTES.pool).length).toBeGreaterThan(0);
    // Scanned with the served notes lifted out: the pool note is where "able
    // to play" is DENIED, so scanning it for that phrase would fail on the
    // very sentence doing the work.
    let body = document.body.textContent ?? "";
    for (const note of Object.values(NOTES)) body = body.split(note).join("");
    expect(body).not.toMatch(/champion pool of|able to play|can play/i);
  });

  it("collapses at the served preview and keeps the tail one click away", async () => {
    await renderBoard();
    const top = screen.getByTestId("lane-card-Top");
    const doran = within(top).getByTestId("candidate-Doran");
    // pool_preview is 2; Doran has three picks, the third with one game.
    expect(within(doran).queryByTestId("pool-row-Rumble")).toBeNull();
    fireEvent.click(within(doran).getByTestId("pool-disclosure-toggle"));
    expect(within(doran).getByTestId("pool-row-Rumble")).toBeInTheDocument();
  });

  it("shows a one-game pick when expanded — no minimum-game floor", async () => {
    await renderBoard();
    const doran = within(screen.getByTestId("lane-card-Top")).getByTestId("candidate-Doran");
    fireEvent.click(within(doran).getByTestId("pool-disclosure-toggle"));
    expect(within(doran).getByTestId("pool-row-Rumble")).toHaveTextContent("1");
  });

  it("expanding is a display toggle and never a second request", async () => {
    await renderBoard();
    const before = requests.length;
    const doran = within(screen.getByTestId("lane-card-Top")).getByTestId("candidate-Doran");
    fireEvent.click(within(doran).getByTestId("pool-disclosure-toggle"));
    expect(requests.length).toBe(before);
  });

  it("declares a bounded pool fetch rather than looking like an empty bench", async () => {
    await renderBoard();
    const support = screen.getByTestId("lane-card-Support");
    // Phase 3 leads with the demonstrated starter and keeps every other
    // candidate one click behind "Other players in this lane" — retained in
    // full, never filtered.
    fireEvent.click(within(support).getByTestId("lane-more-Support-T1-toggle"));
    expect(within(support).getByTestId("candidate-Sub2")).toBeInTheDocument();
    // ...and the omission is stated, pointing at the lane view.
    expect(within(support).getByTestId("pool-omitted")).toHaveTextContent("open the lane");
    expect(within(support).getByTestId("lane-pool-bound")).toHaveTextContent("2 of 3");
  });
});

// --- bans -------------------------------------------------------------------

describe("bans", () => {
  it("applies one ban across every lane", async () => {
    await renderBoard();
    fireEvent.click(screen.getByTestId("team-ban-Vi"));
    await waitFor(() => expect(requests.some((u) => u.includes("ban=Vi"))).toBe(true));
    // Both Jungle sides play Vi; both must show it struck out where the reader
    // actually looks — the summary chip, not only the expanded table.
    await waitFor(() => {
      const jungle = screen.getByTestId("lane-card-Jungle");
      const chips = within(jungle).getAllByTestId("champ-chip-Vi");
      expect(chips.length).toBeGreaterThanOrEqual(2);
      for (const chip of chips) expect(chip.className).toContain("is-banned");
    });
  });

  it("keeps a banned champion visible in the pool", async () => {
    // The whole point of the ban control: you see what you removed. It is a
    // set difference over `selectable`, never a filter over the pool.
    await renderBoard(`${TEAM_URL}&ban=Vi`);
    const jungle = screen.getByTestId("lane-card-Jungle");
    expect(within(jungle).getAllByTestId("champ-chip-Vi").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a banned champion in the full evidence table too", async () => {
    await renderBoard(`${TEAM_URL}&ban=Vi`);
    const jungle = screen.getByTestId("lane-card-Jungle");
    for (const toggle of within(jungle).getAllByTestId("pool-disclosure-toggle")) {
      fireEvent.click(toggle);
    }
    const rows = within(jungle).getAllByTestId("pool-row-Vi");
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.className).toContain("is-banned");
  });

  it("marks a ban on the team summary too", async () => {
    await renderBoard(`${TEAM_URL}&ban=Ambessa`);
    const chip = screen.getByTestId("team-champ-Bilibili Gaming-Ambessa");
    expect(chip.className).toContain("is-banned");
  });

  it("writes the ban into the URL so a board is shareable", async () => {
    await renderBoard();
    fireEvent.click(screen.getByTestId("team-ban-Vi"));
    await waitFor(() => {
      const last = requests[requests.length - 1];
      expect(last).toContain("ban=Vi");
      expect(last).toContain("team_a=T1");
    });
  });

  it("prints the server's ban note denying a draft model", async () => {
    await renderBoard();
    expect(screen.getByText(NOTES.bans)).toBeInTheDocument();
  });

  it("offers only champions somebody on the board demonstrably plays", async () => {
    await renderBoard();
    const bar = screen.getByTestId("team-bans");
    expect(within(bar).getByTestId("team-ban-Vi")).toBeInTheDocument();
    // Nobody on this board played Yuumi, so it is not offered.
    expect(within(bar).queryByTestId("team-ban-Yuumi")).toBeNull();
  });
});

// --- team summary -----------------------------------------------------------

describe("team champion summary", () => {
  it("shows each team's own demonstrated champions", async () => {
    await renderBoard();
    expect(screen.getByTestId("team-champ-T1-Ornn")).toHaveTextContent("Ornn");
    expect(screen.getByTestId("team-champ-Bilibili Gaming-Ambessa")).toBeInTheDocument();
  });

  it("prints the note denying a meta or draft read", async () => {
    await renderBoard();
    expect(screen.getByText(NOTES.team_summary)).toBeInTheDocument();
  });

  it("reports a partial roster beside the team", async () => {
    await renderBoard();
    expect(screen.getByTestId("team-summary-Bilibili Gaming")).toHaveTextContent("no player in Mid");
  });
});

// --- drill-down -------------------------------------------------------------

describe("lane drill-down", () => {
  it("builds a lane-mode URL from the server's own selection", () => {
    const url = drilldownUrl("/lol/pro-play/matchup", {
      lane: "Mid",
      selection: {
        team_a: "T1",
        team_b: "Bilibili Gaming",
        lane: "Mid",
        player_a: "Faker",
        player_b: null,
        champion_a: null,
        champion_b: null,
        bans: ["Vi"],
        pool_scope_id: "all_time",
      },
      player_a_prefilled: true,
      player_b_prefilled: false,
    });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("lane")).toBe("Mid");
    expect(params.get("player_a")).toBe("Faker");
    expect(params.get("player_b")).toBeNull();
    expect(params.getAll("ban")).toEqual(["Vi"]);
    expect(params.get("pool_scope")).toBe("all_time");
    // The lane it names would resolve to lane mode on its own; since Phase 3
    // the link says so outright as well.
    expect(params.get("mode")).toBe("lane");
  });

  it("pre-fills both players for an unambiguous lane", async () => {
    await renderBoard();
    const link = screen.getByTestId("lane-drilldown-Top") as HTMLAnchorElement;
    const params = new URLSearchParams(link.getAttribute("href")!.split("?")[1]);
    expect(params.get("player_a")).toBe("Doran");
    expect(params.get("player_b")).toBe("Bin");
    expect(link).not.toHaveTextContent("choose players");
  });

  it("pre-fills nobody on a timeshared side and says so", async () => {
    await renderBoard();
    const link = screen.getByTestId("lane-drilldown-Jungle") as HTMLAnchorElement;
    const params = new URLSearchParams(link.getAttribute("href")!.split("?")[1]);
    expect(params.get("player_a")).toBeNull();
    expect(params.get("player_b")).toBe("Xun");
    expect(link).toHaveTextContent("choose players");
  });

  it("pre-fills nobody on an uncovered side", async () => {
    await renderBoard();
    const link = screen.getByTestId("lane-drilldown-Mid") as HTMLAnchorElement;
    const params = new URLSearchParams(link.getAttribute("href")!.split("?")[1]);
    expect(params.get("player_a")).toBe("Faker");
    expect(params.get("player_b")).toBeNull();
  });

  it("never pre-fills a champion", async () => {
    await renderBoard();
    for (const lane of LANES) {
      const link = screen.getByTestId(`lane-drilldown-${lane}`) as HTMLAnchorElement;
      const params = new URLSearchParams(link.getAttribute("href")!.split("?")[1]);
      expect(params.get("champion_a")).toBeNull();
      expect(params.get("champion_b")).toBeNull();
    }
  });

  it("carries the bans and the scope into every drill-down", async () => {
    await renderBoard(`${TEAM_URL}&ban=Vi`);
    for (const lane of LANES) {
      const link = screen.getByTestId(`lane-drilldown-${lane}`) as HTMLAnchorElement;
      const params = new URLSearchParams(link.getAttribute("href")!.split("?")[1]);
      expect(params.getAll("ban")).toEqual(["Vi"]);
    }
  });
});

// --- Phase 1 regression -----------------------------------------------------

describe("Phase 1 is not regressed", () => {
  it("opens the five-lane board with no mode in the URL", async () => {
    // Phase 3 made the board the flagship. A bare URL is now a dossier, not
    // an empty configuration form.
    renderAt("");
    await waitFor(() => expect(screen.getByTestId("lane-board")).toBeInTheDocument());
    expect(screen.queryByTestId("matchup-lane")).toBeNull();
    expect(requests.some((u) => u.includes("/matchup/team"))).toBe(true);
  });

  it("still renders a Phase 1 lane link in lane mode", async () => {
    // Every link Phase 1 ever produced names a lane, and must be unchanged.
    renderAt("?team_a=T1&team_b=Bilibili+Gaming&lane=Mid");
    await waitFor(() => expect(screen.getByTestId("matchup-lane")).toBeInTheDocument());
    expect(screen.queryByTestId("lane-board")).toBeNull();
    expect(requests.some((u) => u.includes("/matchup/explore"))).toBe(true);
  });

  it("switching to the board and back keeps the teams", async () => {
    await renderBoard();
    fireEvent.click(screen.getByTestId("matchup-mode-lane"));
    await waitFor(() => expect(screen.getByTestId("matchup-lane")).toBeInTheDocument());
    const last = requests[requests.length - 1];
    expect(last).toContain("/matchup/explore");
    expect(last).toContain("team_a=T1");
    expect(last).toContain("team_b=Bilibili+Gaming");
  });

  it("offers a route back to the board from a lane view", async () => {
    renderAt("?team_a=T1&team_b=Bilibili+Gaming&lane=Mid");
    await waitFor(() => expect(screen.getByTestId("lane-to-team")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("lane-to-team"));
    await waitFor(() => expect(screen.getByTestId("lane-board")).toBeInTheDocument());
  });

  it("shows both mode tabs with the active one selected", async () => {
    await renderBoard();
    expect(screen.getByTestId("matchup-mode-team")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("matchup-mode-lane")).toHaveAttribute("aria-selected", "false");
  });
});

// --- Phase 3: the dossier ---------------------------------------------------

describe("Phase 3 dossier", () => {
  it("answers 'who is playing' before it asks anything", async () => {
    await renderBoard();
    const header = screen.getByTestId("team-heading");
    expect(header).toHaveTextContent("T1");
    expect(header).toHaveTextContent("Bilibili Gaming");
    expect(header).toHaveTextContent("2026");
    // The five lanes are present on first paint — no configuration required.
    expect(screen.getByTestId("lane-board")).toBeInTheDocument();
    for (const lane of ["Top", "Jungle", "Mid", "Bot", "Support"]) {
      expect(screen.getByTestId(`lane-card-${lane}`)).toBeInTheDocument();
    }
  });

  it("offers the four scopes as a dossier-level rail", async () => {
    await renderBoard();
    const rail = screen.getByTestId("dossier-scope-rail");
    for (const id of ["current_2026", "worlds_2025", "recent_2025_2026", "all_time"]) {
      expect(within(rail).getByTestId(`dossier-scope-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("dossier-scope-current_2026")).toHaveAttribute("aria-pressed", "true");
  });

  it("re-requests the board when the scope changes", async () => {
    await renderBoard();
    fireEvent.click(screen.getByTestId("dossier-scope-all_time"));
    await waitFor(() =>
      expect(requests.some((u) => u.includes("scope=all_time"))).toBe(true),
    );
  });

  it("renders a timeshare as a finding, with every candidate and no starter", async () => {
    await renderBoard();
    const jungle = screen.getByTestId("lane-card-Jungle");
    const side = within(jungle).getByTestId("lane-Jungle-T1");
    expect(within(side).getByTestId("lane-state-Jungle-T1")).toHaveTextContent("timeshare");
    // No starter badge anywhere on a shared lane, and the other candidates
    // are OPEN by default — collapsing half a shared lane would be the forced
    // starter this board refuses to name.
    expect(within(side).queryByTestId("starter-badge")).toBeNull();
    expect(within(side).getAllByTestId(/^candidate-/).length).toBeGreaterThan(1);
  });

  it("explains an uncovered lane rather than showing it as empty or zero", async () => {
    await renderBoard();
    // BLG Mid before the identity rebuild: quarantined, so uncovered. The
    // OTHER side of the same lane still has its demonstrated starter — an
    // uncovered side must never borrow one, and never suppress one either.
    const uncovered = within(screen.getByTestId("lane-card-Mid")).getByTestId(
      "lane-Mid-Bilibili Gaming",
    );
    expect(within(uncovered).getByText(/Nobody played this lane/i)).toBeInTheDocument();
    expect(within(uncovered).queryByTestId("starter-badge")).toBeNull();
    expect(within(uncovered).queryByTestId(/^candidate-/)).toBeNull();
  });

  it("still prints the server's no-prediction note, unedited", async () => {
    await renderBoard();
    expect(screen.getByTestId("team-mode-note")).toHaveTextContent(NOTES.team_mode);
  });

  it("surfaces team-level figures already served by the backend", async () => {
    await renderBoard();
    const summary = screen.getByTestId("team-summary-T1");
    expect(summary).toHaveTextContent("Games");
    expect(summary).toHaveTextContent("Win rate");
    expect(summary).toHaveTextContent("Champions");
    expect(within(summary).getByTestId("team-roster-T1")).toHaveTextContent(/roster/i);
  });

  it("never claims a head-to-head anywhere on the dossier", async () => {
    await renderBoard();
    let body = document.body.textContent ?? "";
    for (const note of Object.values(NOTES)) body = body.split(note).join("");
    expect(body).not.toMatch(/head-to-head|h2h|series score|versus record/i);
    expect(body).not.toMatch(/will start|predicted|projected|expected to win/i);
  });

  it("prefills a lane drill-down only where the server named a player", async () => {
    await renderBoard();
    const jungle = screen.getByTestId("lane-card-Jungle");
    const href = within(jungle).getByTestId("lane-drilldown-Jungle").getAttribute("href")!;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("lane")).toBe("Jungle");
    // T1's jungle is the timeshare, so side A must stay unfilled; BLG's is
    // unambiguous and carries its player through.
    expect(params.get("player_a")).toBeNull();
    expect(params.get("player_b")).toBeTruthy();
  });
});
