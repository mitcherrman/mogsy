/**
 * RD1 — the duel standing projection.
 *
 * Persistent facts from the public snapshot; the lead-change and speed-bonus
 * EVENTS from one settlement, and only while it is being revealed.
 */
import { describe, expect, it } from "vitest";
import {
  duelEventOf, duelProgressSuffix, duelStandingLabel, projectDuelState, projectLeadChange,
} from "./duelState";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import type { ResolvedRoundView } from "./viewTypes";

const pub = ({
  you = 0, opp = 0, moduleNumber = 1, matchLength = 10 as number | null,
  modulesCompleted = moduleNumber - 1, model = "points" as "points" | "hp",
  matchOver = false,
} = {}): PublicRoundView => ({
  matchOver,
  players: [
    { playerId: "you", score: model === "points" ? you : null },
    { playerId: "opp", score: model === "points" ? opp : null },
  ],
  scoring: { model, matchLength: model === "points" ? matchLength : null,
    moduleNumber, modulesCompleted },
}) as unknown as PublicRoundView;

const award = (before: number, after: number, speed = 0) => ({
  basePoints: after - before - speed, speedBonusPoints: speed,
  pointsAwarded: after - before, scoreBefore: before, scoreAfter: after,
});
const settled = (
  round: number,
  you: [number, number, number?], opp: [number, number, number?],
): ResolvedRoundView => ({
  roundNumber: round,
  modulePoints: { you: award(...you), opp: award(...opp) },
}) as unknown as ResolvedRoundView;

const state = (p: PublicRoundView, settlement: ResolvedRoundView | null = null, revealing = false) =>
  projectDuelState({ publicRound: p, viewerUserId: "you", settlement, revealing })!;

describe("persistent standing", () => {
  it("leading, with the margin", () => {
    const s = state(pub({ you: 9, opp: 6 }));
    expect(s.standing).toBe("leading");
    expect(s.margin).toBe(3);
    expect(duelStandingLabel(s)).toBe("AHEAD BY 3 PTS");
  });

  it("trailing, with the margin as a plain number", () => {
    const s = state(pub({ you: 4, opp: 5 }));
    expect(s.standing).toBe("trailing");
    expect(s.margin).toBe(1);
    expect(duelStandingLabel(s)).toBe("BEHIND BY 1 PT");
  });

  it("tied, including the 0-0 opening", () => {
    for (const n of [0, 7]) {
      const s = state(pub({ you: n, opp: n }));
      expect(s.standing).toBe("tied");
      expect(s.margin).toBe(0);
      expect(duelStandingLabel(s)).toBe("TIED");
    }
  });
});

describe("progress", () => {
  it("counts the module in play as remaining", () => {
    expect(state(pub({ moduleNumber: 1 })).modulesRemaining).toBe(10);
    expect(state(pub({ moduleNumber: 8 })).modulesRemaining).toBe(3);
  });

  it("uses the match's own length, not ten", () => {
    const s = state(pub({ moduleNumber: 4, matchLength: 6 }));
    expect(s.modulesRemaining).toBe(3);
    expect(s.isFinalThree).toBe(true);
    expect(s.isFinalModule).toBe(false);
  });

  it.each([
    [7, false, false, null],
    [8, true, false, "FINAL 3"],
    [9, true, false, "FINAL 3"],
    [10, true, true, "FINAL"],
  ])("module %i: final three %s, final %s", (moduleNumber, three, last, suffix) => {
    const s = state(pub({ moduleNumber: moduleNumber as number }));
    expect(s.isFinalThree).toBe(three);
    expect(s.isFinalModule).toBe(last);
    expect(duelProgressSuffix(s)).toBe(suffix);
  });

  it("claims no final pressure once the match is over, or without a length", () => {
    expect(duelProgressSuffix(state(pub({ moduleNumber: 10, modulesCompleted: 10, matchOver: true }))))
      .toBeNull();
    const unbounded = state(pub({ moduleNumber: 10, matchLength: null }));
    expect(unbounded.modulesRemaining).toBeNull();
    expect(duelProgressSuffix(unbounded)).toBeNull();
  });
});

describe("the lead-change event", () => {
  it("behind -> ahead names the viewer as the new leader", () => {
    const s = state(pub({ you: 8, opp: 6 }), settled(3, [5, 8], [6, 6]), true);
    expect(s.leadChange).toEqual({
      eventId: "lead:3", roundNumber: 3, from: "trailing", to: "leading", newLeader: "viewer",
    });
  });

  it("ahead -> behind names the opponent", () => {
    const s = state(pub({ you: 6, opp: 8 }), settled(4, [6, 6], [5, 8]), true);
    expect(s.leadChange).toMatchObject({ from: "leading", to: "trailing", newLeader: "opponent" });
  });

  it("into a tie is a change with no new leader", () => {
    expect(projectLeadChange(settled(2, [4, 4], [2, 4]), "you", "opp"))
      .toMatchObject({ from: "leading", to: "tied", newLeader: null });
  });

  it("out of a tie is a lead taken", () => {
    expect(projectLeadChange(settled(1, [0, 3], [0, 2]), "you", "opp"))
      .toMatchObject({ from: "tied", to: "leading", newLeader: "viewer" });
  });

  it("no change when the same side stays ahead or it stays tied", () => {
    expect(projectLeadChange(settled(5, [9, 11], [6, 8]), "you", "opp")).toBeNull();
    expect(projectLeadChange(settled(5, [3, 5], [3, 5]), "you", "opp")).toBeNull();
  });

  it("does not exist outside the reveal beat, whatever the settlement says", () => {
    const s = state(pub({ you: 8, opp: 6 }), settled(3, [5, 8, 1], [6, 6]), false);
    expect(s.leadChange).toBeNull();
    expect(s.speedBonus).toBe(false);
    // ...while the persistent standing is still there straight away.
    expect(s.standing).toBe("leading");
  });

  it("makes no claim when the settlement published no award", () => {
    const hpRound = { roundNumber: 2, modulePoints: null } as unknown as ResolvedRoundView;
    expect(state(pub({ you: 3, opp: 1 }), hpRound, true).leadChange).toBeNull();
  });
});

describe("speed bonus", () => {
  it("is the viewer's own server bonus, during the beat", () => {
    expect(state(pub({ you: 3 }), settled(1, [0, 3, 1], [0, 0]), true).speedBonus).toBe(true);
    expect(state(pub({ you: 2 }), settled(1, [0, 2, 0], [0, 3, 1]), true).speedBonus).toBe(false);
  });
});

describe("formats it does not describe", () => {
  it("returns null for an hp match", () => {
    expect(projectDuelState({
      publicRound: pub({ model: "hp" }), viewerUserId: "you", settlement: null, revealing: true,
    })).toBeNull();
  });

  it("returns null with no snapshot, no scoring block, or no opponent", () => {
    expect(projectDuelState({ publicRound: null, viewerUserId: "you", settlement: null, revealing: false }))
      .toBeNull();
    const noBlock = { ...pub(), scoring: null } as unknown as PublicRoundView;
    expect(projectDuelState({ publicRound: noBlock, viewerUserId: "you", settlement: null, revealing: false }))
      .toBeNull();
    const solo = { ...pub(), players: [{ playerId: "you", score: 1 }] } as unknown as PublicRoundView;
    expect(projectDuelState({ publicRound: solo, viewerUserId: "you", settlement: null, revealing: false }))
      .toBeNull();
  });
});

describe("standing wording", () => {
  it.each([
    [10, 9, "AHEAD BY 1 PT"], [10, 8, "AHEAD BY 2 PTS"],
    [8, 9, "BEHIND BY 1 PT"], [5, 8, "BEHIND BY 3 PTS"], [4, 4, "TIED"],
  ])("%i-%i reads %s", (you, opp, label) => {
    expect(duelStandingLabel(state(pub({ you, opp })))).toBe(label);
  });
});

describe("the transient duel event", () => {
  const event = (p: PublicRoundView, s: ResolvedRoundView | null, revealing = true) =>
    duelEventOf(state(p, s, revealing));

  it("viewer takes the lead", () => {
    expect(event(pub({ you: 8, opp: 6 }), settled(3, [5, 8], [6, 6])))
      .toEqual({ label: "YOU TAKE THE LEAD", tone: "positive" });
  });

  it("opponent takes the lead", () => {
    expect(event(pub({ you: 6, opp: 8 }), settled(3, [6, 6], [5, 8])))
      .toEqual({ label: "OPPONENT TAKES THE LEAD", tone: "danger" });
  });

  it("into a tie from either side is TIED UP", () => {
    expect(event(pub({ you: 4, opp: 4 }), settled(2, [4, 4], [2, 4])))
      .toEqual({ label: "TIED UP", tone: "neutral" });
    expect(event(pub({ you: 4, opp: 4 }), settled(2, [1, 4], [4, 4])))
      .toEqual({ label: "TIED UP", tone: "neutral" });
  });

  it("staying tied, or 0-0 at load, is not an event", () => {
    expect(event(pub({ you: 5, opp: 5 }), settled(2, [3, 5], [3, 5]))).toBeNull();
    expect(event(pub({ you: 0, opp: 0 }), null)).toBeNull();
    expect(event(pub({ you: 0, opp: 0 }), null, false)).toBeNull();
  });

  it("a speed bonus with no change of standing", () => {
    expect(event(pub({ you: 12, opp: 6 }), settled(4, [9, 12, 1], [6, 6])))
      .toEqual({ label: "SPEED BONUS +1", tone: "bonus" });
  });

  it("a lead change outranks a speed bonus earned on the same module", () => {
    expect(event(pub({ you: 8, opp: 6 }), settled(3, [5, 8, 1], [6, 6]))?.label)
      .toBe("YOU TAKE THE LEAD");
  });

  it("nothing outside the reveal beat, whatever the settlement says", () => {
    expect(event(pub({ you: 8, opp: 6 }), settled(3, [5, 8, 1], [6, 6]), false)).toBeNull();
    expect(duelEventOf(null)).toBeNull();
  });
});
