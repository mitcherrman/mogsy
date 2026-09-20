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
import type { CSSProperties } from "react";
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

/** Spelled numerals for the sub-line. A block outside this range falls back
 *  to the digit, which is still true and still reads in the beat. */
const SPELLED = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
] as const;

/**
 * The sub-line, derived from the block's OWN card count.
 *
 * `FIVE CARDS` is the approved copy and the production ladder's blocks are
 * five — but the count is published per block (`segmentState.challengeCount`)
 * and a hardcoded "FIVE" would describe a four-card block wrongly. Derived,
 * it cannot.
 *
 * THE SECOND CLAUSE IS `THINK FAST`, AND THE EARLIER `FASTEST WINS` WAS WRONG.
 * The Ranked Rules panel is explicit that speed is a bonus on a clean run and
 * not the win condition — "each correct answer +1; perfect module, and first
 * to finish +1 … miss one and there is no speed bonus, however fast you
 * were". A player told that the fastest wins would be told to trade accuracy
 * for speed, which is the opposite of how the module scores. `THINK FAST`
 * keeps the urgency and claims nothing about the result.
 */
export function metaReflexSubline(cardCount: number | null | undefined): string | null {
  if (typeof cardCount !== "number" || !Number.isFinite(cardCount) || cardCount <= 0) {
    return null;
  }
  const n = Math.floor(cardCount);
  const word = n < SPELLED.length ? SPELLED[n] : String(n);
  return `${word} ${n === 1 ? "CARD" : "CARDS"} \u00b7 THINK FAST`;
}

export interface MetaReflexStingProps {
  /**
   * RFX1 2B3 — how long the beat is HELD, from the Ranked presentation
   * coordinator. Published to CSS as `--mr-sting-ms`, which is what makes the
   * ANIMATION last as long as the ELEMENT does. Defaults to `STING_MS`, so
   * the Daily and every harness are byte-identical.
   */
  durationMs?: number;
  /**
   * RFX1 2B3 — WHICH TREATMENT, and it defaults to the one that shipped.
   *
   * `"sting"` is the original: a 64px band pinned to the top of the module
   * viewport, no scrim, no sub-line. It is what the Daily Challenge draws and
   * what every harness draws, and this phase deliberately does not change
   * that mode.
   *
   * `"beat"` is the Ranked MEDIUM presentation beat: centred in the viewport,
   * over a 55% scrim, with the block's card count underneath. Ranked opts in;
   * nobody else does.
   */
  variant?: "sting" | "beat";
  /** The block's real card count, for the sub-line. `beat` variant only. */
  cardCount?: number | null;
  /** Settings -> Reduce Motion, for the static treatment. */
  reducedMotion?: boolean;
}

export function MetaReflexSting({
  durationMs = STING_MS, variant = "sting", cardCount = null,
  reducedMotion = false,
}: MetaReflexStingProps = {}) {
  const beat = variant === "beat";
  const subline = beat ? metaReflexSubline(cardCount) : null;
  return (
    <div
      aria-hidden
      data-testid="mr-sting"
      data-sting-ms={String(Math.round(durationMs))}
      data-sting-variant={variant}
      data-reduced-motion={reducedMotion ? "true" : undefined}
      /**
       * THE DURATION LIVES IN CSS NOW.
       *
       * Before 2B3 the three keyframes were a complete in-AND-OUT cycle
       * hardcoded at 720 ms with `animation-fill-mode: both`, so they came to
       * rest at `opacity: 0`. 2B3 then held the ELEMENT for 1800 ms — which
       * meant roughly 1080 ms of every Ranked mode-shift beat was a mounted,
       * fully transparent overlay over a locked card. The tests could not see
       * it: they assert the duration, not the pixels.
       *
       * Publishing the coordinator's window here, and rewriting the keyframes
       * to hold CENTRED AND OPAQUE through the middle of whatever duration
       * they are given, is the whole fix. The variable defaults to 720 ms so
       * the Daily's sting is unchanged to the millisecond.
       */
      style={{ "--mr-sting-ms": `${Math.round(durationMs)}ms` } as CSSProperties}
      // `pointer-events-none` is load-bearing: the card underneath must stay
      // clickable for the whole animation. The scrim is a sibling BACKGROUND,
      // so it dims the arena without ever being the thing that eats a click.
      className={beat
        ? "mr-sting pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden"
        : "mr-sting pointer-events-none absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-center gap-2 overflow-hidden"}
    >
      {beat && <span aria-hidden className="mr-sting__scrim" />}
      {/* The band is a wrapper only in the `beat` variant; the `sting`
          variant IS the row, exactly as it always was. */}
      <Band wrapped={beat} />
      {subline !== null && (
        <p className="mr-sting__subline" data-testid="mr-sting-subline">{subline}</p>
      )}
    </div>
  );
}

/** The wordmark itself — identical in both variants, which is the point: the
 *  mode's visual identity is not being replaced, only re-staged. */
function Band({ wrapped }: { wrapped: boolean }) {
  const words = (
    <>
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
    </>
  );
  return wrapped ? <div className="mr-sting__band">{words}</div> : words;
}
