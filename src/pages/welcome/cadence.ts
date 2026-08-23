// ---------------------------------------------------------------------------
// The reveal cadence for the cinematic Academy introduction.
//
// This module owns EVERY number in the introduction's timing, and one decision:
// what a beat is. The controller (useRevealSequence) counts beats, the view
// (AcademyWelcomePage / InkText) renders them, and the CSS animates them — all
// three read their durations from here, so the clock and the animation cannot
// drift apart.
//
// A BEAT IS A BLOCK. This is the whole of the pacing rewrite, and it replaces
// two earlier models that were both too slow to sit through:
//
//   HI1-C2  a beat was a PHRASE — a clause or comma group — and every word was
//           animated individually. Five or six stops a chapter, several of them
//           mid-thought.
//   HI1-C3  a beat became a SENTENCE, which halved the stops, but kept the
//           word-by-word writing and SLOWED it (85ms a word against a 520ms
//           ink). A two-line chapter took eight seconds to say twenty words.
//
// A beat is now a whole BLOCK — one entry of a chapter's `lines`, which is one
// short paragraph — and a block arrives as ONE PIECE. Nothing is animated per
// word, per sentence or per character. The choreography a reader sees is:
//
//   1. the chapter label and heading arrive together
//   2. the first block arrives
//   3. the next block arrives
//   4. the next, if the chapter has one
//   5. underneath all of it the illustration and the page's champion drawing
//      have been settling in as single layers since the first block
//   6. Next becomes available
//
// The interval between two of those arrivals is BLOCK_FADE_MS + BLOCK_PAUSE_MS
// and is held by test to the 350–600ms band the redesign asks for: long enough
// that the page reads as composing itself, short enough that nobody waits. The
// longest chapter in the book is now under three seconds end to end, against
// roughly nine before.
//
// SEGMENTATION IS GONE, NOT MOVED. There is no sentence splitter here any more,
// because a block is exactly what the script already authored: `lines[i]`. The
// copy's own paragraphing IS the cadence, so re-pacing a chapter is a matter of
// how it is written rather than of a regex.
// ---------------------------------------------------------------------------

/** Every block of a chapter's body, in reveal order. One per authored line. */
export function chapterBlocks(lines: string[]): string[] {
  return lines.filter((line) => line.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Timing.
//
// Two numbers per kind of beat: how long it takes to ARRIVE (which is also the
// window the pen's sound is scheduled for, and must match the CSS animation's
// duration), and the PAUSE after it before the next one is released.
// ---------------------------------------------------------------------------

/** How long a body block takes to arrive. Must match `tome-block-in` in CSS. */
export const BLOCK_FADE_MS = 340;
/** The breath after a block, before the next is released. */
export const BLOCK_PAUSE_MS = 150;

/** How long the chapter label and heading take to arrive, together. */
export const HEADING_FADE_MS = 380;
/** The beat between the heading and the chapter's first block. */
export const HEADING_PAUSE_MS = 180;

/** The page settling before the first thing lands on it. */
export const OPENING_PAUSE_MS = 220;

/**
 * The beat after a slot that is a CONTROL rather than copy.
 *
 * The finale's exits, the register's form and the register's sign-in line
 * arrive rather than being written, so there is no ink to wait on — but the
 * pause after them is what makes the NEXT thing read as a separate offer. It is
 * longer than a block's breath on purpose: the sign-in line has to feel like it
 * was added after the register was finished, not like the register's last row.
 */
export const CONTROL_PAUSE_MS = 420;

/** Tail after the last slot has landed, before the page is offered as done. */
export const SETTLE_TAIL_MS = 160;

/**
 * The gap between two consecutive body blocks arriving.
 *
 * Exported because it is the one number the pacing brief actually specifies,
 * and a test holds it inside the band rather than trusting a comment.
 */
export const BLOCK_INTERVAL_MS = BLOCK_FADE_MS + BLOCK_PAUSE_MS;

/** The gap between the heading arriving and the first block arriving. */
export const HEADING_INTERVAL_MS = HEADING_FADE_MS + HEADING_PAUSE_MS;

/** The band the brief asks every major text beat to sit inside. */
export const MIN_BEAT_MS = 350;
export const MAX_BEAT_MS = 600;
