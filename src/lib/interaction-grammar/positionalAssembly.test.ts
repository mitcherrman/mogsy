import { describe, expect, it } from "vitest";
import {
  assemblyStageAt, assertPositionalAssemblyContent, clearPosition, emptyBoard, filledCount, firstEmpty, gridMove,
  insideRect, isBoardFull, markDelayMs, monogramFor, normalizeBoard, placeCard, placedTokens, planAssemblyReveal,
  positionForDigit, positionOf, settleDelayMs, showsContext, showsSettled, snapToPosition, ASSEMBLY_TIMING,
} from "./positionalAssembly";

const content = {
  positions: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
  cards: ["x", "y", "z", "w", "v"].map((t) => ({ token: t, label: t.toUpperCase() })),
};

describe("content assertions", () => {
  it("accepts 2–8 distinct positions and at least as many distinct cards", () => {
    expect(() => assertPositionalAssemblyContent(content)).not.toThrow();
    expect(() => assertPositionalAssemblyContent({ positions: [content.positions[0]], cards: content.cards })).toThrow(/positions/);
    expect(() => assertPositionalAssemblyContent({ positions: [...content.positions, { id: "a", label: "dup" }], cards: content.cards })).toThrow(/distinct/);
    expect(() => assertPositionalAssemblyContent({ positions: content.positions, cards: content.cards.slice(0, 2) })).toThrow(/cards/);
    expect(() => assertPositionalAssemblyContent({ positions: content.positions, cards: [...content.cards, { token: "x", label: "dup" }] })).toThrow(/tokens/);
  });
});

describe("board invariants", () => {
  it("starts empty with every position present", () => {
    expect(emptyBoard(content)).toEqual({ a: null, b: null, c: null });
    expect(isBoardFull(emptyBoard(content))).toBe(false);
  });
  it("normalizes: unknown tokens drop, a duplicate keeps its first position, every position is present", () => {
    expect(normalizeBoard(content, { a: "x", b: "x", c: "nope" })).toEqual({ a: "x", b: null, c: null });
    expect(normalizeBoard(content, null)).toEqual({ a: null, b: null, c: null });
    expect(normalizeBoard(content, { b: "y" })).toEqual({ a: null, b: "y", c: null });
  });
  it("places into an empty position", () => {
    const out = placeCard(emptyBoard(content), "b", "x");
    expect(out).toEqual({ kind: "placed", next: { a: null, b: "x", c: null } });
  });
  it("replaces an occupant from the tray, sending it back", () => {
    const out = placeCard({ a: null, b: "x", c: null }, "b", "y");
    expect(out).toEqual({ kind: "replaced", next: { a: null, b: "y", c: null }, displaced: "x" });
  });
  it("moves a seated card to an empty position, leaving its old one empty", () => {
    const out = placeCard({ a: "x", b: null, c: null }, "c", "x");
    expect(out).toEqual({ kind: "moved", next: { a: null, b: null, c: "x" }, from: "a" });
  });
  it("swaps two seated cards", () => {
    const out = placeCard({ a: "x", b: "y", c: null }, "b", "x");
    expect(out).toEqual({ kind: "swapped", next: { a: "y", b: "x", c: null }, from: "a", other: "y" });
  });
  it("reports 'same' and 'invalid' without changing the board", () => {
    expect(placeCard({ a: "x", b: null, c: null }, "a", "x").kind).toBe("same");
    expect(placeCard({ a: "x", b: null, c: null }, "zz", "y").kind).toBe("invalid");
  });
  it("never holds a card in two positions nor two cards in one, over a random walk", () => {
    let board: Record<string, string | null> = emptyBoard(content);
    let seed = 7;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 500; i++) {
      const pos = content.positions[Math.floor(rnd() * 3)].id;
      if (rnd() < 0.2) { board = clearPosition(board, pos).next; continue; }
      const tok = content.cards[Math.floor(rnd() * 5)].token;
      board = placeCard(board, pos, tok).next;
      const placed = Object.values(board).filter((t) => t !== null);
      expect(new Set(placed).size).toBe(placed.length);
      expect(Object.keys(board).sort()).toEqual(["a", "b", "c"]);
    }
  });
  it("clears, counts, finds and locates", () => {
    const board = { a: "x", b: null, c: "z" };
    expect(clearPosition(board, "a")).toEqual({ next: { a: null, b: null, c: "z" }, removed: "x" });
    expect(clearPosition(board, "b").removed).toBeNull();
    expect(filledCount(board)).toBe(2);
    expect(firstEmpty(content, board)).toBe("b");
    expect(firstEmpty(content, { a: "x", b: "y", c: "z" })).toBeNull();
    expect(positionOf(board, "z")).toBe("c");
    expect(positionOf(board, "y")).toBeNull();
    expect([...placedTokens(board)].sort()).toEqual(["x", "z"]);
    expect(isBoardFull({ a: "x", b: "y", c: "z" })).toBe(true);
  });
});

describe("pointer geometry", () => {
  const rects = [
    { id: "a", rect: { left: 0, top: 0, right: 50, bottom: 50 } },
    { id: "b", rect: { left: 60, top: 0, right: 110, bottom: 50 } },
  ];
  it("snaps to the nearest position inside the grown region and nowhere outside it", () => {
    expect(snapToPosition({ x: 55, y: 25 }, rects, { x: 10, y: 10 })).toBe("a");
    expect(snapToPosition({ x: 58, y: 25 }, rects, { x: 10, y: 10 })).toBe("b");
    expect(snapToPosition({ x: 25, y: 58 }, rects, { x: 10, y: 10 })).toBe("a");
    expect(snapToPosition({ x: 25, y: 61 }, rects, { x: 10, y: 10 })).toBeNull();
    expect(snapToPosition({ x: 0, y: 0 }, [], { x: 10, y: 10 })).toBeNull();
  });
  it("insideRect honours slack", () => {
    const r = { left: 10, top: 10, right: 20, bottom: 20 };
    expect(insideRect({ x: 5, y: 15 }, r, { x: 5, y: 0 })).toBe(true);
    expect(insideRect({ x: 4, y: 15 }, r, { x: 5, y: 0 })).toBe(false);
  });
});

describe("keyboard", () => {
  it("moves inside a grid and stays put at the edges", () => {
    expect(gridMove("ArrowRight", 0, 10, 5)).toBe(1);
    expect(gridMove("ArrowLeft", 0, 10, 5)).toBe(0);
    expect(gridMove("ArrowDown", 2, 10, 5)).toBe(7);
    expect(gridMove("ArrowDown", 7, 10, 5)).toBe(7);
    expect(gridMove("ArrowUp", 7, 10, 5)).toBe(2);
    expect(gridMove("Home", 7, 10, 5)).toBe(0);
    expect(gridMove("End", 0, 10, 5)).toBe(9);
    expect(gridMove("Enter", 3, 10, 5)).toBeNull();
  });
  it("maps digit keys to positions within range", () => {
    expect(positionForDigit("1", 5)).toBe(0);
    expect(positionForDigit("5", 5)).toBe(4);
    expect(positionForDigit("6", 5)).toBeNull();
    expect(positionForDigit("0", 5)).toBeNull();
    expect(positionForDigit("a", 5)).toBeNull();
  });
});

describe("reveal plan", () => {
  it("is instant under reduced motion", () => {
    const plan = planAssemblyReveal({ reduced: true, anyWrong: true });
    expect(plan.instant).toBe(true);
    expect(assemblyStageAt(plan, 0)).toBe("done");
  });
  it("runs marks → settle → context → done when something is wrong, within 2 s", () => {
    const plan = planAssemblyReveal({ reduced: false, anyWrong: true });
    expect(plan.stages.map((s) => s.stage)).toEqual(["marks", "settle", "context"]);
    expect(plan.totalMs).toBe(ASSEMBLY_TIMING.contextEnd);
    expect(plan.totalMs).toBeLessThanOrEqual(2000);
    expect(assemblyStageAt(plan, 0)).toBe("marks");
    expect(assemblyStageAt(plan, ASSEMBLY_TIMING.marksEnd)).toBe("settle");
    expect(assemblyStageAt(plan, ASSEMBLY_TIMING.settleEnd)).toBe("context");
    expect(assemblyStageAt(plan, ASSEMBLY_TIMING.contextEnd)).toBe("done");
  });
  it("skips settle when every position is right, with no gap", () => {
    const plan = planAssemblyReveal({ reduced: false, anyWrong: false });
    expect(plan.stages.map((s) => s.stage)).toEqual(["marks", "context"]);
    expect(plan.stages[1].start).toBe(ASSEMBLY_TIMING.marksEnd);
    expect(assemblyStageAt(plan, ASSEMBLY_TIMING.marksEnd)).toBe("context");
  });
  it("stage predicates", () => {
    expect(showsSettled("marks")).toBe(false);
    expect(showsSettled("settle")).toBe(true);
    expect(showsContext("settle")).toBe(false);
    expect(showsContext("context")).toBe(true);
    expect(showsContext("done")).toBe(true);
  });
  it("staggers end inside their windows for eight positions", () => {
    const T = ASSEMBLY_TIMING;
    expect(markDelayMs(7) + T.markTween).toBeLessThanOrEqual(T.marksEnd);
    expect(settleDelayMs(7) + T.settleTween).toBeLessThanOrEqual(T.settleEnd - T.marksEnd);
    expect(markDelayMs(0)).toBe(0);
    expect(settleDelayMs(1)).toBe(T.settleStagger);
  });
});

describe("monograms", () => {
  it("takes two letters of one word, initials of two, and ignores parentheticals", () => {
    expect(monogramFor("Crown")).toBe("Cr");
    expect(monogramFor("Hans Sama")).toBe("HS");
    expect(monogramFor("Blank (Kang Sun-gu)")).toBe("Bl");
    expect(monogramFor("")).toBe("?");
  });
});
