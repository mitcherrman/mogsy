import { describe, expect, it } from "vitest";
import {
  canonicalLabel,
  canonicalValue,
  compareDecimals,
  formatDecimal,
  isEligibleValue,
  parseDecimal,
  subtractDecimals,
  valueFact,
  valueTemplate,
} from "./value";

const same = (a: string, b: string) => {
  const ca = canonicalValue(a);
  expect(ca).not.toBeNull();
  expect(ca).toBe(canonicalValue(b));
};
const different = (a: string, b: string) => {
  expect(canonicalValue(a)).not.toBeNull();
  expect(canonicalValue(b)).not.toBeNull();
  expect(canonicalValue(a)).not.toBe(canonicalValue(b));
};

describe("canonicalLabel: cosmetic folds only", () => {
  it("folds case, spacing, curly quotes, dashes and a trailing colon", () => {
    expect(canonicalLabel("  Heal   Shield Power: ")).toBe("heal shield power");
    expect(canonicalLabel("Bel’Veth")).toBe(canonicalLabel("Bel'Veth"));
    expect(canonicalLabel("Q – Chain Lash")).toBe("q - chain lash");
    expect(canonicalLabel("Q — Chain Lash")).toBe(canonicalLabel("Q - Chain Lash"));
    expect(canonicalLabel("Q − Chain Lash")).toBe(canonicalLabel("Q - Chain Lash"));
    expect(canonicalLabel("“Quoted”")).toBe('"quoted"');
    expect(canonicalLabel(null)).toBe("");
    expect(canonicalLabel(undefined)).toBe("");
  });

  it("never rewrites tokens (no semantic or fuzzy normalisation)", () => {
    expect(canonicalLabel("Heal & Shield Power")).not.toBe(canonicalLabel("Heal and Shield Power"));
    expect(canonicalLabel("Initial Damage")).not.toBe(canonicalLabel("First Lash Damage"));
    expect(canonicalLabel("Stat Steal")).not.toBe(canonicalLabel("Stolen Stats"));
    expect(canonicalLabel("Slow Amount")).not.toBe(canonicalLabel("Slow Threshold"));
    expect(canonicalLabel("Health")).not.toBe(canonicalLabel("Health Growth"));
    expect(canonicalLabel("Monster Damage")).not.toBe(canonicalLabel("Monster Damage Modifier"));
  });
});

describe("canonicalValue: the enumerated folds (PH3-A §10, §15 token table)", () => {
  it("equal under cosmetic folds", () => {
    same("(+45% AP)", "(+45% Ability Power)");
    same("(+ 80% AP)", "(+80% AP)");
    same("10/14/18", "10 / 14 / 18");
    same(".6%", "0.60%");
    same("18 / 16s", "18 / 16 seconds");
    same("5 sec", "5s");
    same("40 / 65 / 90 / 115 / 140 (+45% AP)", "40 / 65 / 90 / 115 / 140 (+45% Ability Power)");
    same("0.50", ".5");
    same("100.0", "100");
    same("(+80% attack damage)", "(+80% AD)");
    same("10 – 15", "10 - 15");
  });

  it("NOT equal: a unit's presence, trailing text, parentheticals, qualifiers", () => {
    different("5", "5s");
    different("175%", "175% against Monsters");
    different("x 5 (Levels 1 / 6 / 11)", "x 5");
    different("5 -", "5");
    different("13", "13%");
    different("(+40% AD)", "(+40% bonus AD)");
    different("(+40% AD)", "(+40% total AD)");
    different("10 / 15", "10 / 15 / 20");
    different("5%", "5 %");
  });

  it("keeps qualifiers when folding synonyms", () => {
    expect(canonicalValue("(+40% bonus attack damage)")).toBe("(+40% bonus ad)");
    expect(canonicalValue("(+40% total Ability Power)")).toBe("(+40% total ap)");
  });

  it("does not touch digit groups or letter-glued numbers", () => {
    expect(canonicalValue("1,000")).toBe("1,000");
    expect(canonicalValue("Q2 60")).toBe("q2 60");
  });

  it("never reads a number out of a word", () => {
    expect(canonicalValue("100 stacks")).toBe("100 stacks");
    expect(canonicalValue("3 seconds later")).toBe("3s later");
  });
});

describe("value eligibility", () => {
  it("refuses null, digitless, truncated and sentinel values", () => {
    for (const raw of [null, undefined, "", "   ", "On Hit", "Removed", "Every attack", "None", "N/A", "Unchanged"]) {
      expect(isEligibleValue(raw)).toBe(false);
      expect(canonicalValue(raw)).toBeNull();
      expect(valueFact(raw)).toBeNull();
    }
    expect(isEligibleValue("2% (+…. )")).toBe(false);
    expect(isEligibleValue("2% (+...)")).toBe(false);
    expect(isEligibleValue("Passive removed when swapping targets")).toBe(false);
  });

  it("accepts any value with a digit", () => {
    for (const raw of ["0", "13%", "40 / 65 / 90 / 115 / 140 (+45% AP)", "0.6s"]) {
      expect(isEligibleValue(raw)).toBe(true);
    }
  });
});

describe("valueTemplate", () => {
  it("replaces every numeric literal and keeps exact decimals in order", () => {
    expect(valueTemplate("40 / 65 / 90 (+45% ap)")).toEqual({
      template: "# / # / # (+#% ap)",
      numbers: ["40", "65", "90", "45"],
    });
    expect(valueTemplate("0.6s")).toEqual({ template: "#s", numbers: ["0.6"] });
    expect(valueTemplate("13%")).toEqual({ template: "#%", numbers: ["13"] });
  });

  it("separates rank-array lengths, percent placement and ratio basis", () => {
    const t = (raw: string) => valueFact(raw)?.template;
    expect(t("70 / 75 / 80 / 85 / 90")).not.toBe(t("90"));
    expect(t("13%")).not.toBe(t("13"));
    expect(t("(+40% AD)")).not.toBe(t("(+40% bonus AD)"));
  });
});

describe("exact decimals", () => {
  it("never accumulates binary float error", () => {
    const delta = subtractDecimals(parseDecimal("0.3"), parseDecimal("0.1"));
    expect(formatDecimal(delta)).toBe("0.2");
    expect(0.3 - 0.1).not.toBe(0.2); // the float answer this avoids
  });

  it("formats sign, scale and zero", () => {
    expect(formatDecimal(subtractDecimals(parseDecimal("105"), parseDecimal("110")))).toBe("-5");
    expect(formatDecimal(subtractDecimals(parseDecimal("0.5"), parseDecimal("0.5")))).toBe("0");
    expect(formatDecimal(subtractDecimals(parseDecimal("1.25"), parseDecimal("0.5")))).toBe("0.75");
    expect(formatDecimal(subtractDecimals(parseDecimal("0.05"), parseDecimal("0.2")))).toBe("-0.15");
  });

  it("compares across scales", () => {
    expect(compareDecimals(parseDecimal("1.5"), parseDecimal("1.50"))).toBe(0);
    expect(compareDecimals(parseDecimal("1.5"), parseDecimal("1.49"))).toBe(1);
    expect(compareDecimals(parseDecimal("0.9"), parseDecimal("10"))).toBe(-1);
  });
});
