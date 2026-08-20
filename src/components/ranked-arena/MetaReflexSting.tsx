/**
 * QUIZ1 Phase 11 — the Meta Reflex mode-transition sting.
 *
 * Plays ONCE when a block is entered, never between cards.
 *
 * The timing constraint, and why this is an overlay rather than a curtain
 * ────────────────────────────────────────────────────────────────────────
 * The backend starts card 1's deadline at the instant it CREATES the block
 * (`ranked_public/service.py` calls `sf.start_card_deadline` inside the same
 * transaction that inserts the round), before this client has polled. The card
 * clock is therefore already running when the first card renders. A 720ms
 * animation that covered or replaced the card would spend 12% of a six-second
 * window on itself, and the player would have no way to get it back.
 *
 * So the sting does not gate anything. It is `pointer-events: none`, it is
 * bounded to the block HEADER band rather than the choice buttons, and it does
 * not delay, defer or remount the card beneath it. The full server window
 * stays interactive for its whole duration; the animation is decoration laid
 * over a live surface, which is the only shape that is honest about the clock.
 *
 * Reduced motion is handled in CSS (`src/index.css`): the two words stop
 * travelling and simply appear centred and fade.
 *
 * ASSET NOTE: there is no Meta Reflex emblem PNG in the repository. The
 * central mark below is drawn inline in the block's own brass accent rather
 * than inventing a brand asset for this phase; a real emblem replaces exactly
 * this one element when one exists.
 */
import { useEffect, useRef, useState } from "react";

/** Total sting duration. Must match the CSS animation duration. */
export const STING_MS = 720;

/**
 * Returns the block key to play a sting FOR, or null.
 *
 * A hook rather than an effect inside the sting so the decision — "is this a
 * new block?" — is testable on its own, and so the sting element only exists
 * while it is actually playing.
 */
export function useEntrySting(blockKey: string | null): boolean {
  // "Which block have I already played for" is a REF, not state, and that is
  // load-bearing: as state it would be an effect dependency, so recording it
  // re-ran the effect, whose cleanup cancelled the timer that ends the sting —
  // and the guard then returned early without setting a new one. The sting ran
  // forever. A ref records the fact without re-triggering the effect.
  const playedFor = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (blockKey === null || blockKey === playedFor.current) return;
    playedFor.current = blockKey;
    setPlaying(true);
    const id = window.setTimeout(() => setPlaying(false), STING_MS);
    return () => window.clearTimeout(id);
  }, [blockKey]);
  return playing;
}

export function MetaReflexSting() {
  return (
    <div
      aria-hidden
      data-testid="mr-sting"
      // `pointer-events-none` is load-bearing: the card underneath must stay
      // clickable for the whole animation. `overflow-hidden` keeps the two
      // words' travel inside the band instead of over the choice buttons.
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-center gap-2 overflow-hidden"
    >
      <span className="mr-sting__word--left text-2xl font-black uppercase tracking-[0.18em] text-[#e8c97a] sm:text-3xl">
        Meta
      </span>
      <span className="mr-sting__mark inline-flex h-6 w-6 items-center justify-center text-[#7fd6ef] sm:h-7 sm:w-7">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinejoin="round" className="h-full w-full" aria-hidden>
          <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
        </svg>
      </span>
      <span className="mr-sting__word--right text-2xl font-black uppercase tracking-[0.18em] text-[#7fd6ef] sm:text-3xl">
        Reflex
      </span>
    </div>
  );
}
