/**
 * UX1 — derivations behind the Worlds experience screens, on the real
 * production body (13 Oct) and the simulated phases built on it.
 */
import { describe, expect, it } from "vitest";

import {
  KO,
  PI,
  WORLDS_PRE,
  betweenPlayInAndSwiss,
  clone,
  knockoutMid,
  playInDay1,
  standingsUnavailable,
  swissThrough,
  unknownPhase,
  worldsComplete,
} from "@/lib/pro-play/__fixtures__/worldsScenarios";
import { stageOf } from "@/lib/pro-play/tournamentV2View";

import {
  countdownParts,
  defaultStageKey,
  matchOnward,
  outcomeId,
  overviewFocus,
  poolId,
  recentResults,
  stageStakes,
  swissMatchStakes,
  swissOccupancy,
  swissPoolMap,
  upcoming,
} from "./experienceView";

const stage = (d = WORLDS_PRE, key: string) => stageOf(d.context, key)!;
const match = (d: typeof WORLDS_PRE, id: string) => d.state.matches.find((m) => m.match_id === id)!;

describe("stage stakes from the served structure", () => {
  it("Play-In: four teams, one goes to Swiss, three go home", () => {
    const s = stageStakes(stage(WORLDS_PRE, "play_in"), WORLDS_PRE.state, WORLDS_PRE.context);
    expect(s).toMatchObject({ teams: 4, advance: 1, eliminated: 3, formats: "Bo5" });
    expect(s.nextStage?.key).toBe("swiss");
  });

  it("Swiss: sixteen teams, eight to the Knockouts", () => {
    expect(stageStakes(stage(WORLDS_PRE, "swiss"), WORLDS_PRE.state, WORLDS_PRE.context)).toMatchObject({ teams: 16, advance: 8, eliminated: 8, formats: "Bo1 / Bo3" });
  });

  it("Knockouts: eight teams, one champion", () => {
    const s = stageStakes(stage(WORLDS_PRE, "knockout"), WORLDS_PRE.state, WORLDS_PRE.context);
    expect(s).toMatchObject({ teams: 8, advance: 1, eliminated: 7, nextStage: null });
  });

  it("without standings, a bracket stage is sized from the registry's entrants only", () => {
    const d = standingsUnavailable(clone());
    expect(stageStakes(stage(d, "play_in"), d.state, d.context).teams).toBe(4);
    // Nobody enters the Knockouts directly and its cells are gone: no size, so no claim.
    expect(stageStakes(stage(d, "knockout"), d.state, d.context)).toMatchObject({ teams: null, advance: null, eliminated: null });
    // Swiss has 15 direct entrants but is also filled from the Play-In: not "15 teams".
    expect(stageStakes(stage(d, "swiss"), d.state, d.context).teams).toBeNull();
    expect(stageStakes(stage(d, "play_in"), d.state, d.context).advance).toBeNull();
  });
});

describe("what the Overview leads with", () => {
  it("before the event: the next match (C9 v KC)", () => {
    const f = overviewFocus(WORLDS_PRE.state);
    expect(f.kind).toBe("next");
    expect(f.kind === "next" && f.match.match_id).toBe(PI.ubsf1);
  });

  it("live play, the changeover, the champion, and an honest unavailable", () => {
    const live = overviewFocus(playInDay1().state);
    expect(live.kind === "live" && live.matches.map((m) => m.match_id)).toEqual([PI.ubsf2]);
    expect(overviewFocus(betweenPlayInAndSwiss().state).kind).toBe("transition");
    expect(overviewFocus(worldsComplete().state).kind).toBe("champion");
    expect(overviewFocus(unknownPhase().state).kind).toBe("unavailable");
  });

  it("lists fixtures soonest first and results latest first", () => {
    const d = playInDay1();
    expect(upcoming(d.state, 2).map((m) => m.match_id)).toEqual([PI.ubf, PI.lbsf]);
    expect(recentResults(d.state, 2).map((m) => m.match_id)).toEqual([PI.ubsf1]);
  });

  it("opens the Stage Explorer on the stage in play or next", () => {
    expect(defaultStageKey(WORLDS_PRE.state, WORLDS_PRE.context)).toBe("play_in");
    expect(defaultStageKey(betweenPlayInAndSwiss().state, WORLDS_PRE.context)).toBe("swiss");
    expect(defaultStageKey(knockoutMid().state, WORLDS_PRE.context)).toBe("knockout");
    expect(defaultStageKey(worldsComplete().state, WORLDS_PRE.context)).toBe("knockout");
  });
});

describe("countdown", () => {
  it("splits into days, hours and minutes, rounding minutes up", () => {
    const start = "2026-10-15T18:00:00Z";
    expect(countdownParts(start, Date.parse("2026-10-13T00:10:00Z"))).toEqual({ days: 2, hours: 17, minutes: 50, started: false });
    expect(countdownParts(start, Date.parse("2026-10-15T17:59:30Z"))).toMatchObject({ days: 0, hours: 0, minutes: 1 });
    expect(countdownParts(start, Date.parse("2026-10-15T18:00:01Z"))?.started).toBe(true);
    expect(countdownParts("not a date", 0)).toBeNull();
  });
});

describe("what a match decides", () => {
  it("upper semifinal: winner to the Upper Final, loser to the Lower Semifinal (upstream edges)", () => {
    const o = matchOnward(match(WORLDS_PRE, PI.ubsf1), WORLDS_PRE.state, WORLDS_PRE.context)!;
    expect(o.winner).toMatchObject({ kind: "route", to: { match_id: PI.ubf } });
    expect(o.loser).toMatchObject({ kind: "route", to: { match_id: PI.lbsf } });
  });

  it("lower semifinal: the loser is out; Play-In Final: the winner goes to Swiss", () => {
    expect(matchOnward(match(WORLDS_PRE, PI.lbsf), WORLDS_PRE.state, WORLDS_PRE.context)?.loser).toEqual({ kind: "eliminated" });
    const final = matchOnward(match(WORLDS_PRE, PI.final), WORLDS_PRE.state, WORLDS_PRE.context)!;
    expect(final.winner).toMatchObject({ kind: "advances", stage: { key: "swiss" } });
    expect(final.loser).toEqual({ kind: "eliminated" });
  });

  it("knockout final: the winner is champion", () => {
    expect(matchOnward(match(WORLDS_PRE, KO.final), WORLDS_PRE.state, WORLDS_PRE.context)?.winner).toEqual({ kind: "champion" });
    expect(matchOnward(match(WORLDS_PRE, KO.qf1), WORLDS_PRE.state, WORLDS_PRE.context)?.loser).toEqual({ kind: "eliminated" });
  });

  it("says nothing without standings authority, or for a Swiss match", () => {
    const d = standingsUnavailable(clone());
    expect(matchOnward(match(d, PI.ubsf1), d.state, d.context)).toBeNull();
    const swissId = WORLDS_PRE.state.swiss.rounds["1"][0];
    expect(matchOnward(match(WORLDS_PRE, swissId), WORLDS_PRE.state, WORLDS_PRE.context)).toBeNull();
  });

  it("a Swiss match between teams on the same record: what each result does to it", () => {
    const d = swissThrough(4.5);
    const live = d.state.matches.find((m) => m.stage === "swiss" && m.state === "live")!;
    const s = swissMatchStakes(live, d.state);
    expect(s?.record).toBe("2–2");
    expect(s).toMatchObject({ winner: "advances", loser: "eliminated" });
    // Nothing before records exist.
    expect(swissMatchStakes(match(WORLDS_PRE, WORLDS_PRE.state.swiss.rounds["1"][0]), WORLDS_PRE.state)).toBeNull();
  });
});

describe("Swiss pool map", () => {
  const map = swissPoolMap(WORLDS_PRE.state, 16, 3, 3)!;

  it("reproduces the format's pools, and upstream's round sizes (8/8/8/6/3)", () => {
    expect(map.rounds.map((r) => r.pools.map((p) => `${p.wins}-${p.losses}:${p.teams}`))).toEqual([
      ["0-0:16"],
      ["1-0:8", "0-1:8"],
      ["2-0:4", "1-1:8", "0-2:4"],
      ["2-1:6", "1-2:6"],
      ["2-2:6"],
    ]);
    expect(map.rounds.map((r) => r.pools.reduce((s, p) => s + p.teams / 2, 0))).toEqual(
      Object.values(WORLDS_PRE.state.swiss.rounds).map((ids) => ids.length),
    );
    expect(map.advanced.map((o) => `${o.wins}-${o.losses}:${o.teams}`)).toEqual(["3-0:2", "3-1:3", "3-2:3"]);
    expect(map.eliminated.map((o) => `${o.wins}-${o.losses}:${o.teams}`)).toEqual(["2-3:3", "1-3:3", "0-3:2"]);
  });

  it("links every pool by a win and a loss", () => {
    expect(map.edges.filter((e) => e.from === poolId(2, 0))).toEqual([
      { from: "2-0", to: outcomeId(3, 0), kind: "win" },
      { from: "2-0", to: "2-1", kind: "loss" },
    ]);
  });

  it("steps aside when the arithmetic does not match upstream, or the format is not served", () => {
    const d = clone();
    d.state.swiss.rounds["4"] = d.state.swiss.rounds["4"].slice(0, 5);
    expect(swissPoolMap(d.state, 16, 3, 3)).toBeNull();
    expect(swissPoolMap(WORLDS_PRE.state, 15, 3, 3)).toBeNull();
    expect(swissPoolMap(WORLDS_PRE.state, null, 3, 3)).toBeNull();
  });

  it("places teams only from served records: none before a result, then each on its current record", () => {
    expect(swissOccupancy(WORLDS_PRE.state).size).toBe(0);
    const d = swissThrough(2.5);
    const occ = swissOccupancy(d.state);
    for (const r of d.state.swiss.records) {
      const id = r.status === "active" ? poolId(r.wins, r.losses) : outcomeId(r.wins, r.losses);
      expect(occ.get(id)).toContain(r.code);
    }
    expect(occ.get(poolId(0, 0))).toBeUndefined();
  });
});
