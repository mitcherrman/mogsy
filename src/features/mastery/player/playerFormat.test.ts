import { describe, expect, it } from "vitest";

import {
  championForTarget,
  effectLabel,
  formatNumber,
  humanizeFamily,
  humanizeResource,
  humanizeUnit,
  patchLabel,
} from "./playerFormat";

describe("humanizeUnit", () => {
  it("maps internal stat slugs to player labels", () => {
    expect(humanizeUnit("ability_haste")).toBe("Ability Haste");
    expect(humanizeUnit("magic_resist")).toBe("Magic Resist");
    expect(humanizeUnit("ap")).toBe("AP");
    expect(humanizeUnit("health")).toBe("HP");
  });
  it("title-cases unknown slugs and never returns the raw slug", () => {
    expect(humanizeUnit("some_new_stat")).toBe("Some New Stat");
    expect(humanizeUnit(null)).toBe("");
  });
});

describe("formatNumber", () => {
  it("keeps integers and rounds long floats to <=2 dp", () => {
    expect(formatNumber(20)).toBe("20");
    expect(formatNumber(0.7692307)).toBe("0.77");
    expect(formatNumber(10.0)).toBe("10");
  });
});

describe("patchLabel", () => {
  it("extracts a single clean patch and never exposes the internal wording", () => {
    expect(patchLabel("Mixed verified snapshot — League 26.13 context")).toBe("Patch 26.13");
    expect(patchLabel("16.12.1")).toBe("Patch 16.12");
    expect(patchLabel("Mixed snapshot")).toBe("Fixed scenario");
    expect(patchLabel(null)).toBe("Fixed scenario");
  });
});

describe("championForTarget / effect / resource / family", () => {
  it("maps A/B target codes to champion names", () => {
    expect(championForTarget("A", "Ahri", "Syndra")).toBe("Ahri");
    expect(championForTarget("B", "Ahri", "Syndra")).toBe("Syndra");
  });
  it("labels an effect with no internal slug or duplicate value", () => {
    expect(effectLabel({ label: "Ability Haste (authored)", magnitude: 20, unit: "ability_haste" }))
      .toBe("+20 Ability Haste");
  });
  it("humanizes resource and question-family names", () => {
    expect(humanizeResource("mana")).toBe("Mana");
    expect(humanizeFamily("health_remaining")).toBe("Damage & lethality");
    expect(humanizeFamily("cooldown_comparison")).toBe("Cooldown comparison");
  });
});
