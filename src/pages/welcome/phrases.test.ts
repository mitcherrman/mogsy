/**
 * The writing cadence's segmentation contract (HI1-C3).
 *
 * The visible complaint this pass fixes — "it pauses too often, and in the
 * wrong places" — is entirely a property of how a paragraph is cut up, and
 * nothing tested it. These assertions are that rule written down: a beat is a
 * SENTENCE, a sentence is never cut at a comma or an em-dash, and the copy
 * itself is never altered by being segmented. A future pass that reaches for
 * clause-level beats again has to delete a test that says why not.
 */
import { describe, expect, it } from "vitest";

import { ACADEMY_CHAPTERS } from "./academyChapters";
import {
  BODY_WORD_PACE,
  chapterSentences,
  headingWriteMs,
  PARAGRAPH_PAUSE_MS,
  SENTENCE_PAUSE_MS,
  sentencePauseMs,
  sentenceWriteMs,
  sentencesOf,
} from "./phrases";

describe("sentencesOf", () => {
  it("cuts a paragraph at its sentences and nowhere else", () => {
    const s = sentencesOf("One thing. Then another thing.");
    expect(s.map((x) => x.text)).toEqual(["One thing.", "Then another thing."]);
  });

  it("writes straight through a comma — a clause is not a beat", () => {
    // HI1-C2 broke this into three, and stopped between each.
    const s = sentencesOf("Build them however you like, run it, and read the result.");
    expect(s).toHaveLength(1);
  });

  it("writes straight through an em-dash", () => {
    const s = sentencesOf("Stat Check lives here too — pure knowledge, head to head.");
    expect(s).toHaveLength(1);
  });

  it("does not shorten a sentence for being long", () => {
    // No maximum length: a long sentence written continuously is the texture,
    // and chopping it is the stammer this module exists to avoid.
    const long = `${"word ".repeat(40).trim()}.`;
    expect(sentencesOf(long)).toHaveLength(1);
  });

  it("marks only the last sentence of a paragraph", () => {
    const s = sentencesOf("First. Second. Third.");
    expect(s.map((x) => x.endsParagraph)).toEqual([false, false, true]);
  });

  it("preserves the copy exactly — segmentation never rewrites a word", () => {
    for (const chapter of ACADEMY_CHAPTERS) {
      for (const line of chapter.lines) {
        expect(sentencesOf(line).map((s) => s.text).join(" ")).toBe(line);
      }
    }
  });
});

describe("the chapters' cadence", () => {
  it("stops at most three times inside any chapter's copy", () => {
    // One pause per sentence. The ceiling is the whole point: HI1-C2 reached
    // six on a two-line chapter, which is what read as a stammer.
    for (const chapter of ACADEMY_CHAPTERS) {
      expect(chapterSentences(chapter.lines).length).toBeLessThanOrEqual(3);
    }
  });

  it("gives a paragraph break more air than a sentence break, and both stay short", () => {
    expect(SENTENCE_PAUSE_MS).toBeLessThan(PARAGRAPH_PAUSE_MS);
    // A breath, not a stop. Anything approaching a second reads as the pen
    // being put down.
    expect(PARAGRAPH_PAUSE_MS).toBeLessThanOrEqual(800);
  });

  it("spends more of a chapter writing than pausing", () => {
    for (const chapter of ACADEMY_CHAPTERS) {
      const sentences = chapterSentences(chapter.lines);
      if (!sentences.length) continue;
      const writing = sentences.reduce((n, s) => n + sentenceWriteMs(s), 0);
      const pausing = sentences.reduce((n, s) => n + sentencePauseMs(s), 0);
      expect(writing).toBeGreaterThan(pausing);
    }
  });

  it("writes deliberately enough to follow by eye", () => {
    // Under ~15 words a second. HI1-C2 started a word every 34ms — thirty a
    // second, faster than anyone reads, which is why it needed the pauses to
    // register as writing at all.
    expect(1000 / BODY_WORD_PACE).toBeLessThan(15);
  });

  it("sizes the opening slot from the words actually in it", () => {
    // Headings run from one word to six; a fixed estimate is wrong at both
    // ends, and being wrong long means the first sentence starts under a
    // heading still arriving.
    const short = headingWriteMs("The Academy", "Leaguecraft");
    const long = headingWriteMs("The Last Page", "How would you like to begin?");
    expect(long).toBeGreaterThan(short);
  });
});
