import { describe, expect, it } from "vitest";
import {
  assertReconstructContent, clearSlot, filledSummary, isBoardFull, normalizePlacement,
  numberWord, placeToken, countUses,
} from "./reconstruct";
import * as lib from "./reconstruct";
import type { AssemblyOption } from "./types";

const opts = (...o: [string, number?][]): AssemblyOption[] =>
  o.map(([token, maxUses]) => ({ token, label: token.toUpperCase(), ...(maxUses === undefined ? {} : { maxUses }) }));

// ------------------------------------------------------------------ no grader

describe("grading is the server's", () => {
  it("the client library exports no grader (Ranked grades reconstruct.v1 on the server)", () => {
    expect(Object.keys(lib).filter((k) => /grade/i.test(k))).toEqual([]);
  });
});

// -------------------------------------------------------------------- placement

describe("placement helpers", () => {
  const content = { slotCount: 3, options: opts(["a"], ["b", 2], ["c"], ["d"]) };

  it("maxUses defaults to 1", () => {
    expect(placeToken(content, [null, null, null], 0, "a").kind).toBe("placed");
    const full = ["a", null, null];
    expect(placeToken(content, full, 1, "a")).toMatchObject({ kind: "at-limit", used: 1, max: 1 });
  });

  it("a choice with maxUses 2 may fill two sockets and no more", () => {
    let board: (string | null)[] = [null, null, null];
    board = (placeToken(content, board, 0, "b") as { next: (string | null)[] }).next;
    board = (placeToken(content, board, 2, "b") as { next: (string | null)[] }).next;
    expect(board).toEqual(["b", null, "b"]);
    expect(placeToken(content, board, 1, "b")).toMatchObject({ kind: "at-limit", used: 2, max: 2 });
  });

  it("replacing an occupant frees it first and reports it", () => {
    const out = placeToken(content, ["a", "c", null], 1, "d");
    expect(out).toMatchObject({ kind: "replaced", previous: "c" });
    expect(out.next).toEqual(["a", "d", null]);
  });

  it("placing a token over itself is a no-op, and never counts as a second use", () => {
    expect(placeToken(content, ["a", null, null], 0, "a")).toMatchObject({ kind: "same", next: ["a", null, null] });
  });

  it("rejects an unknown token or socket without changing the board", () => {
    expect(placeToken(content, [null, null, null], 0, "zzz").kind).toBe("invalid");
    expect(placeToken(content, [null, null, null], 3, "a").kind).toBe("invalid");
    expect(placeToken(content, [null, null, null], -1, "a").kind).toBe("invalid");
  });

  it("does not mutate the board it was given", () => {
    const board = Object.freeze(["a", null, null]);
    expect(() => placeToken(content, board, 1, "c")).not.toThrow();
    expect(() => clearSlot(board, 0)).not.toThrow();
  });

  it("clearSlot returns what it removed, and is a no-op on an empty socket", () => {
    expect(clearSlot(["a", "b", null], 1)).toEqual({ next: ["a", null, null], removed: "b" });
    expect(clearSlot(["a", "b", null], 2)).toEqual({ next: ["a", "b", null], removed: null });
  });

  it("normalizePlacement pads, truncates, drops strangers and over-limit copies", () => {
    expect(normalizePlacement(content, [])).toEqual([null, null, null]);
    expect(normalizePlacement(content, ["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
    expect(normalizePlacement(content, ["zzz", "a", "a"])).toEqual([null, "a", null]);
    expect(normalizePlacement(content, ["b", "b", "b"])).toEqual(["b", "b", null]);
    expect(normalizePlacement(content, ["a", null, "c"])).toEqual(["a", null, "c"]);
  });

  it("countUses and isBoardFull", () => {
    expect([...countUses(["a", "b", "a", null])]).toEqual([["a", 2], ["b", 1]]);
    expect(isBoardFull(["a", "b", "c"])).toBe(true);
    expect(isBoardFull(["a", null, "c"])).toBe(false);
    expect(isBoardFull([])).toBe(false);
  });
});

describe("assertReconstructContent", () => {
  const ok = { slotCount: 3, options: opts(["a"], ["b"], ["c"], ["d"]) };
  it("accepts a sound config", () => { expect(() => assertReconstructContent(ok)).not.toThrow(); });
  it("rejects slot counts outside 2–4", () => {
    for (const slotCount of [0, 1, 5, 2.5, NaN]) expect(() => assertReconstructContent({ ...ok, slotCount })).toThrow(/slotCount/);
    for (const slotCount of [2, 3, 4]) expect(() => assertReconstructContent({ ...ok, slotCount })).not.toThrow();
  });
  it("rejects a tray with duplicate tokens: the tray holds each option once", () => {
    expect(() => assertReconstructContent({ ...ok, options: opts(["a"], ["a"], ["b"]) })).toThrow(/duplicate option token/);
  });
  it("rejects a bad maxUses and an empty token", () => {
    expect(() => assertReconstructContent({ ...ok, options: opts(["a", 0], ["b"], ["c"]) })).toThrow(/maxUses/);
    expect(() => assertReconstructContent({ ...ok, options: opts(["a", 1.5], ["b"], ["c"]) })).toThrow(/maxUses/);
    expect(() => assertReconstructContent({ ...ok, options: opts(["", 1], ["b"], ["c"]) })).toThrow(/empty token/);
  });
  it("rejects a tray that can never fill the board", () => {
    expect(() => assertReconstructContent({ slotCount: 4, options: opts(["a"], ["b"], ["c"]) })).toThrow(/Lock could never enable/);
    expect(() => assertReconstructContent({ slotCount: 3, options: opts(["a", 3], ["b"]) })).not.toThrow();
  });
  it("rejects a tray with too few or too many options", () => {
    expect(() => assertReconstructContent({ slotCount: 2, options: opts(["a", 2]) })).toThrow(/options/);
    const nine = opts(...Array.from({ length: 9 }, (_, i) => [`o${i}`] as [string]));
    expect(() => assertReconstructContent({ slotCount: 3, options: nine })).toThrow(/options/);
  });
});

describe("speech helpers", () => {
  it("numberWord reads 0–8 as words and falls back to digits", () => {
    expect([0, 1, 2, 3, 4].map(numberWord)).toEqual(["zero", "one", "two", "three", "four"]);
    expect(numberWord(12)).toBe("12");
  });
  it("filledSummary says how full the board is and when Lock opens", () => {
    expect(filledSummary(2, 3)).toBe("Two of three parts filled.");
    expect(filledSummary(0, 3)).toBe("Zero of three parts filled.");
    expect(filledSummary(3, 3)).toBe("Three of three parts filled. Lock is available.");
  });
});

// ------------------------------------------------------------- R2 input paths

describe("placeFromTray — the one placement every input path calls", () => {
  const content = { slotCount: 3, options: opts(["a"], ["b", 3], ["c"]) };

  it("with no socket named, fills the first empty socket", () => {
    expect(lib.nextEmptySlot([null, null, null])).toBe(0);
    expect(lib.nextEmptySlot(["a", null, "c"])).toBe(1);
    expect(lib.nextEmptySlot(["a", "b", "c"])).toBe(-1);
    expect(lib.placeFromTray(content, ["a", null, null], "b").next).toEqual(["a", "b", null]);
    expect(lib.placeFromTray(content, ["a", null, "c"], "b").next).toEqual(["a", "b", "c"]);
  });

  it("repeated adds stack copies within the limit", () => {
    let board: (string | null)[] = [null, null, null];
    for (let i = 0; i < 3; i++) board = lib.placeFromTray(content, board, "b").next;
    expect(board).toEqual(["b", "b", "b"]);
  });

  it("a full board with no socket named is `full`, unchanged", () => {
    expect(lib.placeFromTray(content, ["a", "b", "c"], "b")).toEqual({ kind: "full", next: ["a", "b", "c"] });
  });

  it("with a socket named (a drop), it is exactly placeToken: replacement included", () => {
    expect(lib.placeFromTray(content, ["a", "c", null], "b", 1))
      .toEqual(placeToken(content, ["a", "c", null], 1, "b"));
    expect(lib.placeFromTray(content, ["a", "c", null], "b", 1)).toMatchObject({ kind: "replaced", previous: "c" });
  });
});

describe("snapToSocket — the forgiving drop", () => {
  // Three 56px sockets, 16px apart.
  const r = (left: number) => ({ left, top: 100, right: left + 56, bottom: 156 });
  const sockets = [r(100), r(172), r(244)];
  const slack = { x: 28, y: 64 };

  it("inside a socket: that socket", () => {
    expect(lib.snapToSocket({ x: 128, y: 128 }, sockets, slack)).toBe(0);
    expect(lib.snapToSocket({ x: 270, y: 110 }, sockets, slack)).toBe(2);
  });

  it("between sockets: the nearer centre", () => {
    expect(lib.snapToSocket({ x: 160, y: 128 }, sockets, slack)).toBe(0);
    expect(lib.snapToSocket({ x: 168, y: 128 }, sockets, slack)).toBe(1);
  });

  it("outside the visible boxes but inside the region: still lands", () => {
    expect(lib.snapToSocket({ x: 120, y: 156 + 60 }, sockets, slack)).toBe(0);     // under the row
    expect(lib.snapToSocket({ x: 100 - 20, y: 100 - 50 }, sockets, slack)).toBe(0); // above-left
    expect(lib.snapToSocket({ x: 300 + 25, y: 128 }, sockets, slack)).toBe(2);     // past the end
  });

  it("outside the region: null", () => {
    expect(lib.snapToSocket({ x: 128, y: 156 + 65 }, sockets, slack)).toBeNull();
    expect(lib.snapToSocket({ x: 100 - 29, y: 128 }, sockets, slack)).toBeNull();
    expect(lib.snapToSocket({ x: 128, y: 128 }, [], slack)).toBeNull();
  });
});
