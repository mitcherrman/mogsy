import { describe, expect, it } from "vitest";
import { getGlossaryTerm } from "@/lib/lol-glossary/registry";
import { JOURNEY_FORMULAS, JOURNEY_FORMULA_GLOSSARY_IDS } from "./formulas";
import { evaluate } from "./calculator";

describe("Journey formula reference (JX2)", () => {
  it("is pinned to the approved reference list (reference, not question support)", () => {
    // A general mechanics reference. Magic resistance is listed although no
    // Journey child deals magic damage today (combat_working.v1 is physical).
    expect(JOURNEY_FORMULAS.map((f) => f.id)).toEqual([
      "ability-cooldown", "armor-penetration", "physical-mitigation", "magic-mitigation",
    ]);
  });

  it("lists nothing without a canonical source (movement speed, shields, bonus armor pen)", () => {
    const text = JOURNEY_FORMULAS.flatMap((f) => [f.title, ...f.lines]).join(" ").toLowerCase();
    expect(text).not.toMatch(/movement|move speed|shield|bonus armor|magic_pen/);
  });

  it("reuses the glossary's exact formula text rather than restating it", () => {
    const lines = JOURNEY_FORMULAS.flatMap((f) => f.lines);
    for (const id of JOURNEY_FORMULA_GLOSSARY_IDS) {
      expect(lines).toContain(getGlossaryTerm(id)?.formula);
    }
  });

  it("states penetration in the backend's order: percent, then flat", () => {
    const pen = JOURNEY_FORMULAS.find((f) => f.id === "armor-penetration")!;
    expect(pen.lines[0]).toMatch(/armor_pen_percent/);
    expect(pen.lines[1]).toMatch(/max\(0, .*lethality \+ flat_armor_pen/);
  });

  it("worked examples agree with the formulas", () => {
    // armor 80, 30% pen, 10 lethality → 46; raw 200 vs 46 armor.
    expect(evaluate("80×(1−0.3)−10")).toBeCloseTo(46);
    expect(evaluate("200×100÷(100+46)")).toBeCloseTo(136.99, 2);
    expect(evaluate("200×100÷(100+50)")).toBeCloseTo(133.33, 2);
  });
});
