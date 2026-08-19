import { describe, expect, it } from "vitest";
import { RANK_TIERS } from "./tiers";
import { resolveTierArt } from "./art";

describe("RE1 track-scoped tier art", () => {
  it("resolves a Mogzy crown for all five Academy tiers", () => {
    for (const tier of RANK_TIERS) {
      const art = resolveTierArt("academy", tier);
      expect(art).toEqual({
        track: "academy",
        tier,
        src: `/images/ranked/crowns/${tier}.png`,
        backendRelative: false,
      });
    }
  });

  it("resolves Ranked to the existing backend League emblem family", () => {
    for (const tier of RANK_TIERS) {
      expect(resolveTierArt("ranked", tier)).toEqual({
        track: "ranked",
        tier,
        src: `assets/ranks/large/${tier}.png`,
        backendRelative: true,
      });
    }
    expect(resolveTierArt("ranked", "gold", { size: "small" })?.src).toBe(
      "assets/ranks/small/gold.png",
    );
  });

  it("keeps the two art families disjoint", () => {
    for (const tier of RANK_TIERS) {
      const academy = resolveTierArt("academy", tier)!;
      const ranked = resolveTierArt("ranked", tier)!;
      expect(academy.src).not.toBe(ranked.src);
      expect(academy.src).not.toContain("assets/ranks/");
      expect(ranked.src).not.toContain("crowns");
    }
  });

  it("returns null for unsupported tracks and legacy tiers", () => {
    expect(resolveTierArt("academy", "iron")).toBeNull();
    expect(resolveTierArt("ranked", "platinum")).toBeNull();
    expect(resolveTierArt("elo", "gold")).toBeNull();
    expect(resolveTierArt("jungle", "gold")).toBeNull();
    expect(resolveTierArt(null, null)).toBeNull();
  });
});
