// ---------------------------------------------------------------------------
// Phrase segmentation for the cinematic Academy introduction (HI1-C2).
//
// The chapters' copy lives in academyChapters.ts as whole paragraphs, and the
// content-contract tests hold it to that shape (two lines per chapter, tops).
// The writing cadence, though, is conversational: the page is written a short
// phrase at a time, with a breath between phrases and a longer one after a
// finished sentence. This module is the single place a paragraph is broken
// into those beats — the sequence controller counts them, the view reveals
// them, and the two must never disagree, so both import from here.
//
// Splitting is derived, not authored: the copy stays exactly what it was, and
// a rewritten line simply re-segments. Rules, in order: a sentence ends a
// phrase; an em-dash ends a phrase (it is written as a spoken pause); and a
// fragment too long to be one breath is broken at its commas. Anything without
// those seams stays whole — a phrase that is a bit long reads better than one
// chopped mid-thought.
// ---------------------------------------------------------------------------

export interface Phrase {
  text: string;
  /** True when the phrase closes a sentence — the pause after it is longer. */
  endsSentence: boolean;
}

/** A fragment longer than this many words gets broken at its commas. */
const MAX_PHRASE_WORDS = 9;

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function splitLongFragment(fragment: string): string[] {
  if (wordCount(fragment) <= MAX_PHRASE_WORDS) return [fragment];
  const commaParts = fragment.split(/(?<=,)\s+/);
  if (commaParts.length === 1) return [fragment];
  // Greedily merge comma-separated clauses back together while they still fit
  // in one breath, so "a, b" does not become two two-word stutters.
  const chunks: string[] = [];
  let current = "";
  for (const part of commaParts) {
    if (!current) {
      current = part;
    } else if (wordCount(current) + wordCount(part) <= MAX_PHRASE_WORDS) {
      current = `${current} ${part}`;
    } else {
      chunks.push(current);
      current = part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** One paragraph of chapter copy, broken into its written beats. */
export function phrasesOf(line: string): Phrase[] {
  const fragments = line.split(/(?<=[.!?])\s+|(?<=—)\s+/).filter(Boolean);
  const phrases: Phrase[] = [];
  for (const fragment of fragments) {
    for (const chunk of splitLongFragment(fragment)) {
      phrases.push({ text: chunk, endsSentence: /[.!?]$/.test(chunk) });
    }
  }
  return phrases;
}

/** Every phrase of every line of a chapter, in writing order. */
export function chapterPhrases(lines: string[]): Phrase[] {
  return lines.flatMap(phrasesOf);
}

// ---------------------------------------------------------------------------
// Timing. The writing is word-by-word CSS (see InkText); these numbers are the
// controller's model of how long that takes plus the breath after it, so the
// clock and the ink agree. All approximate and tuned by eye, per the brief:
// a phrase lands in roughly 250–450ms of animation, the pause after it runs
// roughly 350–700ms, and a finished sentence earns a slightly longer one.
// ---------------------------------------------------------------------------

/** ms/word between word starts. Must match the `pace` InkPhrase passes to CSS. */
export const PHRASE_WORD_PACE = 34;
/** ms one word's ink takes to land. Must match the CSS tome-ink-in duration. */
export const WORD_INK_MS = 420;

/** How long a phrase is visibly being written. */
export function phraseWriteMs(phrase: Phrase): number {
  return (wordCount(phrase.text) - 1) * PHRASE_WORD_PACE + WORD_INK_MS;
}

/** The breath after a phrase, before the next one begins. */
export function phrasePauseMs(phrase: Phrase): number {
  const base = Math.min(700, Math.max(350, 240 + wordCount(phrase.text) * 40));
  return base + (phrase.endsSentence ? 220 : 0);
}
