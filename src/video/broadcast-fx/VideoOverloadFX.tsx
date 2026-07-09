/**
 * VideoOverloadFX — deterministic Remotion port of HextechOverloadFX
 * (countdown energy-overload environment layer: localized vignette,
 * procedural cracks, buildup glow).
 *
 * Crack networks are generated with the live component's own mulberry32,
 * seeded by question index instead of Date.now(), so each question gets its
 * own coherent-but-repeatable crack pattern. Growth (a first-order lag in
 * the live RAF loop) uses a closed-form exponential response — visually
 * identical to the smoothed live behavior.
 */
import React, { useMemo } from "react";
import { mulberry32 } from "@/components/quiz-broadcast/HextechOverloadFX";
import { coreOverload, type VideoPhaseState } from "./videoPhase";

const MAIN_CRACKS = 7;
const BRANCHES = 7;
const MAX_RADIUS = 330;

interface CrackPath {
  d: string;
  threshold: number;
  strokeWidth: number;
  stroke: string;
}

/** Port of the live regenerate() — same construction rules, seeded RNG. */
function generateCracks(seed: number, anchorX: number, anchorY: number, aspect: number): CrackPath[] {
  const rng = mulberry32(seed >>> 0);

  // squareSpace() from the live component
  let ox: number, oy: number, minX: number, maxX: number, minY: number, maxY: number;
  if (aspect >= 1) {
    const visH = 1000 / aspect;
    ox = anchorX * 1000;
    oy = 500 + (anchorY - 0.5) * visH;
    minX = 40; maxX = 960;
    minY = 500 - visH / 2 + 30; maxY = 500 + visH / 2 - 30;
  } else {
    const visW = 1000 * aspect;
    ox = 500 + (anchorX - 0.5) * visW;
    oy = anchorY * 1000;
    minX = 500 - visW / 2 + 30; maxX = 500 + visW / 2 - 30;
    minY = 40; maxY = 960;
  }

  const cracks: CrackPath[] = [];
  const mainPoints: [number, number][][] = [];

  for (let i = 0; i < MAIN_CRACKS; i++) {
    let heading =
      (i / MAIN_CRACKS) * Math.PI * 2 + rng() * 0.9 + (rng() < 0.4 ? Math.PI * 0.25 : 0);
    const curve = (rng() - 0.5) * 0.22;
    let px = ox + Math.cos(heading) * (14 + rng() * 22);
    let py = oy + Math.sin(heading) * (14 + rng() * 22) + 10;
    const pts: [number, number][] = [[px, py]];
    const segs = 9 + Math.floor(rng() * 5);
    for (let s = 0; s < segs; s++) {
      heading += (rng() - 0.5) * 1.0 + curve;
      const step = 20 + rng() * 22;
      px += Math.cos(heading) * step;
      py += Math.sin(heading) * step;
      const dx = px - ox, dy = py - oy;
      if (dx * dx + dy * dy > MAX_RADIUS * MAX_RADIUS) break;
      if (px < minX || px > maxX || py < minY || py > maxY) break;
      pts.push([px, py]);
    }
    mainPoints.push(pts);
    cracks.push({
      d: pts.length > 1 ? `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ")}` : "M 0,0",
      threshold: 0.10 + i * 0.11,
      strokeWidth: 2.2,
      stroke: "#9fd8ff",
    });
  }

  for (let i = 0; i < BRANCHES; i++) {
    const parent = mainPoints[i % mainPoints.length];
    if (parent.length < 4) {
      cracks.push({ d: "M 0,0", threshold: 0.30 + i * 0.09, strokeWidth: 1.3, stroke: "#7fc4ff" });
      continue;
    }
    const startIdx = 1 + Math.floor(rng() * (parent.length - 2));
    let [px, py] = parent[startIdx];
    const [qx, qy] = parent[Math.max(0, startIdx - 1)];
    let heading = Math.atan2(py - qy, px - qx) + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.6);
    const pts: [number, number][] = [[px, py]];
    const segs = 4 + Math.floor(rng() * 3);
    for (let s = 0; s < segs; s++) {
      heading += (rng() - 0.5) * 1.1;
      const step = 14 + rng() * 16;
      px += Math.cos(heading) * step;
      py += Math.sin(heading) * step;
      const dx = px - ox, dy = py - oy;
      if (dx * dx + dy * dy > MAX_RADIUS * MAX_RADIUS) break;
      if (px < minX || px > maxX || py < minY || py > maxY) break;
      pts.push([px, py]);
    }
    cracks.push({
      d: pts.length > 1 ? `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ")}` : "M 0,0",
      threshold: 0.30 + i * 0.09,
      strokeWidth: 1.3,
      stroke: "#7fc4ff",
    });
  }
  return cracks;
}

export const VideoOverloadFX: React.FC<{
  state: VideoPhaseState;
  questionIndex: number;
  /** When (local ms) the overload episode starts (reveal − 5000 ms). */
  episodeStartMs: number;
  anchorX: number;
  anchorY: number;
  aspect: number;
}> = ({ state, questionIndex, episodeStartMs, anchorX, anchorY, aspect }) => {
  const now = state.localMs;
  const cracks = useMemo(
    () => generateCracks(questionIndex * 7919 + 13, anchorX, anchorY, aspect),
    [questionIndex, anchorX, anchorY, aspect],
  );

  const overload = coreOverload(state);
  const burstElapsed = state.phase === "reveal" ? state.phaseElapsedMs : state.sinceRevealMs;

  // Master fade — live formula
  const master =
    state.phase === "reveal"
      ? burstElapsed < 250 ? 1 : Math.max(0, 1 - (burstElapsed - 250) / 700)
      : state.phase === "question"
        ? Math.min(1, overload * 1.6)
        : 0;

  if (master <= 0.001) return null;

  // Time since the episode began — drives the closed-form growth lag.
  const sinceEpisode = Math.max(0, now - episodeStartMs);

  /** Growth: live code low-passes toward target with rate 7/s. Closed form:
   *  respond to the (monotonic during buildup) target with 1−e^(−7Δt). */
  const growthOf = (threshold: number) => {
    const target =
      state.phase === "reveal"
        ? Math.max(0, Math.min(1, (1 - threshold) / 0.28)) // frozen at full-overload value
        : Math.max(0, Math.min(1, (overload - threshold) / 0.28));
    const lag = 1 - Math.exp(-7 * (sinceEpisode / 1000));
    return target * lag;
  };

  const throb = 0.75 + Math.sin(now / 210) * 0.25 * overload;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Localized vignette around the core */}
      <div
        className="absolute"
        style={{
          left: `${anchorX * 100}%`,
          top: `${anchorY * 100}%`,
          width: "85%",
          aspectRatio: "1",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, transparent 0%, transparent 9%, rgba(2,6,20,0.55) 22%, rgba(2,6,20,0.30) 38%, transparent 55%)",
          opacity: master * 0.62,
        }}
      />
      {/* Energy buildup glow */}
      <div
        className="absolute"
        style={{
          left: `${anchorX * 100}%`,
          top: `${anchorY * 100}%`,
          width: "34%",
          aspectRatio: "1",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(80,170,255,0.30) 0%, rgba(40,110,255,0.12) 40%, transparent 68%)",
          opacity: master * 0.55 * throb,
        }}
      />
      {/* Procedural energy cracks */}
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <g style={{ filter: "drop-shadow(0 0 5px rgba(90,185,255,0.70))" }}>
          {cracks.map((c, i) => {
            const growth = growthOf(c.threshold);
            const flicker = 0.6 + Math.sin(now / 92 + i * 2.7) * 0.25 + Math.sin(now / 41 + i) * 0.15;
            const burstBoost = burstElapsed >= 0 && burstElapsed < 250 ? 0.35 : 0;
            const opacity = Math.max(0, Math.min(1, (growth * flicker * master + burstBoost * master) * 0.82));
            return (
              <path
                key={i}
                d={c.d}
                pathLength={1}
                fill="none"
                stroke={c.stroke}
                strokeWidth={c.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1"
                style={{ strokeDashoffset: 1 - growth, opacity }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
