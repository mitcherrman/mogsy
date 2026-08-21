/**
 * MALT — the role mastery tally, which is DERIVED and therefore has to be
 * checked. Every rule here exists because breaking it would put a number on
 * the lobby that the account's own history does not support.
 */
import { describe, expect, it } from "vitest";
import { matchAgeLabel, tallyRoleMastery } from "./roleRecords";
import type { MatchHistoryEntryView } from "./contracts";

function row(over: Partial<MatchHistoryEntryView>): MatchHistoryEntryView {
  return {
    matchId: `m-${Math.random().toString(36).slice(2)}`,
    viewerOutcome: "win",
    terminalReason: "combat",
    completionReason: null,
    finalRoundNumber: 5,
    completedAt: "2026-08-10T12:00:00Z",
    isBotMatch: false,
    viewerClass: "mage",
    opponentClass: "tank",
    viewerRole: "mid",
    opponentRole: null,
    opponentDisplayName: "Rival",
    opponentIsBot: false,
    ratingDelta: null,
    ratingAfter: null,
    ...over,
  } as MatchHistoryEntryView;
}

describe("tallyRoleMastery", () => {
  it("counts games, record and win rate per role", () => {
    const out = tallyRoleMastery([
      row({ viewerRole: "mid", viewerOutcome: "win" }),
      row({ viewerRole: "mid", viewerOutcome: "win" }),
      row({ viewerRole: "mid", viewerOutcome: "loss" }),
      row({ viewerRole: "jungle", viewerOutcome: "loss" }),
    ]);
    expect(out.mid).toMatchObject({ games: 3, wins: 2, losses: 1, draws: 0, winRatePercent: 67 });
    expect(out.jungle).toMatchObject({ games: 1, wins: 0, losses: 1, winRatePercent: 0 });
  });

  it("gives a role with no rows NO entry, so a caller cannot render 0-0", () => {
    const out = tallyRoleMastery([row({ viewerRole: "mid" })]);
    expect(out.support).toBeUndefined();
    expect(out.top).toBeUndefined();
  });

  it("counts a row that predates roles for no role at all", () => {
    // R1: a class is not a role, in either direction. A legacy row is never
    // back-filled from the class it does carry.
    const out = tallyRoleMastery([row({ viewerRole: null, viewerClass: "assassin" })]);
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("sums applied rating deltas", () => {
    const out = tallyRoleMastery([
      row({ viewerRole: "mid", ratingDelta: 22 }),
      row({ viewerRole: "mid", ratingDelta: -14 }),
    ]);
    expect(out.mid!.netRating).toBe(8);
  });

  it("distinguishes 'no delta was applied' (null) from 'the deltas came out even' (0)", () => {
    // These are different facts and must not render identically.
    const none = tallyRoleMastery([row({ viewerRole: "mid", ratingDelta: null })]);
    expect(none.mid!.netRating).toBeNull();

    const even = tallyRoleMastery([
      row({ viewerRole: "mid", ratingDelta: 12 }),
      row({ viewerRole: "mid", ratingDelta: -12 }),
    ]);
    expect(even.mid!.netRating).toBe(0);
  });

  it("ignores a null delta while still summing the rows that have one", () => {
    const out = tallyRoleMastery([
      row({ viewerRole: "mid", ratingDelta: null }),
      row({ viewerRole: "mid", ratingDelta: 9 }),
    ]);
    expect(out.mid!.netRating).toBe(9);
    expect(out.mid!.games).toBe(2);
  });

  it("keeps the newest timestamp whichever order the rows arrive in", () => {
    const out = tallyRoleMastery([
      row({ viewerRole: "mid", completedAt: "2026-08-01T00:00:00Z" }),
      row({ viewerRole: "mid", completedAt: "2026-08-09T00:00:00Z" }),
      row({ viewerRole: "mid", completedAt: "2026-08-05T00:00:00Z" }),
    ]);
    expect(out.mid!.lastPlayedAt).toBe("2026-08-09T00:00:00Z");
  });
});

describe("matchAgeLabel", () => {
  const NOW = Date.parse("2026-08-20T12:00:00Z");
  const at = (iso: string) => matchAgeLabel(iso, NOW);

  it("is coarse on purpose — days, never hours", () => {
    expect(at("2026-08-20T01:00:00Z")).toBe("Today");
    expect(at("2026-08-19T01:00:00Z")).toBe("Yesterday");
    expect(at("2026-08-17T01:00:00Z")).toBe("3 days ago");
    expect(at("2026-08-12T01:00:00Z")).toBe("Last week");
    expect(at("2026-07-20T01:00:00Z")).toBe("4 weeks ago");
    expect(at("2026-05-20T01:00:00Z")).toBe("3 months ago");
  });

  it("returns null rather than rendering an unparseable date", () => {
    expect(matchAgeLabel(null)).toBeNull();
    expect(matchAgeLabel("not-a-date")).toBeNull();
  });
});
