import { describe, expect, it } from "vitest";
import { evaluate, formatResult, press, type CalcKey } from "./calculator";

const type = (keys: string) => [...keys].reduce((e, k) => press(e, k as CalcKey), "");

describe("calculator (JX2)", () => {
  it("respects precedence and parentheses", () => {
    expect(evaluate("2+3×4")).toBe(14);
    expect(evaluate("(2+3)×4")).toBe(20);
    expect(evaluate("10÷4")).toBe(2.5);
    expect(evaluate("7−10")).toBe(-3);
    expect(evaluate("−(2+3)")).toBe(-5);
  });

  it("returns null for incomplete, malformed or non-finite input", () => {
    for (const bad of ["", "2+", "(2+3", "2)", "1.2.3", "5÷0", "×2"]) {
      expect(evaluate(bad)).toBeNull();
    }
  });

  it("formats without float noise", () => {
    expect(formatResult(evaluate("0.1+0.2")!)).toBe("0.3");
    expect(formatResult(1 / 3)).toBe("0.333333333333");
  });

  it("keeps input sane as keys are pressed", () => {
    expect(type("1..5")).toBe("1.5");
    expect(type(".5")).toBe("0.5");
    expect(type("2+×3")).toBe("2×3");
    expect(type("×2")).toBe("2");
    expect(type("−2")).toBe("−2");
  });
});
