import { describe, expect, it } from "vitest";
import {
  isStandaloneRankedLeaveProtected,
  leavesStandaloneRankedOwner,
  RANKED_LEAVE_COPY,
} from "./rankedLeaveContract";
import type { MatchPhase } from "./useRankedMatch";

describe("standalone Ranked leave contract", () => {
  it.each<MatchPhase>([
    "recovering",
    "active",
    "reviewing",
    "locked",
    "recovering_error",
    "fatal",
  ])("protects a known standalone match in %s", (phase) => {
    expect(isStandaloneRankedLeaveProtected({ matchId: "m1", hosted: false, phase }))
      .toBe(true);
  });

  it("protects the assigned pre-snapshot interval", () => {
    expect(isStandaloneRankedLeaveProtected({ matchId: "m1", hosted: false, phase: null }))
      .toBe(true);
  });

  it.each<MatchPhase>(["match_outro", "match_over"])(
    "does not protect authority-proved terminal %s",
    (phase) => {
      expect(isStandaloneRankedLeaveProtected({ matchId: "m1", hosted: false, phase }))
        .toBe(false);
    },
  );

  it("never protects a hosted child or an unknown match", () => {
    expect(isStandaloneRankedLeaveProtected({ matchId: "m1", hosted: true, phase: "active" }))
      .toBe(false);
    expect(isStandaloneRankedLeaveProtected({ matchId: null, hosted: false, phase: "active" }))
      .toBe(false);
  });

  it("uses approved copy", () => {
    expect(RANKED_LEAVE_COPY).toEqual({
      title: "Leave this Ranked match?",
      body: "Leaving will not forfeit immediately. The match keeps running. You can reconnect for about 45 seconds, but it may advance or end while you are away.",
      stayLabel: "Stay in Match",
      leaveLabel: "Leave Match",
    });
  });

  it("allows only navigation that preserves the exact route owner", () => {
    expect(leavesStandaloneRankedOwner("/quiz/ranked")).toBe(false);
    expect(leavesStandaloneRankedOwner("/quiz/ranked/")).toBe(false);
    expect(leavesStandaloneRankedOwner("/quiz")).toBe(true);
    expect(leavesStandaloneRankedOwner("/lol")).toBe(true);
    expect(leavesStandaloneRankedOwner("/quiz/ranked/history")).toBe(true);
  });
});
