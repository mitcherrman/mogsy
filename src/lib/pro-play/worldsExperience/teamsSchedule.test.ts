/**
 * UX2: the Teams and Schedule derivations, on the real production body
 * (13 Oct) and the simulated phases built on it.
 */
import { describe, expect, it } from "vitest";

import {
  KO,
  PI,
  WORLDS_PRE,
  betweenPlayInAndSwiss,
  clone,
  knockoutMid,
  partialSchedule,
  playInDay1,
  swissThrough,
  unknownPhase,
  worldsComplete,
} from "@/lib/pro-play/__fixtures__/worldsScenarios";

import { daysBetween, filterCounts, matchDay, pickDay, scheduleDays } from "./scheduleView";
import {
  certifiedLineup,
  participantByCode,
  regionOptions,
  teamMatches,
  teamPath,
  teamSeries,
  teamStatus,
  teamsInRegion,
} from "./teamsView";

const ctx = WORLDS_PRE.context;
const team = (code: string, d = WORLDS_PRE) => participantByCode(d.context, code)!;

describe("Teams: the field", () => {
  it("has all 19 certified participants, filterable by region in registry order", () => {
    expect(ctx.participants).toHaveLength(19);
    expect(regionOptions(ctx)).toEqual([
      { region: "LPL", count: 4 },
      { region: "LCK", count: 4 },
      { region: "LEC", count: 3 },
      { region: "LCS", count: 3 },
      { region: "LCP", count: 3 },
      { region: "CBLOL", count: 2 },
    ]);
    expect(teamsInRegion(ctx, "LCS").map((p) => p.code)).toEqual(["TLAW", "LYON", "C9"]);
    expect(teamsInRegion(ctx, null)).toHaveLength(19);
  });

  it("finds a participant by code, case-insensitively, with its canonical profile key", () => {
    const p = participantByCode(ctx, "tlaw")!;
    expect(p).toMatchObject({ code: "TLAW", team_key: "Team Liquid", name: "Team Liquid Alienware", entry_stage: "swiss", swiss_tier: 1, region: "LCS" });
    expect(participantByCode(ctx, "ZZZ")).toBeNull();
    expect(participantByCode(ctx, null)).toBeNull();
  });
});

describe("Teams: identity", () => {
  it("attributes a match side to a team only when code AND canonical key agree", () => {
    const d = clone();
    expect(teamMatches(d.state, team("C9", d)).map((m) => m.match_id)).toEqual([PI.ubsf1]);
    // A side whose key the backend left null (a conflicting esports id) is not this team.
    const m = d.state.matches.find((x) => x.match_id === PI.ubsf1)!;
    m.teams[0].team_key = null;
    expect(teamMatches(d.state, team("C9", d))).toEqual([]);
  });
});

describe("Teams: status only from authority", () => {
  it("before the event nobody has a status", () => {
    for (const p of ctx.participants) expect(teamStatus(p, WORLDS_PRE.state, ctx)).toBeNull();
  });

  it("Play-In: winner and eliminations only as served with standings authority", () => {
    const d = betweenPlayInAndSwiss();
    expect(teamStatus(team("KC", d), d.state, d.context)).toMatchObject({ kind: "placed" });
    for (const c of ["MVK", "FUR", "C9"]) expect(teamStatus(team(c, d), d.state, d.context)).toMatchObject({ kind: "out", stage: "play_in" });
    // Without authority the same served lists say nothing.
    d.state.play_in.bracket_authority = "incomplete";
    expect(teamStatus(team("MVK", d), d.state, d.context)).toBeNull();
  });

  it("a live Play-In says nothing about the teams still playing", () => {
    const d = playInDay1();
    for (const c of ["C9", "KC", "FUR", "MVK"]) expect(teamStatus(team(c, d), d.state, d.context)).toBeNull();
  });

  it("Swiss: the served record and status", () => {
    const d = swissThrough(4.5);
    for (const r of d.state.swiss.records) {
      const s = teamStatus(team(r.code, d), d.state, d.context)!;
      expect(s.kind).toBe(r.status === "advanced" ? "advanced" : r.status === "eliminated" ? "out" : "alive");
      expect(s.label).toContain(`${r.wins}–${r.losses}`);
    }
  });

  it("Knockouts and the champion", () => {
    const mid = knockoutMid();
    const out = mid.state.knockout.eliminated[0];
    expect(teamStatus(team(out, mid), mid.state, mid.context)).toMatchObject({ kind: "out", stage: "knockout" });
    const done = worldsComplete();
    const champ = done.state.knockout.champion_code!;
    expect(teamStatus(team(champ, done), done.state, done.context)).toMatchObject({ kind: "champion", label: "Worlds champion" });
  });
});

describe("Teams: way through Worlds", () => {
  it("a Swiss seed skips the Play-In, and the Knockouts stay open (structure)", () => {
    const path = teamPath(team("GEN"), WORLDS_PRE.state, ctx);
    expect(path.map((s) => [s.stage.key, s.state, s.basis])).toEqual([
      ["play_in", "skipped", "verified"],
      ["swiss", "entered", "verified"],
      ["knockout", "open", "structure"],
    ]);
    expect(path[1].detail).toBe("Tier 1 seed");
  });

  it("a Play-In team: Swiss is open to the winner until served; reached once placed", () => {
    const pre = teamPath(team("KC"), WORLDS_PRE.state, ctx);
    expect(pre.map((s) => s.state)).toEqual(["entered", "open", "open"]);
    expect(pre[1].basis).toBe("structure");
    const d = swissThrough(2.5);
    const kc = teamPath(team("KC", d), d.state, d.context);
    expect(kc[0]).toMatchObject({ state: "entered", outcome: "won" });
    expect(kc[1]).toMatchObject({ state: "reached", basis: "verified" });
  });

  it("a team out of the Play-In does not reach later stages", () => {
    const d = betweenPlayInAndSwiss();
    expect(teamPath(team("MVK", d), d.state, d.context).map((s) => s.state)).toEqual(["entered", "closed", "closed"]);
  });

  it("counts series from completed matches with a served winner", () => {
    const d = swissThrough(2.5);
    const kc = teamSeries(d.state, team("KC", d));
    expect(kc.won + kc.lost).toBe(teamMatches(d.state, team("KC", d)).filter((m) => m.state === "completed").length);
  });
});

describe("Teams: lineups", () => {
  it("only a registered lineup with entries is certified", () => {
    const p = { ...team("GEN") };
    expect(p.lineup_status).toBe("not_certified");
    expect(certifiedLineup(p)).toBeNull();
    expect(certifiedLineup({ ...p, lineup_status: "registered", lineup: [] })).toBeNull();
    const lineup = [{ role: "top" as const, player_key: "Kiin", handle: "Kiin", change: null }];
    expect(certifiedLineup({ ...p, lineup_status: "registered", lineup })).toEqual(lineup);
    expect(certifiedLineup({ ...p, lineup_status: "not_certified", lineup })).toBeNull();
  });
});

describe("Schedule: days", () => {
  it("groups all 46 fixtures by local day, each day in start order", () => {
    const days = scheduleDays(WORLDS_PRE.state, null, "UTC");
    expect(days.reduce((n, d) => n + d.matches.length, 0)).toBe(46);
    for (const d of days) {
      const starts = d.matches.map((m) => Date.parse(m.scheduled_start));
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
    expect(days[0]).toMatchObject({ day: "2026-10-15", stages: ["play_in"], live: 0, completed: 0 });
  });

  it("local midnight: the same fixtures fall on different local days in Los Angeles and Seoul", () => {
    const first = WORLDS_PRE.state.matches.find((x) => x.match_id === PI.ubsf1)!; // 15 Oct 18:00Z
    const late = WORLDS_PRE.state.matches.find((x) => x.match_id === PI.ubsf2)!; // 15 Oct 23:00Z
    expect(matchDay(first, "America/Los_Angeles")).toBe("2026-10-15");
    expect(matchDay(late, "America/Los_Angeles")).toBe("2026-10-15");
    expect(matchDay(first, "Asia/Seoul")).toBe("2026-10-16");
    expect(matchDay(late, "Asia/Seoul")).toBe("2026-10-16");
    expect(matchDay(late, "UTC")).toBe("2026-10-15");
    const la = scheduleDays(WORLDS_PRE.state, "play_in", "America/Los_Angeles").map((d) => [d.day, d.matches.length]);
    const seoul = scheduleDays(WORLDS_PRE.state, "play_in", "Asia/Seoul").map((d) => [d.day, d.matches.length]);
    expect(la[0]).toEqual(["2026-10-15", 2]);
    expect(seoul[0]).toEqual(["2026-10-16", 2]);
    expect(seoul.some((d) => d[0] === "2026-10-15")).toBe(false);
    expect(la.reduce((n, d) => n + (d[1] as number), 0)).toBe(6);
    expect(seoul.reduce((n, d) => n + (d[1] as number), 0)).toBe(6);
  });

  it("filters by stage, with counts for every stage that has fixtures", () => {
    expect(filterCounts(WORLDS_PRE.state, ["play_in", "swiss", "knockout"])).toEqual([
      { key: null, count: 46 },
      { key: "play_in", count: 6 },
      { key: "swiss", count: 33 },
      { key: "knockout", count: 7 },
    ]);
    expect(scheduleDays(WORLDS_PRE.state, "knockout", "UTC").every((d) => d.stages.every((s) => s === "knockout"))).toBe(true);
  });

  it("states live and completed from the served match state, never from a date", () => {
    const d = playInDay1();
    const day = scheduleDays(d.state, null, "UTC").find((x) => x.day === "2026-10-15")!;
    expect(day).toMatchObject({ live: 1, completed: 1 });
    // A past date with no result is still not completed.
    const after = scheduleDays(WORLDS_PRE.state, null, "UTC");
    expect(after.every((x) => x.completed === 0)).toBe(true);
  });

  it("partial and unavailable schedules: only what was served, gaps stay gaps", () => {
    const partial = scheduleDays(partialSchedule().state, "knockout", "UTC");
    expect(partial.reduce((n, d) => n + d.matches.length, 0)).toBe(1);
    expect(partial[0].matches[0].match_id).toBe(KO.qf1);
    expect(scheduleDays(unknownPhase().state, null)).toEqual([]);
    expect(pickDay([], null, Date.now())).toBeNull();
  });
});

describe("Schedule: the day a board opens on", () => {
  const days = scheduleDays(WORLDS_PRE.state, null, "UTC");
  const at = (iso: string) => Date.parse(iso);

  it("the linked day, when it has fixtures", () => {
    expect(pickDay(days, "2026-10-25", at("2026-10-13T00:00:00Z"), "UTC")).toBe("2026-10-25");
  });

  it("otherwise today, else the next day ahead, else the last day", () => {
    expect(pickDay(days, "2026-10-20", at("2026-10-16T12:00:00Z"), "UTC")).toBe("2026-10-16");
    expect(pickDay(days, null, at("2026-10-13T00:10:00Z"), "UTC")).toBe("2026-10-15");
    expect(pickDay(days, null, at("2026-10-20T12:00:00Z"), "UTC")).toBe("2026-10-23");
    expect(pickDay(days, null, at("2026-12-01T00:00:00Z"), "UTC")).toBe(days[days.length - 1].day);
  });

  it("a day with live play leads", () => {
    const d = playInDay1();
    expect(pickDay(scheduleDays(d.state, null, "UTC"), null, at("2026-10-20T00:00:00Z"), "UTC")).toBe("2026-10-15");
  });

  it("counts the gap between match days", () => {
    expect(daysBetween("2026-10-18", "2026-10-23")).toBe(5);
    expect(daysBetween("2026-10-31", "2026-11-03")).toBe(3);
  });
});
