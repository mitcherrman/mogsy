/**
 * PERFECT TIMING — THE REVEAL: the archive's cooldown against the player's stop.
 *
 * Reads top-down in the order a viewer cares: the TIER lands (big, tier-coloured)
 * with the server's points beside it; then the signed ERROR; then YOU against
 * TRUE as two plates; then one rail that draws the cooldown itself — a stone
 * track filled gold up to the TRUE cooldown, the player's stop standing as a
 * needle with the gap between the two lit (cyan for early, ember for late).
 * Last: the authority's own progression text, an "unverified timing" chip when
 * the server could not vouch for the window, and the way on.
 *
 * EVERY FIGURE IS THE SERVER'S. The component formats `PtRevealView`; it never
 * compares the two durations, never names a tier and never computes a point.
 *
 * CHOREOGRAPHY (motion allowed): the rail appears → the gold fills to the
 * truth → the stop drops onto the track → the gap lights → the error counts
 * up → the tier lands → provenance and the way on enter. ~1.6 s, every step
 * finite and `both`, so the rest frame is the settled frame. Reduced motion
 * (OS or in-app) is that rest frame from the first paint.
 *
 * THE WAY ON. Once the choreography has settled focus moves to the button, and
 * Space/Enter anywhere advance too (only once, never on a repeat, never while a
 * control or a text field has the key) — so the keyboard player who stopped with
 * Space continues with Space, and a double-tap during the reveal can never skip it.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { useCountUp } from "@/components/game-results/useCountUp";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { documentKeyIsForTimer } from "@/lib/perfect-timing/useTimingEngine";
import type { PtRevealView } from "@/lib/perfect-timing/viewModel";
import {
  TIER_WORD, errorDirection, formatMs, formatSeconds, railGeometry, revealRankText,
} from "./presentation";
import "./perfectTiming.css";

export interface PerfectTimingRevealProps {
  reveal: PtRevealView;
  /** `"key"` when Space/Enter advanced it, from the document or from the focused button. */
  onNext: (source?: "key") => void;
  /** The label on the way-on button. "Next round" by default; the last round says "See results". */
  nextLabel?: string;
  /**
   * Move focus to the way-on button once the choreography has settled, and let
   * Space/Enter advance from then on, so a keyboard player continues with the
   * same key they stopped with. Default on.
   */
  autoFocusNext?: boolean;
}

/** Where the beats fall, in ms after mount, with motion allowed. */
export const REVEAL_BEATS = {
  fill: 160,
  trueMark: 560,
  youMark: 760,
  band: 1000,
  error: 900,
  tier: 1180,
  provenance: 1400,
  next: 1500,
  /** Focus moves to the way on. Late enough that the stop's own key-up has long passed. */
  focus: 1700,
} as const;

/** Under reduced motion the frame is settled at once; focus still waits past a key-up. */
const REDUCED_FOCUS_MS = 320;

const delay = (ms: number): CSSProperties => ({ "--pt-delay": `${ms}ms` } as CSSProperties);

/** The error count: 0 → |error| while the needle settles, exact on landing. */
function ErrorFigure({ absErrorMs, animate }: { absErrorMs: number; animate: boolean }) {
  const count = useCountUp(absErrorMs, { durationMs: 620, delayMs: REVEAL_BEATS.error, animate });
  return (
    <span className="pt-error-ms" data-testid="pt-error-ms" data-landed={count.done ? "true" : "false"}>
      <span aria-hidden>{formatMs(count.value)}</span>
      <span className="sr-only">{formatMs(absErrorMs)}</span>
    </span>
  );
}

export function PerfectTimingReveal({ reveal, onNext, nextLabel = "Next round", autoFocusNext = true }: PerfectTimingRevealProps) {
  const reducedMotion = useReducedMotionPreference();
  const animate = !reducedMotion;
  const direction = errorDirection(reveal.errorMs);
  const rail = railGeometry(reveal);
  const nextRef = useRef<HTMLButtonElement>(null);
  const advanced = useRef(false);
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; });

  // The band between the truth and the stop, as rail percentages.
  const bandLeft = Math.min(rail.truePct, rail.youPct);
  const bandWidth = Math.abs(rail.truePct - rail.youPct);
  // A mark's label hangs TOWARD the rail's centre, as a pennant from its
  // needle, so it can never run past either end however narrow the rail is.
  const side = (pct: number) => (pct > 50 ? "right" : "left");
  // The scale labels at the ends yield to the true flag when it hangs over them:
  // the flag is the fact, the end is only scale.
  const startLabelHidden = rail.truePct < 14;
  // (The rail always ends at least 12% past the longer duration, so the flag never stands past ~89%.)
  const endLabelHidden = rail.truePct > 85;

  useEffect(() => {
    if (!autoFocusNext) return;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    const t = window.setTimeout(() => {
      nextRef.current?.focus({ preventScroll: true });
      // Space/Enter with focus anywhere else: advance once. A press aimed at the
      // button itself (or any control) is the control's own and is left alone.
      onKey = (e: KeyboardEvent) => {
        if (e.repeat || advanced.current || !documentKeyIsForTimer(e)) return;
        e.preventDefault();
        advanced.current = true;
        onNextRef.current("key");
      };
      document.addEventListener("keydown", onKey);
    }, animate ? REVEAL_BEATS.focus : REDUCED_FOCUS_MS);
    return () => {
      window.clearTimeout(t);
      if (onKey) document.removeEventListener("keydown", onKey);
    };
  }, [autoFocusNext, animate]);

  const sentence = `You stopped at ${formatSeconds(reveal.elapsedMs)}; the true cooldown is ${formatSeconds(reveal.targetMs)}. `
    + (direction === "exact" ? "Exact." : `${formatMs(reveal.errorMs)} ${direction}.`);

  const railStyle = {
    "--pt-true": `${rail.truePct}%`,
    "--pt-tick": `${(rail.tickMs / rail.domainMs) * 100}%`,
    "--pt-band-left": `${bandLeft}%`,
    "--pt-band-width": `${bandWidth}%`,
  } as CSSProperties;

  return (
    <section
      className="pt-reveal"
      data-testid="pt-reveal"
      data-tier={reveal.tier}
      data-direction={direction}
      data-animate={animate ? "true" : "false"}
      data-plausible={reveal.plausible ? "true" : "false"}
      aria-label="Timing result"
    >
      <p className="pt-verdict" data-testid="pt-verdict">
        <span className="pt-tier" data-testid="pt-tier">{TIER_WORD[reveal.tier]}</span>
        <span className="pt-points pt-enter" data-testid="pt-points" style={delay(REVEAL_BEATS.tier + 120)}>
          +{reveal.points}<small> pts</small>
        </span>
      </p>

      <p className="pt-error pt-enter" data-testid="pt-error" style={delay(REVEAL_BEATS.error)}>
        {direction === "exact" ? (
          <span className="pt-error-word" data-testid="pt-error-word">Exact</span>
        ) : (
          <>
            <ErrorFigure absErrorMs={reveal.absErrorMs} animate={animate} />
            <span className="pt-error-word" data-testid="pt-error-word">{direction}</span>
          </>
        )}
      </p>

      <div className="pt-plates" data-testid="pt-plates">
        <p className="pt-plate pt-enter" data-kind="you" style={delay(REVEAL_BEATS.youMark)}>
          <span>You</span><b data-testid="pt-you-time">{formatSeconds(reveal.elapsedMs)}</b>
        </p>
        <p className="pt-plate pt-enter" data-kind="true" style={delay(REVEAL_BEATS.trueMark)}>
          <span>True cooldown</span><b data-testid="pt-true-time">{formatSeconds(reveal.targetMs)}</b>
        </p>
      </div>

      <div className="pt-rail" data-testid="pt-rail" role="img" aria-label={sentence} style={railStyle}>
        <span className="pt-rail-end" data-end="start" data-hidden={startLabelHidden ? "true" : "false"} aria-hidden>0</span>
        <span className="pt-rail-end" data-end="end" data-hidden={endLabelHidden ? "true" : "false"} aria-hidden>
          {rail.endLabel}
        </span>
        <div className="pt-rail-track" aria-hidden>
          <span className="pt-rail-fill" data-testid="pt-rail-fill" />
          <span className="pt-rail-band" data-testid="pt-rail-band" />
        </div>
        <span className="pt-mark pt-mark--true" data-testid="pt-mark-true" data-side={side(rail.truePct)}
          style={{ "--pt-x": `${rail.truePct}%` } as CSSProperties} aria-hidden>
          <span className="pt-mark-inner">
            <span className="pt-mark-label"><span>True</span></span>
            <span className="pt-needle" />
          </span>
        </span>
        <span className="pt-mark pt-mark--you" data-testid="pt-mark-you" data-side={side(rail.youPct)}
          style={{ "--pt-x": `${rail.youPct}%` } as CSSProperties} aria-hidden>
          <span className="pt-mark-inner">
            <span className="pt-mark-label"><span>You</span></span>
            <span className="pt-needle" />
          </span>
        </span>
      </div>

      <p className="pt-evidence pt-enter" style={delay(REVEAL_BEATS.provenance)} data-testid="pt-provenance">
        <span data-testid="pt-evidence">Cooldown {reveal.cooldownRaw} s · {revealRankText(reveal.rank)}</span>
        {!reveal.plausible && (
          <span className="pt-chip pt-chip--warn" data-testid="pt-unverified"
            title="This stop ran longer than the server's own window for the round. Shown for honesty; the grade stands.">
            Unverified timing
          </span>
        )}
      </p>

      <button ref={nextRef} type="button" className="pt-next pt-enter" data-testid="pt-next" onClick={(e) => onNext(e.detail === 0 ? "key" : undefined)}
        style={delay(REVEAL_BEATS.next)}>
        {nextLabel}
      </button>
    </section>
  );
}
