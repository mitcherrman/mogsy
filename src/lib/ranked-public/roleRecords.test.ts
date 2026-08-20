/**
 * LC1 — the per-role tally counts real rows and invents nothing.
 */
import { describe, expect, it } from "vitest";
import { roleRecordScopeLabel, tallyRoleRecords } from "./roleRecords";
import type { MatchHistoryEntryView } from "./contracts";

function row(over: Partial<MatchHistoryEntryView>): MatchHistoryEntryView {
  return {
    matchId: Math.random().toString(36).slice(2),
    viewerOutcome: "win",
    terminalReason: "hp_zero" as MatchHistoryEntryView["terminalReason"],
    completionReason: null,
    finalRoundNumber: 5,
    completedAt: "2026-08-19T00:00:00Z",
    isBotMatch: false,
    viewerClass: "tank",
    opponentClass: "mage",
    viewerRole: "jungle",
    opponentRole: null,
    opponentDisplayName: "Rival",
    opponentIsBot: false,
    ...over,
  } as MatchHistoryEntryView;
}

describe("tallyRoleRecords", () => {
  it("counts wins, losses and draws per role", () => {
    const out = tallyRoleRecords([
      row({ viewerRole: "jungle", viewerOutcome: "win" }),
      row({ viewerRole: "jungle", viewerOutcome: "win" }),
      row({ viewerRole: "jungle", viewerOutcome: "loss" }),
      row({ viewerRole: "mid", viewerOutcome: "draw" }),
    ]);
    expect(out.jungle).toEqual({ wins: 2, losses: 1, draws: 0 });
    expect(out.mid).toEqual({ wins: 0, losses: 0, draws: 1 });
  });

  it("gives a role with no rows NO entry, so callers cannot render a fake 0W-0L", () => {
    const out = tallyRoleRecords([row({ viewerRole: "top" })]);
    expect(out.top).toBeDefined();
    expect(out.support).toBeUndefined();
    expect(out.adc).toBeUndefined();
  });

  it("counts a pre-R1 row for NO role — a class is never back-filled into one", () => {
    const out = tallyRoleRecords([
      row({ viewerRole: null, viewerClass: "tank", viewerOutcome: "win" }),
      row({ viewerRole: null, viewerClass: "mage", viewerOutcome: "loss" }),
    ]);
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("returns nothing at all for an empty history", () => {
    expect(tallyRoleRecords([])).toEqual({});
  });
});

describe("roleRecordScopeLabel", () => {
  it("states the window the tally actually covers, never 'all time'", () => {
    expect(roleRecordScopeLabel(12)).toBe("Last 12 ranked matches");
    expect(roleRecordScopeLabel(1)).toBe("Last 1 ranked match");
  });
});
