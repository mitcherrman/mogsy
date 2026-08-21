import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AcademyChapter } from "./academyChapters";
import {
  chapterSentences,
  DOCKET_PAUSE_MS,
  DOCKET_WRITE_MS,
  headingWriteMs,
  INK_SETTLE_TAIL_MS,
  MARGINALIA_PAUSE_MS,
  MARGINALIA_WRITE_MS,
  OPENING_PAUSE_MS,
  HEADING_PAUSE_MS,
  sentencePauseMs,
  sentenceWriteMs,
} from "./phrases";

// ---------------------------------------------------------------------------
// The sequence controller for the cinematic Academy introduction (HI1-C).
//
// One position — `{ chapter, step }` — and a timer that pushes it forward. Every
// piece of a chapter's WRITING (its heading, each SENTENCE of its copy, its
// marginalia) is a SLOT, and `step` is how many of them have been released onto
// the page. The view renders slot N once `step > N`; nothing here knows what a
// slot looks like, and nothing in the view decides when it appears.
//
// THE SLOT IS A SENTENCE (HI1-C3). It used to be a phrase — a clause or comma
// group — and the controller therefore stopped five or six times a chapter,
// several of them mid-thought, because a stop is simply what sits between two
// slots. Making the slot a sentence is the whole cadence fix: the page now
// stops only where a reader would, the writing inside a slot runs continuously
// however far it wraps, and the pauses that remain are short. Every duration
// this file uses lives in phrases.ts.
//
// TWO CHANNELS, ONE CLOCK (HI1-C2). The illustration is deliberately NOT a
// slot. It is its own channel, keyed off the writing's progress: it begins
// once the first sentence starts arriving (`artRevealed`) and then develops on
// its own long CSS timeline while the remaining sentences are still being
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
 * Slot 0 is the eyebrow and heading together; then one slot per SENTENCE of
 * body copy (see phrases.ts — a whole sentence, written straight through,
 * however many display lines it wraps onto); then marginalia if the chapter has
 * any; and on the finale, one final slot for the two exits. The illustration is
 * not a slot — it is the second channel, keyed off `artRevealed`. Exported
 * because the view resolves the same slot numbers and the two must never
 * disagree.
 *
 * HI1-C3 halved this count without touching a word of copy: the same paragraph
 * that used to be five or six phrase slots is now two or three sentence slots,
 * which is the whole of the "stop pausing every line" fix — the controller
 * simply has fewer places it can stop.
 */
export function slotCount(chapter: AcademyChapter): number {
  return (
    1 +
    chapterSentences(chapter.lines).length +
    (hasAnnotation(chapter) ? 1 : 0) +
    (hasTerminal(chapter) ? 1 : 0)
  );
}

/**
 * The annotation slot: marginalia, or the last spread's reference docket.
 *
 * One slot, never two — a chapter has one or the other. They are different
 * furniture for the same job (what is actually in there?) on pages with
 * different subjects, and giving the docket its own extra stop would add a beat
 * to the one page that already carries the most.
 */
export function hasAnnotation(chapter: AcademyChapter): boolean {
  return Boolean(chapter.marginalia?.length || chapter.docket?.length);
}

/**
 * The terminal slot: the finale's two exits, or the register's form.
 *
 * Both are CONTROLS rather than writing, both are the last thing to arrive on
 * their page, and both mean the same thing to the sequence — that this page's
 * forward action belongs to the page and not to the tome's Next. Treating them
 * as one slot kind is what keeps useRevealSequence unaware of either.
 */
export function hasTerminal(chapter: AcademyChapter): boolean {
  return Boolean(chapter.finale || chapter.registration);
}

/**
 * The writing already on the page when the illustration starts.
 *
 * `step >= 2` means the heading has been written and the first SENTENCE is
 * being written — "roughly one beat after the first text line". The CSS adds
 * its own small delay on top so the painting visibly starts under words already
 * arriving, never in lockstep with them.
 *
 * The slower writing of HI1-C3 only deepens this: a sentence now occupies two
 * to three seconds rather than one, so the illustration's whole wash runs
 * underneath a single sentence still being written instead of racing it.
 */
export const ART_START_STEP = 2;

/**
 * How long the sequence holds at `step` before releasing the next slot —
 * i.e. how long slot `step - 1`'s ink takes to land, plus the breath after it.
 *
 * Sentences are timed from their own length (see phrases.ts) so a long one is
 * never overtaken by the next; the beats around them are fixed. Every number
 * lives in phrases.ts — this function is only the assignment of those numbers
 * to slots, so the cadence can be retuned in one file.
 */
function slotHold(chapter: AcademyChapter, step: number): number {
  if (step === 0) return OPENING_PAUSE_MS;
  if (step === 1) return headingWriteMs(chapter.eyebrow, chapter.heading) + HEADING_PAUSE_MS;
  const sentences = chapterSentences(chapter.lines);
  const sentence = sentences[step - 2];
  if (sentence) return sentenceWriteMs(sentence) + sentencePauseMs(sentence);
  // Past the prose there is at most one written slot left — the annotation.
  if (chapter.docket?.length) return DOCKET_WRITE_MS + DOCKET_PAUSE_MS;
  return MARGINALIA_WRITE_MS + MARGINALIA_PAUSE_MS;
}

/** Visible writing time of the slot just released — the scribble's window. */
export function slotWriteMs(chapter: AcademyChapter, slot: number): number {
  if (slot === 0) return headingWriteMs(chapter.eyebrow, chapter.heading);
  const sentences = chapterSentences(chapter.lines);
  const sentence = sentences[slot - 1];
  if (sentence) return sentenceWriteMs(sentence);
  if (slot === 1 + sentences.length) {
    if (chapter.docket?.length) return DOCKET_WRITE_MS;
    if (chapter.marginalia?.length) return MARGINALIA_WRITE_MS;
  }
  return 0; // the exits and the register's form arrive; they are not written
}

/**
 * How long the last slot's ink needs to land after it is released.
 *
 * `step` reaching the slot count means every piece has been RELEASED, not that
 * it has finished arriving — the words of the final sentence are still
 * darkening into place after that. Without this the control would offer "Next"
 * over a page that is visibly still being written, and a visitor taking it at
 * its word would turn away from words they never saw. The chapter is only
 * "complete" once the ink has settled.
 *
 * DERIVED, NOT A CONSTANT (HI1-C3). This used to be a flat 700ms, which held
 * only because HI1-C2's final beat was a short phrase; a whole final sentence
 * written at the new pace can take twice that, and a fixed number would have
 * quietly reintroduced the exact bug this guard exists to prevent. It is now
 * the last slot's own write window plus a small tail, so it is correct for any
 * copy. The floor covers the finale, whose last slot is the two exits — they
 * arrive, they are not written.
 */
function settleMs(chapter: AcademyChapter): number {
  return Math.max(320, slotWriteMs(chapter, slotCount(chapter) - 1) + INK_SETTLE_TAIL_MS);
}

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
  /**
   * Turn the page unconditionally. The register's submit uses this; nothing
   * else should, because everywhere else the dual-purpose `advance` is the
   * correct meaning of a press.
   */
  goNext: () => void;
  /** Back to the previous chapter, shown complete. */
  back: () => void;
  canGoBack: boolean;
  isFinale: boolean;
  /**
   * True on the register — the one chapter whose forward action is its own
   * form. `advance()` still FINISHES it (an impatient tap must always be able
   * to land the writing), but the page refuses to turn it; see
   * AcademyWelcomePage.
   */
  isRegistration: boolean;
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
  const isRegistration = Boolean(chapter.registration);
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

  /**
   * Turn to the next chapter, whatever this one's ink is doing.
   *
   * Separate from `advance()` because the register's own submit button can be
   * pressed during the settle window — the form is released with the rest of
   * its slots, a beat before `complete` becomes true — and a turn that quietly
   * became "finish the current page" instead would leave the visitor looking at
   * a register they had just handed in. `advance()` still routes through here,
   * so there remains exactly one way a chapter is left.
   */
  const goNext = useCallback(() => {
    if (chapterIndex >= chapters.length - 1) return;
    goToChapter(chapterIndex + 1, { revealed: reducedMotion });
  }, [chapterIndex, chapters.length, goToChapter, reducedMotion]);

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
    goNext();
  }, [complete, total, goNext]);

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

    const delay = released ? settleMs(chapter) : slotHold(chapter, step);
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
      goNext,
      back,
      canGoBack: chapterIndex > 0,
      isFinale,
      isRegistration,
    }),
    [
      chapterIndex,
      chapter,
      step,
      total,
      complete,
      released,
      artRevealed,
      instant,
      advance,
      goNext,
      back,
      isFinale,
      isRegistration,
    ],
  );
}
