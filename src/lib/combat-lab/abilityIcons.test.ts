import { describe, expect, it } from "vitest";
import {
  abilityVariantToken,
  getAbilityIconUrl,
  getChampionSquareIconUrl,
  inferActionAbilitySlot,
  toneForSlot,
} from "./abilityIcons";

/**
 * The Combat Lab's ability buttons show Mogzy's own stored ability art. These
 * pin the two things that make that work: resolving a champion + slot to the
 * real asset path, and deciding which parent ability a champion-specific
 * runtime action belongs to — which must never be a guess, because a wrong
 * guess renders another ability's artwork.
 */

describe("getAbilityIconUrl", () => {
  it("resolves a slot to the stored asset path on the combat asset host", () => {
    expect(getAbilityIconUrl("Aatrox", "Q")).toMatch(
      /\/assets\/champions\/Aatrox\/Q_AatroxQ\.png$/,
    );
    expect(getAbilityIconUrl("Aatrox", "Q")).toMatch(/^https?:\/\//);
  });

  it("uses the stored Riot spell key rather than deriving it from the name", () => {
    // Lux's icons are named after her spells, not her slots.
    expect(getAbilityIconUrl("Lux", "Q")).toContain("/Lux/Q_LuxLightBinding.png");
    expect(getAbilityIconUrl("Lux", "E")).toContain("/Lux/E_LuxLightStrikeKugel.png");
  });

  it("maps a champion onto the real asset directory, not the display name", () => {
    // Wukong's art lives under MonkeyKing; Kai'Sa's directory drops the apostrophe
    // *and* the capital S, which the backend's own folder field gets wrong.
    expect(getAbilityIconUrl("Wukong", "R")).toContain("/MonkeyKing/R_MonkeyKingSpinToWin.png");
    expect(getAbilityIconUrl("Kai'Sa", "Q")).toContain("/Kaisa/Q_KaisaQ.png");
  });

  it("matches champion names regardless of punctuation or case", () => {
    const canonical = getAbilityIconUrl("Kai'Sa", "W");
    expect(getAbilityIconUrl("KaiSa", "W")).toBe(canonical);
    expect(getAbilityIconUrl("kai sa", "W")).toBe(canonical);
  });

  it("resolves the passive to the single stored passive image", () => {
    expect(getAbilityIconUrl("Ahri", "P")).toContain("/Ahri/passive.png");
  });

  it("returns null for an unknown or empty champion instead of inventing a path", () => {
    expect(getAbilityIconUrl("Not A Champion", "Q")).toBeNull();
    expect(getAbilityIconUrl("", "Q")).toBeNull();
    expect(getAbilityIconUrl(undefined, "R")).toBeNull();
  });

  it("resolves the champion square icon for actions with no parent ability", () => {
    expect(getChampionSquareIconUrl("Zeri")).toContain("/Zeri/icon.png");
    expect(getChampionSquareIconUrl("Not A Champion")).toBeNull();
  });
});

describe("abilityVariantToken", () => {
  it("reads the leading key token off a variant label", () => {
    expect(abilityVariantToken("Q1 - The Darkin Blade")).toBe("Q1");
    expect(abilityVariantToken("Q1 Sweetspot")).toBe("Q1");
    expect(abilityVariantToken("QQ - Devastating Fire")).toBe("QQ");
    expect(abilityVariantToken("R - Spiraling Despair")).toBe("R");
  });

  it("does not treat a coincidental leading letter as a key", () => {
    expect(abilityVariantToken("Rend")).toBeNull();
    expect(abilityVariantToken("Weapon Q")).toBeNull();
    expect(abilityVariantToken("Basic Zap")).toBeNull();
    expect(abilityVariantToken("")).toBeNull();
  });
});

describe("inferActionAbilitySlot", () => {
  it("prefers the label's key token", () => {
    expect(inferActionAbilitySlot("aatrox_q2_sweetspot", "Q2 Sweetspot")).toBe("Q");
    expect(inferActionAbilitySlot("hwei_we", "WE - Stirring Lights")).toBe("W");
    expect(inferActionAbilitySlot("hwei_r", "R - Spiraling Despair")).toBe("R");
  });

  it("falls back to a slot suffix on the action id", () => {
    expect(inferActionAbilitySlot("aphelios_q", "Weapon Q")).toBe("Q");
    expect(inferActionAbilitySlot("xin_zhao_q", "Three Talon Strike")).toBe("Q");
    expect(inferActionAbilitySlot("aatrox_q3_sweetspot", null)).toBe("Q");
    expect(inferActionAbilitySlot("hwei_eq", null)).toBe("E");
  });

  it("uses the curated hint for actions that name no slot at all", () => {
    expect(inferActionAbilitySlot("kalista_rend", "Rend")).toBe("E");
    expect(inferActionAbilitySlot("varus_blight", "Detonate Blight")).toBe("W");
    expect(inferActionAbilitySlot("katarina_death_lotus", "Death Lotus")).toBe("R");
  });

  it("returns null rather than guessing when nothing identifies a parent", () => {
    expect(inferActionAbilitySlot("zeri_charged_attack", "Charged Attack")).toBeNull();
    expect(inferActionAbilitySlot("katarina_pickup_dagger", "Pickup Dagger")).toBeNull();
    expect(inferActionAbilitySlot("aphelios_phase", "Phase")).toBeNull();
    expect(inferActionAbilitySlot(undefined, undefined)).toBeNull();
  });
});

describe("toneForSlot", () => {
  it("gives every castable slot its own accent and defaults to neutral", () => {
    expect(["q", "w", "e", "r"].map((s) => toneForSlot(s))).toEqual(["q", "w", "e", "r"]);
    expect(toneForSlot("P")).toBe("neutral");
    expect(toneForSlot(null)).toBe("neutral");
  });
});
