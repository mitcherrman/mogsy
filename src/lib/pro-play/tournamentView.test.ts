/**
 * DCGI1 — pure tournament presentation helpers, on the backend's real
 * pre-event payload (registry + upstream getSchedule read 2026-10-01).
 */
import { describe, expect, it } from "vitest";

import fixture from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import type { TournamentMatch, TournamentResponse } from "@/lib/pro-play/tournamentApi";
import {
  bracketRounds,
  dateRange,
  fieldByRegion,
  localDayKey,
  matchHref,
  matchesByDay,
  recordGroups,
  scoreText,
  todaysMatches,
} from "@/lib/pro-play/tournamentView";

const DATA = fixture as unknown as TournamentResponse;
const clone = (): TournamentResponse => JSON.parse(JSON.stringify(DATA));

describe("tournamentView", () => {
  it("groups the field by region in the registry's order", () => {
    const groups = fieldByRegion(DATA.context);
    expect(groups.map((g) => [g.region, g.teams.map((t) => t.code)])).toEqual([
      ["LPL", ["JDG", "WE", "LGD"]],
      ["LCK", ["KT", "BFX", "BRO"]],
      ["LEC", ["NAVI", "VIT"]],
      ["LCS", ["SR", "FLY"]],
      ["LCP", ["GAM"]],
      ["CBLOL", ["RED"]],
    ]);
  });

  it("groups matches by local day (UTC here: R1 on 3 Oct, final on 17 Oct)", () => {
    const days = matchesByDay(DATA.state.matches, "UTC");
    expect(days[0].day).toBe("2026-10-03");
    expect(days[0].matches).toHaveLength(6);
    expect(days[days.length - 1].day).toBe("2026-10-17");
    expect(days.flatMap((d) => d.matches)).toHaveLength(27);
    // Beijing (UTC+8): Round 1 runs 16:00–21:00 on the same day.
    expect(localDayKey(DATA.state.matches[5].scheduled_start, "Asia/Shanghai")).toBe("2026-10-03");
  });

  it("finds today's matches in the viewer's zone", () => {
    const at = Date.parse("2026-10-03T09:30:00Z");
    expect(todaysMatches(DATA.state.matches, at, "UTC")).toHaveLength(6);
    expect(todaysMatches(DATA.state.matches, Date.parse("2026-10-10T09:00:00Z"), "UTC")).toEqual([]);
  });

  it("serves no record groups before a match has finished", () => {
    expect(DATA.state.swiss_records).toEqual([]);
    expect(recordGroups(DATA.state.swiss_records)).toEqual([]);
  });

  it("groups records the backend served, keeping its order", () => {
    const rows = [
      { code: "LGD", team_key: "LGD Gaming", wins: 1, losses: 0, played: 1 },
      { code: "NAVI", team_key: "Natus Vincere", wins: 1, losses: 0, played: 1 },
      { code: "KT", team_key: "KT Rolster", wins: 0, losses: 0, played: 0 },
      { code: "RED", team_key: "RED Canids", wins: 0, losses: 1, played: 1 },
    ];
    expect(recordGroups(rows).map((g) => [g.record, g.rows.map((r) => r.code)])).toEqual([
      ["1–0", ["LGD", "NAVI"]],
      ["0–0", ["KT"]],
      ["0–1", ["RED"]],
    ]);
  });

  it("lays out the knockout rounds from upstream's block names", () => {
    expect(bracketRounds(DATA.state.matches).map((r) => [r.round, r.matches.length])).toEqual([
      ["Quarterfinals", 4],
      ["Semifinals", 2],
      ["Finals", 1],
    ]);
  });

  it("links only to destinations that exist", () => {
    const [r1] = DATA.state.matches;
    expect(matchHref(r1)).toBe(`/lol/pro-play?next=${r1.match_id}`);
    const tbd = DATA.state.matches[6];
    expect(matchHref(tbd)).toBeNull(); // both TBD: no match to follow yet
    const played: TournamentMatch = { ...r1, state: "completed", live1_game_ids: ["g1", "g2"] };
    expect(matchHref(played)).toBe("/lol/pro-play?game=g2");
    expect(matchHref({ ...r1, state: "completed", live1_game_ids: [] })).toBeNull();
  });

  it("shows a score only once a match has started", () => {
    const data = clone();
    const m = data.state.matches[0];
    expect(scoreText(m)).toBeNull();
    m.state = "completed";
    m.teams[1].game_wins = 1;
    expect(scoreText(m)).toBe("0–1");
  });

  it("formats date ranges", () => {
    expect(dateRange("2026-10-03", "2026-10-17")).toBe("3–17 Oct 2026");
    expect(dateRange("2026-10-15", "2026-11-14")).toBe("15 Oct – 14 Nov 2026");
  });
});
