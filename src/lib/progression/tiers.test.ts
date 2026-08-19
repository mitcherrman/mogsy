import { describe, expect, it } from "vitest";
import {
  RANK_TIERS,
  RANK_TRACKS,
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
