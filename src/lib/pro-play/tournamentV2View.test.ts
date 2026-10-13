/**
 * PW4-B — presentation helpers for the v2 tournament page, on the real
 * production Worlds body and simulated results written onto it.
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
  staleSchedule,
  standingsUnavailable,
  swissThrough,
} from "@/lib/pro-play/__fixtures__/worldsScenarios";

import {
  cellMatchName,
  doubleElimLayout,
  focusRound,
  freshness,
  matchNames,
  matchesById,
  phaseLabelV2,
  playInSwissSlot,
  routesFrom,
  sectionOrderV2,
  singleElimRounds,
  slotLabel,
  stageMatches,
  stageProgress,
  swissRounds,
  swissTiers,
  winnerEdges,
} from "./tournamentV2View";

const W = WORLDS_PRE;
const ctx = W.context;

describe("cell names", () => {
  it.each([
    ["Upper Bracket - Semifinals", "Play-In", "Upper Semifinal"],
    ["Upper Bracket - Finals", "Play-In", "Upper Final"],
    ["Lower Bracket - Semifinals", "Play-In", "Lower Semifinal"],
    ["Lower Bracket - Finals", "Play-In", "Lower Final"],
    ["Finals", "Play-In", "Play-In Final"],
    ["Finals", "Knockout", "Final"],
    ["Quarterfinals", "Knockout", "Quarterfinal"],
    ["Round 3", "Swiss", "Round 3"],
  ])("%s (%s) → %s", (cell, stage, name) => {
    expect(cellMatchName(cell, stage)).toBe(name);
  });
});

describe("match names and slot provenance (real body)", () => {
  const names = matchNames(W.state, ctx);
  const byId = matchesById(W.state);

  it("numbers matches within a cell in play order", () => {
    expect(names.get(PI.ubsf1)).toBe("Upper Semifinal 1"); // C9 v KC, 18:00Z
    expect(names.get(PI.ubsf2)).toBe("Upper Semifinal 2"); // FUR v MVK, 23:00Z
    expect(names.get(PI.final)).toBe("Play-In Final");
    expect([KO.qf1, KO.qf2, KO.qf3, KO.qf4].map((id) => names.get(id))).toEqual([
      "Quarterfinal 1",
      "Quarterfinal 2",
      "Quarterfinal 3",
      "Quarterfinal 4",
    ]);
    expect(names.get(KO.final)).toBe("Final");
    expect(names.get("115660540726095045")).toBe("Round 3");
  });

  it("labels TBD slots as the winner or loser of a named match, or a draw", () => {
    const ubf = byId.get(PI.ubf)!;
    expect(ubf.teams.map((t) => slotLabel(t.slot, byId, names))).toEqual(["Winner of FUR v MVK", "Winner of C9 v KC"]);
    const lbsf = byId.get(PI.lbsf)!;
    expect(lbsf.teams.map((t) => slotLabel(t.slot, byId, names))).toEqual(["Loser of FUR v MVK", "Loser of C9 v KC"]);
    const lbf = byId.get(PI.lbf)!;
    expect(lbf.teams.map((t) => slotLabel(t.slot, byId, names))).toEqual(["Loser of Upper Final", "Winner of Lower Semifinal"]);
    const sf1 = byId.get(KO.sf1)!;
    expect(sf1.teams.map((t) => slotLabel(t.slot, byId, names))).toEqual(["Winner of Quarterfinal 1", "Winner of Quarterfinal 2"]);
    expect(slotLabel(byId.get(KO.qf1)!.teams[0].slot, byId, names)).toBe("Decided by draw");
    expect(slotLabel(null, byId, names)).toBeNull();
  });

  it("reads where a match's winner and loser go from the slots that name it", () => {
    const r = routesFrom(PI.ubsf1, W.state.matches);
    expect(r.map((x) => [x.kind, names.get(x.to.match_id)])).toEqual([
      ["winner", "Upper Final"],
      ["loser", "Lower Semifinal"],
    ]);
    expect(routesFrom(PI.final, W.state.matches)).toEqual([]);
  });
});

describe("bracket layouts", () => {
  it("lays the Play-In out as double elimination from upstream cells", () => {
    const layout = doubleElimLayout(stageMatches(W.state, "play_in", W.state.play_in))!;
    expect(layout.rows.map((r) => [r.key, r.columns.map((c) => [c.cell, c.matches.length])])).toEqual([
      ["upper", [["Upper Bracket - Semifinals", 2], ["Upper Bracket - Finals", 1]]],
      ["lower", [["Lower Bracket - Semifinals", 1], ["Lower Bracket - Finals", 1]]],
    ]);
    expect(layout.final?.cell).toBe("Finals");
    expect(winnerEdges(stageMatches(W.state, "play_in"))).toHaveLength(5);
  });

  it("refuses to draw a double-elimination layout without cells", () => {
    const d = standingsUnavailable(clone());
    expect(doubleElimLayout(stageMatches(d.state, "play_in"))).toBeNull();
  });

  it("orders the knockout so each pair sits beside the match it feeds", () => {
    const { rounds, tree } = singleElimRounds(stageMatches(W.state, "knockout", W.state.knockout));
    expect(tree).toBe(true);
    expect(rounds.map((r) => [r.cell, r.matches.map((m) => m.match_id)])).toEqual([
      ["Quarterfinals", [KO.qf1, KO.qf2, KO.qf3, KO.qf4]],
      ["Semifinals", [KO.sf1, KO.sf2]],
      ["Finals", [KO.final]],
    ]);
  });
});

describe("Swiss", () => {
  it("serves the certified tiers: four, four, four and three, with the Play-In slot unresolved", () => {
    expect(swissTiers(ctx).map((t) => [t.tier, t.teams.map((p) => p.code)])).toEqual([
      [1, ["AL", "GEN", "G2", "TLAW"]],
      [2, ["BLG", "HLE", "TSW", "LOS"]],
      [3, ["TES", "T1", "MKOI", "LYON"]],
      [4, ["IG", "DK", "CFO"]],
    ]);
    expect(playInSwissSlot(ctx, W.state)).toEqual({ code: null, basis: "unresolved" });
  });

  it("names the Play-In slot from upstream placement first", () => {
    expect(playInSwissSlot(ctx, betweenPlayInAndSwiss().state)).toEqual({ code: "KC", basis: "placed" });
  });

  it("reads rounds from standings and focuses the round in play", () => {
    const rounds = swissRounds(W.state);
    expect(rounds.map((r) => [r.round, r.matches.length])).toEqual([[1, 8], [2, 8], [3, 8], [4, 6], [5, 3]]);
    expect(focusRound(rounds)).toBe(1);
    const mid = swissThrough(3.5);
    expect(focusRound(swissRounds(mid.state))).toBe(4);
    expect(swissRounds(standingsUnavailable(clone()).state)).toEqual([]);
  });
});

describe("phase-aware order and progress", () => {
  const order = (d = W) => sectionOrderV2(d.state, d.context);

  it("leads with the Play-In and the field before the event", () => {
    expect(order()).toEqual(["stage:play_in", "field", "stage:swiss", "stage:knockout", "schedule"]);
  });

  it("leads with today and the stage in play", () => {
    expect(order(playInDay1()).slice(0, 2)).toEqual(["today", "stage:play_in"]);
    expect(order(swissThrough(2)).slice(0, 3)).toEqual(["today", "stage:swiss", "schedule"]);
    expect(order(knockoutMid()).slice(0, 2)).toEqual(["today", "stage:knockout"]);
  });

  it("leads with the next stage between stages", () => {
    expect(order(betweenPlayInAndSwiss())[0]).toBe("stage:swiss");
  });

  it("shows only registry facts when the phase is unknown", () => {
    const d = clone();
    d.state.phase = "unknown";
    expect(order(d)).toEqual(["field", "stage:swiss"]);
  });

  it("marks stages only as the phase states them", () => {
    const marks = (d = W) => d.context.stages.map((s) => stageProgress(s, d.state, d.context));
    expect(marks()).toEqual(["next", null, null]);
    expect(marks(playInDay1())).toEqual(["current", null, null]);
    expect(marks(betweenPlayInAndSwiss())).toEqual(["complete", "next", null]);
    expect(marks(swissThrough(2))).toEqual([null, "current", null]);
  });

  it("labels the phase, naming the stage completed between stages", () => {
    expect(phaseLabelV2(W.state, ctx)).toBe("Know the field");
    expect(phaseLabelV2(betweenPlayInAndSwiss().state, ctx)).toBe("Play-In complete");
  });
});

describe("freshness", () => {
  it("is fresh on the real body and stale on a recent copy", () => {
    expect(freshness(W).stale).toBe(false);
    const s = freshness(staleSchedule());
    expect(s.stale).toBe(true);
    expect(s.scheduleStale).toBe(true);
    expect(s.fetchedAt).toBe("2026-10-13T00:01:00.000+00:00");
  });
});
