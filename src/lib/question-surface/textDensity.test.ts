import { describe, expect, it } from "vitest";
import {
  ANSWER_DENSITY_BOUNDS, PROMPT_DENSITY_BOUNDS, answerDensity, promptDensity,
} from "./textDensity";

const of = (n: number) => "x".repeat(n);

describe("answerDensity — the grid's tier, from its longest label", () => {
  it("keeps ordinary labels at the arena's own type", () => {
    expect(answerDensity(["Sunfire Aegis", "Heartsteel", "Thornmail", "Randuin's Omen"])).toBe("normal");
    expect(answerDensity([of(ANSWER_DENSITY_BOUNDS.normal), "a"])).toBe("normal");
  });

  it("steps to long, then dense, at the measured bounds", () => {
    expect(answerDensity([of(ANSWER_DENSITY_BOUNDS.normal + 1)])).toBe("long");
    expect(answerDensity([of(ANSWER_DENSITY_BOUNDS.long)])).toBe("long");
    expect(answerDensity([of(ANSWER_DENSITY_BOUNDS.long + 1)])).toBe("dense");
    // The bank's longest real label (76 characters) is dense, not off the scale.
    expect(answerDensity(["Ability Haste, Ability Power, Heal and Shield Power, Mana Regen", of(76)]))
      .toBe("dense");
  });

  it("is decided by the LONGEST label, so every tablet in a grid shares one tier", () => {
    expect(answerDensity(["Yes", "No", of(30)])).toBe("long");
  });

  it("ignores surrounding whitespace, and an empty grid is normal", () => {
    expect(answerDensity([`  ${of(24)}  `])).toBe("normal");
    expect(answerDensity([])).toBe("normal");
  });
});

describe("promptDensity — the prompt's tier, from its length", () => {
  it("keeps ordinary prompts at the arena's own type", () => {
    expect(promptDensity("Which item grants Immolate?")).toBe("normal");
    expect(promptDensity(of(PROMPT_DENSITY_BOUNDS.normal))).toBe("normal");
  });

  it("steps to long, then dense, at the measured bounds", () => {
    expect(promptDensity(of(PROMPT_DENSITY_BOUNDS.normal + 1))).toBe("long");
    expect(promptDensity(of(PROMPT_DENSITY_BOUNDS.long))).toBe("long");
    expect(promptDensity(of(PROMPT_DENSITY_BOUNDS.long + 1))).toBe("dense");
    expect(promptDensity(of(188))).toBe("dense"); // the bank maximum
    expect(promptDensity(of(192))).toBe("dense"); // the RA7 fixture
  });

  // VISCONT1-SSM: the bounds are the PRODUCTION face's (Cinzel, `theme-lol`).
  it("holds the bounds measured in Cinzel, not the body face", () => {
    expect(PROMPT_DENSITY_BOUNDS).toEqual({ normal: 100, long: 144, dense: 192 });
    // The bank's longest real prompt (108) no longer claims four 18px lines on
    // a 360px phone: in Cinzel those hold 102.
    expect(promptDensity(of(108))).toBe("long");
  });

  it("classifies real ssm.combined prompts past the bank as extended", () => {
    const ssm = (spell: string, cd: number, item: string, haste: number) =>
      `${spell} has a ${cd}-second base cooldown. You are running Cosmic Insight `
      + `(18 summoner spell haste) and ${item} (${haste} summoner spell haste). That is `
      + `${18 + haste} summoner spell haste in total. What is ${spell}'s cooldown now?`;
    const real = [
      ssm("Heal", 240, "Crimson Lucidity", 20),
      ssm("Exhaust", 240, "Crimson Lucidity", 20),
      ssm("Ignite", 180, "Ionian Boots of Lucidity", 10),
      ssm("Teleport", 360, "Ionian Boots of Lucidity", 10),
    ];
    expect(real.map((p) => p.length)).toEqual([212, 218, 224, 228]);
    for (const p of real) expect(promptDensity(p)).toBe("extended");
    expect(promptDensity(of(PROMPT_DENSITY_BOUNDS.dense + 1))).toBe("extended");
  });
});
