/**
 * RD2 — which mascot plays which motion, under which event id.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_FINAL_MODULE_WATCH, observeFinalModuleEntry, projectDuelMascotReactions,
} from "./duelMascot";
import type { ResolvedRoundView } from "./viewTypes";

const award = (before: number, base: number, speed = 0) => ({
  basePoints: base, speedBonusPoints: speed, pointsAwarded: base + speed,
  scoreBefore: before, scoreAfter: before + base + speed,
});
const settled = (round: number, you: ReturnType<typeof award>, opp: ReturnType<typeof award>) =>
  ({ roundNumber: round, modulePoints: { you, opp } }) as unknown as ResolvedRoundView;

const react = (settlement: ResolvedRoundView | null, revealing = true,
  finalEntry: { id: string; moduleNumber: number } | null = null) =>
  projectDuelMascotReactions({ settlement, revealing, viewerId: "you", opponentId: "opp", finalEntry });

describe("settlement reactions", () => {
  it("a positive score cheers", () => {
    expect(react(settled(2, award(9, 2), award(3, 0)))).toEqual({
      you: { action: "cheer", actionId: "score:2:you" },
    });
  });

  it("a speed bonus outranks the score", () => {
    expect(react(settled(2, award(9, 2, 1), award(3, 0))).you)
      .toEqual({ action: "celebrate", actionId: "speed:2:you" });
  });

  it("taking the lead outranks the speed bonus", () => {
    expect(react(settled(3, award(5, 2, 1), award(6, 0))).you)
      .toEqual({ action: "celebrate", actionId: "lead:3:you" });
  });

  it("the opponent reacts to its OWN award, and taking the lead from the viewer moves only the opponent", () => {
    const out = react(settled(4, award(8, 0), award(7, 2)));
    expect(out.opp).toEqual({ action: "celebrate", actionId: "lead:4:opp" });
    expect(out.you).toBeUndefined();
  });

  it("both can react on the same module", () => {
    const out = react(settled(5, award(10, 2), award(4, 3, 1)));
    expect(out.you?.action).toBe("cheer");
    expect(out.opp?.action).toBe("celebrate");
  });

  it("a tie reached by scoring is that player's cheer; the caught player does not move", () => {
    const out = react(settled(6, award(4, 0), award(2, 2)));
    expect(out.opp).toEqual({ action: "cheer", actionId: "score:6:opp" });
    expect(out.you).toBeUndefined();
  });

  it("never plays a combat action", () => {
    const cases = [
      settled(1, award(0, 0), award(0, 3, 1)), settled(1, award(5, 0), award(4, 2)),
      settled(1, award(0, 2, 1), award(0, 2)),
    ];
    for (const c of cases) {
      for (const r of Object.values(react(c))) expect(["hit", "attack"]).not.toContain(r.action);
    }
  });

  it("nothing outside the reveal beat", () => {
    expect(react(settled(3, award(5, 2, 1), award(6, 0)), false)).toEqual({});
  });

  it("the same settlement always yields the same ids (a re-render cannot retrigger)", () => {
    const s = settled(3, award(5, 2, 1), award(6, 0));
    expect(react(s)).toEqual(react(s));
  });
});

describe("the final module", () => {
  const snap = (moduleNumber: number, matchOver = false) =>
    ({ moduleNumber, matchLength: 10, matchOver });

  it("records an entry only for a WATCHED crossing", () => {
    let w = observeFinalModuleEntry(EMPTY_FINAL_MODULE_WATCH, snap(9));
    expect(w.entry).toBeNull();
    w = observeFinalModuleEntry(w, snap(10));
    expect(w.entry).toEqual({ id: "final:10", moduleNumber: 10 });
  });

  it("records nothing when the first snapshot is already the final module (reconnect)", () => {
    const w = observeFinalModuleEntry(EMPTY_FINAL_MODULE_WATCH, snap(10));
    expect(w.entry).toBeNull();
    expect(w.lastModule).toBe(10);
  });

  it("is identity-preserving on an unchanged snapshot", () => {
    const w = observeFinalModuleEntry(EMPTY_FINAL_MODULE_WATCH, snap(4));
    expect(observeFinalModuleEntry(w, snap(4))).toBe(w);
    expect(observeFinalModuleEntry(w, null)).toBe(w);
  });

  it("nothing for a finished match or one with no length", () => {
    const w = observeFinalModuleEntry(EMPTY_FINAL_MODULE_WATCH, snap(9));
    expect(observeFinalModuleEntry(w, snap(10, true)).entry).toBeNull();
    expect(observeFinalModuleEntry(w, { moduleNumber: 10, matchLength: null, matchOver: false }).entry)
      .toBeNull();
  });

  it("both mascots focus between beats, under one id, until the final module settles", () => {
    const entry = { id: "final:10", moduleNumber: 10 };
    const after9 = settled(9, award(5, 0), award(5, 0));
    expect(react(after9, false, entry)).toEqual({
      you: { action: "focus", actionId: "final:10" },
      opp: { action: "focus", actionId: "final:10" },
    });
    // During the previous module's beat, the settlement owns the mascots.
    expect(react(after9, true, entry)).toEqual({});
    // Once module 10 itself has settled, the lock-in is no longer offered.
    expect(react(settled(10, award(5, 0), award(5, 0)), false, entry)).toEqual({});
  });
});
