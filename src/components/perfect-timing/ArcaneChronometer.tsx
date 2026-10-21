/**
 * PT5.2 — THE ARCANE CHRONOMETER: the casting seal's face, now a visible
 * stopwatch.
 *
 * Drawn inside the seal's existing box (`.pt-seal-face`), so the stage's fit
 * budget is unchanged: an engraved dial (60 ticks, a stronger mark every five),
 * a cyan sweep that makes one revolution a minute, the ability's medallion at
 * twelve o'clock, the big tabular numerals in the centre, a compact SECONDS
 * label and the state word (CAST / PRESS TO STOP / LOCKED / VOIDED).
 *
 * DISPLAY ONLY. The digits come from `useChronometer`, which reads the timing
 * engine's own `t0` while running and freezes on the engine's own `elapsedMs`.
 * They are written straight into the DOM from the frame loop, so nothing above
 * this component re-renders while the clock runs. Every node is decoration
 * (`aria-hidden`): a screen reader is never fed a changing number; the stage's
 * status line announces the cast, the lock and the result.
 *
 * MOTION. Everything that moves is finite and sits on its own layer (opacity,
 * SVG stroke, a transform on the sweep group), so nothing here can move the
 * instrument's box or its neighbours: the cast's ignition (a burst and one
 * light travelling once around the dial), a one-shot pulse on each whole
 * elapsed second (stronger, gold, on every fifth), and the lock flash. Under
 * reduced motion none of it plays and the sweep is hidden; the digits still run.
 *
 * PT5.3 — THE BLIND CHRONOMETER (`BlindChronometer`, the owner lab's automatic
 * flow). The same instrument with NO elapsed time while the round runs: no
 * digits, no sweep, no per-second pulse or tick, nothing that moves on a
 * period. Before the start it counts the round in (3, 2, 1 — one-shot beats in
 * the manner of the quiz countdown) and flashes CAST as the game starts it;
 * while it runs the face is still and cold, the ability's slot letter engraved
 * in the centre; once stopped it shows the player's own locked time (the
 * engine's submitted value — no longer secret, the measurement is over). There
 * is no frame loop at all: every change is a React render on a phase or beat edge.
 */
import { useCallback, useId, useRef, type ReactNode } from "react";
import { CHRONO_WIDE_FROM_MS, formatLocked, formatRunning, sweepDegrees, type PtClockReading, type SecondBeat } from "@/lib/perfect-timing/chronometer";
import { countInIsFinal, type CountInBeat } from "@/lib/perfect-timing/countIn";
import { blindReadoutFor } from "./presentation";
import { useChronometer, type ChronoFrameKind } from "@/lib/perfect-timing/useChronometer";
import type { PtPhase } from "@/lib/perfect-timing/viewModel";

/** The 60 engraved ticks, built once. Every fifth is a long brass mark. */
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0;
  const a = (i / 60) * Math.PI * 2;
  const r1 = major ? 83 : 87.5;
  const r2 = 93;
  const x = (r: number) => (100 + r * Math.sin(a)).toFixed(2);
  const y = (r: number) => (100 - r * Math.cos(a)).toFixed(2);
  return { i, major, d: `M${x(r1)} ${y(r1)}L${x(r2)} ${y(r2)}` };
});

/** The engraved dial every chronometer shares: bezel, 60 ticks, rings, the beat and ignition lights. */
function ChronoDialBase({ children }: { children?: ReactNode }) {
  return (
    <>
      <circle className="pt-chrono-bezel" cx="100" cy="100" r="96.5" />
      <g className="pt-chrono-ticks">
        {TICKS.map((t) => <path key={t.i} d={t.d} data-major={t.major ? "true" : undefined} />)}
      </g>
      <circle className="pt-chrono-ring" cx="100" cy="100" r="79.5" />
      <circle className="pt-chrono-track" cx="100" cy="100" r="76" />
      <circle className="pt-chrono-runes" cx="100" cy="100" r="66" />
      <circle className="pt-chrono-beat" cx="100" cy="100" r="76" />
      <circle className="pt-chrono-ignite" cx="100" cy="100" r="76" pathLength={100} transform="rotate(-90 100 100)" />
      {children}
    </>
  );
}

export interface ArcaneChronometerProps {
  phase: PtPhase;
  roundId: string | null;
  clock: PtClockReading | null;
  /** The ability's icon (or monogram), set as the medallion at twelve o'clock. */
  icon: ReactNode;
  /** The state word: CAST, PRESS TO STOP, LOCKED, VOIDED … */
  word: string;
  /** No ignition, pulse, flash or sweep. */
  reducedMotion: boolean;
  /** Each whole elapsed second, at most once (see `observeSecond`). The host decides the sound. */
  onBeat?: (beat: SecondBeat) => void;
}

export function ArcaneChronometer({ phase, roundId, clock, icon, word, reducedMotion, onBeat }: ArcaneChronometerProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const digitsRef = useRef<HTMLSpanElement>(null);
  const sweepRef = useRef<SVGGElement>(null);
  const tailId = useId();
  const shown = useRef<string>("0.00");
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  const write = useCallback((ms: number | null, kind: ChronoFrameKind) => {
    const root = rootRef.current;
    const digits = digitsRef.current;
    if (!root || !digits) return;
    let text = shown.current;
    if (kind === "zero") text = "0.00";
    else if (kind === "locked" && ms !== null) text = formatLocked(ms);
    else if (kind === "running" && ms !== null) text = formatRunning(ms);
    // Edit React's own text node in place (never replace it), so a later
    // render of this component cannot find a node it no longer owns.
    const node = digits.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE) { if (node.nodeValue !== text) node.nodeValue = text; }
    else digits.textContent = text;
    shown.current = text;
    root.dataset.readout = kind;
    const wide = ms !== null ? ms >= CHRONO_WIDE_FROM_MS : root.dataset.wide === "true";
    root.dataset.wide = wide ? "true" : "false";
    const sweep = sweepRef.current;
    if (sweep && ms !== null) sweep.setAttribute("transform", `rotate(${sweepDegrees(ms).toFixed(2)} 100 100)`);
  }, []);

  const beat = useCallback((b: SecondBeat) => {
    const root = rootRef.current;
    if (root) {
      // Two identical keyframes under alternating names restart a one-shot
      // animation each second without touching layout or React state.
      root.dataset.beat = b.second % 2 === 0 ? "b" : "a";
      root.dataset.mark = b.mark ? "true" : "false";
    }
    onBeatRef.current?.(b);
  }, []);

  useChronometer({ phase, roundId, clock, onFrame: write, onBeat: beat });

  return (
    <span ref={rootRef} className="pt-chrono" data-testid="pt-chrono" data-phase={phase}
      data-animate={reducedMotion ? "false" : "true"} aria-hidden>
      <svg className="pt-chrono-dial" viewBox="0 0 200 200" focusable="false">
        <defs>
          <linearGradient id={tailId} gradientUnits="userSpaceOnUse" x1="64" y1="40" x2="100" y2="24">
            <stop offset="0" stopColor="#7fd6ef" stopOpacity="0" />
            <stop offset="1" stopColor="#7fd6ef" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <ChronoDialBase>
          <g ref={sweepRef} className="pt-chrono-sweep" transform="rotate(0 100 100)">
            <path className="pt-chrono-tail" d="M66.68 31.69A76 76 0 0 1 100 24" stroke={`url(#${tailId})`} />
            <circle className="pt-chrono-pip-glow" cx="100" cy="24" r="6.5" />
            <circle className="pt-chrono-pip" cx="100" cy="24" r="3" />
          </g>
        </ChronoDialBase>
      </svg>
      <span className="pt-chrono-flare" />
      <span className="pt-seal-icon pt-chrono-medallion" data-testid="pt-seal-icon">{icon}</span>
      <span className="pt-chrono-readout">
        <span ref={digitsRef} className="pt-chrono-digits" data-testid="pt-chrono-digits">0.00</span>
        <span className="pt-chrono-unit">Seconds</span>
      </span>
      <span className="pt-seal-word pt-chrono-word" data-testid="pt-seal-word">{word}</span>
    </span>
  );
}

export interface BlindChronometerProps {
  phase: PtPhase;
  /** The engine's readings: only `elapsedMs` (once stopped) is ever drawn. */
  clock: PtClockReading | null;
  /** The count-in beat on screen, or null. */
  countIn: CountInBeat | null;
  /** This count-in pass: each beat of each pass is its own one-shot. */
  countInId: string | null;
  /** The player is holding between attempts (a held count-in shows no beat). */
  held: boolean;
  /** The ability's slot letter, engraved in the centre while the round runs. */
  slot: string;
  /** The ability's icon (or monogram), set as the medallion at twelve o'clock. */
  icon: ReactNode;
  /** The state word: GET READY, HELD, PRESS TO STOP, LOCKED, VOIDED … */
  word: string;
  /** The word flashed as the game starts the round. */
  castWord: string;
  reducedMotion: boolean;
}

/**
 * PT5.3: the blind instrument (see the file header). Every node is decoration
 * (`aria-hidden`); the stage's status line speaks for it.
 */
export function BlindChronometer({ phase, clock, countIn, countInId, held, slot, icon, word, castWord, reducedMotion }: BlindChronometerProps) {
  const elapsedMs = clock?.elapsedMs ?? null;
  const readout = blindReadoutFor(phase, held, countIn, elapsedMs);
  const beatKey = `${countInId ?? "pass"}:${countIn ?? "-"}`;
  return (
    <span className="pt-chrono" data-testid="pt-chrono" data-flow="blind" data-phase={phase} data-readout={readout}
      data-held={held ? "true" : undefined} data-animate={reducedMotion ? "false" : "true"} aria-hidden>
      <svg className="pt-chrono-dial" viewBox="0 0 200 200" focusable="false">
        <ChronoDialBase>
          {/* The count-in ring: one finite stroke per beat, keyed so each beat replays it. */}
          {readout === "count" ? (
            <circle key={beatKey} className="pt-chrono-countring" cx="100" cy="100" r="76"
              data-final={countIn !== null && countInIsFinal(countIn) ? "true" : undefined} />
          ) : null}
        </ChronoDialBase>
      </svg>
      <span className="pt-chrono-flare" />
      <span className="pt-seal-icon pt-chrono-medallion" data-testid="pt-seal-icon">{icon}</span>
      <span className="pt-chrono-readout" data-readout={readout}>
        {readout === "count" && countIn !== null ? (
          <span key={beatKey} className="pt-chrono-count" data-testid="pt-chrono-count"
            data-final={countInIsFinal(countIn) ? "true" : undefined}>{countIn}</span>
        ) : readout === "held" ? (
          <span className="pt-chrono-pause" data-testid="pt-chrono-held"><i /><i /></span>
        ) : readout === "blind" ? (
          <>
            <span className="pt-chrono-glyph" data-testid="pt-chrono-glyph">{slot}</span>
            <span className="pt-chrono-cast" data-testid="pt-chrono-cast">{castWord}</span>
          </>
        ) : readout === "locked" && elapsedMs !== null ? (
          <>
            <span className="pt-chrono-digits" data-testid="pt-chrono-digits"
              data-wide={elapsedMs >= CHRONO_WIDE_FROM_MS ? "true" : undefined}>{formatLocked(elapsedMs)}</span>
            <span className="pt-chrono-unit">Seconds</span>
          </>
        ) : readout === "halted" ? (
          <span className="pt-chrono-glyph" data-testid="pt-chrono-glyph" data-halted="true">—</span>
        ) : null}
      </span>
      <span className="pt-seal-word pt-chrono-word" data-testid="pt-seal-word">{word}</span>
    </span>
  );
}
