import { describe, expect, it } from "vitest";
import {
  describeOption,
  optionLabel,
  parseNotation,
  positionCell,
  questionLabel,
} from "./notation";

describe("QI1 notation · question and option labels", () => {
  it("labels rows A1, A2, … from the 0-based index in the full result", () => {
    expect(questionLabel(0)).toBe("A1");
    expect(questionLabel(49)).toBe("A50");
    expect(questionLabel(50)).toBe("A51"); // page 2 continues, never restarts
  });

  it("names an option by its DISPLAYED position", () => {
    expect(optionLabel("A1", 4)).toBe("A1.4");
    expect(optionLabel("A12", 1)).toBe("A12.1");
  });

  it("refuses indexes and positions that cannot exist", () => {
    expect(() => questionLabel(-1)).toThrow(RangeError);
    expect(() => questionLabel(1.5)).toThrow(RangeError);
    expect(() => optionLabel("A1", 0)).toThrow(RangeError);
  });

  it("round-trips through the parser and refuses anything else", () => {
    expect(parseNotation("A1")).toEqual({ question: 1, position: null });
    expect(parseNotation("A1.4")).toEqual({ question: 1, position: 4 });
    expect(parseNotation(" A23.2 ")).toEqual({ question: 23, position: 2 });
    for (const bad of ["", "A0", "A01", "A1.0", "a1", "B1", "A1.4.2", "A1.", "1.4", "A-1"]) {
      expect(parseNotation(bad), bad).toBeNull();
    }
    const label = questionLabel(6);
    expect(parseNotation(optionLabel(label, 3))).toEqual({ question: 7, position: 3 });
  });
});

describe("QI1 mapping · displayed position → screen cell", () => {
  it("lays four options out 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right", () => {
    expect(positionCell(1, 4)).toEqual({ row: 0, col: 0, name: "top-left" });
    expect(positionCell(2, 4)).toEqual({ row: 0, col: 1, name: "top-right" });
    expect(positionCell(3, 4)).toEqual({ row: 1, col: 0, name: "bottom-left" });
    expect(positionCell(4, 4)).toEqual({ row: 1, col: 1, name: "bottom-right" });
  });

  it("keeps a three-option question on the same grid", () => {
    expect(positionCell(3, 3)).toEqual({ row: 1, col: 0, name: "bottom-left" });
  });

  it("reads a two-option card (Meta Reflex) as left / right on one row", () => {
    expect(positionCell(1, 2)).toEqual({ row: 0, col: 0, name: "left" });
    expect(positionCell(2, 2)).toEqual({ row: 0, col: 1, name: "right" });
  });

  it("keeps filling rows of two beyond four options, without inventing corner names", () => {
    expect(positionCell(5, 6)).toEqual({ row: 2, col: 0, name: null });
    expect(positionCell(6, 6)).toEqual({ row: 2, col: 1, name: null });
  });

  it("describes options for tooltips", () => {
    expect(describeOption("A1", 4, 4)).toBe("A1.4 · bottom-right");
    expect(describeOption("A3", 2, 2)).toBe("A3.2 · right");
    expect(describeOption("A3", 5, 6)).toBe("A3.5");
    expect(() => positionCell(0, 4)).toThrow(RangeError);
  });
});
