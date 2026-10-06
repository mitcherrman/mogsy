/**
 * PP-IA2 — what the Match Center may claim about ONE game, pinned against the
 * real LCS 2026 Split 3 Playoffs Final G4 (TLAW vs LYON): the production
 * payloads of 2026-10-05 plus the result/series the PP-IA2 backend serves.
 */
import { describe, expect, it } from "vitest";

import type { LiveGameDetailResponse, LivePlayersResponse } from "@/lib/live-esports/api";
import { proStatsRedirect } from "@/lib/pro-play/routes";
import G4 from "./__fixtures__/ppia2LcsFinalG4.json";
import LES_G1 from "./__fixtures__/ppia2LesSwappedG1.json";
import {
  gameResultView,
  isOfficialWinner,
  runeLine,
  runeSummary,
  seriesScoreText,
  seriesScoreView,
  sidesUnverified,
} from "./gameTruth";
import { RUNE_PERKS, RUNE_TREES } from "./runeData";

const detail = G4.detail as unknown as LiveGameDetailResponse;
const players = (G4.players as unknown as LivePlayersResponse).players;
const byName = (name: string) => players.find((p) => p.resolved_player_name === name)!;

describe("the real final, game 4", () => {
  it("names TLAW the official winner on blue — from the series record, not structures", () => {
    const view = gameResultView(detail);
    expect(view).toEqual({ kind: "official", side: "blue", teamId: "98926509885559666" });
    expect(isOfficialWinner(view, "blue")).toBe(true);
    expect(isOfficialWinner(view, "red")).toBe(false);
  });

  it("shows the FINAL 3–1, never the 2–1 the game entered at", () => {
    expect(detail.game.teams.blue.series_wins).toBe(2);
    expect(detail.game.teams.red.series_wins).toBe(1);
    const score = seriesScoreView(detail.series, detail.game)!;
    expect(score).toEqual({
      teams: [
        { code: "TLAW", wins: 3 },
        { code: "LYON", wins: 1 },
      ],
      final: true,
      complete: true,
    });
    expect(seriesScoreText(score)).toBe("Final · TLAW 3–1 LYON");
  });

  it("orders the series score by the game's own sides", () => {
    // The same record seen from a game where LYON was blue.
    const swapped = {
      ...detail.game,
      teams: { blue: detail.game.teams.red, red: detail.game.teams.blue },
    };
    expect(seriesScoreText(seriesScoreView(detail.series, swapped)!)).toBe("Final · LYON 1–3 TLAW");
  });

  it("reads every player's real rune page (the feed sends an object, not an array)", () => {
    expect(players.every((p) => runeSummary(p.runes) !== null)).toBe(true);
    expect(runeLine(runeSummary(byName("Morgan").runes)!)).toBe("Grasp of the Undying · Resolve / Sorcery");
    expect(runeLine(runeSummary(byName("Dhokla").runes)!)).toBe("Fleet Footwork · Precision / Resolve");
    expect(runeLine(runeSummary(byName("Saint (Kang Sung-in)").runes)!)).toBe(
      "Deathfire Touch · Sorcery / Resolve",
    );
    const morgan = runeSummary(byName("Morgan").runes)!;
    expect(morgan.minors.map((r) => r.name)).toEqual([
      "Demolish",
      "Second Wind",
      "Unflinching",
      "Manaflow Band",
      "Scorch",
    ]);
    expect(morgan.shards).toEqual(["Attack speed", "Adaptive force", "Health"]);
    expect(morgan.keystone?.icon).toBe("assets/runes/Grasp_of_the_Undying.png");
  });

  it("knows every perk id the final's ten rune pages use", () => {
    for (const p of players) {
      const r = p.runes!;
      expect(RUNE_TREES[r.style_id!]).toBeTruthy();
      expect(RUNE_TREES[r.sub_style_id!]).toBeTruthy();
      for (const id of r.perks.filter((x) => x < 5000)) expect(RUNE_PERKS[id], String(id)).toBeTruthy();
    }
  });
});

describe("gameResultView fails closed", () => {
  it("crowns nobody without a result, or with an unconfirmed one", () => {
    expect(gameResultView(null)).toEqual({ kind: "unknown" });
    expect(gameResultView({ result: undefined })).toEqual({ kind: "unknown" });
    expect(
      gameResultView({ result: { status: "unconfirmed", winner_team_id: null, winner_side: null, basis: null } }),
    ).toEqual({ kind: "unconfirmed" });
    expect(
      gameResultView({ result: { status: "in_progress", winner_team_id: null, winner_side: null, basis: null } }),
    ).toEqual({ kind: "in_progress" });
  });

  it("names the team but marks no side when schedule and telemetry disagree on sides", () => {
    const view = gameResultView({
      result: { status: "official", winner_team_id: "M", winner_side: null, basis: "series_progression" },
    });
    expect(view).toEqual({ kind: "official_unsided", side: null, teamId: "M" });
    expect(isOfficialWinner(view, "blue")).toBe(false);
    expect(isOfficialWinner(view, "red")).toBe(false);
  });
});

describe("series score", () => {
  it("is absent without a record, and marked when it may be short", () => {
    expect(seriesScoreView(null, detail.game)).toBeNull();
    const partial = {
      ...detail.series!,
      state: "unknown" as const,
      score: { basis: "confirmed_games" as const, complete: false },
      teams: detail.series!.teams.map((t) => ({ ...t, wins: t.code === "TLAW" ? 2 : 1 })),
    };
    const view = seriesScoreView(partial, detail.game)!;
    expect(view.final).toBe(false);
    expect(view.complete).toBe(false);
    expect(seriesScoreText(view)).toBe("Series · TLAW 2–1 LYON");
  });
});

describe("runeSummary", () => {
  it("is null for no page, the old array shape, or nothing recognisable", () => {
    expect(runeSummary(null)).toBeNull();
    expect(runeSummary(undefined)).toBeNull();
    expect(runeSummary([8437, 8400])).toBeNull();
    expect(runeSummary({ style_id: 1, sub_style_id: 2, perks: [3, 4] })).toBeNull();
  });

  it("drops an unknown id rather than renaming it", () => {
    const s = runeSummary({ style_id: 8400, sub_style_id: 8200, perks: [8437, 99999, 8446] })!;
    expect(s.keystone?.name).toBe("Grasp of the Undying");
    expect(s.minors.map((r) => r.name)).toEqual(["Demolish"]);
  });
});

describe("proStatsRedirect (Pro Stats URL contract)", () => {
  const go = (qs: string) => proStatsRedirect(new URLSearchParams(qs));
  it("moves a profile's 'View in Pro Stats' URL to the stats route, keys intact", () => {
    expect(go("view=players&player=Faker")).toBe("/lol/pro-play/stats?view=players&player=Faker");
    expect(go("view=champions&champion=Azir&year=2026")).toBe(
      "/lol/pro-play/stats?view=champions&champion=Azir&year=2026",
    );
    expect(go("page=4")).toBe("/lol/pro-play/stats?page=4");
  });

  it("leaves the hub alone without table keys, or when a match is selected", () => {
    expect(go("")).toBeNull();
    expect(go("utm_source=x")).toBeNull();
    expect(go("game=1&view=teams")).toBeNull();
    expect(go("next=2&view=teams")).toBeNull();
  });
});

/* ── PP-IA2 P0: sides by the game's own identity (LES UCAM vs MKF, G1) ───── */

describe("swapped schedule sides, corrected by the backend", () => {
  const fixed = LES_G1.detail as unknown as LiveGameDetailResponse;
  const before = LES_G1.schedule_game as unknown as LiveGameDetailResponse["game"];
  const lesPlayers = LES_G1.players as unknown as LivePlayersResponse["players"];

  it("documents the bug: the schedule put UCAM on the side whose numbers are MKF's", () => {
    expect(before.teams.blue.code).toBe("UCAM");
    expect(fixed.team_state.blue?.esports_team_id).toBe("111692802629324367");
  });

  it("labels each side with the team whose stats and players it holds", () => {
    expect(fixed.game.teams.blue.code).toBe("MKF");
    expect(fixed.game.teams.blue.esports_team_id).toBe(fixed.team_state.blue?.esports_team_id);
    expect(fixed.game.teams.red.esports_team_id).toBe(fixed.team_state.red?.esports_team_id);
    for (const p of lesPlayers) {
      const code = p.side === "blue" ? fixed.game.teams.blue.code : fixed.game.teams.red.code;
      const prefix = (p.summoner_name ?? "").split(" ")[0];
      expect(code === "MKF" ? ["MKF", "MKOI"] : ["UCAM"]).toContain(prefix);
    }
    expect(fixed.game.sides).toEqual({ source: "telemetry", verified: true, corrected: true });
    expect(sidesUnverified(fixed.game)).toBe(false);
  });

  it("keeps the winner's identity and marks the side it actually played", () => {
    // Series record: MKF went 1-0 up after G1.
    expect(gameResultView(fixed)).toEqual({ kind: "official", side: "blue", teamId: "111692802629324367" });
  });

  it("flags a game whose sides could not be verified", () => {
    expect(sidesUnverified({ sides: { source: "schedule", verified: false, corrected: false } })).toBe(true);
    expect(sidesUnverified({ sides: { source: "schedule", verified: null, corrected: false } })).toBe(false);
    expect(sidesUnverified({})).toBe(false);
  });
});
