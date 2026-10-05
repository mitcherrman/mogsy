import { describe, expect, it } from "vitest";

import type { LiveGameSummary } from "@/lib/live-esports/api";
import {
  countdown,
  gameState,
  gamesNeedingResult,
  groupSeries,
  leagueMonogram,
  railUpcoming,
  seriesOf,
} from "./hubSeries";

const FINAL = { label: "final" as const, seconds_since_success: 10, source_frame_ts: null, last_attempt_at: null, last_success_at: null };

function team(code: string, wins: number | null) {
  return { name: code, code, esports_team_id: `id-${code}`, resolved_page: code, series_wins: wins };
}

function game(
  id: string,
  match: string,
  n: number,
  blue: [string, number | null],
  red: [string, number | null],
  over: Partial<LiveGameSummary> = {},
): LiveGameSummary {
  return {
    game_id: id,
    match_id: match,
    league: { slug: "lck", name: "LCK" },
    block_name: null,
    competition: null,
    best_of: 5,
    game_number: n,
    teams: { blue: team(...blue), red: team(...red) },
    patch_version: null,
    game_state: "finished",
    availability: "finished",
    availability_detail: null,
    scheduled_start: null,
    first_frame_ts: null,
    freshness: FINAL,
    ...over,
  } as LiveGameSummary;
}

/** A `/games/{id}` detail's PP-IA2 fields: official results by team id. */
function record(
  matchId: string,
  results: Record<string, string | null>,
  final: Record<string, number> | null = null,
) {
  const ids = Object.keys(final ?? {});
  return {
    result: null,
    series: {
      contract_version: 1,
      match_id: matchId,
      best_of: 5,
      state: final ? ("completed" as const) : ("unknown" as const),
      teams: (ids.length ? ids : ["id-LOS", "id-KBM"]).map((id) => ({
        esports_team_id: id,
        code: id.replace("id-", ""),
        name: null,
        wins: final ? final[id] : null,
      })),
      score: { basis: final ? ("upstream_final" as const) : ("confirmed_games" as const), complete: !!final },
      games: Object.entries(results).map(([gameId, winner], i) => ({
        game_id: gameId,
        game_number: i + 1,
        availability: "finished",
        result: winner
          ? { status: "official" as const, winner_team_id: winner, winner_side: null, basis: "series_progression" as const }
          : { status: "unconfirmed" as const, winner_team_id: null, winner_side: null, basis: null },
        sides: { consistent: true, swapped: false },
      })),
    },
  };
}

// A real-shaped Bo5: LOS 3–0 KBM with LOS switching sides in game 2.
const g1 = game("g1", "m", 1, ["LOS", 0], ["KBM", 0]);
const g2 = game("g2", "m", 2, ["KBM", 0], ["LOS", 1]);
const g3 = game("g3", "m", 3, ["LOS", 2], ["KBM", 0]);
const LOS_3_0 = record("m", { g1: "id-LOS", g2: "id-LOS", g3: "id-LOS" }, { "id-LOS": 3, "id-KBM": 0 });

describe("groupSeries", () => {
  it("groups by match_id, orders games and takes every result from the series record", () => {
    const [s] = groupSeries([], [g3, g2, g1], { g3: LOS_3_0 });
    expect(s.games.map((g) => g.game.game_id)).toEqual(["g1", "g2", "g3"]);
    expect(s.games.map((g) => g.winner)).toEqual(["id-LOS", "id-LOS", "id-LOS"]);
    expect(s.score).toEqual({ a: 3, b: 0, known: true, final: true });
    expect(s.decided).toBe(true);
    expect(s.state).toBe("completed");
    expect(s.focus.game_id).toBe("g3");
  });

  it("matches teams by identity across a side swap, never by side", () => {
    const rec = record("m", { g1: "id-LOS", g2: "id-KBM" });
    const [s] = groupSeries([], [g1, g2], { g2: rec }); // KBM (blue) wins game 2
    expect(s.a.team.code).toBe("KBM");
    expect(s.score).toEqual({ a: 1, b: 1, known: true, final: false });
  });

  it("keeps an unconfirmed last result unknown — a structure lead never decides (PP-IA2)", () => {
    const rec = record("m", { g1: "id-LOS", g2: "id-LOS", g3: null });
    const [s] = groupSeries([], [g1, g2, g3], { g3: rec });
    expect(s.games[2].winner).toBeNull();
    expect(s.score).toEqual({ a: 2, b: 0, known: false, final: false });
    expect(s.decided).toBe(false);
  });

  it("without a record the feed's own entering scores still name the earlier games, and the last is unknown", () => {
    const series = groupSeries([], [g1, g2, g3]);
    expect(series[0].games.map((g) => g.winner)).toEqual(["id-LOS", "id-LOS", null]);
    expect(series[0].score.known).toBe(false);
    expect(gamesNeedingResult(series)).toEqual(["g3"]);
  });

  it("refuses an entering reading that already includes the game (total != game_number - 1)", () => {
    const late = game("g2", "m", 2, ["KBM", 0], ["LOS", 2]); // a post-game reading
    const [s] = groupSeries([], [g1, late, g3]);
    expect(s.games[0].winner).toBeNull();
    expect(s.games[1].winner).toBeNull();
  });

  it("a completed series shows Riot's FINAL score, not the score entering its last game", () => {
    // TLAW–LYON shape: G4 entering 2–1, final 3–1.
    const t1 = game("t1", "f", 1, ["TLAW", 0], ["LYON", 0]);
    const t2 = game("t2", "f", 2, ["TLAW", 1], ["LYON", 0]);
    const t3 = game("t3", "f", 3, ["TLAW", 2], ["LYON", 0]);
    const t4 = game("t4", "f", 4, ["TLAW", 2], ["LYON", 1]);
    const rec = record(
      "f",
      { t1: "id-TLAW", t2: "id-TLAW", t3: "id-LYON", t4: "id-TLAW" },
      { "id-TLAW": 3, "id-LYON": 1 },
    );
    const [s] = groupSeries([], [t4, t3, t2, t1], { t4: rec });
    expect(s.score).toEqual({ a: 3, b: 1, known: true, final: true });
    expect(s.games.map((g) => g.winner)).toEqual(["id-TLAW", "id-TLAW", "id-LYON", "id-TLAW"]);
  });

  it("a live game makes the series live, focuses it, and leads the rail", () => {
    const g4 = game("g4", "m", 4, ["KBM", 0], ["LOS", 3], { availability: "live" });
    const other = game("x1", "other", 1, ["T1", 0], ["GEN", 0]);
    const series = groupSeries([g4], [other, g3, g2, g1]);
    expect(series.map((s) => s.key)).toEqual(["m", "other"]);
    expect(series[0].state).toBe("live");
    expect(series[0].focus.game_id).toBe("g4");
    // Score entering the live game, which is not over.
    expect(series[0].score).toEqual({ a: 0, b: 3, known: true, final: false });
    expect(gamesNeedingResult(series)).toEqual(["x1"]);
  });

  it("drops store `scheduled` rows (never-played games); a series of only those is not drawn", () => {
    const np = game("g5", "m", 5, ["LOS", 3], ["KBM", 0], { availability: "scheduled" });
    const ghost = game("z1", "ghost", 3, ["BFX", 1], ["DNS", 1], { availability: "scheduled" });
    const series = groupSeries([], [np, ghost, g3, g2, g1], { g3: LOS_3_0 });
    expect(series.map((s) => s.key)).toEqual(["m"]);
    expect(series[0].games.map((g) => g.game.game_id)).toEqual(["g1", "g2", "g3"]);
  });

  it("a Bo1 is one game, decided by its own official result", () => {
    const bo1 = game("b1", "bo1", 1, ["ONT", 0], ["EXE", 0], { best_of: 1 });
    const rec = record("bo1", { b1: "id-EXE" }, { "id-ONT": 0, "id-EXE": 1 });
    const [s] = groupSeries([], [bo1], { b1: rec });
    expect(s.score).toEqual({ a: 0, b: 1, known: true, final: true });
    expect(s.decided).toBe(true);
  });

  it("a stale (not finished) last game has no result", () => {
    const stale = game("s1", "st", 1, ["KT", 0], ["NS", 0], {
      availability: "live",
      freshness: { ...FINAL, label: "stale" },
    });
    const [s] = groupSeries([], [stale]);
    expect(s.score.known).toBe(false);
    expect(gamesNeedingResult([s])).toEqual([]);
  });

  it("finds the series a game belongs to", () => {
    const series = groupSeries([], [g1, g2, g3]);
    expect(seriesOf(series, "g2")?.key).toBe("m");
    expect(seriesOf(series, "nope")).toBeNull();
  });
});

describe("gameState", () => {
  it("LIVE / COMPLETED, and null for a stale game so its honest pill stays", () => {
    expect(gameState(g1, true)).toBe("live");
    expect(gameState(g1, false)).toBe("completed");
    expect(gameState(game("s", "s", 1, ["A", 0], ["B", 0], { availability: "live", freshness: { ...FINAL, label: "stale" } }), false)).toBeNull();
  });
});

describe("countdown", () => {
  const now = Date.parse("2026-10-01T17:00:00Z");
  it("formats days, hours and minutes, and never a negative time", () => {
    expect(countdown("2026-10-03T19:30:00Z", now)).toBe("in 2d 2h");
    expect(countdown("2026-10-01T20:05:00Z", now)).toBe("in 3h 05m");
    expect(countdown("2026-10-01T17:12:00Z", now)).toBe("in 12m");
    expect(countdown("2026-10-01T16:00:00Z", now)).toBe("starting");
    expect(countdown("not a date", now)).toBeNull();
  });
});

describe("leagueMonogram", () => {
  it("uses upstream's short name, else word initials", () => {
    expect(leagueMonogram("LCK")).toBe("LCK");
    expect(leagueMonogram("CBLOL")).toBe("CBLOL");
    expect(leagueMonogram("EMEA Masters")).toBe("EM");
    expect(leagueMonogram("Hitpoint Masters")).toBe("HM");
    expect(leagueMonogram(null, "wsci")).toBe("WSCI");
  });
});

describe("railUpcoming", () => {
  const m = (id: string, a: boolean, b: boolean) => ({ id, teams: { a: { tbd: a }, b: { tbd: b } } });
  it("keeps the soonest few and drops only TBD-vs-TBD slots", () => {
    const list = [m("1", true, true), m("2", false, true), m("3", false, false), m("4", false, false), m("5", false, false), m("6", false, false)];
    expect(railUpcoming(list).map((x) => x.id)).toEqual(["2", "3", "4", "5"]);
  });
});
