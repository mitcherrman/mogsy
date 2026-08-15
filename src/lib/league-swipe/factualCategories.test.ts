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
import { STAT_KEYS, LEAGUE_SWIPE_GAMES } from "./api";
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
  it("leaves no stat silently unverifiable", () => {
    // The real hazard is additive: someone appends a stat to STAT_KEYS, the game
    // starts asking about it, and every answer quietly stops being verified
    // because nothing failed loudly. Each stat must be either mapped or listed
    // as a known, explained gap.
    for (const { key } of STAT_KEYS) {
      const mapped = resolveFactualCategory("higher-base-stat", key) !== null;
      const knownGap = key in UNVERIFIABLE_STAT_VARIANTS;
      expect(
        mapped || knownGap,
        `stat "${key}" is neither mapped to a factual category nor listed in ` +
          `UNVERIFIABLE_STAT_VARIANTS — Stat Duel would ask it and never verify it`,
      ).toBe(true);
    }
  });

  it("documents a reason for every declared gap", () => {
    for (const [variant, reason] of Object.entries(UNVERIFIABLE_STAT_VARIANTS)) {
      expect(reason.length, `${variant} needs a reason`).toBeGreaterThan(10);
      expect(resolveFactualCategory("higher-base-stat", variant)).toBeNull();
    }
  });
});
