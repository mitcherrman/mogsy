import { describe, expect, it } from "vitest";
import {
  BASELINE_RANK_TIER,
  RANK_TIERS,
  RANK_TRACKS,
  isRankTier,
  parseRankTier,
  parseRankTrack,
  rankTierIndex,
} from "./tiers";

describe("RE1 canonical tier vocabulary", () => {
  it("is exactly the five shared tiers, ascending", () => {
    expect([...RANK_TIERS]).toEqual(["bronze", "silver", "gold", "diamond", "challenger"]);
  });

  it("has exactly two independent tracks", () => {
    expect([...RANK_TRACKS]).toEqual(["academy", "ranked"]);
  });

  it("parses case-insensitively", () => {
    expect(parseRankTier(" Gold ")).toBe("gold");
    expect(parseRankTrack("ACADEMY")).toBe("academy");
  });

  it("rejects legacy League tiers so callers keep legacy rendering", () => {
    for (const legacy of ["iron", "platinum", "emerald", "master", "grandmaster", "Unranked"]) {
      expect(parseRankTier(legacy)).toBeNull();
    }
  });

  it("rejects R1 role names — progression is not role identity", () => {
    for (const role of ["top", "jungle", "mid", "adc", "support"]) {
      expect(parseRankTier(role)).toBeNull();
      expect(parseRankTrack(role)).toBeNull();
    }
  });

  it("rejects non-string input", () => {
    for (const bad of [null, undefined, 3, {}, []]) {
      expect(parseRankTier(bad)).toBeNull();
      expect(parseRankTrack(bad)).toBeNull();
    }
  });

  it("orders tiers ascending", () => {
    expect(rankTierIndex("bronze")).toBe(0);
    expect(rankTierIndex("challenger")).toBe(4);
    expect(rankTierIndex("iron")).toBeNull();
  });
});


/**
 * THE LADDER'S FLOOR — the one rule two surfaces share.
 *
 * Mogzy retired "Unranked": an account with no standing is rendered AT the
 * bottom of the ladder rather than off it. The constant lives here, with the
 * tier vocabulary, because it began as a private const inside the lobby hero —
 * which is exactly why the PLAY1 match-entry record could not reach it and hid
 * its crest instead.
 */
describe("the baseline tier", () => {
  it("is Bronze", () => {
    expect(BASELINE_RANK_TIER).toBe("bronze");
  });

  it("is the FIRST canonical tier, so it cannot drift from the ordering", () => {
    expect(BASELINE_RANK_TIER).toBe(RANK_TIERS[0]);
    expect(rankTierIndex(BASELINE_RANK_TIER)).toBe(0);
  });

  it("is a real tier, so it renders through the same art path as every other", () => {
    // Not a sixth "unranked" token outside the five — that was the old
    // treatment, and it read as "you are not part of this ladder".
    expect(isRankTier(BASELINE_RANK_TIER)).toBe(true);
    expect(parseRankTier("Unranked")).toBeNull();
  });
});
