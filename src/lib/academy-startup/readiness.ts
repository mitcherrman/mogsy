/**
 * ACADEMY STARTUP RC2 — the Orrery's critical-readiness contract (pure).
 *
 * "Ready" means what is ON THE FIRST SCREEN of the current layout is drawn and
 * frames are flowing — not that some loads were started, and not that a
 * promise settled. Each signal is read from the real page (the mounted DOM
 * images, the engine's stage, the document's fonts) and resolves to one of:
 *
 *   ok       loaded AND decoded (images), measured (stage), loaded (fonts)
 *   error    failed for good — the page already has a fallback for it (bare
 *            leather for a cover, no Mogzy, the font's fallback face) — so it
 *            SETTLES the signal: a failed image never holds the veil
 *   pending  not yet; becomes `timeout` if the veil's cap is reached first
 *
 * Signals (R1–R9 in ACADEMY_STARTUP_INVESTIGATION.md §C):
 *   stage    the Orrery mounted, its stage measured (non-zero) and the engine
 *            started (`data-ready`) — implies the route chunk (R1) and the
 *            shell gate (R2), since neither lets the page mount without them
 *   frame:*  the shared book frame on every on-screen book
 *   cover:*  the cover splash of every on-screen book; a manifest that failed
 *            (or names no splash) settles it as `error` (bare leather)
 *   mogzy    Mogzy's rest plate
 *   patch    desktop only: the Patch Report feed has settled (ready / empty /
 *            unavailable) and every image the open book draws is decoded
 *   font:*   the display faces the first screen sets (Cinzel 500/700 titles,
 *            Space Mono markings, Lora prose, Inter UI text) — waiting for them is what keeps
 *            a font swap (a reflow) from happening after the reveal
 *
 * and, once all of those have settled, `framesFlowing`: FLOW_FRAMES
 * consecutive frame intervals under FLOW_MAX_INTERVAL_MS. That absorbs the GPU
 * first-use stall and decode-on-first-draw, which happen after every resource
 * is in (measured 0.5–1.1 s on fresh profiles).
 */

export type SignalStatus = "ok" | "error" | "pending";
export type Signals = Readonly<Record<string, SignalStatus>>;

export interface ReadinessVerdict {
  /** Every signal has a final answer (ok or error). */
  settled: boolean;
  /** Signals still pending, sorted (what a cap reports as "timeout"). */
  pending: string[];
  /** Signals that settled as `error` (a degraded, still usable reveal). */
  degraded: string[];
}

export function evaluateReadiness(signals: Signals): ReadinessVerdict {
  const pending: string[] = [];
  const degraded: string[] = [];
  for (const [name, status] of Object.entries(signals)) {
    if (status === "pending") pending.push(name);
    else if (status === "error") degraded.push(name);
  }
  pending.sort();
  degraded.sort();
  return { settled: pending.length === 0, pending, degraded };
}

/** Consecutive short frames that count as "frames are flowing". ~67 ms at 60 Hz. */
export const FLOW_FRAMES = 4;
/**
 * A frame shorter than this counts. 50 ms, not 25: Firefox and weak devices run
 * the full scene at ~40 fps (25–33 ms frames) and would never qualify under a
 * 25 ms rule (measured); frame RATE is the quality tier's question, not this one.
 */
export const FLOW_MAX_INTERVAL_MS = 50;

/**
 * Tracks frame intervals after the signals settle. `push(t)` takes a
 * requestAnimationFrame timestamp and answers whether frames are now flowing.
 * A long frame (a stall) restarts the count.
 */
export class FrameFlow {
  private last: number | null = null;
  private run = 0;

  push(t: number): boolean {
    if (this.last != null) {
      const dt = t - this.last;
      this.run = dt > 0 && dt < FLOW_MAX_INTERVAL_MS ? this.run + 1 : 0;
    }
    this.last = t;
    return this.run >= FLOW_FRAMES;
  }

  reset(): void {
    this.last = null;
    this.run = 0;
  }
}

/** The display faces the Orrery's first screen sets, as FontFaceSet specs. */
export const CRITICAL_FONTS: ReadonlyArray<{ name: string; family: string; spec: string }> = [
  { name: "font:cinzel-500", family: "Cinzel", spec: '500 16px "Cinzel"' },
  { name: "font:cinzel-700", family: "Cinzel", spec: '700 16px "Cinzel"' },
  { name: "font:space-mono", family: "Space Mono", spec: '400 12px "Space Mono"' },
  { name: "font:lora", family: "Lora", spec: '400 12px "Lora"' },
  { name: "font:inter", family: "Inter", spec: '400 14px "Inter"' },
];
