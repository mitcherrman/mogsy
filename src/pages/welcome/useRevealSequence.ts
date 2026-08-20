import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AcademyChapter } from "./academyChapters";
import { chapterPhrases, phrasePauseMs, phraseWriteMs } from "./phrases";

// ---------------------------------------------------------------------------
// The sequence controller for the cinematic Academy introduction (HI1-C).
//
// One position — `{ chapter, step }` — and a timer that pushes it forward. Every
// piece of a chapter's WRITING (its heading, each phrase of its copy, its
// marginalia) is a SLOT, and `step` is how many of them have been released onto
// the page. The view renders slot N once `step > N`; nothing here knows what a
// slot looks like, and nothing in the view decides when it appears.
//
// TWO CHANNELS, ONE CLOCK (HI1-C2). The illustration is deliberately NOT a
// slot. It is its own channel, keyed off the writing's progress: it begins
// once the first phrase is on the page (`artRevealed`) and then develops on
// its own long CSS timeline while the remaining phrases are still being
// written. That controlled desynchronisation — writing first, painting a beat
// behind it, both alive at once — is the choreography the redesign asks for,
// and it costs the controller nothing: one derived boolean.
//
// THE PAGE NEVER TURNS ITSELF (HI1-C2). A chapter writes itself out, settles,
// and then STOPS — the finished spread stays up until the visitor presses
// Next. The earlier build auto-advanced after a dwell; that swept readers off
// pages mid-thought, so the dwell is gone and the only page-turn is the
// visitor's.
//
// WHY A COUNTER AND NOT AN ANIMATION LIBRARY. HI1-1 shipped, and then had to
// remove, `<AnimatePresence mode="wait">`: it holds the incoming child until the
// outgoing child's exit reports completion, and a second click during that exit
// stranded the page on a correct state above an empty content area. A plain
// integer cannot strand. Every visual reveal here is a CSS animation on freshly
// mounted markup, so it has no completion the controller can wait on and no way
// to deadlock however fast the visitor clicks.
//
// ONE CONTROL, TWO MEANINGS. `advance()` is the dual-purpose action the redesign
// asks for: mid-reveal it FINISHES the current chapter (everything lands at
// once), and on a finished chapter it turns the page. That is what makes the
// experience feel like one unfolding sequence rather than a slideshow — the same
// tap always means "I'm ready", and the sequence works out what that implies.
// ---------------------------------------------------------------------------

/**
 * How many reveal slots a chapter's writing has.
 *
 * Slot 0 is the eyebrow and heading together; then one slot per PHRASE of body
 * copy (see phrases.ts — the conversational beat, not the paragraph); then
 * marginalia if the chapter has any; and on the finale, one final slot for the
 * two exits. The illustration is not a slot — it is the second channel, keyed
 * off `artRevealed`. Exported because the view resolves the same slot numbers
 * and the two must never disagree.
 */
export function slotCount(chapter: AcademyChapter): number {
  return (
    1 +
    chapterPhrases(chapter.lines).length +
    (chapter.marginalia?.length ? 1 : 0) +
    (chapter.finale ? 1 : 0)
  );
}

/**
 * The writing already on the page when the illustration starts.
 *
 * `step >= 2` means the heading has been written and the first phrase is being
 * written — the brief's "roughly one beat after the first text line". The CSS
 * adds its own small delay on top so the painting visibly starts under words
 * already arriving, never in lockstep with them.
 */
export const ART_START_STEP = 2;

/**
 * How long the sequence holds at `step` before releasing the next slot —
 * i.e. how long slot `step - 1`'s ink takes to land, plus the breath after it.
 *
 * Phrases are timed from their own length (see phrases.ts) so a long clause is
 * not overtaken by the next one; the beats around them are fixed. None of this
 * is a hard spec — it is the pacing model, tuned by eye against the CSS.
 */
function slotHold(chapter: AcademyChapter, step: number): number {
  if (step === 0) return 260; // the page settling before the pen touches it
  if (step === 1) return 950; // the eyebrow and heading being written
  const phrases = chapterPhrases(chapter.lines);
  const phrase = phrases[step - 2];
  if (phrase) return phraseWriteMs(phrase) + phrasePauseMs(phrase);
  return 600; // marginalia settling in
}

/** Visible writing time of the slot just released — the scribble's window. */
export function slotWriteMs(chapter: AcademyChapter, slot: number): number {
  if (slot === 0) return 850; // eyebrow + heading
  const phrases = chapterPhrases(chapter.lines);
  const phrase = phrases[slot - 1];
  if (phrase) return phraseWriteMs(phrase);
  if (chapter.marginalia?.length && slot === 1 + phrases.length) return 420;
  return 0; // the finale's exits arrive, they are not written
}

/**
 * How long the last slot's ink needs to land after it is released.
 *
 * `step` reaching the slot count means every piece has been RELEASED, not that
 * it has finished arriving — the words of the final phrase are still darkening
 * into place for a few hundred milliseconds after that. Without this the
 * control would offer "Next" over a page that is visibly still being written,
 * and a visitor taking it at its word would turn away from words they never
 * saw. The chapter is only "complete" once the ink has settled.
 */
const INK_SETTLE = 700;

export interface RevealSequence {
  chapterIndex: number;
  chapter: AcademyChapter;
  /** Slots released so far. The view shows slot N while `step > N`. */
  step: number;
  /** Total slots on the current chapter. */
  total: number;
  /** Every slot is out AND its ink has landed. The page now waits for Next. */
  complete: boolean;
  /** Every slot is out. True a beat before `complete` while the ink settles. */
  released: boolean;
  /** The illustration channel has begun (or arrived, under skip/reduce). */
  artRevealed: boolean;
  /**
   * True when the current slots arrived by skip or by stepping back rather
   * than on their own beat — the view drops its stagger so they land at once
   * instead of replaying an animation the visitor just said they were done
   * with.
   */
  instant: boolean;
  /** Finish this chapter's reveal, or turn the page if it is already finished. */
  advance: () => void;
  /** Back to the previous chapter, shown complete. */
  back: () => void;
  canGoBack: boolean;
  isFinale: boolean;
}

export function useRevealSequence({
  chapters,
  /**
   * Reduced motion turns the whole thing off: no timer, and every chapter opens
   * complete. A motion-sensitive visitor gets the same words and the same
   * artwork with nothing moving or changing under them, and turns the pages
   * themselves. See the note in AcademyWelcomePage.
   */
  reducedMotion = false,
  /**
   * True while the physical page-turn is playing over this hook's output. The
   * clock holds so the incoming chapter does not start writing itself under
   * the turning sheet; it resumes the moment the sheet lands.
   */
  paused = false,
}: {
  chapters: AcademyChapter[];
  reducedMotion?: boolean;
  paused?: boolean;
}): RevealSequence {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [step, setStep] = useState(() => (reducedMotion ? slotCount(chapters[0]) : 0));
  const [instant, setInstant] = useState(reducedMotion);
  const [settled, setSettled] = useState(reducedMotion);

  const chapter = chapters[chapterIndex] ?? chapters[0];
  const total = slotCount(chapter);
  const released = step >= total;
  const complete = released && settled;
  const isFinale = Boolean(chapter.finale);
  const artRevealed = released || step >= Math.min(ART_START_STEP, total);

  // Reduced motion can flip mid-session (a visitor changing the OS setting, or
  // a test that installs matchMedia after mount). Land on the complete page
  // rather than resuming a reveal nobody asked to see.
  const wasReduced = useRef(reducedMotion);
  useEffect(() => {
    if (reducedMotion && !wasReduced.current) {
      setStep(total);
      setInstant(true);
      setSettled(true);
    }
    wasReduced.current = reducedMotion;
  }, [reducedMotion, total]);

  const goToChapter = useCallback(
    (index: number, opts: { revealed: boolean }) => {
      const next = chapters[index];
      if (!next) return;
      setChapterIndex(index);
      setStep(opts.revealed ? slotCount(next) : 0);
      setInstant(opts.revealed);
      setSettled(opts.revealed);
    },
    [chapters],
  );

  const advance = useCallback(() => {
    if (!complete) {
      // Mid-reveal: land the rest of this page at once — including whatever ink
      // is still arriving. Never a page turn: an impatient tap must not cost the
      // visitor content they have not read.
      setStep(total);
      setInstant(true);
      setSettled(true);
      return;
    }
    if (chapterIndex >= chapters.length - 1) return;
    goToChapter(chapterIndex + 1, { revealed: reducedMotion });
  }, [complete, total, chapterIndex, chapters.length, goToChapter, reducedMotion]);

  const back = useCallback(() => {
    if (chapterIndex === 0) return;
    goToChapter(chapterIndex - 1, { revealed: true });
  }, [chapterIndex, goToChapter]);

  // The clock. One timeout at a time, re-armed on every position change — and
  // it only ever finishes the CURRENT page. Once a chapter is complete there is
  // nothing armed at all: the spread stays up, indefinitely, until the visitor
  // turns it. (The earlier build auto-turned after a dwell; HI1-C2 removed it.)
  useEffect(() => {
    if (reducedMotion || paused) return;
    if (complete) return;

    const delay = released ? INK_SETTLE : slotHold(chapter, step);
    // Bare setTimeout, not window.setTimeout: under vitest's jsdom environment
    // `window` is a distinct object from `globalThis`, so fake timers replace
    // only the global one — a `window.`-qualified timer is never faked and the
    // autoplay path becomes untestable.
    const id = setTimeout(() => {
      if (released) {
        setSettled(true);
      } else {
        setStep((s) => s + 1);
        // A slot arriving on its own beat animates; only skipping and stepping
        // back suppress that.
        setInstant(false);
      }
    }, delay);
    return () => clearTimeout(id);
  }, [reducedMotion, paused, complete, released, chapter, step]);

  return useMemo(
    () => ({
      chapterIndex,
      chapter,
      step,
      total,
      complete,
      released,
      artRevealed,
      instant,
      advance,
      back,
      canGoBack: chapterIndex > 0,
      isFinale,
    }),
    [chapterIndex, chapter, step, total, complete, released, artRevealed, instant, advance, back, isFinale],
  );
}
