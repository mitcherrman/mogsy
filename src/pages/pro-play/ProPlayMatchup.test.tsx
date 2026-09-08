/**
 * The Worlds Matchup Explorer — the rendering and state rules that carry
 * meaning.
 *
 * Not snapshot tests. Each one pins a statement the surface must not make, or
 * a behaviour the product requirement turns on:
 *
 *  - a watchlist team is never presented as qualified;
 *  - two independent records are never labelled head-to-head;
 *  - an absence is never a zero, and a rate over no games is never 0%;
 *  - a demonstrated pool is never a capability, and a one-game pick survives;
 *  - a ban is a set difference, and never silently unselects a champion;
 *  - the URL is the selection, exactly, in both directions.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MatchupBody } from "./ProPlayMatchup";
import {
  EMPTY_SELECTION,
  selectionFromParams,
  selectionToParams,
  withBanToggled,
  withChampion,
  withLane,
  withPlayer,
  withPoolScope,
  withTeam,
  type MatchupSelection,
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

const SCOPE_ORDER = ["current_2026", "worlds_2025", "recent_2025_2026", "all_time"];
const SCOPE_LABELS: Record<string, string> = {
  current_2026: "2026",
  worlds_2025: "Worlds 2025",
  recent_2025_2026: "2025–2026",
  all_time: "All Time",
};

function scope(id: string, stats: Record<string, unknown> | null) {
  return {
    scope: { scope_id: id, kind: "season", label: SCOPE_LABELS[id], bounded: true },
    participation: stats === null ? "did_not_participate" : "participated",
    entity_games_in_scope: stats ? 100 : 0,
    tournaments_in_scope: [],
    leagues_in_scope: [],
    stats,
  };
}

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
    team_key: "Hanwha Life Esports",
    owner_label: "HLE",
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

const NOTES = {
  focus: "Team selection is limited to Mogzy's curated Worlds 2026 focus set — an editorial watchlist, not a qualification claim.",
  pool: "Demonstrated picks: champions this player actually played in the selected scope. Not a statement of what they are able to play.",
  side_by_side:
    "Side-by-side record: each player's own results against the whole field over the same scopes. This is not a head-to-head record.",
  bans: "Bans remove a champion from what can be selected. No draft model, no inferred opponent bans.",
};

const CONTRACT = {
  contract_version: "pro_matchup_v1",
  comparison_contract_version: "pro_comparison_v1",
  semantics: "independent_side_by_side",
  head_to_head: false,
  lanes: ["Top", "Jungle", "Mid", "Bot", "Support"],
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
    pending_slots: [
      {
        group: "South America",
        count: 2,
        reason: "qualification unresolved as of 2026-09-06",
        team_key: null,
        status: "unresolved",
      },
    ],
    teams_asserting_qualification: [],
  },
  notes: NOTES,
};

function rosterPlayer(page: string, role: string, games: number) {
  return {
    player_lp_page: page,
    display_name: page,
    role,
    games,
    wins: Math.floor(games * 0.7),
    first_played_at: "2026-01-10 00:00:00",
    last_played_at: "2026-07-08 08:52:00",
    share_of_team_games: games / 101,
    declared_member: true,
  };
}

function side(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function fullSide({
  team,
  player,
  champion,
  pool,
  scopes,
  conflicts = [],
  laneCandidates,
  rosterOverrides = {},
}: {
  team: string;
  player: string;
  champion: string | null;
  pool: ReturnType<typeof champ>[];
  scopes: Record<string, unknown>;
  conflicts?: string[];
  laneCandidates?: Record<string, unknown>;
  rosterOverrides?: Record<string, unknown>;
}) {
  const focus = FOCUS_TEAMS.find((t) => t.team_key === team)!;
  return side({
    team: { team_key: team, display_name: team },
    focus,
    lane: "Mid",
    roster: {
      team_key: team,
      scope_id: "current_2026",
      scope_label: "2026",
      team_games_in_scope: 101,
      players: [rosterPlayer(player, "Mid", 101)],
      by_role: { Mid: [rosterPlayer(player, "Mid", 101)] },
      completeness: {
        state: "complete",
        roles_covered: ["Top", "Jungle", "Mid", "Bot", "Support"],
        roles_missing: [],
        ambiguous_roles: [],
        has_full_five: true,
      },
      ...rosterOverrides,
    },
    lane_candidates: laneCandidates ?? {
      lane: "Mid",
      players: [rosterPlayer(player, "Mid", 101)],
      starter: player,
      ambiguous: false,
      ambiguous_reason: null,
      lane_covered: true,
    },
    player: { player_lp_page: player, display_name: player },
    pool: {
      scope_id: "current_2026",
      scope_label: "2026",
      participation: "participated",
      player_games_in_scope: 101,
      pool_size: pool.length,
      champions: pool,
      selectable: pool.filter((c) => !c.banned).map((c) => c.key),
      banned_from_pool: pool.filter((c) => c.banned).map((c) => c.key),
      note: NOTES.pool,
    },
    champion_key: champion,
    comparison: champion
      ? {
          contract_version: "pro_comparison_v1",
          entity: { kind: "player_champion", id: player, display_name: player, champion_key: champion },
          league_filter: "MAJOR",
          scope_order: SCOPE_ORDER,
          scopes,
        }
      : null,
    needs: champion ? [] : ["champion_not_selected"],
    conflicts,
  });
}

function response(sides: { a: unknown; b: unknown }, selection: Partial<MatchupSelection> = {}, bans: string[] = []) {
  return {
    contract_version: "pro_matchup_v1",
    comparison_contract_version: "pro_comparison_v1",
    comparison_kind: "players_side_by_side",
    semantics: "independent_side_by_side",
    head_to_head: false,
    selection: { ...EMPTY_SELECTION, ...selection, bans },
    lanes: CONTRACT.lanes,
    scope_order: SCOPE_ORDER,
    scope_labels: SCOPE_LABELS,
    bans: { champions: bans, note: NOTES.bans },
    sides,
    resolved: true,
    notes: NOTES,
  };
}

const FAKER_POOL = [champ("Azir", 13, 11), champ("Orianna", 8, 7), champ("Viktor", 1, 0)];
const ZEKA_POOL = [champ("Aurora", 15, 10), champ("Yone", 7, 5), champ("Sylas", 4, 3)];

const SCENARIO_A = response({
  a: fullSide({
    team: "T1",
    player: "Faker",
    champion: "Orianna",
    pool: FAKER_POOL,
    scopes: {
      current_2026: scope("current_2026", { games: 8, wins: 7, losses: 1, win_rate: 0.875, first_played_at: null, last_played_at: "2026-07-06 06:00:00", champion_share: 0.079 }),
      worlds_2025: scope("worlds_2025", { games: 2, wins: 2, losses: 0, win_rate: 1, first_played_at: null, last_played_at: "2025-11-02 07:15:00", champion_share: 0.083 }),
      recent_2025_2026: scope("recent_2025_2026", { games: 26, wins: 21, losses: 5, win_rate: 0.807, first_played_at: null, last_played_at: "2026-07-06 06:00:00", champion_share: 0.104 }),
      all_time: scope("all_time", { games: 93, wins: 70, losses: 23, win_rate: 0.752, first_played_at: null, last_played_at: "2026-07-06 06:00:00", champion_share: 0.064 }),
    },
  }),
  b: fullSide({
    team: "Hanwha Life Esports",
    player: "Zeka (Kim Geon-woo)",
    champion: "Yone",
    pool: ZEKA_POOL,
    scopes: {
      current_2026: scope("current_2026", { games: 7, wins: 5, losses: 2, win_rate: 0.714, first_played_at: null, last_played_at: "2026-07-11 10:03:00", champion_share: 0.076 }),
      // The two states that must never collapse, both present in one payload.
      worlds_2025: scope("worlds_2025", null),
      recent_2025_2026: scope("recent_2025_2026", { games: 0, wins: 0, losses: 0, win_rate: null, first_played_at: null, last_played_at: null, champion_share: 0 }),
      all_time: scope("all_time", { games: 49, wins: 37, losses: 12, win_rate: 0.755, first_played_at: null, last_played_at: "2026-07-11 10:03:00", champion_share: 0.079 }),
    },
  }),
});

function installFetch(explore: unknown = SCENARIO_A) {
  requests.length = 0;
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
      } else if (url.includes("/matchup/explore")) {
        // Reflect the requested champions back, the way the server does, so a
        // test that changes a selection sees the panel follow it.
        const params = new URLSearchParams(url.split("?")[1] ?? "");
        const payload = JSON.parse(JSON.stringify(explore));
        for (const [key, field] of [["a", "champion_a"], ["b", "champion_b"]] as const) {
          const wanted = params.get(field);
          if (wanted && payload?.sides?.[key]?.champion_key) payload.sides[key].champion_key = wanted;
        }
        body = payload;
        status = 200;
      } else if (url.includes("/api/docs/champions/")) {
        const slug = url.split("/api/docs/champions/")[1];
        body = {
          ok: true,
          champion: { name: slug, slug, id: 1, title: null, resource_type: "Mana", release_date: null },
          stats: { hp: 530, armor: 17, magic_resist: 30, ad: 40, attack_range: 525, move_speed: 325 },
          abilities: [{ slot: "Q", name: "Command: Attack", cooldown: { raw: "6 / 5 / 4", by_rank: null }, cost: { raw: "50", by_rank: null }, range: null, ranks: 5, source_id: 1, formulas: [], description: null }],
          meta: { patch: "26.14", source: "wiki", last_updated: null, last_verified: null, verification_status: "verified" },
        };
        status = 200;
      }
      return { ok: status < 300, status, json: async () => body } as Response;
    }),
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/lol/pro-play/matchup" element={<MatchupBody />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SCENARIO_URL =
  "/lol/pro-play/matchup?team_a=T1&team_b=Hanwha+Life+Esports&lane=Mid&player_a=Faker&player_b=Zeka+%28Kim+Geon-woo%29&champion_a=Orianna&champion_b=Yone";

beforeEach(() => {
  installFetch();
});

// --- URL state --------------------------------------------------------------

describe("selection <-> URL", () => {
  it("round-trips every field", () => {
    const selection: MatchupSelection = {
      team_a: "T1",
      team_b: "Gen.G",
      lane: "Mid",
      player_a: "Faker",
      player_b: "Chovy",
      champion_a: "Orianna",
      champion_b: "Vex",
      bans: ["Sylas", "Yone"],
      pool_scope_id: "all_time",
    };
    expect(selectionFromParams(selectionToParams(selection))).toEqual(selection);
  });

  it("keeps a key with punctuation intact", () => {
    // A comma-joined ban list would split "Kai'Sa" — and a Leaguepedia page
    // really does contain parentheses and spaces.
    const selection = {
      ...EMPTY_SELECTION,
      player_a: "Zeka (Kim Geon-woo)",
      bans: ["Kai'Sa", "Nunu & Willump"],
    };
    const back = selectionFromParams(selectionToParams(selection));
    expect(back.player_a).toBe("Zeka (Kim Geon-woo)");
    expect(back.bans).toEqual(["Kai'Sa", "Nunu & Willump"]);
  });

  it("produces one canonical URL whatever order the bans were added", () => {
    const one = selectionToParams({ ...EMPTY_SELECTION, bans: ["Yone", "Akali", "Sylas"] }).toString();
    const two = selectionToParams({ ...EMPTY_SELECTION, bans: ["Sylas", "Yone", "Akali"] }).toString();
    expect(one).toBe(two);
  });

  it("omits the default pool scope and empty fields, and names its mode", () => {
    // `mode=lane` is now explicit: since Phase 3 the board is the default, so
    // a lane selection with nothing chosen yet has to say which board it is
    // or it would bounce back to the dossier.
    expect(selectionToParams(EMPTY_SELECTION).toString()).toBe("mode=lane");
  });

  it("restores a pasted matchup", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-sides")).toBeInTheDocument());
    const explore = requests.find((u) => u.includes("/explore"))!;
    expect(explore).toContain("team_a=T1");
    expect(explore).toContain("champion_a=Orianna");
    expect(explore).toContain("champion_b=Yone");
    // URLSearchParams form-encodes a space as "+", so the key survives with
    // its parentheses intact and is decoded back by the server.
    expect(decodeURIComponent(explore).replace(/\+/g, " ")).toContain("player_b=Zeka (Kim Geon-woo)");
  });
});

// --- selection edits --------------------------------------------------------

describe("selection edits invalidate exactly what they must", () => {
  const base: MatchupSelection = {
    team_a: "T1",
    team_b: "Gen.G",
    lane: "Mid",
    player_a: "Faker",
    player_b: "Chovy",
    champion_a: "Orianna",
    champion_b: "Azir",
    bans: [],
    pool_scope_id: "current_2026",
  };

  it("a new team clears that side's player and champion only", () => {
    const next = withTeam(base, "a", "Gen.G");
    expect(next.player_a).toBeNull();
    expect(next.champion_a).toBeNull();
    expect(next.player_b).toBe("Chovy");
    expect(next.champion_b).toBe("Azir");
  });

  it("a new lane clears both sides' players — the lane is shared", () => {
    const next = withLane(base, "Top");
    expect(next.player_a).toBeNull();
    expect(next.player_b).toBeNull();
    expect(next.team_a).toBe("T1");
  });

  it("a new player clears only that side's champion", () => {
    const next = withPlayer(base, "b", "Ruler");
    expect(next.champion_b).toBeNull();
    expect(next.champion_a).toBe("Orianna");
  });

  it("swapping a champion changes nothing upstream — the product requirement", () => {
    const next = withChampion(base, "a", "Viktor");
    expect(next).toEqual({ ...base, champion_a: "Viktor" });
  });

  it("changing the pool scope keeps the champions — a real answer is not erased", () => {
    const next = withPoolScope(base, "all_time");
    expect(next.champion_a).toBe("Orianna");
    expect(next.pool_scope_id).toBe("all_time");
  });

  it("banning a selected champion does not silently unselect it", () => {
    const next = withBanToggled(base, "Orianna");
    expect(next.bans).toEqual(["Orianna"]);
    expect(next.champion_a).toBe("Orianna");
  });

  it("a ban toggles off", () => {
    expect(withBanToggled(withBanToggled(base, "Yone"), "Yone").bans).toEqual([]);
  });
});

// --- rendering: the statements the page must not make -----------------------

describe("the Explorer's wording", () => {
  it("never says head-to-head", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-sides")).toBeInTheDocument());
    expect(screen.getByText("Independent performance comparison")).toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toContain("head-to-head record:");
    expect(screen.getByText(/not a head-to-head record/i)).toBeInTheDocument();
  });

  it("prints the focus status literally and claims no qualification", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-sides")).toBeInTheDocument());
    expect(screen.getAllByText("watchlist").length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    expect(text).toContain("not a qualification claim");
    expect(text).not.toContain("slot claimed");
    expect(text).not.toMatch(/qualified for/i);
  });

  it("shows the unresolved slots rather than omitting them", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-pending-slot")).toBeInTheDocument());
    expect(screen.getByTestId("matchup-pending-slot").textContent).toContain("2 unresolved South America");
  });

  it("calls the pool demonstrated picks, never a capability", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-pool-a")).toBeInTheDocument());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Demonstrated picks");
    expect(text).not.toMatch(/champions? (they|he|she) can play/i);
    expect(text).not.toContain("full champion pool");
  });
});

describe("the participation fork", () => {
  it("renders an absence as 'Did not participate', not a zero", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-side-b")).toBeInTheDocument());
    const b = screen.getByTestId("matchup-side-b");
    const worlds = b.querySelector('[data-testid="scope-card-worlds_2025"]')!;
    expect(worlds.textContent).toContain("Did not participate");
    expect(worlds.textContent).toContain("not a record of zero games");
  });

  it("renders a real zero as a zero with no win rate", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-side-b")).toBeInTheDocument());
    const recent = screen
      .getByTestId("matchup-side-b")
      .querySelector('[data-testid="scope-card-recent_2025_2026"]')!;
    expect(recent.textContent).not.toContain("Did not participate");
    expect(recent.textContent).toContain("0");
    // A rate over zero games is an em dash, never 0.0%.
    expect(recent.textContent).not.toContain("0.0%");
  });

  it("shows all four scopes for both sides", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-sides")).toBeInTheDocument());
    for (const testid of ["matchup-side-a", "matchup-side-b"]) {
      const card = screen.getByTestId(testid);
      for (const id of SCOPE_ORDER) {
        expect(card.querySelector(`[data-testid="scope-card-${id}"]`)).toBeTruthy();
      }
    }
  });
});

describe("the demonstrated pool", () => {
  it("keeps a one-game pick and offers it", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-champion-a")).toBeInTheDocument());
    const select = screen.getByTestId("matchup-champion-a") as HTMLSelectElement;
    const viktor = [...select.options].find((o) => o.value === "Viktor")!;
    expect(viktor).toBeTruthy();
    expect(viktor.disabled).toBe(false);
    expect(viktor.textContent).toContain("1g");
  });
});

describe("bans", () => {
  it("offers only champions in the two pools", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-bans")).toBeInTheDocument());
    expect(screen.getByTestId("matchup-ban-Azir")).toBeInTheDocument();
    expect(screen.getByTestId("matchup-ban-Yone")).toBeInTheDocument();
    expect(screen.queryByTestId("matchup-ban-Yuumi")).toBeNull();
  });

  it("a ban writes itself into the URL and the request", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-ban-Yone")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("matchup-ban-Yone"));
    await waitFor(() =>
      expect(requests.filter((u) => u.includes("ban=Yone")).length).toBeGreaterThan(0),
    );
  });

  it("a banned champion stays listed, disabled and marked", async () => {
    const banned = response(
      {
        a: fullSide({
          team: "T1",
          player: "Faker",
          champion: "Orianna",
          pool: [champ("Azir", 13, 11), champ("Orianna", 8, 7, true)],
          scopes: Object.fromEntries(SCOPE_ORDER.map((id) => [id, scope(id, { games: 8, wins: 7, losses: 1, win_rate: 0.875, first_played_at: null, last_played_at: null, champion_share: 0.079 })])),
          conflicts: ["champion_banned"],
        }),
        b: side(),
      },
      {},
      ["Orianna"],
    );
    installFetch(banned);
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-champion-a")).toBeInTheDocument());
    const option = [...(screen.getByTestId("matchup-champion-a") as HTMLSelectElement).options].find(
      (o) => o.value === "Orianna",
    )!;
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain("(banned)");
    // And the conflict is explained rather than the selection being dropped.
    expect(screen.getByTestId("matchup-conflict-champion_banned")).toBeInTheDocument();
  });
});

describe("roster honesty", () => {
  it("reports a lane nobody covers instead of naming a player", async () => {
    const blg = response({
      a: fullSide({
        team: "Bilibili Gaming",
        player: "",
        champion: null,
        pool: [],
        scopes: {},
        laneCandidates: {
          lane: "Mid",
          players: [],
          starter: null,
          ambiguous: false,
          ambiguous_reason: null,
          lane_covered: false,
        },
        rosterOverrides: {
          completeness: {
            state: "partial",
            roles_covered: ["Top", "Jungle", "Bot", "Support"],
            roles_missing: ["Mid"],
            ambiguous_roles: [],
            has_full_five: false,
          },
        },
      }),
      b: side(),
    });
    installFetch(blg);
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-roster-a")).toBeInTheDocument());
    expect(screen.getByTestId("matchup-roster-a").textContent).toContain("no player in Mid");
    const select = screen.getByTestId("matchup-player-a") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.textContent).toContain("No player in this lane");
  });

  it("reports a timeshare and offers both players", async () => {
    const ig = response({
      a: fullSide({
        team: "T1",
        player: "Soboro",
        champion: null,
        pool: [],
        scopes: {},
        laneCandidates: {
          lane: "Mid",
          players: [rosterPlayer("Soboro", "Mid", 41), rosterPlayer("Breathe", "Mid", 38)],
          starter: null,
          ambiguous: true,
          ambiguous_reason: "Mid: no clear starter: Soboro 41g vs Breathe 38g",
          lane_covered: true,
        },
      }),
      b: side(),
    });
    installFetch(ig);
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-lane-ambiguous-a")).toBeInTheDocument());
    expect(screen.getByTestId("matchup-lane-ambiguous-a").textContent).toContain("no clear starter");
    const options = [...(screen.getByTestId("matchup-player-a") as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toContain("Soboro");
    expect(options).toContain("Breathe");
  });
});

describe("champion mechanics", () => {
  it("reads the public champion docs authority for both champions", async () => {
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-mechanics")).toBeInTheDocument());
    expect(requests.some((u) => u.endsWith("/api/docs/champions/orianna"))).toBe(true);
    expect(requests.some((u) => u.endsWith("/api/docs/champions/yone"))).toBe(true);
    const table = screen.getByTestId("matchup-mechanics").textContent ?? "";
    expect(table).toContain("Attack range");
    expect(table).toContain("525");
    expect(table).toContain("Command: Attack");
    expect(table).toContain("CD 6 / 5 / 4");
  });

  it("does not refetch the other champion when one side changes", async () => {
    // The Explorer's core interaction is swapping one champion. Refetching
    // both documents each time is one HTTP request per champion per swap,
    // which is exactly the shape this workstream was told to avoid.
    renderAt(SCENARIO_URL);
    await waitFor(() => expect(screen.getByTestId("matchup-mechanics")).toBeInTheDocument());
    expect(requests.filter((u) => u.endsWith("/api/docs/champions/yone")).length).toBe(1);

    const seen = requests.length;
    fireEvent.change(screen.getByTestId("matchup-champion-a"), { target: { value: "Viktor" } });
    await waitFor(() =>
      expect(requests.slice(seen).some((u) => u.includes("champion_a=Viktor"))).toBe(true),
    );
    await waitFor(() =>
      expect(requests.slice(seen).some((u) => u.endsWith("/api/docs/champions/viktor"))).toBe(true),
    );
    // Yone is unchanged, so its document is not requested a second time.
    expect(requests.slice(seen).filter((u) => u.endsWith("/api/docs/champions/yone")).length).toBe(0);
  });

  it("is absent until both champions are chosen", async () => {
    installFetch(response({ a: side(), b: side() }));
    renderAt("/lol/pro-play/matchup?mode=lane");
    await waitFor(() => expect(screen.getByTestId("matchup-focus-note")).toBeInTheDocument());
    expect(screen.queryByTestId("matchup-mechanics")).toBeNull();
  });
});

describe("first paint", () => {
  it("renders the configuration with nothing selected", async () => {
    installFetch(response({ a: side(), b: side() }));
    renderAt("/lol/pro-play/matchup?mode=lane");
    await waitFor(() => expect(screen.getByTestId("matchup-team-a")).toBeInTheDocument());
    expect((screen.getByTestId("matchup-player-a") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId("matchup-champion-a") as HTMLSelectElement).disabled).toBe(true);
    // The focus set is the entry layer, and only the focus set.
    const options = [...(screen.getByTestId("matchup-team-a") as HTMLSelectElement).options]
      .map((o) => o.value)
      .filter(Boolean);
    expect(options).toEqual(FOCUS_TEAMS.map((t) => t.team_key));
  });
});
