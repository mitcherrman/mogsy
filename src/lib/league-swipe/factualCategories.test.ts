/**
 * The game → factual-category binding.
 *
 * This mapping is what decides whether an answer gets a CANONICAL verdict or
 * silently falls back to the browser's own comparison. Before it existed, the
 * game slug was passed straight to the verifier: that worked for Item Cost Duel
 * (whose slug happens to equal its category id) and 404'd for every Stat Duel
 * answer, so half the factual surface was never server-verified at all. These
 * tests exist to stop that regressing quietly.
 */
import { describe, expect, it } from "vitest";
import { STAT_KEYS, LEAGUE_SWIPE_GAMES, makeStatMatchup } from "./api";
import {
  resolveFactualCategory,
  UNVERIFIABLE_STAT_VARIANTS,
  VERIFIABLE_STAT_VARIANTS,
} from "./factualCategories";

describe("resolveFactualCategory", () => {
  it("maps Item Cost Duel to the canonical item category", () => {
    expect(resolveFactualCategory("item-cost-duel", "cost")).toBe("item-cost-duel");
    // The variant is irrelevant here: the game asks exactly one fact.
    expect(resolveFactualCategory("item-cost-duel", null)).toBe("item-cost-duel");
  });

  it("maps each Stat Duel variant to its own champion-stat category", () => {
    expect(resolveFactualCategory("higher-base-stat", "hp")).toBe("champion-hp-duel");
    expect(resolveFactualCategory("higher-base-stat", "ad")).toBe("champion-ad-duel");
    expect(resolveFactualCategory("higher-base-stat", "armor")).toBe("champion-armor-duel");
    expect(resolveFactualCategory("higher-base-stat", "move_speed")).toBe("champion-move-speed-duel");
    expect(resolveFactualCategory("higher-base-stat", "attack_range")).toBe("champion-attack-range-duel");
  });

  it("never sends the Stat Duel game slug as if it were a category", () => {
    // The pre-Phase-4 bug: `higher-base-stat` is not a category, so the verifier
    // 404s and the client's own answer stands unchallenged.
    for (const variant of VERIFIABLE_STAT_VARIANTS) {
      expect(resolveFactualCategory("higher-base-stat", variant)).not.toBe("higher-base-stat");
    }
  });

  it("returns null for base magic resist rather than guessing a category", () => {
    expect(resolveFactualCategory("higher-base-stat", "magic_resist")).toBeNull();
  });

  it("returns null for opinion games, which have no factual truth", () => {
    for (const g of LEAGUE_SWIPE_GAMES.filter((g) => g.mode === "opinion")) {
      expect(resolveFactualCategory(g.slug, null)).toBeNull();
      expect(resolveFactualCategory(g.slug, "hp")).toBeNull();
    }
  });

  it("returns null for an unknown game or a missing variant", () => {
    expect(resolveFactualCategory("not-a-game", "hp")).toBeNull();
    expect(resolveFactualCategory("higher-base-stat", null)).toBeNull();
    expect(resolveFactualCategory("higher-base-stat", "")).toBeNull();
  });
});

describe("coverage of every stat Stat Duel can actually deal", () => {
  it("maps EVERY dealt stat to an evaluator — a documented gap is no longer enough", () => {
    // Strengthened when base MR left the pool. The old rule ("mapped OR listed as
    // a known gap") was satisfied by a stat that could be dealt and never judged,
    // which is exactly the ~1-in-6 unscored Stat Duel round that got MR removed.
    // Now that score and streak are canonical-only, an unjudgeable stat in the
    // deal is a scoring hole, so the dealt pool must be fully mapped.
    for (const { key } of STAT_KEYS) {
      expect(
        resolveFactualCategory("higher-base-stat", key),
        `stat "${key}" is dealt by Stat Duel but has no canonical evaluator, so ` +
          `every round asking it would be unscored — map it, or drop it from STAT_KEYS`,
      ).not.toBeNull();
    }
  });

  it("deals no stat that is on the unverifiable register", () => {
    // The same rule from the other direction, stated against the register itself,
    // so re-adding a known-unjudgeable stat to the deal fails here too.
    for (const variant of Object.keys(UNVERIFIABLE_STAT_VARIANTS)) {
      expect(
        STAT_KEYS.some((s) => s.key === variant),
        `"${variant}" is registered as having no canonical evaluator but is still ` +
          `in STAT_KEYS — Stat Duel would deal a round it cannot score`,
      ).toBe(false);
    }
  });

  it("base magic resist specifically is out of the playable pool", () => {
    expect(STAT_KEYS.map((s) => s.key)).not.toContain("magic_resist");
    // Data support is NOT withdrawn. The stat is still fetched and typed, and a
    // STORED MR answer still resolves to unjudged rather than to wrong, so old
    // history keeps reading correctly.
    expect(resolveFactualCategory("higher-base-stat", "magic_resist")).toBeNull();
    expect(UNVERIFIABLE_STAT_VARIANTS).toHaveProperty("magic_resist");
  });

  it("documents a reason for every declared gap", () => {
    for (const [variant, reason] of Object.entries(UNVERIFIABLE_STAT_VARIANTS)) {
      expect(reason.length, `${variant} needs a reason`).toBeGreaterThan(10);
      expect(resolveFactualCategory("higher-base-stat", variant)).toBeNull();
    }
  });
});

describe("what the Stat Duel generator can actually put on screen", () => {
  // Asserting against STAT_KEYS proves the CONFIG is right; this drives the real
  // generator instead, because the config only matters through what it deals.
  // Stats are pairwise-distinct on every key so the tie-rejection loop always
  // finds a matchup on its first attempt and the sample stays uniform.
  const GAME = LEAGUE_SWIPE_GAMES.find((g) => g.slug === "higher-base-stat")!;
  const ROSTER = [
    { champion_name: "Garen", hp: 690, hp_per_level: 98, ad: 69, ad_per_level: 4.5, armor: 38, armor_per_level: 4.7, magic_resist: 32, magic_resist_per_level: 2.05, move_speed: 340, attack_range: 175, attack_speed: 0.625 },
    { champion_name: "Ahri", hp: 590, hp_per_level: 96, ad: 53, ad_per_level: 3, armor: 21, armor_per_level: 4.7, magic_resist: 30, magic_resist_per_level: 1.3, move_speed: 330, attack_range: 550, attack_speed: 0.668 },
    { champion_name: "Caitlyn", hp: 580, hp_per_level: 107, ad: 60, ad_per_level: 3.8, armor: 27, armor_per_level: 4.7, magic_resist: 28, magic_resist_per_level: 1.3, move_speed: 325, attack_range: 650, attack_speed: 0.681 },
  ];

  const deal = (n: number) =>
    Array.from({ length: n }, () => makeStatMatchup(GAME, ROSTER).context?.stat as string);

  it("never deals a base magic resist round", () => {
    // 400 deals over a 5-stat pool: the chance of missing a live variant by luck
    // is ~(4/5)^400, i.e. nil. If MR were still dealable this would catch it.
    expect(deal(400)).not.toContain("magic_resist");
  });

  it("every matchup it deals resolves to a canonical evaluator", () => {
    // The property that actually matters, end to end: nothing reaches a card
    // that the backend cannot judge, so no dealt round can be unscored.
    for (const stat of deal(400)) {
      expect(
        resolveFactualCategory("higher-base-stat", stat),
        `generator dealt "${stat}", which has no canonical evaluator`,
      ).not.toBeNull();
    }
  });

  it("still deals the whole remaining pool, so the removal cost only MR", () => {
    expect(new Set(deal(400))).toEqual(new Set(STAT_KEYS.map((s) => s.key)));
  });
});
