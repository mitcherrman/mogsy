/**
 * RE1 Phase 2B — validation of the Academy progression block.
 *
 * This module re-derives nothing, so there is no threshold arithmetic to test
 * here. What IS worth testing is the rejection surface: the wire is untrusted,
 * every field arrives as `unknown`, and rendering half a migration is worse
 * than rendering none of it.
 */
import { describe, expect, it } from "vitest";
import { academyTierLabel, parseAcademyProgression } from "./academy";
import { RANK_TIERS } from "./tiers";

const GOLD = {
  academy_tier: "gold",
  academy_next_tier: "diamond",
  academy_current_tier_xp: 1500,
  academy_next_tier_xp: 3000,
  academy_xp_to_next: 750,
  academy_progress_percent: 50,
};

const CHALLENGER = {
  academy_tier: "challenger",
  academy_next_tier: null,
  academy_current_tier_xp: 6000,
  academy_next_tier_xp: null,
  academy_xp_to_next: 0,
  academy_progress_percent: 100,
};

describe("parseAcademyProgression — accepted payloads", () => {
  it("passes a mid-tier block through verbatim, without recomputing it", () => {
    expect(parseAcademyProgression(GOLD)).toEqual({
      tier: "gold",
      nextTier: "diamond",
      currentTierXp: 1500,
      nextTierXp: 3000,
      xpToNext: 750,
      progressPercent: 50,
      isMaxTier: false,
    });
  });

  it("treats Challenger as the terminal state", () => {
    expect(parseAcademyProgression(CHALLENGER)).toEqual({
      tier: "challenger",
      nextTier: null,
      currentTierXp: 6000,
      nextTierXp: null,
      xpToNext: 0,
      progressPercent: 100,
      isMaxTier: true,
    });
  });

  it("accepts an omitted next tier at Challenger, not just an explicit null", () => {
    const parsed = parseAcademyProgression({
      academy_tier: "challenger",
      academy_current_tier_xp: 6000,
      academy_progress_percent: 100,
    });
    expect(parsed?.isMaxTier).toBe(true);
    expect(parsed?.nextTier).toBeNull();
  });

  it("normalizes tier tokens case-insensitively", () => {
    expect(parseAcademyProgression({ ...GOLD, academy_tier: "  GOLD " })?.tier).toBe("gold");
  });

  it.each([
    ["over 100", 140, 100],
    ["under 0", -20, 0],
  ])("clamps a percentage %s, since that is rounding noise not a broken tier", (_l, given, expected) => {
    expect(
      parseAcademyProgression({ ...GOLD, academy_progress_percent: given })?.progressPercent,
    ).toBe(expected);
  });
});

describe("parseAcademyProgression — rejected payloads keep legacy rendering", () => {
  it.each([
    ["null progress", null],
    ["undefined progress", undefined],
    ["no academy block at all", { total_xp: 2500, rank_name: "Platinum" }],
    ["a legacy League tier", { ...GOLD, academy_tier: "platinum" }],
    ["an unranked token", { ...GOLD, academy_tier: "Unranked" }],
    ["a numeric tier", { ...GOLD, academy_tier: 3 }],
    ["a missing floor", { ...GOLD, academy_current_tier_xp: undefined }],
    ["a stringly-typed floor", { ...GOLD, academy_current_tier_xp: "1500" }],
    ["a negative floor", { ...GOLD, academy_current_tier_xp: -1 }],
    ["a missing percentage", { ...GOLD, academy_progress_percent: undefined }],
    ["a NaN percentage", { ...GOLD, academy_progress_percent: Number.NaN }],
    ["an infinite percentage", { ...GOLD, academy_progress_percent: Infinity }],
    ["a legacy next tier", { ...GOLD, academy_next_tier: "emerald" }],
    ["a missing ceiling below Challenger", { ...GOLD, academy_next_tier_xp: undefined }],
    ["an inverted interval", { ...GOLD, academy_next_tier_xp: 1000 }],
    ["a zero-width interval", { ...GOLD, academy_next_tier_xp: 1500 }],
  ])("rejects %s", (_label, payload) => {
    expect(parseAcademyProgression(payload as never)).toBeNull();
  });

  it("rejects a non-Challenger tier with no tier above it", () => {
    // A broken migration, NOT a max tier — rendering it as one would tell a
    // Gold player they had finished the ladder.
    expect(
      parseAcademyProgression({
        ...GOLD,
        academy_next_tier: null,
        academy_next_tier_xp: null,
      }),
    ).toBeNull();
  });

  it("rejects a Challenger payload that claims a ceiling", () => {
    expect(
      parseAcademyProgression({
        ...CHALLENGER,
        academy_next_tier_xp: 9000,
      }),
    ).toBeNull();
  });
});

describe("academyTierLabel", () => {
  it.each(RANK_TIERS)("labels %s with explicit Academy language", (tier) => {
    const label = academyTierLabel(tier);
    expect(label.startsWith("Academy ")).toBe(true);
    expect(label.toLowerCase()).toContain(tier);
  });

  it("produces the five approved labels", () => {
    expect(RANK_TIERS.map(academyTierLabel)).toEqual([
      "Academy Bronze",
      "Academy Silver",
      "Academy Gold",
      "Academy Diamond",
      "Academy Challenger",
    ]);
  });
});
