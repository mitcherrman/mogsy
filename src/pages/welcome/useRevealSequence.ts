import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AcademyChapter } from "./academyChapters";
import {
  BLOCK_FADE_MS,
  BLOCK_PAUSE_MS,
  chapterBlocks,
  CONTROL_PAUSE_MS,
  HEADING_FADE_MS,
  HEADING_PAUSE_MS,
  OPENING_PAUSE_MS,
  SETTLE_TAIL_MS,
} from "./cadence";

// ---------------------------------------------------------------------------
// The sequence controller for the cinematic Academy introduction.
//
// One position — `{ chapter, step }` — and a timer that pushes it forward.
// Every piece of a chapter is a SLOT, and `step` is how many of them have been
// released onto the page. The view renders slot N once `step > N`; nothing here
// knows what a slot looks like, and nothing in the view decides when it
// appears.
//
// THE SLOT IS A BLOCK. It was a phrase (HI1-C2), then a sentence (HI1-C3), and
// under both the words themselves were revealed one at a time. A slot is now a
// whole BLOCK of copy — one authored line — arriving in one piece. That is the
// pacing rewrite in a sentence: the controller has fewer places it can stop,
// and each stop is short. Every duration lives in cadence.ts.
//
// TWO CHANNELS, ONE CLOCK. The illustration is deliberately NOT a slot. It is
// its own channel, keyed off the copy's progress: it begins once the first
// block arrives (`artRevealed`) and then settles on its own CSS timeline while
// the remaining blocks land. The page's champion drawing rides the same
// channel, as ONE layer — see AcademyTome. That controlled desynchronisation —
// copy first, art a beat behind it, both alive at once — is the choreography
// the redesign asks for, and it costs the controller one derived boolean.
//
// THE PAGE NEVER TURNS ITSELF (HI1-C2). A chapter reveals itself, settles, and
// then STOPS — the finished spread stays up until the visitor presses Next. An
// earlier build auto-advanced after a dwell; that swept readers off pages
// mid-thought, so the dwell is gone and the only page-turn is the visitor's.
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
 * How many reveal slots a chapter has.
 *
 * Slot 0 is the chapter label and heading together; then one slot per BLOCK of
 * body copy; then, on the two pages that have one, a terminal slot for the
 * control that belongs to the page (the finale's exits, or the register's
 * form); then, on the register alone, the sign-in line. The illustration is not
 * a slot — it is the second channel, keyed off `artRevealed`. Exported because
 * the view resolves the same slot numbers and the two must never disagree.
 *
 * The annotation slot that used to sit between the copy and the terminal is
 * gone with the marginalia pills and the reference docket it served.
 */
export function slotCount(chapter: AcademyChapter): number {
  return (
    1 + chapterBlocks(chapter.lines).length + (hasTerminal(chapter) ? 1 : 0) + (hasSignIn(chapter) ? 1 : 0)
  );
}

/**
 * The terminal slot: the finale's two exits, or the register's form.
 *
 * Both are CONTROLS rather than copy, both are the last thing to arrive on
 * their page, and both mean the same thing to the sequence — that this page's
 * forward action belongs to the page and not to the tome's Next. Treating them
 * as one slot kind is what keeps useRevealSequence unaware of either.
 */
export function hasTerminal(chapter: AcademyChapter): boolean {
  return Boolean(chapter.finale || chapter.registration);
}

/**
 * The register's last slot: the quiet "already have an account?" line.
 *
 * A SLOT OF ITS OWN, which is the entire mechanism behind the rule that it
 * arrives last. It is not part of the form and it is not part of the copy;
 * it is one more thing the page releases, after the register and its button
 * have finished arriving, so a new visitor reads the register as the page's
 * business and only then notices the way out. Nothing about it is optional at
 * the sequence level — the register always has one — so the count is exact and
 * the view's slot numbers cannot drift from it.
 */
export function hasSignIn(chapter: AcademyChapter): boolean {
  return Boolean(chapter.registration);
}

/**
 * The copy already on the page when the illustration channel starts.
 *
 * `step >= 2` means the heading has landed and the first BLOCK is arriving.
 * The CSS adds its own small delay on top, so the illustration and the page's
 * champion drawing visibly begin under copy already on the paper, never in
 * lockstep with it.
 */
export const ART_START_STEP = 2;

/**
 * The breath after slot `slot` has finished arriving.
 *
 * Paired with slotRevealMs below, this is the whole cadence model: a slot takes
 * as long to arrive as its KIND takes, and is then followed by a beat chosen
 * for the same reason. Splitting it out this way is what lets a control that
 * arrives after another control (the register's sign-in line) get its own beat
 * without this function growing a special case per page.
 */
function slotPauseMs(chapter: AcademyChapter, slot: number): number {
  if (slot === 0) return HEADING_PAUSE_MS;
  if (slot <= chapterBlocks(chapter.lines).length) return BLOCK_PAUSE_MS;
  // A control arrived. The beat before whatever follows it.
  return CONTROL_PAUSE_MS;
}

function slotHold(chapter: AcademyChapter, step: number): number {
  if (step === 0) return OPENING_PAUSE_MS;
  return slotRevealMs(chapter, step - 1) + slotPauseMs(chapter, step - 1);
}

/**
 * How long the slot just released takes to ARRIVE — and so the window the
 * pen's sound is scheduled for.
 *
 * Flat per kind rather than derived from the copy's length, which is the
 * consequence of a block arriving in one piece: a long paragraph and a short
 * one now fade in over the same BLOCK_FADE_MS, because neither is being
 * written a word at a time. Controls are not drawn at all, so they return 0 and
 * the pen stays silent for them.
 */
export function slotRevealMs(chapter: AcademyChapter, slot: number): number {
  if (slot === 0) return HEADING_FADE_MS;
  if (slot <= chapterBlocks(chapter.lines).length) return BLOCK_FADE_MS;
  return 0; // exits, the register's form and its sign-in line are not drawn
}

/**
 * How long the last slot needs to land after it has been released.
 *
 * `step` reaching the slot count means every piece has been RELEASED, not that
 * it has finished arriving — the last block is still settling. Without this the
 * control would offer "Next" over a page visibly still assembling itself, and a
 * visitor taking it at its word would turn away from words they never saw. The
 * chapter is only "complete" once the last slot has landed.
 *
 * Derived rather than a constant, so re-tuning BLOCK_FADE_MS cannot silently
 * reintroduce the bug this guard exists to prevent. The floor covers the
 * finale, whose last slot is the two exits — they arrive, they are not drawn.
 */
function settleMs(chapter: AcademyChapter): number {
  return Math.max(220, slotRevealMs(chapter, slotCount(chapter) - 1) + SETTLE_TAIL_MS);
}

export interface RevealSequence {
  chapterIndex: number;
  chapter: AcademyChapter;
  /** Slots released so far. The view shows slot N while `step > N`. */
  step: number;
  /** Total slots on the current chapter. */
  total: number;
  /** Every slot is out AND the last has landed. The page now waits for Next. */
  complete: boolean;
  /** Every slot is out. True a beat before `complete` while the last settles. */
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
   * to land the copy), but the page refuses to turn it; see
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
   * clock holds so the incoming chapter does not start revealing itself under
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
      // Mid-reveal: land the rest of this page at once — including whatever is
      // still arriving. Never a page turn: an impatient tap must not cost the
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
