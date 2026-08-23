/**
 * The reveal cadence's contract.
 *
 * Two visible complaints are fixed here and both are properties of this module
 * alone, so both get assertions rather than comments: the introduction revealed
 * body copy WORD BY WORD, and it was slow enough that a two-line chapter took
 * the better part of ten seconds before it would offer Next.
 *
 * What is written down below is therefore: a beat is a BLOCK — one authored
 * line, arriving whole — the gap between two beats sits inside the 350–600ms
 * band the brief asks for, and a whole chapter is over in seconds rather than
 * in tens of them. A future pass that reaches for per-word writing again has to
 * delete a test that says why not.
 */
import { describe, expect, it } from "vitest";

import { ACADEMY_CHAPTERS } from "./academyChapters";
import {
  BLOCK_FADE_MS,
  BLOCK_INTERVAL_MS,
  BLOCK_PAUSE_MS,
  chapterBlocks,
  HEADING_FADE_MS,
  HEADING_INTERVAL_MS,
  MAX_BEAT_MS,
  MIN_BEAT_MS,
  OPENING_PAUSE_MS,
} from "./cadence";
import { slotCount, slotRevealMs } from "./useRevealSequence";

describe("chapterBlocks", () => {
  it("is the authored paragraphing and nothing else — a block is never split", () => {
    // The whole point of the model: there is no segmenter here any more. Two
    // sentences in one authored line are ONE beat, because the copy said so.
    const lines = ["One thing. Then another thing.", "And a second block."];
    expect(chapterBlocks(lines)).toEqual(lines);
  });

  it("does not cut at a full stop, a comma or an em-dash", () => {
    const line = "Simulate any matchup. Calculate any situation, however you like — really.";
    expect(chapterBlocks([line])).toHaveLength(1);
  });

  it("does not shorten a block for being long", () => {
    const long = `${"word ".repeat(60).trim()}.`;
    expect(chapterBlocks([long])).toEqual([long]);
  });

  it("drops nothing but empty lines, and rewrites no copy", () => {
    for (const chapter of ACADEMY_CHAPTERS) {
      expect(chapterBlocks(chapter.lines)).toEqual(chapter.lines);
    }
  });
});

describe("the cadence", () => {
  it("puts every major text beat inside the 350–600ms band", () => {
    // The one number the brief specifies. Both the heading→first-block gap and
    // the block→block gap are held to it, so re-tuning either in isolation
    // cannot quietly drift the page back to a slideshow or to a stammer.
    for (const beat of [BLOCK_INTERVAL_MS, HEADING_INTERVAL_MS]) {
      expect(beat).toBeGreaterThanOrEqual(MIN_BEAT_MS);
      expect(beat).toBeLessThanOrEqual(MAX_BEAT_MS);
    }
    expect(BLOCK_INTERVAL_MS).toBe(BLOCK_FADE_MS + BLOCK_PAUSE_MS);
  });

  it("spends more of a beat arriving than waiting", () => {
    // A pause longer than the arrival reads as the page having stopped. The
    // fade is the beat; the breath after it is punctuation.
    expect(BLOCK_FADE_MS).toBeGreaterThan(BLOCK_PAUSE_MS);
  });

  it("times a block by its KIND, never by how many words are in it", () => {
    // The load-bearing consequence of a block arriving in one piece: a long
    // paragraph and a short one take exactly as long. If this ever starts
    // varying with the copy, something has gone back to writing word by word.
    const windows = new Set<number>();
    for (const chapter of ACADEMY_CHAPTERS) {
      const blocks = chapterBlocks(chapter.lines);
      for (let slot = 1; slot <= blocks.length; slot += 1) {
        windows.add(slotRevealMs(chapter, slot));
      }
    }
    expect([...windows]).toEqual([BLOCK_FADE_MS]);
  });

  it("gives the chapter label and its heading one beat, together", () => {
    expect(slotRevealMs(ACADEMY_CHAPTERS[0], 0)).toBe(HEADING_FADE_MS);
  });

  it("does not schedule a pen stroke for a control", () => {
    // The exits, the register's form and its sign-in line arrive; they are not
    // drawn, so nothing scratches for them.
    for (const chapter of ACADEMY_CHAPTERS) {
      const blocks = chapterBlocks(chapter.lines);
      for (let slot = 1 + blocks.length; slot < slotCount(chapter); slot += 1) {
        expect(slotRevealMs(chapter, slot)).toBe(0);
      }
    }
  });

  it("gets every chapter onto the page in a few seconds, not tens of them", () => {
    // The headline complaint, as a number. Summing the whole schedule for each
    // chapter — the opening beat, every slot's arrival and every breath after
    // it — nothing may take longer than four seconds end to end. The old
    // word-by-word cadence put the two-line arrival chapter at roughly nine.
    for (const chapter of ACADEMY_CHAPTERS) {
      const blocks = chapterBlocks(chapter.lines);
      let total = OPENING_PAUSE_MS;
      for (let slot = 0; slot < slotCount(chapter); slot += 1) {
        total += slotRevealMs(chapter, slot);
        total += slot === 0 ? HEADING_INTERVAL_MS - HEADING_FADE_MS : BLOCK_PAUSE_MS;
      }
      expect(total).toBeLessThan(4_000);
    }
  });
});
