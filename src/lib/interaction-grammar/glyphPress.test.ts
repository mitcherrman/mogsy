import { describe, expect, it } from "vitest";
import {
  CLEAR_TILE, assertGlyphPressContent, blankCount, clampDrum, drumIndexOf, drumOffsetPx, drumTiles, firstBlankSocket,
  glyphState, inkProgress, inkReached, keyToGlyph, layoutForme, planGlyphPressReveal, reconcileValue, responseGlyphs,
  showsVerdict, stageAt, stepSocket, GLYPH_PRESS_ALPHABET,
} from "./glyphPress";
import type { GlyphPressCell, GlyphPressLedger, GlyphPressPublic, GlyphPressStructure } from "./types";

/** A structure from a display string, the way an authority would build it (letters only become sockets). */
function structureOf(text: string): GlyphPressStructure {
  const cells: GlyphPressCell[] = [];
  let n = 0;
  let gap = false;
  for (const ch of text) {
    if (ch === " ") { gap = true; continue; }
    if (gap) { cells.push({ kind: "gap" }); gap = false; }
    if (/[A-Za-z]/.test(ch)) cells.push({ kind: "glyph", index: n++ });
    else cells.push({ kind: "mark", text: ch });
  }
  return { cells, glyphCount: n };
}
const content = (text: string): GlyphPressPublic => ({
  prompt: "Set it.", categoryLabel: "Test", clue: {}, structure: structureOf(text), alphabet: GLYPH_PRESS_ALPHABET, soundingsAllowed: 3,
});
const ledgerOf = (engraved: (string | null)[], soundings: { glyph: string; hits: number }[] = []): GlyphPressLedger => ({ engraved, soundings });

describe("content assertions", () => {
  it("accepts a well-formed structure", () => {
    expect(() => assertGlyphPressContent(content("Rabadon's Deathcap"))).not.toThrow();
  });
  it("refuses an empty structure, a miscounted one, a lowercase or repeated alphabet, a bad allowance", () => {
    expect(() => assertGlyphPressContent({ ...content("Zephyr"), structure: { cells: [], glyphCount: 0 } })).toThrow(/empty/);
    expect(() => assertGlyphPressContent({ ...content("Zephyr"), structure: { ...structureOf("Zephyr"), glyphCount: 5 } })).toThrow(/glyphCount/);
    expect(() => assertGlyphPressContent({ ...content("Zephyr"), alphabet: "abc" })).toThrow(/uppercase/);
    expect(() => assertGlyphPressContent({ ...content("Zephyr"), alphabet: "AAB" })).toThrow(/distinct/);
    expect(() => assertGlyphPressContent({ ...content("Zephyr"), soundingsAllowed: -1 })).toThrow(/soundingsAllowed/);
  });
});

describe("the forme's layout", () => {
  it("lays a short word in one row at the largest socket that fits", () => {
    const l = layoutForme(structureOf("Zephyr"), { width: 600, height: 300 });
    expect(l.cell).toBe(44);
    expect(l.rows).toBe(1);
    expect(l.items.filter((i) => i.kind === "glyph")).toHaveLength(6);
    expect(l.overflow).toBe(false);
    expect(l.width).toBeLessThanOrEqual(600);
  });
  it("keeps marks narrower than sockets and gaps between words wider than between glyphs", () => {
    const l = layoutForme(structureOf("Rabadon's Deathcap"), { width: 900, height: 300 });
    const mark = l.items.find((i) => i.kind === "mark")!;
    expect(mark.w).toBeLessThan(l.cell);
    const glyphs = l.items.filter((i): i is Extract<typeof i, { kind: "glyph" }> => i.kind === "glyph");
    // "Rabadon's": the s (index 7) ends word 1; "Deathcap" starts at index 8 on the same row.
    const s = glyphs.find((g) => g.index === 7)!;
    const d = glyphs.find((g) => g.index === 8)!;
    expect(d.x - (s.x + s.w)).toBeGreaterThan(l.gap);
  });
  it("wraps words onto new rows rather than breaking them when a row is too narrow", () => {
    const l = layoutForme(structureOf("Ace in the Hole"), { width: 200, height: 400 });
    expect(l.rows).toBeGreaterThan(1);
    expect(l.items.some((i) => i.kind === "break")).toBe(false);
    for (const row of new Set(l.items.map((i) => i.row))) {
      const items = l.items.filter((i) => i.row === row);
      const right = Math.max(...items.map((i) => i.x + i.w));
      expect(right).toBeLessThanOrEqual(200);
    }
  });
  it("breaks a word that cannot fit a phone-width row, marking the break with a tick, and never below the smallest socket", () => {
    const l = layoutForme(structureOf("Life Form Disintegration Ray"), { width: 300, height: 180 });
    expect(l.items.some((i) => i.kind === "break")).toBe(true);
    expect(l.cell).toBeGreaterThanOrEqual(20);
    expect(l.width).toBeLessThanOrEqual(300);
    expect(l.height).toBeLessThanOrEqual(180);
    expect(l.overflow).toBe(false);
    // Every socket is present exactly once.
    const idx = l.items.filter((i): i is Extract<typeof i, { kind: "glyph" }> => i.kind === "glyph").map((g) => g.index).sort((a, b) => a - b);
    expect(idx).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });
  it("shrinks the socket to fit the height before it overflows, and reports overflow only when nothing fits", () => {
    const tall = layoutForme(structureOf("Sleepy Trouble Bubble"), { width: 320, height: 300 });
    const short = layoutForme(structureOf("Sleepy Trouble Bubble"), { width: 320, height: 70 });
    expect(short.cell).toBeLessThanOrEqual(tall.cell);
    expect(short.overflow).toBe(false);
    const none = layoutForme(structureOf("Sleepy Trouble Bubble"), { width: 60, height: 20 });
    expect(none.overflow).toBe(true);
    expect(none.cell).toBe(20);
  });
  it("is deterministic for a (structure, box) pair", () => {
    const a = layoutForme(structureOf("Command: Shockwave"), { width: 584, height: 200 });
    const b = layoutForme(structureOf("Command: Shockwave"), { width: 584, height: 200 });
    expect(a).toEqual(b);
  });
});

describe("the cursor", () => {
  const ledger = ledgerOf(["Z", null, null, "H", null, null]); // Z _ _ H _ _
  it("starts at the first blank open socket and skips engraved ones", () => {
    expect(firstBlankSocket([null, null, null, null, null, null], ledger)).toBe(1);
    expect(firstBlankSocket([null, "E", null, null, null, null], ledger)).toBe(2);
    expect(firstBlankSocket([null, "E", "P", null, "Y", "R"], ledger)).toBe(1);
    expect(firstBlankSocket([], ledgerOf(["A", "B"]))).toBeNull();
  });
  it("steps between open sockets and clamps at the ends", () => {
    expect(stepSocket(1, 1, ledger)).toBe(2);
    expect(stepSocket(2, 1, ledger)).toBe(4);
    expect(stepSocket(5, 1, ledger)).toBe(5);
    expect(stepSocket(4, -1, ledger)).toBe(2);
    expect(stepSocket(1, -1, ledger)).toBe(1);
    expect(stepSocket(null, 1, ledger)).toBe(1);
    expect(stepSocket(null, -1, ledger)).toBe(5);
    expect(stepSocket(3, 1, ledger)).toBe(4);
  });
  it("counts blanks over open sockets only", () => {
    expect(blankCount([null, "E", null, null, null, "R"], ledger)).toBe(2);
  });
});

describe("the value and the ledger", () => {
  it("drops the player's glyph from a socket the ledger has engraved, and from sockets a sounding proved wrong", () => {
    const before = ["E", "E", "P", null, "E", "R"];
    const after = ledgerOf(["E", null, null, "H", "E", null], [{ glyph: "E", hits: 2 }]);
    expect(reconcileValue(before, after)).toEqual([null, null, "P", null, null, "R"]);
  });
  it("builds a response of engraved glyphs where the ledger has them and the player's elsewhere", () => {
    const ledger = ledgerOf(["Z", null, null, "H", null, null]);
    expect(responseGlyphs([null, "E", null, "Q", "Y", null], ledger)).toEqual(["Z", "E", null, "H", "Y", null]);
  });
});

describe("the drum", () => {
  it("carries the clearing tile and then the alphabet", () => {
    const t = drumTiles(GLYPH_PRESS_ALPHABET);
    expect(t[0]).toBe(CLEAR_TILE);
    expect(t.slice(1).join("")).toBe(GLYPH_PRESS_ALPHABET);
    expect(drumIndexOf("A", GLYPH_PRESS_ALPHABET)).toBe(1);
    expect(drumIndexOf("Z", GLYPH_PRESS_ALPHABET)).toBe(26);
    expect(drumIndexOf("é", GLYPH_PRESS_ALPHABET)).toBe(-1);
  });
  it("clamps within the tiles and centres a tile in the window", () => {
    expect(clampDrum(-3, GLYPH_PRESS_ALPHABET)).toBe(0);
    expect(clampDrum(40, GLYPH_PRESS_ALPHABET)).toBe(26);
    expect(clampDrum(3.4, GLYPH_PRESS_ALPHABET)).toBe(3);
    // Tile 0 of width 44 in a 300px window sits with its centre at 150.
    expect(drumOffsetPx(0, 300, 44, 4)).toBe(150 - 22);
    expect(drumOffsetPx(2, 300, 44, 4)).toBe(150 - (2 * 48 + 22));
  });
  it("reads keys as glyphs, upper-cased, and ignores anything else", () => {
    expect(keyToGlyph("e", GLYPH_PRESS_ALPHABET)).toBe("E");
    expect(keyToGlyph("Enter", GLYPH_PRESS_ALPHABET)).toBeNull();
    expect(keyToGlyph("1", GLYPH_PRESS_ALPHABET)).toBeNull();
    expect(keyToGlyph(" ", GLYPH_PRESS_ALPHABET)).toBeNull();
  });
  it("reports a glyph's state from the soundings", () => {
    const s = [{ glyph: "E", hits: 2 }, { glyph: "Q", hits: 0 }];
    expect(glyphState("E", s, null)).toBe("sounded");
    expect(glyphState("Q", s, null)).toBe("tarnished");
    expect(glyphState("A", s, null)).toBe("free");
    expect(glyphState("A", s, "A")).toBe("pending");
  });
});

describe("the reveal clock", () => {
  it("inks then shows the verdict, and lands on done", () => {
    const plan = planGlyphPressReveal({ reduced: false, glyphCount: 10 });
    expect(plan.instant).toBe(false);
    expect(stageAt(plan, 0)).toBe("ink");
    expect(stageAt(plan, plan.inkMs)).toBe("verdict");
    expect(stageAt(plan, plan.totalMs)).toBe("done");
    expect(showsVerdict("ink")).toBe(false);
    expect(showsVerdict("verdict")).toBe(true);
  });
  it("is instant under reduced motion", () => {
    const plan = planGlyphPressReveal({ reduced: true, glyphCount: 10 });
    expect(plan.instant).toBe(true);
    expect(stageAt(plan, 0)).toBe("done");
    expect(inkProgress(plan, 0)).toBe(1);
  });
  it("scales with the budget and grows with the phrase, capped", () => {
    const small = planGlyphPressReveal({ reduced: false, glyphCount: 4 });
    const big = planGlyphPressReveal({ reduced: false, glyphCount: 40 });
    expect(big.inkMs).toBeGreaterThan(small.inkMs);
    expect(big.inkMs).toBeLessThanOrEqual(1200);
    const half = planGlyphPressReveal({ reduced: false, glyphCount: 4, budgetMs: 900 });
    expect(half.totalMs).toBeLessThan(small.totalMs);
  });
  it("reaches sockets left to right and every socket before the ink stage ends", () => {
    const plan = planGlyphPressReveal({ reduced: false, glyphCount: 6 });
    expect(inkReached(inkProgress(plan, 0), 22, 300)).toBe(false);
    expect(inkReached(inkProgress(plan, plan.inkMs / 2), 22, 300)).toBe(true);
    expect(inkReached(inkProgress(plan, plan.inkMs), 300, 300)).toBe(true);
  });
});
