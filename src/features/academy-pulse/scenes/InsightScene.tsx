/**
 * Personal insight — "the reading".
 *
 * The week's line draws itself across a faint grid, its last point lands with
 * a pulse, the improvement chip pops beside the headline and the milestone
 * ring fills to where the player stands. Hovering or focusing a day reads its
 * value out.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import type { InsightItem } from "../model/pulse-types";
import { CountUp, EASE_OUT, Kicker, pop, rise, sceneRoot, type SceneProps } from "./scene-kit";

const W = 200;
const H = 80;

export function sparkPoints(series: readonly number[]): { x: number; y: number }[] {
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  return series.map((v, i) => ({
    x: series.length === 1 ? W / 2 : (i / (series.length - 1)) * W,
    y: 8 + (1 - (v - lo) / span) * (H - 16),
  }));
}

export default function InsightScene({ item, reduced, onInteract }: SceneProps<InsightItem>) {
  const pts = useMemo(() => sparkPoints(item.series), [item.series]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = pts[pts.length - 1];
  const [probe, setProbe] = useState<number | null>(null);
  const ms = item.milestone;
  const frac = Math.min(1, ms.current / ms.target);

  return (
    <motion.div className="apulse-scene apulse-insight" variants={sceneRoot(0.1, 0.08)}>
      <div className="apulse-stack apulse-insight-head">
        <Kicker>{item.seriesLabel}</Kicker>
        <motion.h3 variants={rise} className="apulse-title apulse-title-sm">
          {item.headline} <motion.span variants={pop} className="apulse-delta">{item.deltaLabel}</motion.span>
        </motion.h3>
      </div>

      <div className="apulse-insight-body">
        <div className="apulse-spark-wrap">
          <svg className="apulse-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden focusable="false">
            <defs>
              <linearGradient id={`${item.id}-fill`} x1="0" y1="0" x2="0" y2="1">
                {/* a CSS variable only resolves in `style`, not in the presentation attribute */}
                <stop offset="0" style={{ stopColor: "var(--apulse-accent)", stopOpacity: 0.35 }} />
                <stop offset="1" style={{ stopColor: "var(--apulse-accent)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => <line key={f} className="apulse-grid" x1="0" x2={W} y1={H * f} y2={H * f} />)}
            <motion.path
              d={area}
              fill={`url(#${item.id}-fill)`}
              variants={{ enter: { opacity: 0 }, show: { opacity: 1, transition: { delay: 1.1, duration: 0.6 } }, exit: { opacity: 0 } }}
            />
            <motion.path
              d={line}
              className="apulse-spark-line"
              variants={{
                enter: { pathLength: 0 },
                show: { pathLength: 1, transition: { delay: 0.3, duration: 1.1, ease: EASE_OUT } },
                exit: { opacity: 0 },
              }}
            />
          </svg>
          <motion.span
            className="apulse-spark-dot"
            style={{ left: `${(last.x / W) * 100}%`, top: `${(last.y / H) * 100}%` }}
            variants={{ enter: { scale: 0 }, show: { scale: 1, transition: { delay: 1.35, type: "spring", stiffness: 500, damping: 16 } }, exit: { scale: 0 } }}
            aria-hidden
          />
          <div className="apulse-spark-probes" role="list" aria-label={item.seriesLabel}>
            {item.series.map((v, i) => (
              <button
                key={i}
                type="button"
                role="listitem"
                className="apulse-spark-probe"
                aria-label={`Day ${i + 1}: ${v}%`}
                onPointerEnter={() => { setProbe(i); onInteract(); }}
                onPointerLeave={() => setProbe(null)}
                onFocus={() => { setProbe(i); onInteract(); }}
                onBlur={() => setProbe(null)}
              />
            ))}
          </div>
          {probe !== null && (
            <span className="apulse-spark-tip" style={{ left: `${(pts[probe].x / W) * 100}%`, top: `${(pts[probe].y / H) * 100}%` }} aria-hidden>
              {item.series[probe]}%
            </span>
          )}
        </div>

        <motion.div variants={pop} className="apulse-ring" role="img" aria-label={`${ms.label}: ${ms.current} of ${ms.target}`}>
          <svg viewBox="0 0 40 40" aria-hidden focusable="false">
            <circle className="apulse-ring-track" cx="20" cy="20" r="16" />
            <motion.circle
              className="apulse-ring-fill"
              cx="20" cy="20" r="16"
              variants={{
                enter: { pathLength: 0 },
                show: { pathLength: frac, transition: { delay: 0.8, duration: 1.2, ease: EASE_OUT } },
                exit: { opacity: 0 },
              }}
            />
          </svg>
          <span className="apulse-ring-value" aria-hidden>
            <CountUp to={ms.current} reduced={reduced} delay={0.8} />/{ms.target}
          </span>
          <span className="apulse-ring-label apulse-hide-short" aria-hidden>{ms.label}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
