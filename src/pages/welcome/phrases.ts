// ---------------------------------------------------------------------------
// Sentence segmentation and writing cadence for the cinematic Academy
// introduction (HI1-C3).
//
// The chapters' copy lives in academyChapters.ts as whole paragraphs, and the
// content-contract tests hold it to that shape (two lines per chapter, tops).
// This module is the single place a paragraph is broken into the beats the
// tome writes it in — the sequence controller counts them, the view reveals
// them, and the two must never disagree, so both import from here. It also
// owns every number in the cadence, so the clock, the ink and the pen's sound
// are all reading the same model.
//
// A BEAT IS A SENTENCE (HI1-C3). HI1-C2 wrote a beat at a time where a beat was
// a PHRASE — a clause, a comma group, anything up to nine words — and breathed
// after each one. On the page that read as a stammer: five or six stops per
// chapter, several of them mid-thought, and each stop long enough to feel like
// the pen had been put down. The unit is now the SENTENCE. A sentence is
// written straight through, however long it is and however many display lines
// it wraps onto, and the only pauses are the ones a reader would actually take:
// one short breath between sentences, a slightly longer one at a paragraph
// break. Roughly half as many pauses, each of them shorter — and the writing
// itself slowed to about a third of its old rate, so the deliberation lives in
// the quill rather than in the gaps between its strokes.
//
// Segmentation stays DERIVED, never authored: the copy is exactly what it was,
// and rewriting a line simply re-segments it. There is deliberately no maximum
// sentence length — a long sentence writing continuously is the intended
// texture, and chopping it at its commas is precisely the stammer this pass
// removes.
// ---------------------------------------------------------------------------

export interface Sentence {
  text: string;
  /**
   * True when this sentence closes its paragraph. The breath after a paragraph
   * is a little longer than the one between two sentences of the same one —
   * the only place the cadence distinguishes one pause from another.
   */
  endsParagraph: boolean;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * A sentence boundary: terminal punctuation, optionally followed by a closing
 * quote or bracket, followed by whitespace. Em-dashes and commas are NOT
 * boundaries — they are punctuation inside a thought, and HI1-C2's habit of
 * stopping at them is the specific thing this module no longer does.
 */
const SENTENCE_BREAK = /(?<=[.!?][\u201D\u2019"')\]]?)\s+/;

/** One paragraph of chapter copy, broken into the sentences it is written in. */
export function sentencesOf(line: string): Sentence[] {
  const parts = line
    .split(SENTENCE_BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((text, i) => ({ text, endsParagraph: i === parts.length - 1 }));
}

/** Every sentence of every paragraph of a chapter, in writing order. */
export function chapterSentences(lines: string[]): Sentence[] {
  return lines.flatMap(sentencesOf);
}

// ---------------------------------------------------------------------------
// Timing.
//
// The writing is word-by-word CSS (see InkText); the paces below are the delay
// between consecutive word starts, and WORD_INK_MS is how long one word's ink
// takes to land. The controller's model of "how long is this being written"
// is built from exactly these numbers, which is why the view takes its `pace`
// props from here rather than carrying its own literals — the clock and the
// ink cannot drift apart if there is only one set of numbers.
//
// At 85ms a word with a 520ms ink, roughly six words are darkening at any
// moment and a new one starts about twelve times a second. HI1-C2 ran 34ms a
// word against a 420ms ink: twelve words in flight and thirty starting every
// second, which is faster than anyone reads and is why the writing needed the
// pauses to feel like writing at all.
// ---------------------------------------------------------------------------

/** ms between consecutive word starts in body copy. */
export const BODY_WORD_PACE = 85;
/** ms between consecutive word starts in a chapter's eyebrow. */
export const EYEBROW_WORD_PACE = 48;
/** ms between consecutive word starts in a chapter heading. */
export const HEADING_WORD_PACE = 110;
/** The heading's first word waits this long under its eyebrow. */
export const HEADING_OFFSET = 200;
/** ms one word's ink takes to land. Must match the CSS tome-ink-in duration. */
export const WORD_INK_MS = 520;

/** The breath between two sentences of the same paragraph. */
export const SENTENCE_PAUSE_MS = 520;
/** The breath after the sentence that closes a paragraph — a little more air. */
export const PARAGRAPH_PAUSE_MS = 760;
/** The beat between the chapter's heading and its first sentence. */
export const HEADING_PAUSE_MS = 420;
/** The page settling before the pen first touches it. */
export const OPENING_PAUSE_MS = 260;
/** The marginalia's write window, and the beat after it. */
export const MARGINALIA_WRITE_MS = 520;
export const MARGINALIA_PAUSE_MS = 360;
/**
 * The reference docket's write window, and the beat after it (HI1-C5).
 *
 * Longer than the marginalia's because it is longer: three ruled entries, each
 * a label and a note, ruled in one after another rather than four pills landing
 * together. Still a single slot — a docket that stopped between its own lines
 * would be the stammer this module exists to have removed.
 */
export const DOCKET_WRITE_MS = 900;
export const DOCKET_PAUSE_MS = 420;
/** Tail after the last slot's ink lands, before the page is offered as done. */
export const INK_SETTLE_TAIL_MS = 240;

/** How long a run of `text` is visibly being written at `pace`. */
function runWriteMs(text: string, pace: number, offset = 0): number {
  return offset + Math.max(0, wordCount(text) - 1) * pace + WORD_INK_MS;
}

/** How long a sentence is visibly being written. */
export function sentenceWriteMs(sentence: Sentence): number {
  return runWriteMs(sentence.text, BODY_WORD_PACE);
}

/** The breath after a sentence, before the next one begins. */
export function sentencePauseMs(sentence: Sentence): number {
  return sentence.endsParagraph ? PARAGRAPH_PAUSE_MS : SENTENCE_PAUSE_MS;
}

/**
 * How long a chapter's opening slot is being written.
 *
 * The eyebrow and the heading are one slot and are written concurrently — the
 * heading merely starts a beat later — so the slot lasts as long as whichever
 * of them finishes last. Derived from the actual words rather than estimated,
 * because the headings run from one word to six and a fixed guess is wrong at
 * both ends.
 */
export function headingWriteMs(eyebrow: string, heading: string): number {
  return Math.max(
    runWriteMs(eyebrow, EYEBROW_WORD_PACE),
    runWriteMs(heading, HEADING_WORD_PACE, HEADING_OFFSET),
  );
}
