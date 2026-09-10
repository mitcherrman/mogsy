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
  meetingFromParams,
  withMeeting,
  withMeetingGame,
  withStudyOpponent,
  withStudySubject,
  type MeetingSelection,
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
  explorer_pool:
    "The Explorer's board can be pointed at Mogzy's Worlds focus set plus every team that meets the admission policy on real data. It is not a ranking, and a team outside the pool is still fully visible in Search.",
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
  meetings:
    "Every time these two teams met inside the selected scope, newest first. The score is counted from the games' own recorded winners. Many professional leagues play a single game per meeting; those are shown as the one game they were, not as a series.",
};

// --- Step 4 fixtures --------------------------------------------------------
//
// A BO3 AND A BO1, because the difference between them is the whole point of
// the terminology: 59% of the real corpus's match_ids carry one game.

const BO3_ID = "LCK/2026 Season/Rounds 1-2_Week 7_7";
const BO1_ID = "2025 Season World Championship/Main Event_Round 3_4";

function meetingTeams() {
  return [
    { team_key: "Bilibili Gaming", display_name: "Bilibili Gaming", explorer_navigable: true },
    { team_key: "T1", display_name: "T1", explorer_navigable: true },
  ];
}

const MEETINGS = [
  {
    match_id: BO3_ID,
    kind: "series",
    game_count: 3,
    started_at: "2026-05-16 08:06:00",
    league_slug: "LoL Champions Korea",
    tournament_id: "LCK 2026 Rounds 1-2",
    score_line: [
      { team_key: "T1", wins: 2 },
      { team_key: "Bilibili Gaming", wins: 1 },
    ],
    undecided: 0,
    winner_team_key: "T1",
    teams: meetingTeams(),
    patch: "26.09",
    patches: ["26.09"],
    single_game_number: null,
  },
  {
    match_id: BO1_ID,
    kind: "single_game",
    game_count: 1,
    started_at: "2025-10-18 09:22:00",
    league_slug: "Worlds",
    tournament_id: "Worlds 2025 Main Event",
    score_line: [
      { team_key: "Bilibili Gaming", wins: 1 },
      { team_key: "T1", wins: 0 },
    ],
    undecided: 0,
    winner_team_key: "Bilibili Gaming",
    teams: meetingTeams(),
    patch: "25.20",
    patches: ["25.20"],
    single_game_number: 1,
  },
];

function meetingGame(n: number, winner: string, seconds: number | null) {
  const five = (team: string, prefix: string) =>
    ["Top", "Jungle", "Mid", "Bot", "Support"].map((role) => ({
      team_key: team,
      display_name: team,
      role,
      side: team === "T1" ? "Blue" : "Red",
      player_lp_page: `${team}-${role}`,
      champion_key: `${prefix}${role}`,
      win: team === winner,
    }));
  return {
    canonical_game_id: `g${n}`,
    game_number: n,
    game_date: `2026-05-16 0${n}:00:00`,
    patch: "26.09",
    blue_team_key: "T1",
    red_team_key: "Bilibili Gaming",
    winner_team_key: winner,
    decided: true,
    duration_seconds: seconds,
    participants: [...five("T1", `G${n}`), ...five("Bilibili Gaming", `G${n}R`)],
  };
}

const MEETING_UNAVAILABLE = [
  {
    metric: "draft_order",
    reason:
      "pick/ban sequence is -1 on every row in the corpus; the order in which champions were picked and banned is not recorded, so no ordering is shown.",
  },
];

// --- Step 9 fixtures --------------------------------------------------------
//
// THE LINEUP AND THE GAME LIST MUST AGREE, because on the server they are two
// projections of one read. The champions here are built from the same
// `G{n}{Role}` naming `meetingGame` uses, so a fixture that drifted from the
// game rows would be visible in the rendered output.
//
// Served in the SERVER'S order — teams sorted by key — so the component's own
// rule (follow the score line, which the reader has just read) is exercised
// rather than accidentally satisfied.
const LINEUP_POSITIONS = ["Top", "Jungle", "Mid", "Bot", "Support"];

function lineupTeam(teamKey: string, prefix: (n: number) => string, gameNumbers: number[]) {
  return {
    team_key: teamKey,
    display_name: teamKey,
    positions: LINEUP_POSITIONS.map((role) => ({
      position: role,
      players: [
        {
          player_lp_page: `${teamKey}-${role}`,
          games: gameNumbers.map((n) => ({
            game_number: n,
            champion_key: `${prefix(n)}${role}`,
          })),
          repeat_picks: [],
        },
      ],
    })),
    players_used: 5,
    positions_changed: [],
    game_coverage: gameNumbers.map((n) => ({
      game_number: n,
      participant_count: 5,
      complete: true,
    })),
  };
}

function meetingLineups(gameNumbers: number[]) {
  return [
    lineupTeam("Bilibili Gaming", (n) => `G${n}R`, gameNumbers),
    lineupTeam("T1", (n) => `G${n}`, gameNumbers),
  ];
}

const BO3_PAYLOAD = {
  match_id: BO3_ID,
  kind: "series",
  game_count: 3,
  teams: meetingTeams(),
  league_slug: "LoL Champions Korea",
  league_name: "LCK",
  tournament_id: "LCK 2026 Rounds 1-2",
  tournament_name: "LCK 2026 Rounds 1-2",
  started_at: "2026-05-16 08:06:00",
  patch: "26.09",
  patches: ["26.09"],
  score_line: [
    { team_key: "T1", wins: 2 },
    { team_key: "Bilibili Gaming", wins: 1 },
  ],
  undecided: 0,
  winner_team_key: "T1",
  scope_id: "current_2026",
  in_scope: true,
  // DELIBERATELY OUT OF ORDER in the fixture, so a test that passes only
  // because the server happened to sort would fail here.
  games: [
    meetingGame(2, "T1", 3018),
    meetingGame(1, "Bilibili Gaming", 1634),
    meetingGame(3, "T1", null),
  ],
  lineups: meetingLineups([1, 2, 3]),
  position_order: LINEUP_POSITIONS,
  unavailable_metrics: MEETING_UNAVAILABLE,
};

const BO1_PAYLOAD = {
  ...BO3_PAYLOAD,
  match_id: BO1_ID,
  kind: "single_game",
  game_count: 1,
  tournament_name: "Worlds 2025 Main Event",
  started_at: "2025-10-18 09:22:00",
  patch: "25.20",
  patches: ["25.20"],
  score_line: [
    { team_key: "Bilibili Gaming", wins: 1 },
    { team_key: "T1", wins: 0 },
  ],
  winner_team_key: "Bilibili Gaming",
  in_scope: false,
  games: [meetingGame(1, "Bilibili Gaming", 1800)],
  lineups: meetingLineups([1]),
};

/**
 * A Bo3 carrying every shape at once, so one render covers them all:
 *
 *   T1 Top      — Doran, `Olaf · K'Sante · Olaf`: a REPEATED pick.
 *   T1 Bot      — Gumayusi played games 1 and 2; Poby played game 3. A real
 *                 participant change, and never two players in one game.
 *   T1 Support  — Keria's game-3 champion is NOT RECORDED.
 *   Bilibili    — five players, one of whose games has an incomplete record.
 */
const SUB_LINEUPS = [
  {
    team_key: "Bilibili Gaming",
    display_name: "Bilibili Gaming",
    positions: LINEUP_POSITIONS.map((role) => ({
      position: role,
      players: [
        {
          player_lp_page: `BLG-${role}`,
          games: [1, 2, 3].map((n) => ({ game_number: n, champion_key: `G${n}R${role}` })),
          repeat_picks: [],
        },
      ],
    })),
    players_used: 5,
    positions_changed: [],
    game_coverage: [
      { game_number: 1, participant_count: 5, complete: true },
      { game_number: 2, participant_count: 4, complete: false },
      { game_number: 3, participant_count: 5, complete: true },
    ],
  },
  {
    team_key: "T1",
    display_name: "T1",
    positions: [
      {
        position: "Top",
        players: [
          {
            player_lp_page: "Doran (Choi Hyeon-joon)",
            games: [
              { game_number: 1, champion_key: "Olaf" },
              { game_number: 2, champion_key: "K'Sante" },
              { game_number: 3, champion_key: "Olaf" },
            ],
            repeat_picks: [{ champion_key: "Olaf", count: 2 }],
          },
        ],
      },
      {
        position: "Jungle",
        players: [
          {
            player_lp_page: "Oner",
            games: [
              { game_number: 1, champion_key: "Vi" },
              { game_number: 2, champion_key: "Xin Zhao" },
              { game_number: 3, champion_key: "Vi" },
            ],
            repeat_picks: [{ champion_key: "Vi", count: 2 }],
          },
        ],
      },
      {
        position: "Mid",
        players: [
          {
            player_lp_page: "Faker",
            games: [
              { game_number: 1, champion_key: "Azir" },
              { game_number: 2, champion_key: "Orianna" },
              { game_number: 3, champion_key: "Taliyah" },
            ],
            repeat_picks: [],
          },
        ],
      },
      {
        position: "Bot",
        players: [
          {
            player_lp_page: "Gumayusi",
            games: [
              { game_number: 1, champion_key: "Varus" },
              { game_number: 2, champion_key: "Jinx" },
            ],
            repeat_picks: [],
          },
          {
            player_lp_page: "Poby",
            games: [{ game_number: 3, champion_key: "Corki" }],
            repeat_picks: [],
          },
        ],
      },
      {
        position: "Support",
        players: [
          {
            player_lp_page: "Keria",
            games: [
              { game_number: 1, champion_key: "Rakan" },
              { game_number: 2, champion_key: "Nautilus" },
              { game_number: 3, champion_key: null },
            ],
            repeat_picks: [],
          },
        ],
      },
    ],
    players_used: 6,
    positions_changed: ["Bot"],
    game_coverage: [1, 2, 3].map((n) => ({
      game_number: n,
      participant_count: 5,
      complete: true,
    })),
  },
];

const SUB_PAYLOAD = { ...BO3_PAYLOAD, lineups: SUB_LINEUPS };

// --- Step 5 fixtures --------------------------------------------------------
//
// THREE GAMES, THREE DIFFERENT TRUTHS, because the failures Step 5 can have
// are all about telling them apart:
//
//   game 1 — fully enriched, and it holds BOTH ambiguous zero cases: a
//            deathless player (2/0/9) and a genuine 0/0/0. Their sums are
//            identical and their meanings are not.
//   game 2 — enriched, with a NULL vision score on one row. Enriched is not
//            the same claim as complete.
//   game 3 — NO statistics at all. Ten players, ten champions, a real winner,
//            and `stats: null` on every row. A zeroed box score would be
//            indistinguishable from a real one.

/** The at-15 state the server puts on EVERY player row. Defaults to the
 *  absence a statless row carries, so a fixture that says nothing about the
 *  checkpoint still says the honest thing rather than an undefined. */
function laneCheckpoint(
  status: string,
  gold: number | null = null,
  cs: number | null = null,
  opponent: string | null = null,
) {
  return {
    mark: 15,
    status,
    gold_diff: gold,
    cs_diff: cs,
    cs_diff_suppressed: status === "available" && cs === null && gold !== null,
    opponent: opponent
      ? {
          player_lp_page: opponent,
          team_key: opponent.split("-")[0],
          display_name: opponent.split("-")[0],
          champion_key: "SomeChampion",
          oe_position: null,
        }
      : null,
  };
}

function gamePlayer(
  team: string,
  role: string,
  champion: string,
  stats: Record<string, unknown> | null,
  lane: ReturnType<typeof laneCheckpoint> = laneCheckpoint("unavailable"),
) {
  return {
    lane_checkpoint: lane,
    player_lp_page: `${team}-${role}`,
    team_key: team,
    display_name: team,
    role,
    oe_position: stats ? role.toLowerCase() : null,
    side: team === "T1" ? "blue" : "red",
    champion_key: champion,
    win: team === "T1",
    stats: stats
      ? {
          double_kills: 0,
          triple_kills: 0,
          quadra_kills: 0,
          penta_kills: 0,
          first_blood_kill: 0,
          first_blood_assist: 0,
          first_blood_victim: 0,
          minion_kills: 200,
          monster_kills: 50,
          earned_gold: 9000,
          gold_spent: 11000,
          damage_to_towers: 3000,
          wards_placed: 20,
          wards_killed: 8,
          control_wards_bought: 5,
          checkpoints: {},
          data_completeness: "complete",
          ...stats,
        }
      : null,
  };
}

function baseStats(kills: number, deaths: number, assists: number) {
  return {
    kills,
    deaths,
    assists,
    total_cs: 250,
    total_gold: 14175,
    damage_to_champions: 18826,
    vision_score: 71,
    // `null` ONLY for deaths === 0 — the League "Perfect" convention, and it
    // can only appear inside a stats object, so it can never be produced by
    // an empty slice.
    kda_ratio: deaths === 0 ? null : (kills + assists) / deaths,
  };
}

function gameTeamRow(team: string, side: string, kills: number, gold: number, won: boolean) {
  return {
    team_key: team,
    display_name: team,
    explorer_navigable: true,
    side,
    objectives: {
      team_kills: kills,
      team_deaths: 26,
      towers: won ? 9 : 8,
      inhibitors: won ? 2 : 0,
      dragons: 4,
      elemental_drakes: 3,
      elders: 1,
      heralds: 1,
      void_grubs: 0,
      barons: 2,
      atakhans: 0,
      total_gold: gold,
      earned_gold: 64815,
      gold_spent: 91740,
      damage_to_champions: 195280,
      // A NULL objective stays null; the row is dropped rather than zeroed.
      total_cs: null,
      vision_score: 524,
      wards_placed: 218,
      wards_killed: 80,
      control_wards_bought: 71,
    },
    firsts: { first_blood: won, first_tower: !won, first_dragon: false },
    win: won,
    data_completeness: "complete",
  };
}

const GAME_UNAVAILABLE = [
  { metric: "draft_order", reason: "bans are an unordered set." },
  {
    metric: "turret_plates",
    reason:
      "the stored plate count exceeds its own structural ceiling of 25 on thousands of rows, so it is not published until the column is reconciled.",
  },
  { metric: "item_builds", reason: "the historical corpus carries no item data." },
  {
    metric: "cs_diff_15_support",
    reason:
      "CS at 15 minutes is not published for the support position. A support's creep score is incidental to the bot lane rather than a record of it, so a difference between two of them does not describe how the lane was going. The gold difference is published for every position.",
  },
];

const BANS_NOTE =
  "Bans are an unordered set. Pick/ban sequence is -1 on every row in the corpus, so the order in which these champions were banned is not recorded and none is implied by the order they are listed in.";

/** Blue's at-15 figures per lane: one clearly ahead, one behind, one far
 *  ahead, one behind, and a support pair that is an EXACT TIE in gold and
 *  publishes no CS at all. Red's are the inverse, from the same pairing. */
const LANE_MARKS: Record<string, [number, number | null]> = {
  Top: [899, 26],
  Jungle: [-223, -13],
  Mid: [1327, 35],
  Bot: [-649, -19],
  Support: [0, null],
};

/** The at-15 state for one fixture row.
 *
 *  Game 1 is fully resolved. Game 2 leaves the BOT LANE unresolved on both
 *  sides — the shape a game takes when the opposing laner has no row in the
 *  canonical record, which really happens. Game 3 has no statistics at all,
 *  so nothing about minute 15 is known either. */
function laneFor(n: number, statted: boolean, role: string, team: string) {
  if (!statted) return laneCheckpoint("unavailable");
  if (n === 2 && role === "Bot") return laneCheckpoint("opponent_unresolved");
  const [gold, cs] = LANE_MARKS[role];
  const blue = team === "T1";
  const opponent = blue ? `Bilibili Gaming-${role}` : `T1-${role}`;
  return laneCheckpoint(
    "available",
    blue ? gold : -gold,
    cs == null ? null : blue ? cs : -cs,
    opponent,
  );
}

function gameDetail(n: number, statted: boolean) {
  const roles = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const lines: Record<string, [number, number, number]> = {
    // DEATHLESS, and a genuine zero line, in the same game.
    Top: [2, 0, 9],
    Jungle: [3, 4, 15],
    Mid: [2, 5, 9],
    Bot: [15, 5, 5],
    Support: [0, 0, 0],
  };
  const players = [
    ...roles.map((role) =>
      gamePlayer(
        "T1",
        role,
        `G${n}${role}`,
        statted
          ? {
              ...baseStats(...lines[role]),
              // One NULL field on an otherwise-enriched row, in game 2 only.
              ...(n === 2 && role === "Top" ? { vision_score: null } : {}),
            }
          : null,
        laneFor(n, statted, role, "T1"),
      ),
    ),
    ...roles.map((role) =>
      gamePlayer(
        "Bilibili Gaming",
        role,
        `G${n}R${role}`,
        statted ? baseStats(1, 2, 3) : null,
        laneFor(n, statted, role, "Bilibili Gaming"),
      ),
    ),
  ];
  return {
    canonical_game_id: `g${n}`,
    match_id: BO3_ID,
    game_number: n,
    meeting: { kind: "series", game_count: 3, game_numbers: [1, 2, 3] },
    league_slug: "LoL Champions Korea",
    league_name: "LCK",
    tournament_id: "LCK 2026 Rounds 1-2",
    tournament_name: "LCK 2026 Rounds 1-2",
    game_date: "2026-05-16 08:57:00",
    patch: "26.09",
    blue_team: {
      team_key: "T1",
      display_name: "T1",
      explorer_navigable: true,
      side: "blue",
    },
    red_team: {
      team_key: "Bilibili Gaming",
      display_name: "Bilibili Gaming",
      explorer_navigable: true,
      side: "red",
    },
    // THE CANONICAL WINNER, not Oracle's Elixir's.
    winner_team_key: "T1",
    decided: true,
    duration_seconds: 3018,
    scope_id: "current_2026",
    in_scope: true,
    stats_available: statted,
    stat_player_rows: statted ? 10 : 0,
    team_stats_available: statted,
    stats_note: statted
      ? null
      : "Detailed box-score statistics are not available for this game. The canonical result, the players and the champions they took are recorded; the per-player and per-team numbers are not.",
    players,
    teams: statted
      ? [
          gameTeamRow("T1", "blue", 22, 96977, true),
          gameTeamRow("Bilibili Gaming", "red", 26, 95090, false),
        ]
      : [],
    bans: statted
      ? [
          {
            team_key: "T1",
            display_name: "T1",
            side: "blue",
            champions: ["Cassiopeia", "Orianna", "Vi"],
            ordered: false,
          },
          {
            team_key: "Bilibili Gaming",
            display_name: "Bilibili Gaming",
            side: "red",
            champions: ["Ryze", "Varus"],
            ordered: false,
          },
        ]
      : [],
    bans_note: BANS_NOTE,
    diagnostics: { oe_winner_disagrees_with_canonical: false },
    unavailable_metrics: GAME_UNAVAILABLE,
  };
}

const GAME_DETAILS: Record<number, ReturnType<typeof gameDetail>> = {
  1: gameDetail(1, true),
  2: gameDetail(2, true),
  // The 19% of the corpus with no statistics.
  3: gameDetail(3, false),
};

/** A REAL SHORT GAME: enriched, decided, and over at 12:40. Its 15-minute
 *  columns are null because minute 15 never happened, which is a different
 *  statement from the record being incomplete — and neither is a 0. */
const SHORT_GAME = {
  ...gameDetail(1, true),
  canonical_game_id: "bo1g1",
  match_id: BO1_ID,
  game_number: 1,
  meeting: { kind: "single_game", game_count: 1, game_numbers: [1] },
  duration_seconds: 760,
  players: gameDetail(1, true).players.map((player) => ({
    ...player,
    lane_checkpoint: laneCheckpoint("not_reached"),
  })),
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


/** The pool the selector actually renders: the focus set, plus a team
 *  admitted on measured data alone. KT Rolster is the case the whole split
 *  exists for — a real historical destination that is not, and should not be,
 *  on a Worlds watchlist. */
const EXPLORER_TEAMS = [
  {
    team_key: "T1",
    label: "T1",
    group: "LCK",
    source: "worlds_focus_set",
    in_worlds_focus_set: true,
    admission: null,
    note: null,
  },
  {
    team_key: "Bilibili Gaming",
    label: "BLG",
    group: "LPL",
    source: "worlds_focus_set",
    in_worlds_focus_set: true,
    admission: null,
    note: null,
  },
  {
    team_key: "KT Rolster",
    label: "KT Rolster",
    group: "LCK",
    source: "data_admitted",
    in_worlds_focus_set: false,
    admission: {
      games: 70,
      lanes_covered: 5,
      league_slug: "LoL Champions Korea",
      measured_on: "2026-09-08",
    },
    note: null,
  },
];

const EXPLORER_POOL = {
  explorer_pool_version: "explorer_pool_v1",
  sources: ["worlds_focus_set", "data_admitted"],
  admission_policy: {
    scope_id: "current_2026",
    league_filter: "MAJOR_PRO",
    min_games_in_scope: 30,
    required_lane_coverage: 5,
    require_live_registry_row: true,
  },
  groups: ["LCK", "LPL"],
  teams: EXPLORER_TEAMS,
  team_count: EXPLORER_TEAMS.length,
  focus_set_count: 2,
  data_admitted_count: 1,
  note: "The Explorer's board can be pointed at Mogzy's Worlds focus set plus every team that meets the admission policy on real data. It is not a ranking, and a team outside the pool is still fully visible in Search.",
};

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
  explorer_teams: EXPLORER_POOL,
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
  // `explorer` is always present; `focus` is null for a team the board can be
  // pointed at on measured data alone, which is exactly KT Rolster here.
  const explorer = EXPLORER_TEAMS.find((t) => t.team_key === teamKey)!;
  const focus = FOCUS_TEAMS.find((t) => t.team_key === teamKey) ?? null;
  return {
    team_key: teamKey,
    display_name: teamKey,
    explorer,
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
    meetings: MEETINGS,
    meetings_total: 12,
    meetings_limit: 8,
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

// --- the player x champion dossier -----------------------------------------
// Ornn for T1's Top laner: 3 of 40 games, 2-1, with one game against the team
// on the other side of the board. Every figure below is arithmetic, so a test
// that reads the wrong field reads a number that cannot be confused with
// another one.
function dossierResponse(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: "pro_comparison_v1",
    entity: {
      kind: "player_champion_dossier",
      player_lp_page: "Doran (Choi Hyeon-joon)",
      display_name: "Doran",
      champion_key: "Ornn",
      teams_in_scope: ["T1"],
      opponent_team_key: "Bilibili Gaming",
      opponent_display_name: "Bilibili Gaming",
    },
    scope: { scope_id: "current_2026", label: "2026", kind: "season" },
    league_filter: "curated",
    head_to_head: false,
    participation: "participated",
    player_games_in_scope: 40,
    player_games_vs_opponent: 6,
    overall: {
      games: 3,
      wins: 2,
      losses: 1,
      win_rate: 2 / 3,
      first_played_at: "2026-02-01 10:00:00",
      last_played_at: "2026-07-08 08:52:00",
    },
    versus_opponent: {
      games: 1,
      wins: 1,
      losses: 0,
      win_rate: 1,
      first_played_at: "2026-06-14 08:27:00",
      last_played_at: "2026-06-14 08:27:00",
    },
    champion_share: 3 / 40,
    recent_form: [
      {
        canonical_game_id: "g3",
        win: false,
        result: "L",
        game_date: "2026-07-08 08:52:00",
        team_key: "T1",
        opponent_team_key: "G2 Esports",
        league_slug: "LCK",
        tournament_id: null,
      },
      {
        canonical_game_id: "g2",
        win: true,
        result: "W",
        game_date: "2026-06-14 08:27:00",
        team_key: "T1",
        opponent_team_key: "Bilibili Gaming",
        league_slug: "LCK",
        tournament_id: null,
      },
      {
        canonical_game_id: "g1",
        win: true,
        result: "W",
        game_date: "2026-02-01 10:00:00",
        team_key: "T1",
        opponent_team_key: "KT Rolster",
        league_slug: "LCK",
        tournament_id: null,
      },
    ],
    recent_form_total: 3,
    ban_pressure: {
      overall: {
        banned_in: 7,
        drafts_with_ban_record: 40,
        games_without_ban_record: 0,
        rate: 7 / 40,
      },
      versus_opponent: {
        banned_in: 3,
        drafts_with_ban_record: 6,
        games_without_ban_record: 0,
        rate: 0.5,
      },
    },
    // Oracle's Elixir figures. DELIBERATELY PARTIAL: 3 canonical games, 2 of
    // them enriched, so the coverage note is exercised by the default fixture
    // rather than only by an override. Every figure is arithmetic —
    // KDA (8 + 14) / 6 = 3.666..., 480 cs over 50:00 = 9.6/min.
    statistics: {
      overall: {
        coverage: { total_games: 3, stat_games: 2, missing_stat_games: 1 },
        kda: { kills: 8, deaths: 6, assists: 14, ratio: 22 / 6, perfect: false, games: 2 },
        cs_per_min: { value: 9.6, games: 2 },
        gold_per_min: { value: 412.5, games: 2 },
        damage_per_min: { value: 738.2, games: 2 },
      },
      versus_opponent: {
        coverage: { total_games: 1, stat_games: 1, missing_stat_games: 0 },
        kda: { kills: 3, deaths: 2, assists: 5, ratio: 4, perfect: false, games: 1 },
        cs_per_min: { value: 8.15, games: 1 },
        gold_per_min: { value: 389, games: 1 },
        damage_per_min: { value: 651.7, games: 1 },
      },
    },
    // Empty since the Oracle's Elixir promotion: the metric this used to
    // declare unavailable (average KDA) is now served.
    unavailable_metrics: [],
    definitions: {
      statistics:
        "Kills, deaths, assists, CS, gold and damage come from Oracle's Elixir, aggregated over the games in this scope that carry statistics. Rates are weighted by game length, not averaged per game.",
      statistics_coverage:
        "Statistics are available for some of these games rather than all of them. Every figure is computed only over the games it covers.",
      champion_games:
        "Games this player played this champion in the selected scope, over their total games in that scope.",
      versus_opponent:
        "The same record, restricted to this player's games against the other team in the matchup on screen.",
      recent_form:
        "This player's most recent games on this champion in the selected scope, newest first. Only games that exist are shown.",
      ban_pressure:
        "How often the opposing team banned this champion in games involving this player, out of the games whose opposing-side ban record exists. It is contextual draft behaviour, not a claim about why.",
    },
    ...overrides,
  };
}

// --- Step 3: the exact matchup study ----------------------------------------
//
// The payload `/exact` returns. Every figure here is arithmetic the assertions
// below check by hand, and the example list is built to exercise all three
// things the section must get right: the tier ORDER, an example the board can
// open, and an example it cannot.

const EXACT_DEFINITIONS = {
  exact_matchup:
    "Games in which this player played this champion and the opposing player played theirs, in the same game, on opposing teams, within the selected scope. Nothing is inferred from rosters or from the two champions appearing in separate games.",
  no_exact_games:
    "No game in the selected scope has both of these players on these champions on opposing sides. That is a fact about the record, not a gap in it \u2014 no looser sample is substituted.",
  other_pro_examples:
    "Other professional games in which the same two champions met on opposing sides in this scope, grouped by the players who played them. Every example is a real game; none is inferred.",
  ranking:
    "Ordered by relation to the matchup on screen \u2014 the same subject player first, then the same opposing player, then examples involving a team from this board, then the rest \u2014 and within each by number of games, then by most recent meeting.",
  record_orientation: "Wins and losses are counted from the subject player's side.",
  navigation_limit:
    "The Explorer's team board can only be pointed at teams in its own pool \u2014 the orgs whose five-lane board the corpus can build honestly \u2014 so an example played between teams outside it is real evidence with no board to open.",
  median_at15:
    "The middle value of the per-game differences at 15 minutes; with an even number of games, the average of the middle two. A median rather than an average because these samples are small and one one-sided game should not stand for the rest.",
  at15_orientation:
    "Differences are read from the subject player's side: a positive number is a lead, a negative number a deficit, and 0 is a measured tie.",
};

/** The server's own sentence, quoted, so a test that reads it is reading what
 *  a reader would actually see. */
const SUPPORT_CS_REASON =
  "CS at 15 minutes is not published for the support position. A support's creep score is incidental to the bot lane rather than a record of it, so a difference between two of them does not describe how the lane was going. The gold difference is published for every position.";

/**
 * STEP 7 — the exact sample's figures, over the fixture's TWO games.
 *
 * Deliberately a complete-coverage default: the note is the exception and a
 * fixture that always triggered it would let a regression hide behind it.
 */
/** The identity half of an evidence row — the SAME shape as a source meeting,
 *  because it is the same game. `x2` is the newer of the two. */
function exactEvidenceGame(id: "x1" | "x2") {
  return id === "x2"
    ? {
        canonical_game_id: "x2",
        game_date: "2026-06-14 11:00:00",
        result: "W" as const,
        win: true,
        subject_team_key: "T1",
        opposing_team_key: "Bilibili Gaming",
        league_slug: "LoL Champions Korea",
        tournament_id: null,
        match_id: BO3_ID,
        game_number: 3,
      }
    : {
        canonical_game_id: "x1",
        game_date: "2026-03-01 09:00:00",
        result: "L" as const,
        win: false,
        subject_team_key: "T1",
        opposing_team_key: "Bilibili Gaming",
        league_slug: "LoL Champions Korea",
        tournament_id: null,
        match_id: BO3_ID,
        game_number: 1,
      };
}

function exactStatistics(overrides: Record<string, unknown> = {}) {
  return {
    coverage: {
      exact_games: 2,
      stat_games: 2,
      missing_stat_games: 0,
      at15_games: { available: 2 },
    },
    // STEP 8 — every figure carries the games it was measured over, NEWEST
    // FIRST, and the per-game rows really do produce the figure above them:
    // 5+3 kills, 1+3 deaths, 4+5 assists is 8/4/9 and (8+9)/4 = 4.25; the
    // gold rows median to 286 and the CS rows to 7.
    kda: {
      kills: 8,
      deaths: 4,
      assists: 9,
      ratio: 4.25,
      perfect: false,
      games: 2,
      evidence: [
        {
          ...exactEvidenceGame("x2"),
          subject_kills: 5,
          subject_deaths: 1,
          subject_assists: 4,
          ratio: 9,
          perfect: false,
        },
        {
          ...exactEvidenceGame("x1"),
          subject_kills: 3,
          subject_deaths: 3,
          subject_assists: 5,
          ratio: 8 / 3,
          perfect: false,
        },
      ],
    },
    gold_diff_at15: {
      median: 286,
      games: 2,
      evidence: [
        { ...exactEvidenceGame("x2"), value: 899 },
        { ...exactEvidenceGame("x1"), value: -327 },
      ],
    },
    cs_diff_at15: {
      median: 7,
      games: 2,
      supported: true,
      unsupported_reason: null,
      evidence: [
        { ...exactEvidenceGame("x2"), value: 20 },
        { ...exactEvidenceGame("x1"), value: -6 },
      ],
    },
    subject_positions: ["top"],
    definitions: EXACT_DEFINITIONS,
    ...overrides,
  };
}

function exactSide(
  player: string,
  champion: string,
  team: string,
  role = "Top",
) {
  return {
    player_lp_page: player,
    display_name: player,
    champion_key: champion,
    team_key: team,
    team_display_name: team,
    role,
  };
}

function exactExample(
  relation: string,
  subject: ReturnType<typeof exactSide>,
  opposing: ReturnType<typeof exactSide>,
  games: number,
  wins: number,
  { navigable = true, outside = [] as string[], date = "2026-05-01 10:00:00" } = {},
) {
  return {
    relation,
    subject,
    opposing,
    record: {
      games,
      wins,
      losses: games - wins,
      win_rate: games ? wins / games : null,
      first_played_at: date,
      last_played_at: date,
    },
    most_recent: {
      canonical_game_id: `${subject.player_lp_page}-${opposing.player_lp_page}`,
      game_date: date,
      result: wins ? "W" : "L",
      win: Boolean(wins),
      subject_team_key: subject.team_key,
      opposing_team_key: opposing.team_key,
      league_slug: "LoL Champions Korea",
      tournament_id: null,
    },
    navigation: {
      team_a: subject.team_key,
      team_b: opposing.team_key,
      scope_id: "current_2026",
      lane: subject.role,
      subject_player_lp_page: subject.player_lp_page,
      subject_champion: subject.champion_key,
      opposing_player_lp_page: opposing.player_lp_page,
      opposing_champion: opposing.champion_key,
      explorer_navigable: navigable,
      teams_outside_explorer_pool: outside,
    },
  };
}

/** Doran's Ornn against Bin's Ambessa: two games, one apiece. */
function exactResponse(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: "pro_comparison_v1",
    kind: "exact_player_champion_matchup",
    scope: { scope_id: "current_2026", label: "2026", description: "The 2026 season." },
    league_filter: "MAJOR_PRO",
    // TRUE here and nowhere else on this screen.
    head_to_head: true,
    subject: {
      player_lp_page: "Doran",
      display_name: "Doran",
      champion_key: "Ornn",
      participation: "participated",
      games_in_scope: 101,
      champion_games_in_scope: 30,
      teams_in_qualifying_games: ["T1"],
    },
    opposing: {
      player_lp_page: "Bin",
      display_name: "Bin",
      champion_key: "Ambessa",
      participation: "participated",
      games_in_scope: 125,
      champion_games_in_scope: 40,
      teams_in_qualifying_games: ["Bilibili Gaming"],
    },
    exact: {
      record: {
        games: 2,
        wins: 1,
        losses: 1,
        win_rate: 0.5,
        first_played_at: "2026-03-01 09:00:00",
        last_played_at: "2026-06-14 11:00:00",
      },
      meetings: [
        {
          canonical_game_id: "x2",
          game_date: "2026-06-14 11:00:00",
          result: "W",
          win: true,
          subject_team_key: "T1",
          opposing_team_key: "Bilibili Gaming",
          league_slug: "LoL Champions Korea",
          tournament_id: null,
          match_id: BO3_ID,
          game_number: 3,
        },
        {
          // The SECOND game of the SAME meeting, on purpose: the study must
          // offer one source meeting to open, not two.
          canonical_game_id: "x1",
          game_date: "2026-03-01 09:00:00",
          result: "L",
          win: false,
          subject_team_key: "T1",
          opposing_team_key: "Bilibili Gaming",
          league_slug: "LoL Champions Korea",
          tournament_id: null,
          match_id: BO3_ID,
          game_number: 1,
        },
      ],
      meetings_total: 2,
      result_sequence: ["W", "L"],
      most_recent: {
        canonical_game_id: "x2",
        game_date: "2026-06-14 11:00:00",
        result: "W",
        win: true,
        subject_team_key: "T1",
        opposing_team_key: "Bilibili Gaming",
        league_slug: "LoL Champions Korea",
        tournament_id: null,
        match_id: BO3_ID,
        game_number: 3,
      },
    },
    champion_matchup_games_in_scope: 9,
    statistics: exactStatistics(),
    other_pro_examples: [
      exactExample(
        "same_subject_player",
        exactSide("Doran", "Ornn", "T1"),
        exactSide("Zeus", "Ambessa", "Gen.G"),
        3,
        2,
      ),
      exactExample(
        "same_opposing_player",
        exactSide("Kingen", "Ornn", "Dplus Kia"),
        exactSide("Bin", "Ambessa", "Bilibili Gaming"),
        2,
        1,
      ),
      // Both teams in the pool on measured data alone — this is the case the
      // team-pool split exists for: real evidence that is now a real
      // destination, without anyone claiming KT is on a Worlds watchlist.
      exactExample(
        "other_professional_example",
        exactSide("PerfecT", "Ornn", "KT Rolster"),
        exactSide("Bin", "Ambessa", "Bilibili Gaming"),
        2,
        1,
      ),
      // And one that genuinely is not: Anyone's Legend has more current games
      // than most of the pool and only three canonical lanes, so no honest
      // five-lane board exists for it.
      exactExample(
        "other_professional_example",
        exactSide("Flandre", "Ornn", "Anyone's Legend"),
        exactSide("Myrwn", "Ambessa", "Movistar KOI"),
        2,
        0,
        { navigable: false, outside: ["Anyone's Legend"] },
      ),
    ],
    example_limit: 6,
    board_team_keys: ["Bilibili Gaming", "T1"],
    // EMPTY BY DEFAULT SINCE STEP 7. The `average_kda` declaration that used
    // to sit here was retired when the payload started carrying a KDA — a
    // sentence saying the figure cannot be served, printed beside the figure,
    // is worse than no sentence.
    unavailable_metrics: [],
    definitions: EXACT_DEFINITIONS,
    ...overrides,
  };
}

let exact: ReturnType<typeof exactResponse>;

let dossier: ReturnType<typeof dossierResponse>;

/** Which meeting payloads `/matchup/series` answers with. A Step 9 test that
 *  needs the substitution meeting swaps the Bo3 for `SUB_PAYLOAD`; the
 *  `beforeEach` puts it back, so no test can leak its own corpus. */
let seriesPayloads: unknown[] = [];

beforeEach(() => {
  requests.length = 0;
  seriesPayloads = [BO3_PAYLOAD, BO1_PAYLOAD];
  dossier = dossierResponse();
  exact = exactResponse();
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
      } else if (url.includes("/matchup/player-champion")) {
        body = dossier;
        status = 200;
      } else if (url.includes("/matchup/exact")) {
        body = exact;
        status = 200;
      } else if (url.includes("/matchup/game")) {
        // Answered by the PAIR, the way the route is: a game_number this
        // meeting does not have is a 404 here exactly as it is on the wire.
        const params = new URLSearchParams(url.split("?")[1] ?? "");
        const found =
          params.get("match_id") === BO3_ID
            ? GAME_DETAILS[Number(params.get("game_number"))]
            : params.get("match_id") === BO1_ID && params.get("game_number") === "1"
              ? SHORT_GAME
              : undefined;
        if (found) {
          body = found;
          status = 200;
        }
      } else if (url.includes("/matchup/series")) {
        // Answered by match_id, the way the route is. An unknown one is a 404
        // here exactly as it is on the wire.
        const params = new URLSearchParams(url.split("?")[1] ?? "");
        const wanted = params.get("match_id");
        const found = (seriesPayloads as { match_id: string }[]).find(
          (m) => m.match_id === wanted,
        );
        if (found) {
          body = found;
          status = 200;
        }
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
      // Step 3 added the open dossier to the round trip. A board with none
      // still parses to an explicit null rather than to an absent key, so the
      // two states cannot be told apart by shape alone.
      study: null,
      // Step 4 added the open meeting on exactly the same terms, and for the
      // same reason: an explicit null, so "no meeting open" and "this key does
      // not exist" cannot be told apart by shape.
      meeting: null,
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
    ).toEqual({
      team_a: "T1",
      team_b: "Bilibili Gaming",
      bans: ["Vi"],
      scope_id: "all_time",
      // The lane explorer holds no study and no meeting, so crossing into the
      // board opens neither.
      study: null,
      meeting: null,
    });
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

  it("offers the explorer pool, not the focus set", async () => {
    // The VS banner IS the selector now — there is no disclosure to open, and
    // no second control anywhere on the page. What it offers is the POOL: the
    // focus set plus every team admitted on measured data.
    await renderBoard();
    expect(screen.queryByTestId("dossier-team-picker")).toBeNull();
    expect(screen.queryByTestId("dossier-team-picker-toggle")).toBeNull();
    const select = screen.getByTestId("team-select-a");
    const values = [...select.querySelectorAll("option")].map((o) => o.getAttribute("value")).filter(Boolean);
    expect(values).toEqual(["T1", "Bilibili Gaming", "KT Rolster"]);
    expect(values.length).toBeGreaterThan(CONTRACT.focus_set.teams.length);
  });

  it("offers a data-admitted team with no watchlist wording on it", async () => {
    await renderBoard();
    const option = [...screen.getByTestId("team-select-a").querySelectorAll("option")].find(
      (o) => o.getAttribute("value") === "KT Rolster",
    )!;
    expect(option.textContent).toContain("KT Rolster");
    expect(option.textContent).not.toMatch(/watchlist|qualified/i);
  });
});

// --- roster semantics -------------------------------------------------------

describe("roster semantics", () => {
  it("carries the starter fact in the lane, not in a badge", async () => {
    // The "demonstrated starter" badge was removed by owner decision. What it
    // asserted was never the badge's to assert: a clear-starter lane is still a
    // clear-starter lane, and the board still never claims a lineup.
    await renderBoard();
    expect(screen.queryAllByTestId("starter-badge")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(
      /will start|expected to start|predicted|confirmed starter/i,
    );
    // The lane's own state is untouched and still distinguishes the cases.
    expect(screen.getByTestId("lane-card-Top")).toBeInTheDocument();
    expect(screen.getByTestId("lane-Jungle-T1")).toBeInTheDocument();
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
    // The boxed label is gone; the section's own eyebrow now says what the five
    // plates ARE, and the server's denial still prints beneath them as fine
    // print — see the next test. The negative guarantee is unchanged.
    await renderBoard();
    expect(screen.getByTestId("dossier-lane-study")).toHaveTextContent(
      /each player's own record/i,
    );
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
  it("claims no qualification, and no longer needs a caveat to say so", async () => {
    // The board used to print the focus STATUS on each team and a paragraph
    // above the page explaining that the status was not a qualification claim.
    // Both are gone together: with no status word on screen there is no claim
    // to correct. The guarantee is unchanged and is asserted more strictly —
    // NOTHING on the page suggests qualification.
    await renderBoard();
    expect(screen.queryByTestId("team-focus-T1")).toBeNull();
    expect(screen.queryByTestId("matchup-focus-note")).toBeNull();
    expect(document.body.textContent).not.toMatch(/qualified|qualification|slot claimed/i);
    expect(document.body.textContent).not.toMatch(/watchlist/i);
  });

  it("keeps the focus payload intact behind the presentation", async () => {
    // Presentation only. The contract still carries the focus set and each
    // team's status; the board simply does not print them.
    await renderBoard();
    expect(CONTRACT.focus_set.teams[0].status).toBe("watchlist");
    expect(teamResponse().teams.a?.focus.asserts_qualification).toBe(false);
  });
});

// --- no prediction ----------------------------------------------------------

describe("no prediction", () => {
  it("predicts nothing, and no longer says so in a box", async () => {
    // The denial paragraph is gone. Asserting its ABSENCE would be weaker than
    // what it protected, so this asserts the guarantee itself: the board makes
    // no forward-looking claim about a starter, a draft or a result anywhere.
    await renderBoard();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/Mogzy's Notes/);
    expect(body).not.toMatch(/will start|will be drafted|will win|predict|favou?rite|projected/i);
    // And what it DOES claim is demonstrated, in the label itself.
    expect(body).toMatch(/demonstrated/i);
  });

  it("never says a lineup is expected, projected or likely", async () => {
    await renderBoard();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/expected lineup|projected|likely to start|predicted/i);
  });
});

// --- champion pools ---------------------------------------------------------

describe("demonstrated picks", () => {
  it("drops the pool heading and keeps the pool GUARANTEE", async () => {
    // "Champion Arsenal · Demonstrated picks" was removed by owner decision.
    // It labelled the only thing in the block. The semantics it was standing in
    // for are served by the backend as a sentence, and that sentence is still
    // printed verbatim — the label went, the guarantee did not.
    await renderBoard();
    const top = screen.getByTestId("lane-card-Top");
    expect(within(top).queryAllByText(/Champion Arsenal/i)).toHaveLength(0);
    expect(screen.getAllByText(NOTES.pool).length).toBeGreaterThan(0);
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

  it("scopes the team's champion usage without a meta or draft claim", async () => {
    // The note under the plate is gone; the plate's own scope label is what
    // stops a reader reading a meta into it, and the negative guarantee stands.
    await renderBoard();
    const summary = screen.getByTestId("team-summary-T1");
    expect(summary).toHaveTextContent(/Champion|Games/i);
    expect(document.body.textContent).not.toMatch(/meta read|draft expectation|tier list/i);
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

  it("reaches lane mode by URL with the teams intact", async () => {
    // The tab that used to do this is gone. The route it drove is not: a lane
    // URL still resolves to the explorer and still carries both teams, which
    // is what every "Open lane dossier" link produces.
    renderAt("?mode=lane&team_a=T1&team_b=Bilibili+Gaming");
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

  it("asks no mode question — the board IS the Explorer", async () => {
    await renderBoard();
    expect(screen.queryByTestId("matchup-mode-team")).toBeNull();
    expect(screen.queryByTestId("matchup-mode-lane")).toBeNull();
    expect(screen.queryByRole("tablist", { name: /explorer mode/i })).toBeNull();
    // And the redundant second route into an empty explorer went with them.
    expect(screen.queryByTestId("team-to-lane")).toBeNull();
    // What remains is the way down that carries the lane with it.
    expect(screen.getAllByTestId(/^lane-drilldown-/).length).toBeGreaterThan(0);
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

  it("makes every lane state honest without a global disclaimer", async () => {
    // The boxed "Mogzy's Notes" denial is gone. What replaces it is not softer
    // wording — it is the per-lane state the board already computes, which is
    // where a reader actually forms the wrong belief.
    await renderBoard();
    expect(screen.queryByTestId("team-mode-note")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Mogzy's Notes/);
    // Demonstrated, never predicted. The badge that used to say so is gone;
    // removing it did not license the language it was guarding against.
    expect(document.body.textContent).not.toMatch(
      /will start|expected to start|predicted|confirmed starter/i,
    );
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


// --- the refinement pass ----------------------------------------------------

describe("the VS banner is the only team selector", () => {
  it("selects Team A directly from the banner", async () => {
    await renderBoard();
    const select = screen.getByTestId("team-select-a") as HTMLSelectElement;
    // It lives INSIDE the banner, not in a panel below the dossier.
    expect(screen.getByTestId("team-heading")).toContainElement(select);
    fireEvent.change(select, { target: { value: "Bilibili Gaming" } });
    // The board re-reads from the server with the new selection, which is the
    // same path the removed picker used — state and shareability unchanged.
    await waitFor(() =>
      expect(requests[requests.length - 1]).toContain("team_a=Bilibili+Gaming"),
    );
  });

  it("selects Team B directly from the banner", async () => {
    await renderBoard();
    const select = screen.getByTestId("team-select-b") as HTMLSelectElement;
    expect(screen.getByTestId("team-heading")).toContainElement(select);
    fireEvent.change(select, { target: { value: "T1" } });
    await waitFor(() => expect(requests[requests.length - 1]).toContain("team_b=T1"));
  });

  it("has exactly one control per side, page-wide", async () => {
    // The regression this guards is the one the pass removed: a second
    // selector below the dossier competing with the banner.
    await renderBoard();
    expect(screen.getAllByTestId("team-select-a")).toHaveLength(1);
    expect(screen.getAllByTestId("team-select-b")).toHaveLength(1);
    expect(screen.queryByTestId("dossier-team-picker")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Change teams|Choose two teams/);
  });

  it("keeps swap and share state working alongside the banner", async () => {
    await renderBoard();
    fireEvent.click(screen.getByTestId("team-swap"));
    await waitFor(() => {
      const last = requests[requests.length - 1];
      expect(last).toContain("team_a=Bilibili+Gaming");
      expect(last).toContain("team_b=T1");
    });
  });

  it("still offers every focus team, and the pooled teams beside them", async () => {
    await renderBoard();
    const values = [...screen.getByTestId("team-select-b").querySelectorAll("option")]
      .map((o) => o.getAttribute("value"))
      .filter(Boolean);
    // Every original team survives, in its original order, and the widening
    // is additive rather than a re-shuffle.
    expect(values.slice(0, 2)).toEqual(["T1", "Bilibili Gaming"]);
    expect(values).toEqual(CONTRACT.explorer_teams.teams.map((t) => t.team_key));
  });
});

describe("the refined chrome", () => {
  it("carries no Mogzy's Notes block", async () => {
    await renderBoard();
    expect(document.body.textContent).not.toMatch(/Mogzy's Notes/);
  });

  it("keeps the event as a banner kicker, never as the page title", async () => {
    await renderBoard();
    expect(screen.getByTestId("team-heading")).toHaveTextContent("Worlds 2026");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "League of Legends Esports Matchup Explorer",
    );
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("Worlds");
  });

  it("keeps every lane state honest", async () => {
    await renderBoard();
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/demonstrated/i);
    expect(body).not.toMatch(/will start|will win|predict/i);
  });
});

// --- Step 1: the unified board ----------------------------------------------

describe("the unified board", () => {
  it("gives each player card its own team and scope", async () => {
    // A lane card has to be readable on its own — whose player, over what span
    // — now that the hero is the only other place the matchup is stated.
    await renderBoard();
    const top = screen.getByTestId("lane-card-Top");
    const t1 = within(top).getByTestId("lane-Top-T1");
    expect(within(t1).getAllByTestId("candidate-team")[0]).toHaveTextContent("T1");
    expect(within(t1).getAllByTestId("candidate-scope")[0]).toHaveTextContent("2026");
    // And a crest beside it, from the same media layer as everything else.
    expect(within(t1).getAllByTestId("team-crest").length).toBeGreaterThan(0);
  });

  it("follows the scope rail in every player card", async () => {
    await renderBoard();
    expect(screen.getAllByTestId("candidate-scope")[0]).toHaveTextContent("2026");
    fireEvent.click(screen.getByTestId("dossier-scope-all_time"));
    await waitFor(() => expect(requests.some((u) => u.includes("scope=all_time"))).toBe(true));
  });

  it("keeps the way down into a lane", async () => {
    await renderBoard();
    expect(screen.getByTestId("lane-drilldown-Top")).toHaveTextContent(/Open lane dossier/i);
  });

  it("opens the dossier drawer on the right player, champion, team and scope", async () => {
    await renderBoard();
    expect(screen.queryByTestId("player-champion-drawer")).toBeNull();

    const top = screen.getByTestId("lane-card-Top");
    const t1 = within(top).getByTestId("lane-Top-T1");
    fireEvent.click(within(t1).getAllByTestId("champ-chip-Ornn")[0]);

    const drawer = await screen.findByTestId("player-champion-drawer");
    const id = within(drawer).getByTestId("dossier-drawer-identity");
    expect(id).toHaveTextContent("Ornn");
    expect(id).toHaveTextContent("T1");
    expect(id).toHaveTextContent("Top");
    expect(id).toHaveTextContent("2026");
    // The opponent is what makes the question contextual.
    expect(id).toHaveTextContent("Bilibili Gaming");
  });

  it("asks the server for exactly the clicked context", async () => {
    await renderBoard();
    const t1 = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(t1).getAllByTestId("champ-chip-Ornn")[0]);
    await screen.findByTestId("player-champion-drawer");

    await waitFor(() => {
      const url = requests.find((u) => u.includes("/matchup/player-champion"));
      expect(url).toBeTruthy();
      const params = new URLSearchParams(String(url).split("?")[1]);
      expect(params.get("champion")).toBe("Ornn");
      expect(params.get("opponent")).toBe("Bilibili Gaming");
      expect(params.get("scope")).toBe("current_2026");
      expect(params.get("player")).toBeTruthy();
    });
  });

  it("marks the selected tile and lets it be unselected", async () => {
    await renderBoard();
    const t1 = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    const tile = within(t1).getAllByTestId("champ-chip-Ornn")[0];

    fireEvent.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "true");
    await screen.findByTestId("player-champion-drawer");
    fireEvent.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(screen.queryByTestId("player-champion-drawer")).toBeNull(),
    );
  });

  it("drops a selection when the scope changes", async () => {
    // A selection made in one scope is not a selection in another. Silently
    // re-pointing it at different numbers would be worse than dropping it.
    await renderBoard();
    const t1 = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(t1).getAllByTestId("champ-chip-Ornn")[0]);
    await screen.findByTestId("player-champion-drawer");

    fireEvent.click(screen.getByTestId("dossier-scope-all_time"));
    await waitFor(() =>
      expect(screen.queryByTestId("player-champion-drawer")).toBeNull(),
    );
  });

  it("shows a compact pool by default and never names the preview count", async () => {
    await renderBoard();
    const board = screen.getByTestId("lane-board");
    expect(board.textContent).not.toMatch(/top \d+|first \d+|cap \d+/i);
  });
});

// --- the player x champion dossier drawer -----------------------------------
//
// Step 2's deliverable. Each test pins either a figure the drawer must get
// right, or a claim it must never make.

describe("player x champion dossier", () => {
  async function openDrawer(champion = "Ornn", lane = "Top", team = "T1") {
    await renderBoard();
    const card = within(screen.getByTestId(`lane-card-${lane}`)).getByTestId(
      `lane-${lane}-${team}`,
    );
    fireEvent.click(within(card).getAllByTestId(`champ-chip-${champion}`)[0]);
    return screen.findByTestId("player-champion-drawer");
  }

  it("states the champion games over the player's total games in scope", async () => {
    // THE RATIO IS THE POINT, and it is not called a share: "3 / 40 total
    // games" says the relationship directly.
    const drawer = await openDrawer();
    expect(await within(drawer).findByTestId("dossier-drawer-ratio")).toHaveTextContent(
      "3 / 40 total games",
    );
  });

  it("never labels the ratio a team, pool or champion share", async () => {
    // Rejected by the owner as confusing. The words must not come back.
    const drawer = await openDrawer();
    await within(drawer).findByTestId("dossier-drawer-summary");
    expect(drawer.textContent).not.toMatch(/team share|pool share|champion share/i);
  });

  it("shows the overall record and win rate from the payload", async () => {
    const drawer = await openDrawer();
    expect(await within(drawer).findByTestId("dossier-drawer-record")).toHaveTextContent(
      "2–1",
    );
    expect(within(drawer).getByTestId("dossier-drawer-winrate")).toHaveTextContent(
      "66.7%",
    );
    expect(within(drawer).getByTestId("dossier-drawer-recent")).toHaveTextContent(
      "2026-07-08",
    );
  });

  it("renders recent form newest first and never pads it", async () => {
    const drawer = await openDrawer();
    const strip = await within(drawer).findByTestId("dossier-drawer-form");
    const glyphs = within(strip).getAllByTestId("dossier-drawer-form-glyph");
    // The payload's order is 2026-07-08 (L), 2026-06-14 (W), 2026-02-01 (W).
    expect(glyphs.map((g) => g.textContent)).toEqual(["L", "W", "W"]);
    // Three games means three glyphs — not a five-slot strip with two blanks.
    expect(glyphs).toHaveLength(3);
    expect(strip).toHaveTextContent("3 games");
  });

  it("carries each result's date and opponent without printing them", async () => {
    const drawer = await openDrawer();
    const strip = await within(drawer).findByTestId("dossier-drawer-form");
    const [first] = within(strip).getAllByTestId("dossier-drawer-form-glyph");
    expect(first).toHaveAttribute("title", expect.stringContaining("2026-07-08"));
    expect(first).toHaveAttribute("title", expect.stringContaining("G2 Esports"));
  });

  it("says 'last N of M' when the strip is capped", async () => {
    dossier = dossierResponse({ recent_form_total: 11 });
    const drawer = await openDrawer();
    const strip = await within(drawer).findByTestId("dossier-drawer-form");
    expect(strip).toHaveTextContent("last 3 of 11");
  });

  it("keeps Overall and the opponent column as distinct aggregates", async () => {
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    // Overall 3 games / 2–1; against this opponent 1 game / 1–0. Two columns
    // of the same metric, and the figures must not be the same one twice.
    const games = within(table).getByTestId("row-games");
    expect(within(games).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "3",
      "1",
    ]);
    const record = within(table).getByTestId("row-record");
    expect(within(record).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "2–1",
      "1–0",
    ]);
  });

  it("heads the opponent column with the team on the other side of the board", async () => {
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    expect(within(table).getByRole("columnheader", { name: /vs Bilibili Gaming/i }))
      .toBeInTheDocument();
  });

  it("shows ban pressure with its numerator and denominator, not a bare rate", async () => {
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    const row = within(table).getByTestId("row-banpressure");
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toBe("7 / 40 · 17.5%");
    expect(cells[1]).toBe("3 / 6 · 50.0%");
  });

  it("never says the opponent banned the champion because of this player", async () => {
    const drawer = await openDrawer();
    await within(drawer).findByTestId("dossier-drawer-table");
    expect(drawer.textContent).toMatch(/ban pressure/i);
    expect(drawer.textContent).not.toMatch(/banned because|to deny|targeted|respect ban/i);
  });

  // --- Oracle's Elixir figures ----------------------------------------------

  it("renders the four statistics as rows of the existing comparison table",
    async () => {
      // Not a second panel: the reader's question is unchanged, so the answer
      // arrives in the table that already answers it.
      const drawer = await openDrawer();
      const table = await within(drawer).findByTestId("dossier-drawer-table");
      for (const id of ["row-kda", "row-csmin", "row-goldmin", "row-dmgmin"]) {
        expect(within(table).getByTestId(id)).toBeInTheDocument();
      }
      expect(within(drawer).queryByTestId("dossier-drawer-unavailable")).toBeNull();
    });

  it("formats each statistic at the precision its metric is read at", async () => {
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    const cells = (id: string) =>
      within(within(table).getByTestId(id)).getAllByRole("cell").map((c) => c.textContent);
    // (8 + 14) / 6 = 3.666..., to two decimals.
    expect(cells("row-kda")[0]).toBe("3.67");
    expect(cells("row-csmin")[0]).toBe("9.6");
    // Gold and damage per minute are read as magnitudes; a decimal is noise.
    expect(cells("row-goldmin")[0]).toBe("413");
    expect(cells("row-dmgmin")[0]).toBe("738");
  });

  it("fills the opponent column with the opponent's own figures", async () => {
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    const cells = (id: string) =>
      within(within(table).getByTestId(id)).getAllByRole("cell").map((c) => c.textContent);
    expect(cells("row-kda")).toEqual(["3.67", "4.00"]);
    expect(cells("row-csmin")).toEqual(["9.6", "8.2"]);
    expect(cells("row-goldmin")).toEqual(["413", "389"]);
  });

  it("keeps the raw components reachable behind the KDA figure", async () => {
    // The ratio is what is scanned; the components are what make it checkable.
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    const cell = within(within(table).getByTestId("row-kda")).getAllByRole("cell")[0];
    expect(cell).toHaveAttribute("title", "8 / 6 / 14 over 2 games");
  });

  it("states the sample when statistics cover fewer games than the record",
    async () => {
      // Three games in the record, two of them with statistics. The drawer
      // must not let a reader assume the KDA covers all three.
      const drawer = await openDrawer();
      const note = await within(drawer).findByTestId("dossier-drawer-coverage");
      expect(note).toHaveTextContent("Statistics available for 2 of 3 games.");
    });

  it("never explains the source or the pipeline to a scout", async () => {
    // Engineering limits are the handoff's business. A dossier says what the
    // sample is, never why the corpus is shaped the way it is.
    const drawer = await openDrawer();
    const note = await within(drawer).findByTestId("dossier-drawer-coverage");
    expect(note.textContent).not.toMatch(
      /oracle|elixir|leaguepedia|corpus|enrich|pipeline|database|backend|API/i,
    );
  });

  it("prints one shared note when every figure covers the same games", async () => {
    dossier = dossierResponse({
      statistics: {
        overall: {
          coverage: { total_games: 3, stat_games: 3, missing_stat_games: 0 },
          kda: { kills: 8, deaths: 6, assists: 14, ratio: 22 / 6, perfect: false, games: 3 },
          cs_per_min: { value: 9.6, games: 3 },
          gold_per_min: { value: 412.5, games: 3 },
          damage_per_min: { value: 738.2, games: 3 },
        },
        versus_opponent: null,
      },
      versus_opponent: null,
      entity: { ...dossierResponse().entity, opponent_team_key: null, opponent_display_name: null },
    });
    const drawer = await openDrawer();
    await within(drawer).findByTestId("dossier-drawer-table");
    // Complete coverage says nothing at all — a note on every dossier would
    // stop being read.
    expect(within(drawer).queryByTestId("dossier-drawer-coverage")).toBeNull();
  });

  it("names both denominators when a figure covers fewer games than the rest",
    async () => {
      // A row can be enriched and still be missing one column. Gold here
      // covers 1 of the 2 enriched games.
      dossier = dossierResponse({
        statistics: {
          overall: {
            coverage: { total_games: 3, stat_games: 2, missing_stat_games: 1 },
            kda: { kills: 8, deaths: 6, assists: 14, ratio: 22 / 6, perfect: false, games: 2 },
            cs_per_min: { value: 9.6, games: 2 },
            gold_per_min: { value: 412.5, games: 1 },
            damage_per_min: { value: 738.2, games: 2 },
          },
          versus_opponent: null,
        },
        versus_opponent: null,
        entity: { ...dossierResponse().entity, opponent_team_key: null, opponent_display_name: null },
      });
      const drawer = await openDrawer();
      const note = await within(drawer).findByTestId("dossier-drawer-coverage");
      expect(note).toHaveTextContent("Statistics available for 1–2 of 3 games.");
    });

  it("renders a missing statistic as a dash and never as zero", async () => {
    // 27 real games with no statistics at all is the state of every pre-2014
    // slice. A zero would read as a player who dealt no damage.
    dossier = dossierResponse({
      statistics: {
        overall: {
          coverage: { total_games: 3, stat_games: 0, missing_stat_games: 3 },
          kda: { kills: null, deaths: null, assists: null, ratio: null, perfect: false, games: 0 },
          cs_per_min: { value: null, games: 0 },
          gold_per_min: { value: null, games: 0 },
          damage_per_min: { value: null, games: 0 },
        },
        versus_opponent: null,
      },
      versus_opponent: null,
      entity: { ...dossierResponse().entity, opponent_team_key: null, opponent_display_name: null },
    });
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    for (const id of ["row-kda", "row-csmin", "row-goldmin", "row-dmgmin"]) {
      const cells = within(within(table).getByTestId(id)).getAllByRole("cell");
      expect(cells[0].textContent).toBe("—");
    }
    expect(within(drawer).getByTestId("dossier-drawer-coverage")).toHaveTextContent(
      /not available for these games/i,
    );
    // And the canonical record is untouched: the games were still played.
    expect(
      within(within(table).getByTestId("row-games")).getAllByRole("cell")[0].textContent,
    ).toBe("3");
  });

  it("calls a genuine no-death record Perfect and an empty one a dash", async () => {
    dossier = dossierResponse({
      statistics: {
        overall: {
          coverage: { total_games: 2, stat_games: 2, missing_stat_games: 0 },
          kda: { kills: 9, deaths: 0, assists: 11, ratio: null, perfect: true, games: 2 },
          cs_per_min: { value: 9.6, games: 2 },
          gold_per_min: { value: 412.5, games: 2 },
          damage_per_min: { value: 738.2, games: 2 },
        },
        // A matchup that never happened. Its ratio is null for a completely
        // different reason and must not be labelled Perfect.
        versus_opponent: {
          coverage: { total_games: 0, stat_games: 0, missing_stat_games: 0 },
          kda: { kills: null, deaths: null, assists: null, ratio: null, perfect: false, games: 0 },
          cs_per_min: { value: null, games: 0 },
          gold_per_min: { value: null, games: 0 },
          damage_per_min: { value: null, games: 0 },
        },
      },
    });
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    const cells = within(within(table).getByTestId("row-kda")).getAllByRole("cell");
    expect(cells[0].textContent).toBe("Perfect");
    expect(cells[1].textContent).toBe("—");
  });

  it("keeps the record, form and ban pressure exactly as they were", async () => {
    // The statistics pass must not have moved anything the dossier already
    // said. These four are the whole of Step 2's original deliverable.
    const drawer = await openDrawer();
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    expect(within(drawer).getByTestId("dossier-drawer-record")).toHaveTextContent("2–1");
    expect(within(drawer).getByTestId("dossier-drawer-winrate")).toHaveTextContent("66.7%");
    expect(within(drawer).getAllByTestId("dossier-drawer-form-glyph")).toHaveLength(3);
    expect(
      within(within(table).getByTestId("row-banpressure")).getAllByRole("cell")[0].textContent,
    ).toBe("7 / 40 · 17.5%");
  });

  it("never introduces a player-versus-player reading", async () => {
    // The opponent axis is a TEAM. Champion-v-champion study is a later layer
    // and must not be implied by anything on this screen.
    const drawer = await openDrawer();
    await within(drawer).findByTestId("dossier-drawer-table");
    expect(drawer.textContent).not.toMatch(
      /head-to-head|head to head|series score|matchup record|will start|predicted/i,
    );
  });

  it("prints the server's own definitions rather than its own wording", async () => {
    const drawer = await openDrawer();
    const fine = await within(drawer).findByTestId("dossier-drawer-definitions");
    expect(fine).toHaveTextContent(
      "Games this player played this champion in the selected scope",
    );
    expect(fine).toHaveTextContent("contextual draft behaviour");
  });

  it("is honest when the player never played the champion in the scope", async () => {
    dossier = dossierResponse({
      overall: {
        games: 0,
        wins: 0,
        losses: 0,
        win_rate: null,
        first_played_at: null,
        last_played_at: null,
      },
      versus_opponent: {
        games: 0,
        wins: 0,
        losses: 0,
        win_rate: null,
        first_played_at: null,
        last_played_at: null,
      },
      champion_share: 0,
      recent_form: [],
      recent_form_total: 0,
    });
    const drawer = await openDrawer();
    const zero = await within(drawer).findByTestId("dossier-drawer-zero");
    expect(zero).toHaveTextContent("did not play Ornn in any of them");
    // No fabricated rate, and no empty table pretending to hold figures.
    expect(drawer.textContent).not.toMatch(/0\.0%/);
    expect(within(drawer).queryByTestId("dossier-drawer-table")).toBeNull();
  });

  it("distinguishes 'did not participate' from a record of zeroes", async () => {
    dossier = dossierResponse({
      participation: "did_not_participate",
      player_games_in_scope: 0,
      overall: null,
      versus_opponent: null,
      ban_pressure: null,
      recent_form: [],
      recent_form_total: 0,
    });
    const drawer = await openDrawer();
    const dnp = await within(drawer).findByTestId("dossier-drawer-dnp");
    expect(dnp).toHaveTextContent(/no games in 2026/i);
    expect(within(drawer).queryByTestId("dossier-drawer-summary")).toBeNull();
    expect(drawer.textContent).not.toMatch(/0\.0%|0 – 0/);
  });

  it("omits the opponent column entirely when the board has only one team", async () => {
    dossier = dossierResponse({
      entity: {
        ...dossierResponse().entity,
        opponent_team_key: null,
        opponent_display_name: null,
      },
      player_games_vs_opponent: null,
      versus_opponent: null,
      ban_pressure: { overall: dossierResponse().ban_pressure.overall, versus_opponent: null },
    });
    await renderBoard("?mode=team&team_a=T1");
    const card = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(card).getAllByTestId("champ-chip-Ornn")[0]);
    const drawer = await screen.findByTestId("player-champion-drawer");
    const table = await within(drawer).findByTestId("dossier-drawer-table");
    // Two columns, not three — and no "vs null" heading.
    expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
    expect(table.textContent).not.toMatch(/vs\s*(null|undefined)/i);
  });

  it("switches cleanly to a champion belonging to the other player", async () => {
    const drawer = await openDrawer();
    await within(drawer).findByTestId("dossier-drawer-table");

    dossier = dossierResponse({
      entity: {
        ...dossierResponse().entity,
        champion_key: "Ambessa",
        display_name: "Bin",
        teams_in_scope: ["Bilibili Gaming"],
        opponent_team_key: "T1",
        opponent_display_name: "T1",
      },
    });
    const other = within(screen.getByTestId("lane-card-Top")).getByTestId(
      "lane-Top-Bilibili Gaming",
    );
    fireEvent.click(within(other).getAllByTestId("champ-chip-Ambessa")[0]);

    await waitFor(() =>
      expect(screen.getByTestId("dossier-drawer-identity")).toHaveTextContent("Ambessa"),
    );
    // And the opponent followed the side: the other player's opponent is T1.
    expect(screen.getByTestId("dossier-drawer-identity")).toHaveTextContent("T1");
  });

  it("follows a side swap so the opponent context stays correct", async () => {
    // Nothing may assume blue/red or A/B: swapping the board must swap which
    // team the drawer asks about.
    await renderBoard();
    fireEvent.click(screen.getByTestId("team-swap"));
    await waitFor(() =>
      expect(requests.some((u) => u.includes("team_a=Bilibili"))).toBe(true),
    );
    const card = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(card).getAllByTestId("champ-chip-Ornn")[0]);
    await screen.findByTestId("player-champion-drawer");
    await waitFor(() => {
      const url = requests.filter((u) => u.includes("/matchup/player-champion")).pop();
      expect(new URLSearchParams(String(url).split("?")[1]).get("opponent")).toBe(
        "Bilibili Gaming",
      );
    });
  });

  it("closes cleanly and clears the selection", async () => {
    const drawer = await openDrawer();
    fireEvent.click(within(drawer).getByRole("button", { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByTestId("player-champion-drawer")).toBeNull(),
    );
    const tile = within(
      within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1"),
    ).getAllByTestId("champ-chip-Ornn")[0];
    expect(tile).toHaveAttribute("aria-pressed", "false");
  });

  it("fills the slot Step 2 left, with a working chooser rather than a promise", async () => {
    // Step 2 asserted this slot was EMPTY: a control promising a feature the
    // product did not have would have been worse than silence. Step 3 built
    // the feature, so the assertion inverts -- but the standard does not. The
    // slot now holds a real chooser wired to real data, and still nothing that
    // says "coming soon".
    const drawer = await openDrawer();
    const slot = await within(drawer).findByTestId("dossier-drawer-study-slot");
    expect(slot).not.toBeEmptyDOMElement();
    expect(within(slot).getByTestId("study-chooser")).toBeInTheDocument();
    expect(drawer.textContent).not.toMatch(/coming soon|not yet available|next step/i);
  });
});

// --- Step 3: the exact matchup study ----------------------------------------
//
// The distinction this whole layer exists for: the dossier above answers
// "Doran's Ornn, including against Bilibili Gaming" — a TEAM opponent axis —
// and the study answers "Doran's Ornn against BIN'S AMBESSA", joined on the
// game. Every test below pins either that distinction, the honesty of a zero,
// or the side journey that turns the two into a graph.

describe("the exact matchup study", () => {
  async function openStudy({ pick = true } = {}) {
    await renderBoard();
    const card = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(card).getAllByTestId("champ-chip-Ornn")[0]);
    const drawer = await screen.findByTestId("player-champion-drawer");
    const study = await within(drawer).findByTestId("dossier-study");
    if (!pick) return { drawer, study };
    // The other side of the same lane, chosen the way the board is read:
    // player, then that player's demonstrated pick.
    fireEvent.click(within(study).getByTestId("study-opposing-player"));
    fireEvent.click(await within(drawer).findByTestId("study-opposing-champion"));
    await within(drawer).findByTestId("study-record");
    return { drawer, study: within(drawer).getByTestId("dossier-study") };
  }

  it("asks for nothing until BOTH sides are chosen", async () => {
    // A request with half a matchup in it would either 422 or, worse, answer a
    // question the reader did not ask.
    const { study } = await openStudy({ pick: false });
    expect(within(study).getByTestId("study-prompt")).toBeInTheDocument();
    expect(requests.some((u) => u.includes("/matchup/exact"))).toBe(false);

    fireEvent.click(within(study).getByTestId("study-opposing-player"));
    await waitFor(() =>
      expect(screen.getByTestId("study-opposing-champion")).toBeInTheDocument(),
    );
    // A player with no champion is still half a question.
    expect(requests.some((u) => u.includes("/matchup/exact"))).toBe(false);
  });

  it("offers only the opposing half of the same lane", async () => {
    // Never the reader's own side, and never a champion catalogue: the chooser
    // is the board's own data, so it cannot offer a player the board does not
    // show or a champion they did not demonstrably play.
    const { study } = await openStudy({ pick: false });
    const chooser = within(study).getByTestId("study-chooser");
    const players = within(chooser).getAllByTestId("study-opposing-player");
    expect(players).toHaveLength(1);
    expect(players[0]).toHaveTextContent("Bin");
    expect(chooser.textContent).toContain("Top · Bilibili Gaming");
    // Scoped to the CHOOSER: the subject line above it names Doran on purpose,
    // and the chooser offering him would be offering the reader themselves.
    expect(chooser.textContent).not.toContain("Doran");
  });

  it("sends the exact question, with the board teams for ordering only", async () => {
    await openStudy();
    const url = requests.find((u) => u.includes("/matchup/exact")) ?? "";
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("subject_player")).toBe("Doran");
    expect(params.get("subject_champion")).toBe("Ornn");
    expect(params.get("opposing_player")).toBe("Bin");
    expect(params.get("opposing_champion")).toBe("Ambessa");
    expect(params.get("scope")).toBe("current_2026");
    // Repeated, not comma-joined: a team key may contain punctuation.
    expect(params.getAll("board_team").sort()).toEqual(["Bilibili Gaming", "T1"]);
  });

  it("prints the record, the sequence and the most recent meeting", async () => {
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-headline")).toHaveTextContent(
      "2 games · 1–1 · 50.0%",
    );
    expect(within(study).getByTestId("study-sequence")).toHaveTextContent("WL");
    expect(within(study).getByTestId("study-most-recent")).toHaveTextContent("2026-06-14");
  });

  it("names all four identities, both champions and both players", async () => {
    const { study } = await openStudy();
    const subject = within(study).getByTestId("study-subject");
    expect(subject).toHaveTextContent("Ornn vs Ambessa");
    expect(subject).toHaveTextContent("Doran vs Bin");
  });

  it("states whose side the record is read from", async () => {
    // "1–1" is meaningless until you know that. The server's own sentence.
    const { study } = await openStudy();
    expect(study.textContent).toContain("Wins and losses are counted from the subject");
  });

  it("prints the server's exact-match definition rather than one of its own", async () => {
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-definition")).toHaveTextContent(
      EXACT_DEFINITIONS.exact_matchup,
    );
  });

  // --- the zero state -------------------------------------------------------

  it("keeps a truthful zero visible rather than hiding the section", async () => {
    exact = exactResponse({
      exact: {
        record: {
          games: 0,
          wins: 0,
          losses: 0,
          win_rate: null,
          first_played_at: null,
          last_played_at: null,
        },
        meetings: [],
        meetings_total: 0,
        result_sequence: [],
        most_recent: null,
      },
    });
    const { drawer } = await openStudyExpectingZero();
    const zero = within(drawer).getByTestId("study-zero");
    expect(zero).toHaveTextContent(
      "No recorded Doran Ornn vs Bin Ambessa games in 2026.",
    );
    // The counts that make the sentence checkable, and the server's own
    // sentence saying no looser sample was substituted.
    expect(within(drawer).getByTestId("study-zero-counts")).toHaveTextContent(
      "Doran: 30 games on Ornn. Bin: 40 games on Ambessa.",
    );
    expect(zero.textContent).toContain("no looser sample is substituted");
    // A rate over zero games is never rendered as a result.
    expect(zero.textContent).not.toMatch(/0\.0%/);
  });

  it("says WHICH zero it is when a player was not in the scope at all", async () => {
    // Three different facts; one sentence for all three would be wrong two
    // thirds of the time.
    exact = exactResponse({
      exact: {
        record: { games: 0, wins: 0, losses: 0, win_rate: null, first_played_at: null, last_played_at: null },
        meetings: [],
        meetings_total: 0,
        result_sequence: [],
        most_recent: null,
      },
      opposing: {
        player_lp_page: "Bin",
        display_name: "Bin",
        champion_key: "Ambessa",
        participation: "did_not_participate",
        games_in_scope: 0,
        champion_games_in_scope: 0,
        teams_in_qualifying_games: [],
      },
    });
    const { drawer } = await openStudyExpectingZero();
    expect(within(drawer).getByTestId("study-zero")).toHaveTextContent(
      "Bin has no games at all in 2026",
    );
  });

  it("says WHICH zero it is when the champion was never played", async () => {
    exact = exactResponse({
      exact: {
        record: { games: 0, wins: 0, losses: 0, win_rate: null, first_played_at: null, last_played_at: null },
        meetings: [],
        meetings_total: 0,
        result_sequence: [],
        most_recent: null,
      },
      opposing: {
        player_lp_page: "Bin",
        display_name: "Bin",
        champion_key: "Ambessa",
        participation: "participated",
        games_in_scope: 125,
        champion_games_in_scope: 0,
        teams_in_qualifying_games: [],
      },
    });
    const { drawer } = await openStudyExpectingZero();
    expect(within(drawer).getByTestId("study-zero")).toHaveTextContent(
      "Bin did not play Ambessa in 2026",
    );
  });

  async function openStudyExpectingZero() {
    await renderBoard();
    const card = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(card).getAllByTestId("champ-chip-Ornn")[0]);
    const drawer = await screen.findByTestId("player-champion-drawer");
    fireEvent.click(await within(drawer).findByTestId("study-opposing-player"));
    fireEvent.click(await within(drawer).findByTestId("study-opposing-champion"));
    await within(drawer).findByTestId("study-zero");
    return { drawer };
  }

  // --- Step 7: the exact sample's scouting figures --------------------------
  //
  // WHAT THESE TESTS ARE ABOUT. Rendering a number is trivial; every real
  // defect in this section is a number that MEANS something other than what
  // the heading above it says. So: that a sign is a claim about direction and
  // a tie is not, that a missing figure is absent rather than zero, that
  // partial coverage is stated in a scout's language and not an engineer's,
  // that a support matchup never shows a creep-score difference, and that an
  // empty sample renders nothing at all rather than a panel of dashes.

  it("renders the exact sample's KDA inside the study", async () => {
    const { study } = await openStudy();
    const block = within(study).getByTestId("study-sample-stats");
    expect(within(block).getByTestId("study-sample-kda")).toHaveTextContent("KDA");
    expect(within(block).getByTestId("study-sample-kda")).toHaveTextContent("4.25");
    // The raw components are reachable without the strip growing a column.
    expect(within(block).getByTestId("study-sample-kda")).toHaveAttribute(
      "title",
      "8 / 4 / 9 over 2 games",
    );
  });

  it("prints a positive gold difference with a + and names it a median", async () => {
    const { study } = await openStudy();
    const gold = within(study).getByTestId("study-sample-gold15");
    expect(gold).toHaveTextContent("Gold @15");
    expect(gold).toHaveTextContent("+286 median");
  });

  it("prints a negative gold difference with a -", async () => {
    exact = exactResponse({
      statistics: exactStatistics({ gold_diff_at15: { median: -286, games: 2 } }),
    });
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-sample-gold15")).toHaveTextContent(
      "-286 median",
    );
  });

  it("prints a measured tie as 0 and never as +0", async () => {
    // A SIGN IS A CLAIM ABOUT DIRECTION and a tie has no direction. This is
    // the same rule the game dossier's per-row figure follows.
    exact = exactResponse({
      statistics: exactStatistics({
        gold_diff_at15: { median: 0, games: 2 },
        cs_diff_at15: { median: 0, games: 2, supported: true, unsupported_reason: null },
      }),
    });
    const { study } = await openStudy();
    const gold = within(study).getByTestId("study-sample-gold15");
    expect(gold).toHaveTextContent("0 median");
    expect(gold.textContent).not.toContain("+0");
    expect(gold.textContent).not.toContain("-0");
    expect(within(study).getByTestId("study-sample-cs15").textContent).not.toContain(
      "+0",
    );
  });

  it("keeps a half from an even sample rather than rounding it away", async () => {
    exact = exactResponse({
      statistics: exactStatistics({ gold_diff_at15: { median: -89.5, games: 6 } }),
    });
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-sample-gold15")).toHaveTextContent(
      "-89.5 median",
    );
  });

  it("renders CS @15 for a farming-role matchup", async () => {
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-sample-cs15")).toHaveTextContent(
      "+7 median",
    );
  });

  it("omits CS @15 entirely for a support matchup", async () => {
    // A support's creep score is a byproduct of which waves the bot laner
    // left. Gold is still shown, because a support's early game really is
    // kill and assist participation.
    exact = exactResponse({
      statistics: exactStatistics({
        subject_positions: ["sup"],
        gold_diff_at15: { median: -89, games: 2 },
        cs_diff_at15: {
          median: null,
          games: 0,
          supported: false,
          unsupported_reason: SUPPORT_CS_REASON,
        },
      }),
      unavailable_metrics: [
        { metric: "cs_diff_15_support", label: "CS at 15 minutes", reason: SUPPORT_CS_REASON },
      ],
    });
    const { study } = await openStudy();
    const block = within(study).getByTestId("study-sample-stats");
    expect(within(block).getByTestId("study-sample-gold15")).toHaveTextContent("-89");
    expect(within(block).queryByTestId("study-sample-cs15")).toBeNull();
    expect(block.textContent).not.toMatch(/CS @15/);
  });

  it("shows no 15-minute figure at all when the sample produced none", async () => {
    // A genuinely cross-lane exact pair: they met six times and never once in
    // lane. The KDA still stands, because it never needed a lane opponent.
    exact = exactResponse({
      statistics: exactStatistics({
        coverage: {
          exact_games: 2,
          stat_games: 2,
          missing_stat_games: 0,
          at15_games: { lane_opponent_is_another_player: 2 },
        },
        gold_diff_at15: { median: null, games: 0 },
        cs_diff_at15: { median: null, games: 0, supported: true, unsupported_reason: null },
      }),
    });
    const { study } = await openStudy();
    const block = within(study).getByTestId("study-sample-stats");
    expect(within(block).getByTestId("study-sample-kda")).toBeInTheDocument();
    expect(within(block).queryByTestId("study-sample-gold15")).toBeNull();
    expect(within(block).queryByTestId("study-sample-cs15")).toBeNull();
    // And NOT a row of dashes, which would read as a broken panel.
    expect(block.textContent).not.toContain("—");
  });

  it("says nothing about coverage when every figure covers every game", async () => {
    // A note printed on every study stops being read.
    const { study } = await openStudy();
    expect(within(study).queryByTestId("study-sample-coverage")).toBeNull();
  });

  it("communicates partial coverage in a scout's language", async () => {
    exact = exactResponse({
      statistics: exactStatistics({
        coverage: {
          exact_games: 3,
          stat_games: 3,
          missing_stat_games: 0,
          at15_games: { available: 2, unavailable: 1 },
        },
        gold_diff_at15: { median: 286, games: 2 },
        cs_diff_at15: { median: 7, games: 2, supported: true, unsupported_reason: null },
        kda: { kills: 8, deaths: 4, assists: 9, ratio: 4.25, perfect: false, games: 3 },
      }),
    });
    const { study } = await openStudy();
    const note = within(study).getByTestId("study-sample-coverage");
    expect(note).toHaveTextContent("15-minute figures based on 2 of 3 games");
    // NO ENGINEERING EXPLANATION REACHES THE SCOUT.
    for (const word of [
      "oracle", "elixir", "leaguepedia", "corpus", "enrich", "pipeline",
      "database", "backend", "api",
    ]) {
      expect(note.textContent?.toLowerCase()).not.toContain(word);
    }
  });

  it("names the KDA's own coverage when it differs from the record", async () => {
    exact = exactResponse({
      statistics: exactStatistics({
        coverage: {
          exact_games: 3,
          stat_games: 2,
          missing_stat_games: 1,
          at15_games: { available: 3 },
        },
        kda: { kills: 8, deaths: 4, assists: 9, ratio: 4.25, perfect: false, games: 2 },
        gold_diff_at15: { median: 286, games: 3 },
        cs_diff_at15: { median: 7, games: 3, supported: true, unsupported_reason: null },
      }),
    });
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-sample-coverage")).toHaveTextContent(
      "KDA based on 2 of 3 games",
    );
  });

  it("renders a deathless sample as Perfect rather than as a ratio", async () => {
    exact = exactResponse({
      statistics: exactStatistics({
        kda: { kills: 8, deaths: 0, assists: 9, ratio: null, perfect: true, games: 2 },
      }),
    });
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-sample-kda")).toHaveTextContent("Perfect");
  });

  it("renders no statistics block at all when the exact sample is empty", async () => {
    // THE ZERO STATE ABOVE IS ALREADY THE WHOLE ANSWER. A strip of figures
    // beneath it would suggest there were aggregates to be missing.
    exact = exactResponse({
      exact: {
        record: {
          games: 0, wins: 0, losses: 0, win_rate: null,
          first_played_at: null, last_played_at: null,
        },
        meetings: [],
        meetings_total: 0,
        result_sequence: [],
        most_recent: null,
      },
      statistics: exactStatistics({
        coverage: { exact_games: 0, stat_games: 0, missing_stat_games: 0, at15_games: {} },
        kda: { kills: null, deaths: null, assists: null, ratio: null, perfect: false, games: 0 },
        gold_diff_at15: { median: null, games: 0 },
        cs_diff_at15: { median: null, games: 0, supported: true, unsupported_reason: null },
        subject_positions: [],
      }),
    });
    const { drawer } = await openStudyExpectingZero();
    expect(within(drawer).getByTestId("study-zero")).toBeInTheDocument();
    expect(within(drawer).queryByTestId("study-sample-stats")).toBeNull();
    expect(within(drawer).queryByTestId("study-sample-kda")).toBeNull();
  });

  it("keeps the source meetings and the examples beside the new figures", async () => {
    // THE REGRESSION THIS SLICE COULD MOST EASILY CAUSE: a block inserted in
    // the middle of the record band that displaces what was already there.
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-sample-stats")).toBeInTheDocument();
    expect(within(study).getByTestId("study-source-meetings")).toBeInTheDocument();
    expect(within(study).getAllByTestId("study-source-meeting")).toHaveLength(1);
    expect(within(study).getAllByTestId("study-example")).toHaveLength(4);
    expect(within(study).getByTestId("study-record")).toHaveTextContent("2 games");
  });

  it("reads in the designed order: identity, then record, then figures", async () => {
    // THE FIGURES SUPPORT THE MATCHUP AND MUST NOT DOMINATE IT. Held as a
    // DOM-order property rather than as a font size, which is the part a
    // restyle could not silently break.
    const { study } = await openStudy();
    const text = study.textContent ?? "";
    expect(text.indexOf("2 games")).toBeGreaterThan(-1);
    expect(text.indexOf("Exact sample")).toBeGreaterThan(text.indexOf("2 games"));
    expect(text.indexOf("Source meeting")).toBeGreaterThan(text.indexOf("Exact sample"));
  });

  it("names no rating, grade or prediction anywhere in the study", async () => {
    const { study } = await openStudy();
    const text = (study.textContent ?? "").toLowerCase();
    for (const word of [
      "dominance", "lane score", "advantage rating", "grade", "prediction",
      "win probability", "lane power",
    ]) {
      expect(text).not.toContain(word);
    }
  });

  // --- other pro examples ---------------------------------------------------

  it("shows other pro examples even when the exact sample is not empty", async () => {
    // A core feature, not an empty-state fallback.
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-record")).toBeInTheDocument();
    expect(within(study).getAllByTestId("study-example")).toHaveLength(4);
  });

  it("shows other pro examples when the exact sample IS empty", async () => {
    exact = exactResponse({
      exact: {
        record: { games: 0, wins: 0, losses: 0, win_rate: null, first_played_at: null, last_played_at: null },
        meetings: [],
        meetings_total: 0,
        result_sequence: [],
        most_recent: null,
      },
    });
    const { drawer } = await openStudyExpectingZero();
    expect(within(drawer).getAllByTestId("study-example")).toHaveLength(4);
  });

  it("renders each example's four identities and its record", async () => {
    const { study } = await openStudy();
    const first = within(study).getAllByTestId("study-example")[0];
    expect(first).toHaveTextContent("Doran");
    expect(first).toHaveTextContent("T1");
    expect(first).toHaveTextContent("Zeus");
    expect(first).toHaveTextContent("Gen.G");
    expect(first).toHaveTextContent("3g · 2–1");
  });

  it("groups the examples by the server's relation, in the server's order", async () => {
    const { study } = await openStudy();
    const groups = within(study)
      .getAllByTestId("study-example-group")
      .map((el) => el.textContent);
    expect(groups).toEqual([
      "Same player, other opponents",
      "Same opponent, other players",
      "Elsewhere in the professional record",
    ]);
  });

  it("never labels an example with a judgement it has no statistic for", async () => {
    const { study } = await openStudy();
    expect(study.textContent).not.toMatch(
      /signature|elite|best example|strongest|pocket pick|comfort pick|must[- ]watch/i,
    );
  });

  // --- the side journey -----------------------------------------------------

  it("clicking an example establishes its whole matchup in one navigation", async () => {
    const { study } = await openStudy();
    const example = within(study).getAllByTestId("study-example")[0];
    fireEvent.click(example);

    // The board follows: new teams, and the study's four keys carried with it.
    await waitFor(() => {
      const url = requests.filter((u) => u.includes("/matchup/team")).pop() ?? "";
      const params = new URLSearchParams(url.split("?")[1]);
      expect(params.get("team_a")).toBe("T1");
      expect(params.get("team_b")).toBe("Gen.G");
    });
    // And the reader did not have to rebuild any of it by hand.
    await waitFor(() =>
      expect(screen.getByTestId("player-champion-drawer")).toBeInTheDocument(),
    );
    const url = requests.filter((u) => u.includes("/matchup/exact")).pop() ?? "";
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("subject_player")).toBe("Doran");
    expect(params.get("subject_champion")).toBe("Ornn");
    expect(params.get("opposing_player")).toBe("Zeus");
    expect(params.get("opposing_champion")).toBe("Ambessa");
  });

  it("opens a side journey into a team the pool admitted on data alone", async () => {
    // The exact case the team-pool split was built for. Before it, this
    // example was real evidence with `explorer_navigable: false` for a reason
    // that had nothing to do with KT's data — it was not on a Worlds
    // watchlist. Nothing about the Worlds claim changed; the board's own
    // pool did.
    const { study } = await openStudy();
    const example = within(study).getAllByTestId("study-example")[2];
    expect(example.tagName).toBe("BUTTON");
    expect(example).toHaveAttribute("data-navigable", "true");
    expect(example).toHaveTextContent("KT Rolster");
    fireEvent.click(example);

    await waitFor(() => {
      const url = requests.filter((u) => u.includes("/matchup/team")).pop() ?? "";
      const params = new URLSearchParams(url.split("?")[1]);
      expect(params.get("team_a")).toBe("KT Rolster");
      expect(params.get("team_b")).toBe("Bilibili Gaming");
    });
    // The study's four keys travel in the same navigation — proven by the
    // first-example test above, which lands on a board this mock does show a
    // roster for. What THIS test is about is the destination existing at all:
    // before the team pool, `KT Rolster` produced no board and this example
    // rendered as a static row.
  });

  it("renders an example the board cannot open as evidence, not a dead link", async () => {
    // Hiding it would quietly redefine "other professional examples" as
    // "other focus-set examples" — a different and much smaller claim.
    const { study } = await openStudy();
    const blocked = within(study).getAllByTestId("study-example")[3];
    expect(blocked.tagName).toBe("DIV");
    expect(blocked).not.toHaveAttribute("data-navigable");
    expect(within(study).getByTestId("study-example-blocked")).toHaveTextContent(
      "Anyone's Legend",
    );
    // And the limit is explained in the server's own words.
    expect(within(study).getByTestId("study-navigation-limit")).toHaveTextContent(
      EXACT_DEFINITIONS.navigation_limit,
    );
  });

  // --- Step 10: where the matchup continues ---------------------------------
  //
  // WHAT THESE TESTS ARE ABOUT. Not that three links render — that the links
  // CARRY THE MATCHUP, that they carry nothing else, and that neither of the
  // two destinations Mogzy cannot yet hand this context to has quietly grown a
  // button. A generic action is the failure mode this whole section exists to
  // prevent, so its absence is asserted as hard as the presence of the rest.

  it("offers Combat Lab with BOTH champions of the exact matchup", async () => {
    const { study } = await openStudy();
    const action = within(study).getByTestId("study-action-combat-lab");
    expect(action).toHaveTextContent("Open in Combat Lab");
    // Ornn is the subject, Ambessa the opponent — attacker then defender, in
    // that order, because the study is written from the subject's side.
    expect(action).toHaveAttribute("href", "/combat-lab?attacker=ornn&defender=ambessa");
  });

  it("names the champion in each Archives action", async () => {
    const { study } = await openStudy();
    const actions = within(study).getAllByTestId("study-action-mechanics");
    expect(actions).toHaveLength(2);
    expect(actions[0]).toHaveTextContent("Study Ornn Mechanics");
    expect(actions[0]).toHaveAttribute("href", "/lol/docs/champions/ornn");
    expect(actions[1]).toHaveTextContent("Study Ambessa Mechanics");
    expect(actions[1]).toHaveAttribute("href", "/lol/docs/champions/ambessa");
  });

  it("carries a punctuation-heavy champion into every destination", async () => {
    // The apostrophe is where a champion is silently lost. "K'Sante" must
    // reach both surfaces as `ksante`, not as `k'sante` or `k-sante`.
    exact = exactResponse({
      subject: {
        player_lp_page: "Doran",
        display_name: "Doran",
        champion_key: "K'Sante",
        participation: "participated",
        games_in_scope: 101,
        champion_games_in_scope: 30,
        teams_in_qualifying_games: ["T1"],
      },
      opposing: {
        player_lp_page: "Bin",
        display_name: "Bin",
        champion_key: "Cho'Gath",
        participation: "participated",
        games_in_scope: 125,
        champion_games_in_scope: 40,
        teams_in_qualifying_games: ["Bilibili Gaming"],
      },
    });
    const { study } = await openStudy();
    expect(within(study).getByTestId("study-action-combat-lab")).toHaveAttribute(
      "href",
      "/combat-lab?attacker=ksante&defender=chogath",
    );
    const actions = within(study).getAllByTestId("study-action-mechanics");
    expect(actions[0]).toHaveAttribute("href", "/lol/docs/champions/ksante");
    expect(actions[0]).toHaveTextContent("Study K'Sante Mechanics");
    expect(actions[1]).toHaveAttribute("href", "/lol/docs/champions/chogath");
  });

  it("offers one mechanics action for a mirror matchup", async () => {
    // Two identical links is a bug the reader has to read twice to notice.
    exact = exactResponse({
      opposing: {
        player_lp_page: "Bin",
        display_name: "Bin",
        champion_key: "Ornn",
        participation: "participated",
        games_in_scope: 125,
        champion_games_in_scope: 40,
        teams_in_qualifying_games: ["Bilibili Gaming"],
      },
    });
    const { study } = await openStudy();
    expect(within(study).getAllByTestId("study-action-mechanics")).toHaveLength(1);
    // Combat Lab still takes both sides: a mirror is a real matchup.
    expect(within(study).getByTestId("study-action-combat-lab")).toHaveAttribute(
      "href",
      "/combat-lab?attacker=ornn&defender=ornn",
    );
  });

  it("still offers the actions when the pro record is empty", async () => {
    // "Compare these two champions mechanically" is the same question whether
    // they met four times or never — and it is the MORE useful offer when the
    // historical answer is nothing.
    exact = exactResponse({
      exact: {
        record: {
          games: 0,
          wins: 0,
          losses: 0,
          win_rate: null,
          first_played_at: null,
          last_played_at: null,
        },
        meetings: [],
        meetings_total: 0,
        result_sequence: [],
        most_recent: null,
      },
    });
    const { drawer } = await openStudyExpectingZero();
    const study = within(drawer).getByTestId("dossier-study");
    expect(within(study).getByTestId("study-action-combat-lab")).toBeInTheDocument();
    expect(within(study).getAllByTestId("study-action-mechanics")).toHaveLength(2);
  });

  it("renders no action until both champions are known", async () => {
    const { study } = await openStudy({ pick: false });
    expect(within(study).queryByTestId("study-actions")).toBeNull();
  });

  it("offers NO quiz and NO pro-graph action", async () => {
    // Neither destination can currently be handed this matchup, and a link
    // that drops the champions on the way is worse than no link. There is no
    // disabled button and no "coming soon" — the row simply does not carry
    // them. This test is the guard on that promise.
    const { study } = await openStudy();
    const row = within(study).getByTestId("study-actions");
    for (const href of row.querySelectorAll("a")) {
      const to = href.getAttribute("href") ?? "";
      expect(to.startsWith("/combat-lab") || to.startsWith("/lol/docs/champions/")).toBe(
        true,
      );
    }
    expect(row.textContent).not.toMatch(/quiz/i);
    expect(row.textContent).not.toMatch(/graph/i);
    expect(row.textContent).not.toMatch(/coming soon/i);
    expect(row.querySelectorAll("button")).toHaveLength(0);
    expect(row.querySelectorAll("[disabled]")).toHaveLength(0);
  });

  it("never implies the simulation recreates the pro game", async () => {
    // Historical Pro Play evidence and mechanical simulation are two
    // authorities. The action row must not blur them, and it must not carry a
    // player, a team, a patch or a build into the simulator's URL.
    const { study } = await openStudy();
    const row = within(study).getByTestId("study-actions");
    for (const word of [
      "recreate",
      "replay",
      "rebuild",
      "their build",
      "this game",
      "predict",
      "simulate the",
    ]) {
      expect(row.textContent?.toLowerCase()).not.toContain(word);
    }
    const href =
      within(study).getByTestId("study-action-combat-lab").getAttribute("href") ?? "";
    const params = new URLSearchParams(href.split("?")[1]);
    expect([...params.keys()].sort()).toEqual(["attacker", "defender"]);
    // No player, team, patch, date or item rides along.
    for (const leak of ["Doran", "Bin", "T1", "Bilibili"]) {
      expect(href).not.toContain(leak);
    }
  });

  it("keeps the actions quieter than the matchup itself", async () => {
    // A continuation, not a conversion banner: the row must sit AFTER the
    // record it continues from, and must not be a heading or a filled button.
    const { study } = await openStudy();
    const row = within(study).getByTestId("study-actions");
    const record = within(study).getByTestId("study-record");
    expect(record.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And BEFORE the wider exploration, which is the less central question.
    const examples = within(study).getByTestId("study-examples");
    expect(row.compareDocumentPosition(examples) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const link of row.querySelectorAll("a")) {
      expect(link.className).toContain("dossier-study__action");
      expect(link.tagName).toBe("A");
    }
  });

  // --- the study lives in the URL -------------------------------------------

  it("restores a whole study from a pasted link", async () => {
    // What makes a side journey a navigation rather than a hidden state
    // transition: the same URL, opened cold, is the same screen.
    renderAt(
      "?mode=team&team_a=T1&team_b=Bilibili+Gaming&focus_player=Doran" +
        "&focus_champion=Ornn&vs_player=Bin&vs_champion=Ambessa",
    );
    const drawer = await screen.findByTestId("player-champion-drawer");
    expect(await within(drawer).findByTestId("study-record")).toHaveTextContent("1–1");
  });

  it("opens no drawer for a link naming somebody this board does not show", async () => {
    // The board is the authority on who is in which lane. A drawer headed with
    // another player's lane and team would be worse than no drawer.
    renderAt("?mode=team&team_a=T1&team_b=Bilibili+Gaming&focus_player=Ghost&focus_champion=Ornn");
    await waitFor(() => expect(screen.getByTestId("lane-board")).toBeInTheDocument());
    expect(screen.queryByTestId("player-champion-drawer")).toBeNull();
  });

  it("does not refetch the board when a dossier is opened", async () => {
    // The study is in the query string; five lanes, ten rosters and six
    // champion pools do not change because one dossier is open.
    await renderBoard();
    const before = requests.filter((u) => u.includes("/matchup/team")).length;
    const card = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(card).getAllByTestId("champ-chip-Ornn")[0]);
    await screen.findByTestId("player-champion-drawer");
    expect(requests.filter((u) => u.includes("/matchup/team")).length).toBe(before);
  });

  it("drops the study when the scope or a team changes", async () => {
    // A selection made in one scope is not a selection in another, and an open
    // dossier belongs to the board it was opened on.
    await openStudy();
    fireEvent.click(screen.getByTestId("dossier-scope-all_time"));
    await waitFor(() =>
      expect(screen.queryByTestId("player-champion-drawer")).toBeNull(),
    );
  });

  it("keeps the study across a side swap", async () => {
    // Reading the same board the other way round does not change which player
    // is on which champion; dropping the dossier would be a surprise.
    await openStudy();
    fireEvent.click(screen.getByTestId("team-swap"));
    await waitFor(() =>
      expect(screen.getByTestId("player-champion-drawer")).toBeInTheDocument(),
    );
  });

  it("never calls the dossier's own two columns a head-to-head", async () => {
    // The study IS a head-to-head; the table above it is not. Two payloads,
    // two sections, and the drawer must not blur them.
    const { drawer } = await openStudy();
    const table = within(drawer).getByTestId("dossier-drawer-table");
    expect(table.textContent).not.toMatch(/head[- ]to[- ]head/i);
    // The board's own side-by-side sentence still renders behind the drawer,
    // unedited, on the section that carries the ten records.
    expect(screen.getByTestId("dossier-side-by-side-note")).toHaveTextContent(
      NOTES.side_by_side,
    );
  });
});

// --- Step 4: historical meetings --------------------------------------------
//
// THE CLAIM THIS STEP MAKES is that a reader can move from broad team scouting
// OR from exact-matchup evidence into one specific historical meeting, in the
// same Explorer, and understand it at a glance. These tests hold both entry
// paths, the terminology that keeps a Bo1 from being called a series, and the
// clearing rules that keep a meeting from outliving the question that opened it.

describe("Step 4 — the meeting selection", () => {
  it("round-trips a meeting through the query string", () => {
    const selection: TeamSelection = {
      ...EMPTY_TEAM_SELECTION,
      team_a: "T1",
      team_b: "Gen.G",
      meeting: { match_id: BO3_ID, game_number: 3 },
    };
    const params = teamSelectionToParams(selection);
    expect(params.get("meeting")).toBe(BO3_ID);
    expect(params.get("game")).toBe("3");
    expect(teamSelectionFromParams(params).meeting).toEqual({
      match_id: BO3_ID,
      game_number: 3,
    });
  });

  it("keeps every URL that predates it parsing exactly as before", () => {
    // Additive, in the way `study` was: a board with no meeting reads the same.
    const before = teamSelectionFromParams(new URLSearchParams("team_a=T1&scope=all_time"));
    expect(before.meeting).toBeNull();
    expect(before.team_a).toBe("T1");
    expect(before.scope_id).toBe("all_time");
  });

  it("drops a game number that names no meeting", () => {
    // A game number identifies nothing without the meeting it numbers.
    expect(meetingFromParams(new URLSearchParams("game=3"))).toBeNull();
    // And a meeting with no game is the normal multi-game case.
    expect(meetingFromParams(new URLSearchParams(`meeting=${encodeURIComponent(BO3_ID)}`)))
      .toEqual({ match_id: BO3_ID, game_number: null });
  });

  it("never sends the meeting to the board endpoint", async () => {
    // Five lanes do not change because one meeting is open, and a request keyed
    // on it would refetch all of them on every click.
    await renderBoard(`${TEAM_URL}&meeting=${encodeURIComponent(BO3_ID)}`);
    for (const url of requests.filter((u) => u.includes("/matchup/team"))) {
      expect(url).not.toContain("meeting=");
      expect(url).not.toContain("game=");
    }
  });
});

describe("Step 4 — Recent Meetings on the board", () => {
  it("renders the section under the team matchup", async () => {
    await renderBoard();
    const section = await screen.findByTestId("dossier-meetings");
    expect(within(section).getAllByTestId("meeting-row")).toHaveLength(2);
  });

  it("shows the score, the event and the date on each row", async () => {
    await renderBoard();
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    expect(rows[0].textContent).toContain("T1");
    expect(rows[0].textContent).toContain("2");
    expect(rows[0].textContent).toContain("LCK 2026 Rounds 1-2");
    expect(rows[0].textContent).toContain("2026");
    expect(rows[0].textContent).toContain("Patch 26.09");
  });

  it("does not call a one-game meeting a series", async () => {
    // 59% of the corpus is one game per match_id. The word is the whole reason
    // this layer says "meeting".
    await renderBoard();
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    const bo1 = rows.find((r) => r.dataset.matchId === BO1_ID)!;
    expect(bo1.dataset.kind).toBe("single_game");
    expect(bo1.textContent).not.toMatch(/series/i);
    expect(within(bo1).getByTestId("meeting-kind")).toHaveTextContent("Single game");
    // …and the Bo3 beside it does say it.
    const bo3 = rows.find((r) => r.dataset.matchId === BO3_ID)!;
    expect(within(bo3).getByTestId("meeting-kind").textContent).toMatch(/series/i);
  });

  it("prints the server's own sentence about what the section is", async () => {
    await renderBoard();
    expect(screen.getByTestId("dossier-meetings-note")).toHaveTextContent(NOTES.meetings);
  });

  it("says how many of the total are shown", async () => {
    await renderBoard();
    expect(screen.getByTestId("dossier-meetings").textContent).toContain("2 of 12");
  });

  it("introduces no mode tab", async () => {
    // The product stays progressive: team → lane → player × champion → exact
    // → meeting. A "Series" or "Game" tab would flatten that into a filter.
    await renderBoard();
    const controls = screen.getByTestId("dossier-controls");
    expect(controls.textContent).not.toMatch(/\b(series|game|meeting)\b/i);
  });
});

describe("Step 4 — the meeting shell", () => {
  async function openMeeting(matchId = BO3_ID) {
    await renderBoard();
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    fireEvent.click(rows.find((r) => r.dataset.matchId === matchId)!);
    return screen.findByTestId("dossier-meeting-shell");
  }

  it("opens the shell when a meeting is clicked", async () => {
    const shell = await openMeeting();
    expect(within(shell).getByTestId("meeting-head")).toBeInTheDocument();
  });

  it("addresses the meeting by match_id, over the same admin-gated API", async () => {
    await openMeeting();
    const url = requests.filter((u) => u.includes("/matchup/series")).pop() ?? "";
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    expect(params.get("match_id")).toBe(BO3_ID);
    // The scope rides along as CONTEXT — the route reports `in_scope`, it does
    // not narrow the meeting.
    expect(params.get("scope")).toBe("current_2026");
  });

  it("is reloadable from the URL alone", async () => {
    // The serialisable half of "shareable". Pretty URLs stay future scope; the
    // state is fully addressable either way.
    await renderBoard(`${TEAM_URL}&meeting=${encodeURIComponent(BO3_ID)}`);
    const shell = await screen.findByTestId("dossier-meeting-shell");
    expect(within(shell).getAllByTestId("meeting-game")).toHaveLength(3);
  });

  it("shows the games in game-number order", async () => {
    // The fixture deliberately hands them back out of order. Ordering comes
    // from `game_number` — never from the draft, which does not exist, and
    // never from the payload's own array order.
    const shell = await openMeeting();
    const games = within(shell).getAllByTestId("meeting-game");
    expect(games.map((g) => g.dataset.gameNumber)).toEqual(["1", "2", "3"]);
  });

  it("names the winner and the duration of each game", async () => {
    const shell = await openMeeting();
    const games = within(shell).getAllByTestId("meeting-game");
    expect(within(games[0]).getByTestId("meeting-game-result")).toHaveTextContent(
      "Bilibili Gaming win",
    );
    expect(games[0].textContent).toContain("27:14");
    expect(games[1].textContent).toContain("50:18");
  });

  it("says a duration is not recorded rather than printing a zero", async () => {
    // OE covers 80% of the corpus; a zero would be a lie about a real game.
    const shell = await openMeeting();
    const games = within(shell).getAllByTestId("meeting-game");
    expect(games[2].textContent).toContain("Duration not recorded");
    expect(games[2].textContent).not.toContain("0:00");
  });

  it("shows the champions each side took, and never a draft order", async () => {
    const shell = await openMeeting();
    const first = within(shell).getAllByTestId("meeting-game")[0];
    const sides = within(first).getAllByTestId("meeting-game-side");
    expect(sides).toHaveLength(2);
    expect(within(sides[0]).getAllByTestId("champion-icon")).toHaveLength(5);
    // `sequence` is -1 on every pick/ban row in the corpus. Nothing may number
    // a pick or lay the ten champions out as a draft.
    expect(first.textContent).not.toMatch(/first pick|pick \d|ban \d|draft/i);
  });

  it("prints the server's words for what is not shown", async () => {
    const shell = await openMeeting();
    expect(within(shell).getByTestId("meeting-unavailable-draft_order")).toHaveTextContent(
      MEETING_UNAVAILABLE[0].reason,
    );
  });

  it("shows no per-player statistics table", async () => {
    // Step 5. Until a payload carries a number, the shell must not imply one.
    const shell = await openMeeting();
    expect(shell.textContent).not.toMatch(/\bKDA\b|\bCS\b|vision score|gold@|damage/i);
  });

  it("keeps the scope visible as context, and says when a meeting is outside it", async () => {
    const outside = await openMeeting(BO1_ID);
    expect(within(outside).getByTestId("meeting-scope")).toHaveTextContent(
      /outside the selected scope/i,
    );
    // …and the meeting still reads whole: it was chosen by name, not filtered.
    expect(within(outside).getAllByTestId("meeting-game")).toHaveLength(1);
  });

  it("closes back to the board without losing the board", async () => {
    const shell = await openMeeting();
    fireEvent.click(within(shell).getByTestId("meeting-close"));
    await waitFor(() =>
      expect(screen.queryByTestId("dossier-meeting-shell")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("lane-board")).toBeInTheDocument();
    expect(screen.getByTestId("dossier-meetings")).toBeInTheDocument();
  });

  it("opens through the board's own selection, so Back returns", async () => {
    // Back works because opening a meeting is the SAME `onChange` every other
    // control uses — one history entry on the same page, not a route change.
    // The observable proof is that the board is not refetched: a second
    // mechanism would have remounted it.
    await renderBoard();
    const before = requests.filter((u) => u.includes("/matchup/team")).length;
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    fireEvent.click(rows[0]);
    await screen.findByTestId("dossier-meeting-shell");
    expect(requests.filter((u) => u.includes("/matchup/team"))).toHaveLength(before);
    expect(screen.getByTestId("lane-board")).toBeInTheDocument();
  });

  it("says so honestly when a meeting cannot be read", async () => {
    await renderBoard(`${TEAM_URL}&meeting=${encodeURIComponent("no/such meeting")}`);
    expect(await screen.findByTestId("meeting-error")).toBeInTheDocument();
    // An unreadable meeting does not take the board down with it.
    expect(screen.getByTestId("lane-board")).toBeInTheDocument();
  });
});

describe("Step 4 — from exact matchup evidence into the source meeting", () => {
  async function openStudyForMeeting() {
    await renderBoard();
    const card = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(card).getAllByTestId("champ-chip-Ornn")[0]);
    const drawer = await screen.findByTestId("player-champion-drawer");
    const study = await within(drawer).findByTestId("dossier-study");
    fireEvent.click(within(study).getByTestId("study-opposing-player"));
    fireEvent.click(await within(drawer).findByTestId("study-opposing-champion"));
    await within(drawer).findByTestId("study-record");
    return within(drawer).getByTestId("dossier-study");
  }

  it("offers the source meeting of a counted game", async () => {
    const study = await openStudyForMeeting();
    expect(within(study).getByTestId("study-source-meetings")).toBeInTheDocument();
  });

  it("offers ONE row for two games of the same meeting", async () => {
    // Two games of a best-of are one meeting to open. Listing it twice would
    // read as the pair having met twice.
    const study = await openStudyForMeeting();
    const rows = within(study).getAllByTestId("study-source-meeting");
    expect(rows).toHaveLength(1);
    expect(rows[0].dataset.matchId).toBe(BO3_ID);
  });

  it("opens the same meeting state the board's own rows open", async () => {
    const study = await openStudyForMeeting();
    fireEvent.click(within(study).getAllByTestId("study-source-meeting")[0]);
    const shell = await screen.findByTestId("dossier-meeting-shell");
    expect(within(shell).getAllByTestId("meeting-game")).toHaveLength(3);
    const url = requests.filter((u) => u.includes("/matchup/series")).pop() ?? "";
    expect(new URLSearchParams(url.split("?")[1] ?? "").get("match_id")).toBe(BO3_ID);
  });

  it("leaves the study open behind the meeting", async () => {
    // The reader arrived through that question; closing it behind them would
    // lose their place.
    const study = await openStudyForMeeting();
    fireEvent.click(within(study).getAllByTestId("study-source-meeting")[0]);
    await screen.findByTestId("dossier-meeting-shell");
    expect(screen.getByTestId("player-champion-drawer")).toBeInTheDocument();
  });
});

describe("Step 4 — clearing rules", () => {
  const withMeetingOpen: TeamSelection = {
    ...EMPTY_TEAM_SELECTION,
    team_a: "T1",
    team_b: "Gen.G",
    study: {
      subject_player: "Doran",
      subject_champion: "Ornn",
      opposing_player: "Bin",
      opposing_champion: "Ambessa",
    },
    meeting: { match_id: BO3_ID, game_number: null } as MeetingSelection,
  };

  it("a team change clears the meeting", () => {
    // A meeting is a meeting BETWEEN TWO TEAMS.
    expect(withTeamSide(withMeetingOpen, "a", "KT Rolster").meeting).toBeNull();
    expect(withTeamSide(withMeetingOpen, "b", "KT Rolster").meeting).toBeNull();
  });

  it("a scope change clears the meeting", () => {
    expect(withTeamScope(withMeetingOpen, "all_time").meeting).toBeNull();
  });

  it("changing the subject of the study clears the meeting", () => {
    expect(
      withStudySubject(withMeetingOpen, { player: "Faker", champion: "Azir" }).meeting,
    ).toBeNull();
  });

  it("closing the study clears the meeting", () => {
    expect(withStudySubject(withMeetingOpen, null).meeting).toBeNull();
  });

  it("changing the opposing side of the study clears the meeting", () => {
    expect(
      withStudyOpponent(withMeetingOpen, { player: "Xun", champion: "Vi" }).meeting,
    ).toBeNull();
  });

  it("a side swap KEEPS the meeting", () => {
    // Reading the same board the other way round does not change which teams
    // played, so dropping the meeting would be a surprise, not a safeguard.
    expect(withTeamsSwapped(withMeetingOpen).meeting).toEqual(withMeetingOpen.meeting);
  });

  it("clears a stale meeting in the rendered board, not just in the selection", async () => {
    await renderBoard(`${TEAM_URL}&meeting=${encodeURIComponent(BO3_ID)}`);
    await screen.findByTestId("dossier-meeting-shell");
    fireEvent.click(
      within(screen.getByTestId("dossier-scope-rail")).getByTestId(
        "dossier-scope-all_time",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("dossier-meeting-shell")).not.toBeInTheDocument(),
    );
  });

  it("opening a meeting keeps the board's own selection intact", () => {
    const next = withMeeting(
      { ...EMPTY_TEAM_SELECTION, team_a: "T1", team_b: "Gen.G", bans: ["Azir"] },
      { match_id: BO3_ID, game_number: null },
    );
    expect(next.team_a).toBe("T1");
    expect(next.bans).toEqual(["Azir"]);
    expect(next.meeting?.match_id).toBe(BO3_ID);
  });
});

// ---------------------------------------------------------------------------
// Step 5 — the game dossier
// ---------------------------------------------------------------------------
//
// The failures this layer can have are all about telling two things apart:
// a deathless game from an empty slice, an unread game from a scoreless one,
// a NULL field from a zero, an unordered ban set from a draft, and the
// canonical winner from Oracle's Elixir's. Each has its own test.

describe("Step 5 — the game dossier", () => {
  async function openGame(gameNumber = 1, matchId = BO3_ID) {
    await renderBoard();
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    fireEvent.click(rows.find((r) => r.dataset.matchId === matchId)!);
    const shell = await screen.findByTestId("dossier-meeting-shell");
    const games = within(shell).getAllByTestId("meeting-game");
    const row = games.find((g) => g.dataset.gameNumber === String(gameNumber))!;
    fireEvent.click(within(row).getByTestId("meeting-game-open"));
    return screen.findByTestId("game-dossier");
  }

  function playersOf(dossier: HTMLElement) {
    return within(dossier).getAllByTestId("game-player");
  }

  function playerRow(dossier: HTMLElement, player: string) {
    return playersOf(dossier).find((r) => r.dataset.player === player)!;
  }

  it("clicking a game row establishes the game state", async () => {
    const dossier = await openGame(2);
    expect(dossier.dataset.gameNumber).toBe("2");
    const url = requests.filter((u) => u.includes("/matchup/game")).pop() ?? "";
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    expect(params.get("match_id")).toBe(BO3_ID);
    expect(params.get("game_number")).toBe("2");
    // The scope rides along as CONTEXT, exactly as it does for the meeting.
    expect(params.get("scope")).toBe("current_2026");
  });

  it("renders the dossier INSIDE the meeting shell, not instead of it", async () => {
    // The whole point of the layer: a reader drilled in, they did not leave.
    const dossier = await openGame(1);
    const shell = screen.getByTestId("dossier-meeting-shell");
    expect(shell).toContainElement(dossier);
    expect(within(shell).getByTestId("meeting-head")).toBeInTheDocument();
    expect(within(shell).getAllByTestId("meeting-game")).toHaveLength(3);
  });

  it("marks the selected game and only the selected game", async () => {
    await openGame(2);
    const games = within(screen.getByTestId("dossier-meeting-shell")).getAllByTestId(
      "meeting-game",
    );
    const selected = games.filter((g) => g.dataset.selected === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].dataset.gameNumber).toBe("2");
  });

  it("renders the ten actual participants, split by team", async () => {
    const dossier = await openGame(1);
    expect(playersOf(dossier)).toHaveLength(10);
    const sides = within(dossier).getAllByTestId("game-side");
    expect(sides).toHaveLength(2);
    // Blue first, so the two halves read the way the game was played.
    expect(sides[0].dataset.team).toBe("T1");
    expect(sides[1].dataset.team).toBe("Bilibili Gaming");
  });

  it("renders each player's own champion", async () => {
    const dossier = await openGame(1);
    expect(playerRow(dossier, "T1-Mid").textContent).toContain("G1Mid");
    expect(playerRow(dossier, "Bilibili Gaming-Mid").textContent).toContain("G1RMid");
  });

  it("renders K / D / A from the real stat row", async () => {
    const dossier = await openGame(1);
    const bot = within(playerRow(dossier, "T1-Bot")).getByTestId("game-player-kda");
    expect(bot).toHaveTextContent("15 / 5 / 5");
    expect(within(bot).getByTestId("game-player-ratio")).toHaveTextContent("4.00 KDA");
  });

  it("renders a deathless player as Perfect, without dividing by zero", async () => {
    const dossier = await openGame(1);
    const top = within(playerRow(dossier, "T1-Top")).getByTestId("game-player-kda");
    expect(top).toHaveTextContent("2 / 0 / 9");
    expect(within(top).getByTestId("game-player-ratio")).toHaveTextContent("Perfect");
  });

  it("renders a genuine 0/0/0 as the zero line it was", async () => {
    // THE TRAP. Support really went 0/0/0 — it lands on the same null ratio
    // as the deathless game and it is a REAL scoreline, which is exactly why
    // "no statistics" has to be a different shape rather than a different
    // number.
    const dossier = await openGame(1);
    const sup = within(playerRow(dossier, "T1-Support")).getByTestId("game-player-kda");
    expect(sup).toHaveTextContent("0 / 0 / 0");
  });

  it("shows an honest unavailable state instead of a zeroed box score", async () => {
    const dossier = await openGame(3);
    expect(within(dossier).getByTestId("game-stats-unavailable").textContent).toContain(
      "not available for this game",
    );
    // The identity SURVIVES: ten players, their champions, and the winner.
    expect(playersOf(dossier)).toHaveLength(10);
    expect(playerRow(dossier, "T1-Mid").textContent).toContain("G3Mid");
    expect(within(dossier).getByTestId("game-result")).toHaveTextContent("T1 victory");
    // And not one fabricated number.
    const kda = within(playerRow(dossier, "T1-Top")).getByTestId("game-player-kda");
    expect(kda.textContent).not.toMatch(/\d/);
    expect(within(kda).queryByTestId("game-player-ratio")).toBeNull();
  });

  it("prints a NULL field as absent rather than as zero", async () => {
    // Enriched is not the same claim as complete: game 2's top laner has no
    // recorded vision score on an otherwise full row.
    const dossier = await openGame(2);
    const cells = within(playerRow(dossier, "T1-Top")).getAllByRole("cell");
    expect(cells[cells.length - 1]).toHaveTextContent("—");
    expect(cells[cells.length - 1]).not.toHaveTextContent("0");
  });

  it("renders the team objective comparison, mapped to the right teams", async () => {
    const dossier = await openGame(1);
    const table = within(dossier).getByTestId("game-objectives");
    const kills = within(table).getByTestId("objective-team_kills");
    expect(kills.textContent).toContain("22");
    expect(kills.textContent).toContain("26");
    // Gold in the League-readable shape the rest of Mogzy prints.
    expect(within(table).getByTestId("objective-total_gold").textContent).toContain("97.0k");
  });

  it("drops an objective that is null on both sides rather than printing dashes", async () => {
    const dossier = await openGame(1);
    const table = within(dossier).getByTestId("game-objectives");
    expect(within(table).queryByTestId("objective-total_cs")).toBeNull();
  });

  it("never prints turret_plates as a trustworthy metric", async () => {
    // Its stored values exceed their own structural ceiling. It may appear
    // only inside the sentence that explains its absence.
    const dossier = await openGame(1);
    const table = within(dossier).getByTestId("game-objectives");
    expect(table.textContent).not.toMatch(/plate/i);
    expect(within(dossier).getByTestId("game-unavailable-turret_plates")).toBeInTheDocument();
  });

  it("presents the canonical winner, on the game and on each side", async () => {
    const dossier = await openGame(1);
    expect(within(dossier).getByTestId("game-result")).toHaveTextContent("T1 victory");
    const results = within(dossier).getAllByTestId("game-side-result");
    expect(results[0]).toHaveTextContent("Victory");
    expect(results[1]).toHaveTextContent("Defeat");
  });

  it("never surfaces the source-disagreement diagnostic to a reader", async () => {
    // It is an operator flag. A reader did not ask about Mogzy's ingestion,
    // and the canonical result already won.
    const dossier = await openGame(1);
    expect(dossier.textContent).not.toMatch(/disagree|oracle|canonical/i);
  });

  it("draws bans as an unordered set and says so", async () => {
    const dossier = await openGame(1);
    const bans = within(dossier).getByTestId("game-bans");
    expect(bans.textContent).toContain("Bans");
    expect(within(bans).getByTestId("game-bans-note").textContent).toContain("unordered set");
    // NO shape that could read as a draft: no ordered list, no numbering, and
    // no draft vocabulary anywhere the champions themselves are drawn. (The
    // NOTE is allowed to say "pick/ban sequence" — that sentence is the
    // server explaining the absence, which is the opposite of implying one.)
    expect(bans.querySelector("ol")).toBeNull();
    const drawn = within(bans).getAllByTestId("champion-icon");
    expect(drawn.length).toBe(5);
    for (const side of bans.querySelectorAll(".dossier-game-bans__side")) {
      expect(side.textContent).not.toMatch(/\bpick\b|\bphase\b|\brotation\b|first ban|\b[1-5]\b/i);
    }
  });

  it("changing the game preserves the meeting", async () => {
    await openGame(1);
    const shell = screen.getByTestId("dossier-meeting-shell");
    const games = within(shell).getAllByTestId("meeting-game");
    const three = games.find((g) => g.dataset.gameNumber === "3")!;
    fireEvent.click(within(three).getByTestId("meeting-game-open"));
    await waitFor(() =>
      expect(screen.getByTestId("game-dossier").dataset.gameNumber).toBe("3"),
    );
    // Same meeting, same shell, one game open.
    expect(screen.getByTestId("dossier-meeting-shell")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("dossier-meeting-shell"))
        .getAllByTestId("meeting-game")
        .filter((g) => g.dataset.selected === "true"),
    ).toHaveLength(1);
  });

  it("clicking the open game closes it and leaves the meeting open", async () => {
    await openGame(1);
    const shell = screen.getByTestId("dossier-meeting-shell");
    const one = within(shell)
      .getAllByTestId("meeting-game")
      .find((g) => g.dataset.gameNumber === "1")!;
    fireEvent.click(within(one).getByTestId("meeting-game-open"));
    await waitFor(() => expect(screen.queryByTestId("game-dossier")).toBeNull());
    expect(screen.getByTestId("dossier-meeting-shell")).toBeInTheDocument();
  });

  it("is reloadable from the URL alone", async () => {
    await renderBoard(`${TEAM_URL}&meeting=${encodeURIComponent(BO3_ID)}&game=2`);
    const dossier = await screen.findByTestId("game-dossier");
    expect(dossier.dataset.gameNumber).toBe("2");
  });

  it("a Bo1 opens with its one game already named", async () => {
    // There is no series above it to choose from, so the row sets both keys.
    await renderBoard();
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    fireEvent.click(rows.find((r) => r.dataset.matchId === BO1_ID)!);
    const shell = await screen.findByTestId("dossier-meeting-shell");
    expect(
      within(shell)
        .getAllByTestId("meeting-game")
        .filter((g) => g.dataset.selected === "true"),
    ).toHaveLength(1);
  });

  it("introduces no top-level Game tab", async () => {
    // Specificity emerges by drilling in, never by choosing a mode.
    await openGame(1);
    expect(screen.getByTestId("dossier-controls").textContent).not.toMatch(
      /\b(series|game|meeting)\b/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Step 5 — the clearing rules
// ---------------------------------------------------------------------------
//
// `game` LIVES INSIDE `meeting`, which is the whole design: a game number is
// a position inside a meeting and means nothing without one, so every Step 4
// clearing rule covers it for free and no path can strand a game. These tests
// hold that property rather than re-deriving each rule.

// ---------------------------------------------------------------------------
// Step 6 — the 15-minute lane checkpoint
// ---------------------------------------------------------------------------
//
// One derived figure, drawn beside the box score that already names both
// players. Everything that can go wrong here is a missing thing rendering as
// a present one: a game that ended at 12:40 printing 0, an unread minute 15
// printing 0, `+0` reading as a small lead, or a support's incidental CS
// being drawn as a lane result.

describe("Step 6 — the at-15 lane differential", () => {
  async function openGame(gameNumber = 1, matchId = BO3_ID) {
    await renderBoard();
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    fireEvent.click(rows.find((r) => r.dataset.matchId === matchId)!);
    const shell = await screen.findByTestId("dossier-meeting-shell");
    const games = within(shell).getAllByTestId("meeting-game");
    const row = games.find((g) => g.dataset.gameNumber === String(gameNumber))!;
    // A SINGLE-GAME MEETING IS ENTERED WITH ITS ONE GAME ALREADY OPEN — the
    // Step 4 rule. Only a meeting with siblings needs the row clicked.
    const open = within(row).queryByTestId("meeting-game-open");
    if (open && row.dataset.selected !== "true") fireEvent.click(open);
    return screen.findByTestId("game-dossier");
  }

  function laneValues(dossier: HTMLElement, player: string) {
    const lane = laneOf(dossier, player);
    return lane?.querySelector(".dossier-game-player__lane-values")?.textContent ?? null;
  }

  function laneOf(dossier: HTMLElement, player: string) {
    const row = within(dossier)
      .getAllByTestId("game-player")
      .find((r) => r.dataset.player === player)!;
    return within(row).queryByTestId("game-player-lane");
  }

  it("renders a positive gold differential with a plus sign", async () => {
    const dossier = await openGame(1);
    const lane = laneOf(dossier, "T1-Top")!;
    expect(lane).toHaveTextContent("@15");
    expect(lane).toHaveTextContent("+899 gold");
  });

  it("renders a negative gold differential with a minus sign", async () => {
    const lane = laneOf(await openGame(1), "T1-Jungle")!;
    expect(lane).toHaveTextContent("-223 gold");
  });

  it("renders a true zero as 0 and never as +0", async () => {
    // A sign is a claim about direction and a tie has no direction.
    const lane = laneOf(await openGame(1), "T1-Support")!;
    expect(lane).toHaveTextContent("0 gold");
    expect(lane.textContent).not.toContain("+0");
  });

  it("renders positive and negative CS differentials", async () => {
    const dossier = await openGame(1);
    expect(laneOf(dossier, "T1-Mid")).toHaveTextContent("+35 CS");
    expect(laneOf(dossier, "Bilibili Gaming-Mid")).toHaveTextContent("-35 CS");
  });

  it("draws the opposing row as the exact inverse", async () => {
    const dossier = await openGame(1);
    expect(laneOf(dossier, "T1-Bot")).toHaveTextContent("-649 gold");
    expect(laneOf(dossier, "Bilibili Gaming-Bot")).toHaveTextContent("+649 gold");
  });

  it("shows a support's gold and no support CS at all", async () => {
    const lane = laneOf(await openGame(1), "T1-Support")!;
    expect(lane).toHaveTextContent("gold");
    expect(lane.textContent).not.toContain("CS");
  });

  it("names the absence of support CS in the server's own words", async () => {
    const dossier = await openGame(1);
    expect(
      within(dossier).getByTestId("game-unavailable-cs_diff_15_support"),
    ).toHaveTextContent("not published for the support position");
  });

  it("renders an em dash, never a zero, when the checkpoint is missing", async () => {
    // Game 3 carries no statistics, so nothing about minute 15 is known.
    const dossier = await openGame(3);
    const lane = laneOf(dossier, "T1-Top")!;
    expect(lane.dataset.status).toBe("unavailable");
    // The VALUES, not the `@15` label, which legitimately contains digits.
    expect(laneValues(dossier, "T1-Top")).toBe("—");
  });

  it("renders no differential when the lane opponent is unresolved", async () => {
    const dossier = await openGame(2);
    expect(laneOf(dossier, "T1-Bot")!.dataset.status).toBe("opponent_unresolved");
    expect(laneValues(dossier, "T1-Bot")).toBe("—");
    // The other four lanes of the same game are unaffected by it.
    expect(laneOf(dossier, "T1-Mid")).toHaveTextContent("+1,327 gold");
  });

  it("a game that never reached 15 claims no differential, and says so once", async () => {
    const dossier = await openGame(1, BO1_ID);
    // Not ten em dashes down the page: one sentence about the game.
    expect(within(dossier).getByTestId("game-lane-not-reached")).toHaveTextContent(
      "ended before the 15-minute mark",
    );
    for (const player of within(dossier).getAllByTestId("game-player")) {
      expect(within(player).queryByTestId("game-player-lane")).toBeNull();
    }
  });

  it("names the actual opposing participant the figure came from", async () => {
    const lane = laneOf(await openGame(1), "T1-Top")!;
    expect(lane.getAttribute("title")).toContain("Bilibili Gaming-Top");
  });

  it("uses literal metrics and never a rating", async () => {
    // No lane score, advantage, lead rating or lane power anywhere.
    const dossier = await openGame(1);
    const text = dossier.textContent ?? "";
    for (const word of ["Lane score", "Advantage", "Lead rating", "Lane power", "Dominance"]) {
      expect(text).not.toContain(word);
    }
  });

  it("adds no columns to the box score", async () => {
    // The 375px treatment survives precisely because this is not two more
    // columns; the header is still the seven Step 5 shipped.
    const dossier = await openGame(1);
    const headers = within(within(dossier).getAllByTestId("game-side")[0])
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Player",
      "Champion",
      "K / D / A",
      "CS",
      "Gold",
      "Damage",
      "Vision",
    ]);
  });

  it("lives inside the existing identity cell, so no row gains a cell", async () => {
    // THE STRUCTURAL GUARANTEE AGAINST HORIZONTAL OVERFLOW at 375px. jsdom
    // does not lay out, so the property that is actually asserted is the one
    // the layout rests on: the figure is a child of the `th` the player's
    // name already occupies, and every row still has exactly seven cells.
    const dossier = await openGame(1);
    for (const row of within(dossier).getAllByTestId("game-player")) {
      expect(row.children).toHaveLength(7);
      const lane = within(row).queryByTestId("game-player-lane");
      if (!lane) continue;
      expect(lane.closest("th")).toBe(row.querySelector("th"));
    }
  });

  it("leaves the Step 5 box score, objectives and meeting context intact", async () => {
    const dossier = await openGame(1);
    expect(within(dossier).getAllByTestId("game-player")).toHaveLength(10);
    expect(within(dossier).getByTestId("game-objectives")).toBeInTheDocument();
    expect(within(dossier).getByTestId("game-bans")).toBeInTheDocument();
    expect(within(dossier).getByTestId("game-result")).toHaveTextContent("T1 victory");
    // The meeting the reader drilled from never left the screen.
    const shell = screen.getByTestId("dossier-meeting-shell");
    expect(shell).toContainElement(dossier);
    expect(within(shell).getByTestId("meeting-head")).toBeInTheDocument();
  });
});

describe("Step 9 — the meeting's lineups", () => {
  async function openMeeting(matchId = BO3_ID) {
    await renderBoard();
    const rows = within(await screen.findByTestId("dossier-meetings")).getAllByTestId(
      "meeting-row",
    );
    fireEvent.click(rows.find((r) => r.dataset.matchId === matchId)!);
    return screen.findByTestId("dossier-meeting-shell");
  }

  async function openSubbedMeeting() {
    seriesPayloads = [SUB_PAYLOAD, BO1_PAYLOAD];
    return openMeeting();
  }

  it("renders both teams", async () => {
    const shell = await openMeeting();
    const teams = within(shell).getAllByTestId("meeting-lineup-team");
    expect(teams.map((t) => t.dataset.teamKey)).toEqual(["T1", "Bilibili Gaming"]);
  });

  it("follows the score line's order, not the payload's", async () => {
    // The reader has just read `T1 2–1 Bilibili Gaming`. Laying the lineups
    // out in the server's alphabetical team order would be a second, silently
    // different order for the same two teams.
    const shell = await openMeeting(BO1_ID);
    const teams = within(shell).getAllByTestId("meeting-lineup-team");
    expect(teams.map((t) => t.dataset.teamKey)).toEqual(["Bilibili Gaming", "T1"]);
  });

  it("renders the five standard positions, in role order", async () => {
    const shell = await openMeeting();
    const team = within(shell).getAllByTestId("meeting-lineup-team")[0];
    expect(
      within(team)
        .getAllByTestId("lineup-position")
        .map((p) => p.dataset.position),
    ).toEqual(["Top", "Jungle", "Mid", "Bot", "Support"]);
  });

  it("names the actual players", async () => {
    const shell = await openSubbedMeeting();
    const team = within(shell)
      .getAllByTestId("meeting-lineup-team")
      .find((t) => t.dataset.teamKey === "T1")!;
    expect(team.textContent).toContain("Doran (Choi Hyeon-joon)");
    expect(team.textContent).toContain("Faker");
  });

  it("shows each player's champions in game order, labelled by game", async () => {
    const shell = await openSubbedMeeting();
    const doran = within(shell)
      .getAllByTestId("lineup-player")
      .find((p) => p.dataset.player === "Doran (Choi Hyeon-joon)")!;
    const picks = within(doran).getAllByTestId("lineup-pick");
    expect(picks.map((p) => p.dataset.gameNumber)).toEqual(["1", "2", "3"]);
    expect(picks.map((p) => p.textContent)).toEqual([
      "G1Olaf",
      "G2K'Sante",
      "G3Olaf",
    ]);
  });

  it("keeps a repeated pick in both games it was taken in", async () => {
    // A deduplicated set would erase the fact that he went BACK to it, which
    // is the whole reason to print a sequence rather than a roster.
    const shell = await openSubbedMeeting();
    const doran = within(shell)
      .getAllByTestId("lineup-player")
      .find((p) => p.dataset.player === "Doran (Choi Hyeon-joon)")!;
    expect(
      within(doran)
        .getAllByTestId("lineup-pick")
        .filter((p) => p.textContent?.includes("Olaf")),
    ).toHaveLength(2);
    expect(within(doran).getByTestId("lineup-repeats")).toHaveTextContent("Olaf ×2");
  });

  it("summarises no frequency for a player who repeated nothing", async () => {
    const shell = await openSubbedMeeting();
    const faker = within(shell)
      .getAllByTestId("lineup-player")
      .find((p) => p.dataset.player === "Faker")!;
    expect(within(faker).queryByTestId("lineup-repeats")).toBeNull();
    expect(faker.textContent).not.toMatch(/×1/);
  });

  it("makes a participant change visible as two players at one position", async () => {
    const shell = await openSubbedMeeting();
    const bot = within(shell)
      .getAllByTestId("lineup-position")
      .find((p) => p.dataset.position === "Bot" && p.dataset.players === "2")!;
    const players = within(bot).getAllByTestId("lineup-player");
    expect(players.map((p) => p.dataset.player)).toEqual(["Gumayusi", "Poby"]);
    // The change is legible from the game numbers themselves.
    expect(within(players[0]).getAllByTestId("lineup-pick")).toHaveLength(2);
    expect(within(players[1]).getAllByTestId("lineup-pick")).toHaveLength(1);
    expect(within(bot).getByTestId("lineup-changed")).toHaveTextContent("2 players");
  });

  it("says a team used more than five players, and nothing about why", async () => {
    const shell = await openSubbedMeeting();
    const t1 = within(shell)
      .getAllByTestId("meeting-lineup-team")
      .find((t) => t.dataset.teamKey === "T1")!;
    expect(within(t1).getByTestId("lineup-players-used")).toHaveTextContent(
      "6 players used",
    );
  });

  it("uses no substitution, starter or benching language anywhere", async () => {
    // The corpus records that participation CHANGED. It records nothing about
    // why, so no word here may suggest a reason.
    const shell = await openSubbedMeeting();
    const lineups = within(shell).getByTestId("meeting-lineups");
    expect(lineups.textContent).not.toMatch(
      /substitut|benched|starter|starting|dropped|replaced|rested|tactical/i,
    );
  });

  it("uses no draft-order language anywhere", async () => {
    // `sequence` is -1 on all 2,235,030 pick/ban rows. `G1` labels the GAME.
    const shell = await openSubbedMeeting();
    const lineups = within(shell).getByTestId("meeting-lineups");
    expect(lineups.textContent).not.toMatch(
      /first pick|counterpick|blind pick|draft|rotation|ban phase|priority/i,
    );
  });

  it("renders an unrecorded champion honestly, and keeps the game", async () => {
    const shell = await openSubbedMeeting();
    const keria = within(shell)
      .getAllByTestId("lineup-player")
      .find((p) => p.dataset.player === "Keria")!;
    const picks = within(keria).getAllByTestId("lineup-pick");
    expect(picks).toHaveLength(3);
    expect(picks[2]).toHaveTextContent("Champion not recorded");
    expect(picks[2].textContent).not.toMatch(/Rakan|Nautilus/);
  });

  it("says a game's player record is incomplete rather than filling it in", async () => {
    const shell = await openSubbedMeeting();
    const blg = within(shell)
      .getAllByTestId("meeting-lineup-team")
      .find((t) => t.dataset.teamKey === "Bilibili Gaming")!;
    expect(within(blg).getByTestId("lineup-incomplete")).toHaveTextContent(
      "Player records are incomplete for Game 2.",
    );
  });

  it("stays compact on a one-game meeting", async () => {
    // No game numbers, no `1×` frequency, no series language: one game is
    // simply the ten players who played it.
    const shell = await openMeeting(BO1_ID);
    const lineups = within(shell).getByTestId("meeting-lineups");
    expect(lineups.textContent).toMatch(/^Lineups/);
    expect(lineups.textContent).not.toMatch(/series/i);
    expect(lineups.textContent).not.toMatch(/\bG1\b/);
    expect(within(lineups).getAllByTestId("lineup-pick")).toHaveLength(10);
    expect(within(lineups).queryAllByTestId("lineup-repeats")).toHaveLength(0);
    expect(within(lineups).queryAllByTestId("lineup-changed")).toHaveLength(0);
  });

  it("carries no performance figure", async () => {
    const shell = await openSubbedMeeting();
    const lineups = within(shell).getByTestId("meeting-lineups");
    expect(lineups.textContent).not.toMatch(
      /kda|kills|deaths|assists|damage|gold|vision|cs\b|mvp|rating/i,
    );
  });

  it("sits between the result and the games, and buries neither", async () => {
    const shell = await openSubbedMeeting();
    const order = ["meeting-head", "meeting-lineups", "meeting-games"].map((id) =>
      within(shell).getByTestId(id),
    );
    expect(order[0].compareDocumentPosition(order[1])).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(order[1].compareDocumentPosition(order[2])).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("leaves the meeting's own result, event and scope untouched", async () => {
    const shell = await openSubbedMeeting();
    expect(within(shell).getByTestId("meeting-score").textContent).toContain("2");
    expect(within(shell).getByTestId("meeting-head").textContent).toContain(
      "LCK 2026 Rounds 1-2",
    );
    expect(within(shell).getByTestId("meeting-head").textContent).toContain("Patch 26.09");
    expect(within(shell).getByTestId("meeting-scope")).toHaveTextContent("Within");
  });

  it("leaves every game row, and its way into the box score, in place", async () => {
    const shell = await openSubbedMeeting();
    const games = within(shell).getAllByTestId("meeting-game");
    expect(games.map((g) => g.dataset.gameNumber)).toEqual(["1", "2", "3"]);
    fireEvent.click(within(games[0]).getByTestId("meeting-game-open"));
    expect((await screen.findAllByTestId("game-side")).length).toBe(2);
  });

  it("renders nothing at all when the server does not serve lineups", async () => {
    // THE DEPLOY WINDOW. A client ahead of Railway reads the meeting it always
    // did; it does not render an empty scaffold and it does not throw.
    const { lineups: _omitted, ...withoutLineups } = SUB_PAYLOAD as Record<string, unknown>;
    seriesPayloads = [withoutLineups, BO1_PAYLOAD];
    const shell = await openMeeting();
    expect(within(shell).queryByTestId("meeting-lineups")).toBeNull();
    expect(within(shell).getAllByTestId("meeting-game")).toHaveLength(3);
  });

  it("renders nothing when the meeting's games carry no player rows", async () => {
    const empty = {
      ...SUB_PAYLOAD,
      lineups: SUB_LINEUPS.map((team) => ({
        ...team,
        positions: [],
        players_used: 0,
        positions_changed: [],
      })),
    };
    seriesPayloads = [empty, BO1_PAYLOAD];
    const shell = await openMeeting();
    expect(within(shell).queryByTestId("meeting-lineups")).toBeNull();
  });
});

describe("Step 5 — game clearing", () => {
  const OPEN: TeamSelection = {
    ...EMPTY_TEAM_SELECTION,
    team_a: "T1",
    team_b: "Bilibili Gaming",
    meeting: { match_id: BO3_ID, game_number: 2 },
  };

  it("changing either team clears the game with the meeting", () => {
    expect(withTeamSide(OPEN, "a", "Gen.G").meeting).toBeNull();
    expect(withTeamSide(OPEN, "b", "Gen.G").meeting).toBeNull();
  });

  it("changing the scope clears the game with the meeting", () => {
    expect(withTeamScope(OPEN, "all_time").meeting).toBeNull();
  });

  it("changing the meeting drops the stale game", () => {
    const next = withMeeting(OPEN, { match_id: BO1_ID, game_number: null });
    expect(next.meeting?.match_id).toBe(BO1_ID);
    expect(next.meeting?.game_number).toBeNull();
  });

  it("closing the meeting closes the game", () => {
    expect(withMeeting(OPEN, null).meeting).toBeNull();
  });

  it("a side swap keeps both — the same two teams played the same games", () => {
    const swapped = withTeamsSwapped(OPEN);
    expect(swapped.meeting?.match_id).toBe(BO3_ID);
    expect(swapped.meeting?.game_number).toBe(2);
  });

  it("changing the study subject clears the game with the meeting", () => {
    const next = withStudySubject(OPEN, { player: "Faker", champion: "Ahri" });
    expect(next.meeting).toBeNull();
  });

  it("a game cannot be set without a meeting to number it inside", () => {
    // The selection comes back UNCHANGED rather than growing a meeting-less
    // game — there is no state in which `game` exists on its own.
    const noMeeting: TeamSelection = { ...EMPTY_TEAM_SELECTION, team_a: "T1" };
    const next = withMeetingGame(noMeeting, 2);
    expect(next.meeting).toBeNull();
    expect(next).toEqual(noMeeting);
  });

  it("changes only the game when the meeting stays", () => {
    const next = withMeetingGame(OPEN, 3);
    expect(next.meeting).toEqual({ match_id: BO3_ID, game_number: 3 });
  });

  it("round-trips the game through the URL, and never without its meeting", () => {
    const params = teamSelectionToParams(OPEN);
    expect(params.get("meeting")).toBe(BO3_ID);
    expect(params.get("game")).toBe("2");
    expect(teamSelectionFromParams(params).meeting).toEqual({
      match_id: BO3_ID,
      game_number: 2,
    });
    // A game with no meeting is dropped, not honoured.
    expect(meetingFromParams(new URLSearchParams("game=2"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Step 8 — an aggregate statistic, opened into the games that produced it.
//
// WHAT CAN BE WRONG HERE, AND IT IS NEVER THE LIST ITSELF. Rendering rows is
// easy; the defects are all mismatches between a figure and its evidence:
//
// * showing every exact game under a figure that covered only some, which
//   silently re-widens the sample in the one place a reader goes to check it;
// * an affordance on a figure with nothing behind it, which opens an empty
//   panel and reads as broken;
// * a CS drilldown on a support matchup, where there is no CS figure at all;
// * an evidence click landing somewhere the source meetings do not;
// * a horizontal scroller at 375px, in a drawer that already scrolls.
// ---------------------------------------------------------------------------

describe("Step 8 — statistic evidence", () => {
  async function openStudy() {
    await renderBoard();
    const card = within(screen.getByTestId("lane-card-Top")).getByTestId("lane-Top-T1");
    fireEvent.click(within(card).getAllByTestId("champ-chip-Ornn")[0]);
    const drawer = await screen.findByTestId("player-champion-drawer");
    const study = await within(drawer).findByTestId("dossier-study");
    fireEvent.click(within(study).getByTestId("study-opposing-player"));
    fireEvent.click(await within(drawer).findByTestId("study-opposing-champion"));
    await within(drawer).findByTestId("study-record");
    return within(drawer).getByTestId("dossier-study");
  }

  async function open(metric: "kda" | "gold15" | "cs15") {
    const study = await openStudy();
    fireEvent.click(within(study).getByTestId(`study-sample-toggle-${metric}`));
    return study;
  }

  it("reveals the games behind the KDA", async () => {
    const study = await open("kda");
    const rows = within(study).getAllByTestId("study-evidence-row");
    expect(rows).toHaveLength(2);
  });

  it("renders the real per-game K/D/A, not the aggregate's ratio", async () => {
    const study = await open("kda");
    const rows = within(study).getAllByTestId("study-evidence-row");
    expect(rows[0]).toHaveTextContent("5 / 1 / 4");
    expect(rows[1]).toHaveTextContent("3 / 3 / 5");
    // The figure above is still (8 + 9) / 4, not the mean of 9 and 2.67.
    expect(within(study).getByTestId("study-sample-kda")).toHaveTextContent("4.25");
  });

  it("reveals the games behind Gold @15, signed from the subject's side", async () => {
    const study = await open("gold15");
    const rows = within(study).getAllByTestId("study-evidence-row");
    expect(rows[0]).toHaveTextContent("+899");
    expect(rows[1]).toHaveTextContent("-327");
  });

  it("reveals the games behind CS @15", async () => {
    const study = await open("cs15");
    const rows = within(study).getAllByTestId("study-evidence-row");
    expect(rows[0]).toHaveTextContent("+20");
    expect(rows[1]).toHaveTextContent("-6");
  });

  it("labels every evidence row with the game it came from", async () => {
    const study = await open("gold15");
    const rows = within(study).getAllByTestId("study-evidence-row");
    expect(rows[0]).toHaveTextContent("T1 vs Bilibili Gaming");
    expect(rows[0]).toHaveTextContent("Game 3");
    expect(rows[1]).toHaveTextContent("Game 1");
  });

  it("lists BOTH games of one meeting, unlike the source meetings above", async () => {
    // A source meeting is a meeting to open; an evidence row is a GAME that
    // contributed. Two games of one best-of are one meeting and two rows.
    const study = await open("gold15");
    expect(within(study).getAllByTestId("study-source-meeting")).toHaveLength(1);
    expect(within(study).getAllByTestId("study-evidence-row")).toHaveLength(2);
  });

  it("shows only the games that contributed, and says how many", async () => {
    exact = exactResponse({
      statistics: exactStatistics({
        coverage: {
          exact_games: 3,
          stat_games: 3,
          missing_stat_games: 0,
          at15_games: { available: 2, not_reached: 1 },
        },
        gold_diff_at15: {
          median: 899,
          games: 1,
          evidence: [{ ...exactEvidenceGame("x2"), value: 899 }],
        },
      }),
    });
    const study = await open("gold15");
    expect(within(study).getAllByTestId("study-evidence-row")).toHaveLength(1);
    expect(within(study).getByTestId("study-evidence-count")).toHaveTextContent(
      "1 of 3 exact games contributed",
    );
  });

  it("counts the list it actually rendered", async () => {
    const study = await open("kda");
    const count = within(study).getByTestId("study-evidence-count");
    const rows = within(study).getAllByTestId("study-evidence-row");
    expect(count).toHaveTextContent(`${rows.length} game`);
  });

  it("opens the meeting AND the game an evidence row names", async () => {
    const study = await open("gold15");
    const rows = within(study).getAllByTestId("study-evidence-row");
    expect(rows[0].dataset.matchId).toBe(BO3_ID);
    expect(rows[0].dataset.gameNumber).toBe("3");
    fireEvent.click(rows[0]);
    const shell = await screen.findByTestId("dossier-meeting-shell");
    expect(within(shell).getAllByTestId("meeting-game")).toHaveLength(3);
    const url = requests.filter((u) => u.includes("/matchup/series")).pop() ?? "";
    expect(new URLSearchParams(url.split("?")[1] ?? "").get("match_id")).toBe(BO3_ID);
  });

  it("reuses the meeting navigation the source meetings use", async () => {
    // NOT A SECOND MECHANISM. Both go through the same selection, so Back
    // behaves the same way from either.
    const study = await open("gold15");
    fireEvent.click(within(study).getAllByTestId("study-evidence-row")[0]);
    await screen.findByTestId("dossier-meeting-shell");
    // The study is still behind it — the reader arrived through that question.
    expect(screen.getByTestId("player-champion-drawer")).toBeInTheDocument();
  });

  it("opens one metric at a time", async () => {
    const study = await open("gold15");
    expect(within(study).getByTestId("study-evidence-count")).toHaveTextContent(
      "Gold @15",
    );
    fireEvent.click(within(study).getByTestId("study-sample-toggle-kda"));
    const groups = within(study).getAllByTestId("study-evidence");
    expect(groups).toHaveLength(1);
    expect(within(study).getByTestId("study-evidence-count")).toHaveTextContent("KDA");
  });

  it("closes a metric when its own figure is clicked again", async () => {
    const study = await open("cs15");
    expect(within(study).getByTestId("study-evidence")).toBeInTheDocument();
    fireEvent.click(within(study).getByTestId("study-sample-toggle-cs15"));
    expect(within(study).queryByTestId("study-evidence")).toBeNull();
  });

  it("renders nothing open until a figure is clicked", async () => {
    const study = await openStudy();
    expect(within(study).queryByTestId("study-evidence")).toBeNull();
    expect(within(study).getByTestId("study-sample-stats")).toBeInTheDocument();
  });

  it("gives a figure with no contributing games NO affordance", async () => {
    // An empty panel that opens is worse than no control at all.
    exact = exactResponse({
      statistics: exactStatistics({
        gold_diff_at15: { median: 286, games: 2, evidence: [] },
      }),
    });
    const study = await openStudy();
    expect(within(study).queryByTestId("study-sample-toggle-gold15")).toBeNull();
    // And the FIGURE is still printed — the number is not the thing missing.
    expect(within(study).getByTestId("study-sample-gold15")).toHaveTextContent("+286");
  });

  it("gives a support matchup no CS affordance at all", async () => {
    exact = exactResponse({
      statistics: exactStatistics({
        cs_diff_at15: {
          median: null,
          games: 0,
          supported: false,
          unsupported_reason: "Creep score at 15 minutes is not published for supports.",
          evidence: [],
        },
        subject_positions: ["sup"],
      }),
    });
    const study = await openStudy();
    expect(within(study).queryByTestId("study-sample-cs15")).toBeNull();
    expect(within(study).queryByTestId("study-sample-toggle-cs15")).toBeNull();
  });

  it("degrades to no affordance against a backend that serves no evidence", async () => {
    // Railway deploys on push; Lovable publishes on a click. This client can
    // briefly meet the older payload, and must render the figures rather than
    // throw on an absent array.
    exact = exactResponse({
      statistics: exactStatistics({
        kda: { kills: 8, deaths: 4, assists: 9, ratio: 4.25, perfect: false, games: 2 },
        gold_diff_at15: { median: 286, games: 2 },
        cs_diff_at15: { median: 7, games: 2, supported: true, unsupported_reason: null },
      }),
    });
    const study = await openStudy();
    expect(within(study).getByTestId("study-sample-kda")).toHaveTextContent("4.25");
    expect(within(study).queryByTestId("study-sample-toggle-kda")).toBeNull();
    expect(within(study).queryByTestId("study-evidence")).toBeNull();
  });

  it("leaves the rest of the study visible while evidence is open", async () => {
    const study = await open("gold15");
    expect(within(study).getByTestId("study-source-meetings")).toBeInTheDocument();
    expect(within(study).getAllByTestId("study-example").length).toBeGreaterThan(0);
    expect(within(study).getByTestId("study-record")).toBeInTheDocument();
  });

  it("keeps the evidence rows inside the sheet at 375px", async () => {
    // No horizontal table, no nested scroller. The rows wrap.
    const study = await open("gold15");
    for (const row of within(study).getAllByTestId("study-evidence-row")) {
      expect(row.className).not.toContain("overflow");
      expect(getComputedStyle(row).overflowX).not.toBe("scroll");
    }
  });
});
