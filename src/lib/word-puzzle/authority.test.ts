import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySounding, chooseGivens, gradeResponse, normalizeAnswer, normalizeGlyph, soundGlyph, structureFromAnswer,
} from "./authority";
import rounds from "./__fixtures__/wordPuzzleRounds.json";

describe("normalization", () => {
  it("upper-cases and strips diacritics; anything else is not a glyph", () => {
    expect(normalizeGlyph("e")).toBe("E");
    expect(normalizeGlyph("é")).toBe("E");
    expect(normalizeGlyph("'")).toBeNull();
    expect(normalizeGlyph("9")).toBeNull();
    expect(normalizeGlyph(" ")).toBeNull();
    expect(normalizeAnswer("Rabadon's Deathcap")).toBe("RABADONSDEATHCAP");
    expect(normalizeAnswer("rabadons deathcap")).toBe("RABADONSDEATHCAP");
  });
});

describe("structure from a display answer", () => {
  it("makes sockets of letters, marks of punctuation and digits, gaps of whitespace runs", () => {
    const { structure, glyphs } = structureFromAnswer("90 Caliber   Net");
    expect(glyphs.join("")).toBe("CALIBERNET");
    expect(structure.glyphCount).toBe(10);
    expect(structure.cells.slice(0, 3)).toEqual([{ kind: "mark", text: "9" }, { kind: "mark", text: "0" }, { kind: "gap" }]);
    expect(structure.cells.filter((c) => c.kind === "gap")).toHaveLength(2);
  });
  it("keeps an apostrophe and a colon as marks in place", () => {
    const { structure } = structureFromAnswer("Command: Shockwave");
    expect(structure.cells[7]).toEqual({ kind: "mark", text: ":" });
    expect(structure.cells[8]).toEqual({ kind: "gap" });
    const kaisa = structureFromAnswer("Kai'Sa");
    expect(kaisa.structure.cells.map((c) => c.kind)).toEqual(["glyph", "glyph", "glyph", "mark", "glyph", "glyph"]);
  });
  it("refuses an answer with no glyphs", () => {
    expect(() => structureFromAnswer("9000")).toThrow(/no glyphs/);
  });
  it("the public structure carries no glyph", () => {
    const { structure } = structureFromAnswer("Zephyr");
    // Only kinds and indices: no cell carries a letter anywhere.
    expect(JSON.stringify(structure.cells).replace(/"(kind|index|text|glyph|mark|gap)"/g, "")).not.toMatch(/[A-Za-z]/);
  });
});

describe("givens", () => {
  it("opens at least one distinct letter and never all of them, every instance engraved, deterministically", () => {
    const { glyphs } = structureFromAnswer("Sleepy Trouble Bubble");
    const a = chooseGivens(glyphs, "seed-1");
    const b = chooseGivens(glyphs, "seed-1");
    expect(a).toEqual(b);
    const opened = new Set(a.filter((g): g is string => g !== null));
    expect(opened.size).toBeGreaterThanOrEqual(1);
    expect(opened.size).toBeLessThan(new Set(glyphs).size);
    glyphs.forEach((g, i) => { if (opened.has(g)) expect(a[i]).toBe(g); else expect(a[i]).toBeNull(); });
  });
  it("gives nothing away for a single-letter alphabet answer", () => {
    expect(chooseGivens(["A", "A"], "x")).toEqual([null, null]);
  });
});

describe("soundings", () => {
  const { glyphs } = structureFromAnswer("Sleepy Trouble Bubble"); // S L E E P Y T R O U B L E B U B B L E
  it("finds every socket a glyph sits in, case-insensitively", () => {
    expect(soundGlyph(glyphs, "b")).toEqual([10, 13, 15, 16]);
    expect(soundGlyph(glyphs, "Z")).toEqual([]);
    expect(soundGlyph(glyphs, "'")).toEqual([]);
  });
  it("engraves every hit into the ledger and records the sounding; a repeated sounding is a no-op", () => {
    const l0 = { engraved: glyphs.map(() => null), soundings: [] };
    const l1 = applySounding(l0, glyphs, "e");
    expect(l1.soundings).toEqual([{ glyph: "E", hits: 4 }]);
    expect(l1.engraved.filter((g) => g === "E")).toHaveLength(4);
    const l2 = applySounding(l1, glyphs, "Z");
    expect(l2.soundings).toEqual([{ glyph: "E", hits: 4 }, { glyph: "Z", hits: 0 }]);
    expect(applySounding(l2, glyphs, "E")).toBe(l2);
  });
});

describe("grading", () => {
  const { glyphs } = structureFromAnswer("Zephyr");
  const givenAtStart = [null, null, "P", null, null, null];
  it("marks given, sounded, right, wrong and missing sockets and words the verdict", () => {
    const ledger = applySounding({ engraved: givenAtStart, soundings: [] }, glyphs, "Y");
    const reveal = gradeResponse({
      glyphs, ledger, givenAtStart, answerText: "Zephyr",
      response: { glyphs: ["z", "A", "P", null, "Y", "R"] },
    });
    expect(reveal.results).toEqual(["right", "wrong", "given", "missing", "sounded", "right"]);
    expect(reveal.locked).toEqual(["Z", "A", "P", null, "Y", "R"]);
    expect(reveal.verdict).toBe("partial");
    expect(reveal.scoreText).toBe("2 of 4 glyphs set right");
    expect(reveal.glyphs.join("")).toBe("ZEPHYR");
    expect(reveal.answerText).toBe("Zephyr");
  });
  it("is solved when every open socket is right, missed when none is", () => {
    const ledger = { engraved: givenAtStart, soundings: [] };
    expect(gradeResponse({ glyphs, ledger, givenAtStart, answerText: "Zephyr", response: { glyphs: ["Z", "E", "P", "H", "Y", "R"] } }).verdict).toBe("solved");
    expect(gradeResponse({ glyphs, ledger, givenAtStart, answerText: "Zephyr", response: { glyphs: [null, null, "P", null, null, null] } }).verdict).toBe("missed");
  });
  it("refuses a response of the wrong length", () => {
    expect(() => gradeResponse({ glyphs, ledger: { engraved: givenAtStart, soundings: [] }, givenAtStart, answerText: "Zephyr", response: { glyphs: ["Z"] } })).toThrow(/socket count/);
  });
});

describe("the frozen rounds", () => {
  const all = (rounds as { rounds: { id: string; answer: string; verified: boolean; source: unknown; traits: string[] }[] }).rounds;
  it("every answer builds a structure, ids are distinct, and the one unverified round says so", () => {
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    for (const r of all) expect(() => structureFromAnswer(r.answer)).not.toThrow();
    const unverified = all.filter((r) => !r.verified);
    expect(unverified.map((r) => r.id)).toEqual(["shurima"]);
    expect(unverified[0].source).toBeNull();
    expect(unverified[0].traits.join(" ")).toMatch(/UNVERIFIED/);
    for (const r of all.filter((x) => x.verified)) expect(r.source).not.toBeNull();
  });
  it("covers the characteristics the brief asks the instrument to prove", () => {
    const answers = all.map((r) => r.answer);
    expect(answers.some((a) => a.length <= 6)).toBe(true); // short word
    expect(answers.some((a) => a.includes("'"))).toBe(true); // apostrophe
    expect(answers.some((a) => a.includes(":"))).toBe(true); // other punctuation
    expect(answers.some((a) => a.split(" ").length >= 4)).toBe(true); // many words
    expect(answers.some((a) => a.replace(/[^A-Za-z]/g, "").length >= 25)).toBe(true); // long content
    expect(answers.some((a) => /(.).*\1.*\1/i.test(a.replace(/[^A-Za-z]/g, "")))).toBe(true); // repeated letters
  });
});

describe("the source boundary", () => {
  it("the primitive never imports the authority or the lab", () => {
    const src = readFileSync(resolve(__dirname, "../../components/interaction-grammar/GlyphPress.tsx"), "utf8");
    expect(src).not.toMatch(/word-puzzle\/authority/);
    expect(src).not.toMatch(/pages\/dev/);
    expect(src).not.toMatch(/__fixtures__/);
    const lib = readFileSync(resolve(__dirname, "../interaction-grammar/glyphPress.ts"), "utf8");
    expect(lib).not.toMatch(/word-puzzle/);
  });
});
