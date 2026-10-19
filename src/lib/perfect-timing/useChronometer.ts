/**
 * PT5.2 — the Arcane Chronometer's frame loop. DISPLAY ONLY.
 *
 * While the engine is RUNNING this drives one `requestAnimationFrame` loop that
 * reads `performance.now()` against the engine's own `t0` and hands the value
 * to `onFrame`, which writes it straight into the DOM. Nothing here calls
 * `setState`: the page and the stage do not re-render at 60 FPS, only the
 * chronometer's few nodes change.
 *
 * When the engine stops, the loop is cancelled in the same commit and the
 * frozen value is the engine's `elapsedMs` — the number the page submits —
 * not a reading of this loop. The loop is also cancelled on reset, a new
 * round, an interruption, unmount, and the moment the document is hidden.
 *
 * The once-a-second beat (`onBeat`) comes from `observeSecond`: at most one
 * per frame, never late, unique per round and second. The beat's memory lives
 * in a ref, so a StrictMode double effect or a re-render cannot replay one.
 */
import { useLayoutEffect, useRef } from "react";
import type { PtPhase } from "./viewModel";
import { observeSecond, runningMs, type PtClockReading, type SecondBeat, type SecondWatch } from "./chronometer";

/**
 * What a frame means for the readout:
 *  - `zero`    armed / dealing: 0.00
 *  - `running` live elapsed time
 *  - `locked`  the engine's submitted value, frozen
 *  - `halted`  interrupted: keep whatever was last shown, marked voided
 */
export type ChronoFrameKind = "zero" | "running" | "locked" | "halted";

export interface UseChronometerOptions {
  phase: PtPhase;
  roundId: string | null;
  clock: PtClockReading | null;
  onFrame: (ms: number | null, kind: ChronoFrameKind) => void;
  onBeat?: (beat: SecondBeat) => void;
}

export function chronoKindFor(phase: PtPhase, clock: PtClockReading | null): ChronoFrameKind {
  if (phase === "running" && clock?.t0 != null) return "running";
  if ((phase === "stopped" || phase === "submitting" || phase === "error") && clock?.elapsedMs != null) return "locked";
  if (phase === "interrupted" || phase === "error") return "halted";
  return "zero";
}

export function useChronometer({ phase, roundId, clock, onFrame, onBeat }: UseChronometerOptions): void {
  const frameRef = useRef(onFrame);
  const beatRef = useRef(onBeat);
  frameRef.current = onFrame;
  beatRef.current = onBeat;
  const watchRef = useRef<SecondWatch | null>(null);

  const t0 = clock?.t0 ?? null;
  const elapsedMs = clock?.elapsedMs ?? null;
  const kind = chronoKindFor(phase, clock);

  useLayoutEffect(() => {
    if (kind === "locked") { frameRef.current(elapsedMs, "locked"); return; }
    if (kind === "halted") { frameRef.current(null, "halted"); return; }
    if (kind === "zero") { frameRef.current(0, "zero"); return; }

    // RUNNING. The first value is written before paint, so the cast never
    // shows a stale 0.00 frame; then one frame loop until anything changes.
    if (t0 === null || roundId === null) return;
    const start = t0;
    const id = roundId;
    let raf = 0;
    let live = true;
    const draw = () => {
      const ms = runningMs(start, performance.now());
      frameRef.current(ms, "running");
      const next = observeSecond(watchRef.current, { roundId: id, ms });
      watchRef.current = next.watch;
      if (next.beat) beatRef.current?.(next.beat);
    };
    const loop = () => {
      if (!live) return;
      draw();
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      live = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    // A hidden page voids the attempt (the engine owns that); the loop stops
    // at once so nothing can render or sound after the interruption.
    const onVisibility = () => { if (document.visibilityState === "hidden") stopLoop(); };
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState !== "hidden") {
      draw();
      raf = requestAnimationFrame(loop);
    } else {
      live = false;
    }
    return () => {
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [kind, t0, elapsedMs, roundId]);
}
