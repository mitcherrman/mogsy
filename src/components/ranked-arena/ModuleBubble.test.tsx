/**
 * RM1 Pass 1 — the module-history bubble's vocabulary.
 *
 * What is fixed here is the one rule the component exists for: the NUMBER is
 * the base award and the DOT is the bonus, and the two are never merged. A
 * `+2` with a dot banked three points and still reads `+2`.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModuleBubble, moduleBubbleGlyph, moduleBubbleLabel } from "./ModuleBubble";

const bubble = (basePoints: number | null, speedBonusPoints?: number | null) => {
  render(<ModuleBubble basePoints={basePoints} speedBonusPoints={speedBonusPoints} />);
  return screen.getByTestId("module-bubble");
};

describe("ModuleBubble", () => {
  it("+0 with no speed bonus is a zero bubble, and says so in words", () => {
    const el = bubble(0);
    expect(el).toHaveTextContent("+0");
    expect(el).toHaveAttribute("data-base-points", "0");
    expect(el).toHaveAttribute("data-speed-bonus", "false");
    expect(el).toHaveAccessibleName("0 points");
    // The zero treatment is the destructive one, and it carries no dot.
    expect(el.className).toContain("destructive");
    expect(screen.queryByTestId("module-bubble-speed")).toBeNull();
  });

  it("+1 with no speed bonus is a positive bubble with no dot", () => {
    const el = bubble(1, 0);
    expect(el).toHaveTextContent("+1");
    expect(el).toHaveAttribute("data-speed-bonus", "false");
    // Singular, because one point is not "1 base points".
    expect(el).toHaveAccessibleName("1 base point");
    expect(el.className).toContain("emerald");
    expect(screen.queryByTestId("module-bubble-speed")).toBeNull();
  });

  it("+2 with a speed bonus keeps the BASE in the glyph and flags the bonus", () => {
    const el = bubble(2, 1);
    // The whole rule: three points were banked, and the bubble says +2.
    expect(el).toHaveTextContent("+2");
    expect(el).not.toHaveTextContent("+3");
    expect(el).toHaveAttribute("data-base-points", "2");
    expect(el).toHaveAttribute("data-speed-bonus", "true");
    expect(el).toHaveAccessibleName("2 base points, plus 1 speed bonus");
    expect(screen.getByTestId("module-bubble-speed")).toBeTruthy();
  });

  it("+3 with a speed bonus does the same at the top of the range", () => {
    const el = bubble(3, 1);
    expect(el).toHaveTextContent("+3");
    expect(el).not.toHaveTextContent("+4");
    expect(el).toHaveAttribute("data-base-points", "3");
    expect(el).toHaveAccessibleName("3 base points, plus 1 speed bonus");
    expect(screen.getByTestId("module-bubble-speed")).toBeTruthy();
  });

  it("a module the settlement never scored is neutral, not a zero", () => {
    // `null` is "no award was published"; rendering it as +0 would be the
    // claim that the module scored this player nothing.
    const el = bubble(null);
    expect(el).toHaveTextContent("—");
    expect(el).toHaveAttribute("data-base-points", "none");
    expect(el).toHaveAccessibleName("Module not scored");
    expect(el.className).not.toContain("emerald");
    expect(el.className).not.toContain("destructive");
  });

  it("colour is never the only channel: every state names itself in text", () => {
    expect(moduleBubbleLabel(0, 0)).toBe("0 points");
    expect(moduleBubbleLabel(2, 0)).toBe("2 base points");
    expect(moduleBubbleLabel(2, 1)).toBe("2 base points, plus 1 speed bonus");
    expect(moduleBubbleLabel(null, 1)).toBe("Module not scored");
  });

  it("the glyph performs no arithmetic", () => {
    expect(moduleBubbleGlyph(0)).toBe("+0");
    expect(moduleBubbleGlyph(3)).toBe("+3");
    expect(moduleBubbleGlyph(null)).toBe("—");
  });
});
