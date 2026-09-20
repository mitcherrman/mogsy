/**
 * QUIZ1 Phase 11 — the Meta Reflex mode-transition sting.
 * RFX1 2B3 — now the MEDIUM presentation beat for entering a block.
 *
 * Plays ONCE when a block is entered, never between cards.
 *
 * WHY IT WAS 720 MS AND AN OVERLAY, AND WHAT CHANGED
 * ──────────────────────────────────────────────────
 * When this shipped, the backend started card 1's deadline at the instant it
 * CREATED the block, before this client had polled — so the card clock was
 * already running when the first card rendered, and anything that covered or
 * replaced the card would have spent the player's own answer window on
 * itself. 720 ms of decoration over a live surface was the only shape that
 * was honest about that clock.
 *
 * RFX1 2B1 removed the premise. `_open_segment` now opens a round at
 * `now + presentation_ms`, and `start_card_deadline` is anchored on that same
 * instant — so a lead-in given to the block round is time card 1 does not
 * pay for. RFX1 2B3 sizes that lead for a real mode-shift beat
 * (`pacing.SPECIAL_TRANSITION_VISIBLE_MS`), and the card underneath is
 * visible-but-LOCKED for it, exactly as round 1 is during its own preview.
 *
 * The overlay shape is kept anyway: `pointer-events: none` costs nothing now
 * that input is closed by `started_at`, and it means a clock error can only
 * ever produce a harmless banner rather than a curtain over a live card.
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

/**
 * The sting's own duration, and the DEFAULT for every caller that does not
 * supply one — the Daily, which has no server-owned lead-in to sit in and
 * whose behaviour this phase deliberately does not change. Matches the CSS
 * animation duration.
 */
export const STING_MS = 720;

/**
 * Returns the block key to play a sting FOR, or null.
 *
 * A hook rather than an effect inside the sting so the decision — "is this a
 * new block?" — is testable on its own, and so the sting element only exists
 * while it is actually playing.
 */
export function useEntrySting(
  blockKey: string | null,
  /**
   * RFX1 2B3 — HOW LONG THE BEAT IS HELD, from the Ranked presentation
   * coordinator. Ranked passes the server-anchored Meta Reflex entry window
   * (`SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]`, clamped to the
   * round's own lead-in); everything else keeps `STING_MS` and is unchanged.
   *
   * 0 means DO NOT PLAY: a reconnect or a refresh into a block whose lead-in
   * is already spent is not owed a mode-shift warning for a mode it is
   * already in.
   */
  durationMs: number = STING_MS,
): boolean {
  // "Which block have I already played for" is a REF, not state, and that is
  // load-bearing: as state it would be an effect dependency, so recording it
  // re-ran the effect, whose cleanup cancelled the timer that ends the sting —
  // and the guard then returned early without setting a new one. The sting ran
  // forever. A ref records the fact without re-triggering the effect.
  const playedFor = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (blockKey === null || blockKey === playedFor.current) return;
    // Read at the START of the beat and deliberately not a dependency: the
    // Ranked window counts down every render, and depending on it would
    // restart the timer on every tick. Same rule as `CentralStage`'s title.
    if (durationMs <= 0) { playedFor.current = blockKey; return; }
    playedFor.current = blockKey;
    setPlaying(true);
    const id = window.setTimeout(() => setPlaying(false), durationMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
