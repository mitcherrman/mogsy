/**
 * Mini-game discovery — "the reflex dial".
 *
 * A tiny playable taster: a needle sweeps a Hextech dial and the viewer stops
 * it inside the gold window. Nothing is scored or sent anywhere — the result
 * lives and dies in this scene — and the Play action opens the real bonus
 * challenges. The needle is driven by one rAF loop writing a transform (no
 * React state per frame). Under reduced motion it waits for an explicit Start.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import type { MiniGameItem } from "../model/pulse-types";
import { EASE_OUT, Kicker, Motes, pop, rise, sceneRoot, type SceneProps } from "./scene-kit";

type Phase = "idle" | "sweeping" | "stopped";

/** Signed distance (degrees) from the window's nearest edge; 0 inside it. */
export function dialOffset(angle: number, start: number, size: number): number {
  const a = ((angle % 360) + 360) % 360;
  const rel = ((a - start) % 360 + 360) % 360;
  if (rel <= size) return 0;
  const after = rel - size;
  const before = 360 - rel;
  return after < before ? after : -before;
}

const R = 42;
function arcPath(startDeg: number, sizeDeg: number): string {
  const p = (deg: number) => {
    const r = ((deg - 90) * Math.PI) / 180;
    return `${50 + R * Math.cos(r)} ${50 + R * Math.sin(r)}`;
  };
  return `M ${p(startDeg)} A ${R} ${R} 0 ${sizeDeg > 180 ? 1 : 0} 1 ${p(startDeg + sizeDeg)}`;
}

export default function MiniGameScene({ item, reduced, onInteract }: SceneProps<MiniGameItem>) {
  const { demo } = item;
  const [phase, setPhase] = useState<Phase>(reduced ? "idle" : "sweeping");
  const [result, setResult] = useState<{ hit: boolean; ms: number } | null>(null);
  const needle = useRef<SVGGElement>(null);
  const angle = useRef(demo.windowStartDeg + 140);

  useEffect(() => {
    if (phase !== "sweeping") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      angle.current = (angle.current + ((now - last) / demo.sweepMs) * 360) % 360;
      last = now;
      needle.current?.setAttribute("transform", `rotate(${angle.current} 50 50)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, demo.sweepMs]);

  const press = useCallback(() => {
    onInteract();
    if (phase === "sweeping") {
      const off = dialOffset(angle.current, demo.windowStartDeg, demo.windowSizeDeg);
      setResult({ hit: off === 0, ms: Math.round((Math.abs(off) / 360) * demo.sweepMs) });
      setPhase("stopped");
    } else {
      setResult(null);
      setPhase("sweeping");
    }
  }, [phase, demo, onInteract]);

  const label = phase === "sweeping" ? "Stop" : phase === "stopped" ? "Again" : "Start";

  return (
    <motion.div className="apulse-scene apulse-minigame" variants={sceneRoot(0.08)} data-phase={phase} data-hit={result ? String(result.hit) : undefined}>
      <motion.div
        className="apulse-dial-wrap"
        variants={{
          enter: { opacity: 0, scale: 0.5, rotate: 90 },
          show: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 0.85, ease: EASE_OUT } },
          exit: { opacity: 0, scale: 1.15, transition: { duration: 0.2 } },
        }}
      >
        <svg className="apulse-dial" viewBox="0 0 100 100" aria-hidden focusable="false">
          <circle className="apulse-dial-face" cx="50" cy="50" r="47" />
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} className={i % 6 === 0 ? "apulse-tick apulse-tick-major" : "apulse-tick"} x1="50" y1="5" x2="50" y2={i % 6 === 0 ? 11 : 8.5} transform={`rotate(${i * 15} 50 50)`} />
          ))}
          <circle className="apulse-dial-track" cx="50" cy="50" r={R} />
          <path className="apulse-dial-window" d={arcPath(demo.windowStartDeg, demo.windowSizeDeg)} />
          <g ref={needle} transform={`rotate(${angle.current} 50 50)`}>
            <line className="apulse-needle" x1="50" y1="50" x2="50" y2="12" />
            <circle className="apulse-needle-tip" cx="50" cy="12" r="2.4" />
          </g>
          <circle className="apulse-dial-hub" cx="50" cy="50" r="6" />
        </svg>
        {result?.hit && <span className="apulse-burst apulse-burst-dial" aria-hidden><Motes reduced={reduced} count={14} /></span>}
      </motion.div>

      <div className="apulse-stack apulse-minigame-text">
        <Kicker>Try a mini-game</Kicker>
        <motion.h3 variants={rise} className="apulse-title">{item.name}</motion.h3>
        <motion.p variants={rise} className={result ? "apulse-body apulse-result" : "apulse-body apulse-hide-short"} aria-live="polite">
          {result
            ? result.hit ? "Inside the gold. Clean timing!" : `Missed by ${result.ms} ms. One more?`
            : item.tagline}
        </motion.p>
        <motion.div variants={pop} className="apulse-actions">
          <button type="button" className="apulse-btn apulse-btn-primary" onClick={press} data-testid="pulse-minigame-stop">
            {label}
          </button>
          <Link to={item.playHref} className="apulse-btn apulse-btn-ghost" onClick={onInteract} data-testid="pulse-minigame-play">
            {item.playLabel}
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
