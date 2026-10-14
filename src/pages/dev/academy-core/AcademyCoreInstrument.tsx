/**
 * Academy Core V1 — the instrument.
 *
 * One designed object: a D-shaped brushed-metal chassis carrying a central
 * measuring aperture (a six-blade iris over a glass lens), a vernier column
 * on its flat side, a bezel-riding index cursor, and — on desktop — four
 * terminal bays mounted on brackets along the chassis arc, each wired to a
 * contact pad the cursor sweeps to. The page overlays the bay LINKS as HTML
 * (real text, real focus rings); this file draws the plates they sit on.
 *
 * FIVE STATES, one `focus` prop: `idle` plus one per room. A state moves the
 * articulated parts (cursor angle, iris opening, vernier carriage), lights the
 * matching pad / lamp, and changes the lens's measurement language:
 *
 *   leaguecraft  INQUIRY  — iris opens wide, a probe wedge sweeps the lens
 *   combat-lab   MEASURE  — iris stops down, caliper jaws close on a dimension
 *   archives     STRATA   — translucent strata fan apart inside the lens
 *   pro-play     OBSERVE  — a tracking reticle with a moving mark
 *
 * MOTION BUDGET. The three articulated parts are driven by Framer springs
 * writing SVG attributes directly (no CSS transform-origin guesswork on SVG,
 * and a settled spring costs nothing). Everything else is CSS transitions and
 * two very slow CSS keyframes (lens breathing, idle sweep) that the page pauses
 * when the stage leaves the viewport. Reduced motion (OS or in-app) snaps every
 * value and disables the keyframes — states remain fully readable without
 * transitions. There is no requestAnimationFrame loop and no canvas.
 */
import { useEffect, useRef } from "react";
import { useMotionValueEvent, useSpring } from "framer-motion";

import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import {
  CORE_DESTINATIONS,
  CORE_IDLE_ANGLE,
  CORE_IDLE_READOUT,
  destinationById,
  type CoreFocus,
} from "./academy-core-destinations";

/* ----------------------------------------------------------------------- */
/* Geometry — one coordinate system, shared with the page's HTML overlays.  */
/* ----------------------------------------------------------------------- */

export const CORE_VIEWBOX = { width: 860, height: 640 } as const;
/** Compact (phone) crop: the chassis alone, bays are rendered as rows instead. */
export const CORE_COMPACT_VIEWBOX = { x: 36, y: 52, width: 536, height: 536 } as const;

/** Aperture centre. The chassis's semicircle, the bezel and the arc of bays all share it. */
export const CORE_CENTER = { x: 300, y: 320 } as const;
const BODY_R = 250;
const BEZEL_R = 200;
const LENS_R = 118;
const PAD_R = 238;
const BAY_ANCHOR_R = 300;
export const BAY_PLATE = { width: 240, height: 64 } as const;

const DEG = Math.PI / 180;
export function polar(r: number, deg: number) {
  return { x: CORE_CENTER.x + r * Math.cos(deg * DEG), y: CORE_CENTER.y + r * Math.sin(deg * DEG) };
}

/** Where a bay plate's left-middle edge sits, in viewBox units. */
export function bayAnchor(angle: number) {
  return polar(BAY_ANCHOR_R, angle);
}

/** Articulation targets per state. */
const IRIS_OPENING: Record<CoreFocus, number> = {
  idle: 56,
  leaguecraft: 104,
  "combat-lab": 46,
  archives: 92,
  "pro-play": 84,
};
const CARRIAGE_Y: Record<CoreFocus, number> = {
  idle: 320,
  leaguecraft: 214,
  "combat-lab": 296,
  archives: 436,
  "pro-play": 196,
};

const BLADES = [0, 60, 120, 180, 240, 300];

/* ----------------------------------------------------------------------- */

export interface AcademyCoreInstrumentProps {
  focus: CoreFocus;
  /** Phone crop: chassis only, no bay plates. */
  compact?: boolean;
  /** Pauses the ambient keyframes (page sets false when off-screen). */
  ambient?: boolean;
  className?: string;
}

export default function AcademyCoreInstrument({
  focus,
  compact = false,
  ambient = true,
  className,
}: AcademyCoreInstrumentProps) {
  const reduced = useReducedMotionPreference();
  const dest = destinationById(focus);
  const targetAngle = dest ? dest.angle : CORE_IDLE_ANGLE;

  // Springs settle and then cost nothing; `jump` is the reduced-motion path.
  const angle = useSpring(targetAngle, { stiffness: 120, damping: 18, mass: 0.9 });
  const opening = useSpring(IRIS_OPENING[focus], { stiffness: 160, damping: 20 });
  const carriage = useSpring(CARRIAGE_Y[focus], { stiffness: 110, damping: 19 });

  useEffect(() => {
    if (reduced) {
      angle.jump(targetAngle);
      opening.jump(IRIS_OPENING[focus]);
      carriage.jump(CARRIAGE_Y[focus]);
    } else {
      angle.set(targetAngle);
      opening.set(IRIS_OPENING[focus]);
      carriage.set(CARRIAGE_Y[focus]);
    }
  }, [focus, targetAngle, reduced, angle, opening, carriage]);

  // Initial attribute values are captured ONCE: React only rewrites an
  // attribute when its prop changes between renders, so holding these constant
  // leaves the springs as the sole writer after mount (a re-render mid-swing
  // never snaps a part back).
  const initial = useRef({
    angle: targetAngle,
    opening: IRIS_OPENING[focus],
    carriage: CARRIAGE_Y[focus],
  }).current;

  const cursorRef = useRef<SVGGElement>(null);
  const bladeRefs = useRef<(SVGRectElement | null)[]>([]);
  const edgeRefs = useRef<(SVGLineElement | null)[]>([]);
  const carriageRef = useRef<SVGGElement>(null);

  useMotionValueEvent(angle, "change", (a) => {
    cursorRef.current?.setAttribute("transform", `rotate(${a} ${CORE_CENTER.x} ${CORE_CENTER.y})`);
  });
  useMotionValueEvent(opening, "change", (d) => {
    const x = String(d);
    for (const r of bladeRefs.current) r?.setAttribute("x", x);
    for (const l of edgeRefs.current) {
      l?.setAttribute("x1", x);
      l?.setAttribute("x2", x);
    }
  });
  useMotionValueEvent(carriage, "change", (y) => {
    carriageRef.current?.setAttribute("transform", `translate(0 ${y})`);
  });

  const readout = dest ? dest.readout : CORE_IDLE_READOUT;
  const vb = compact
    ? `${CORE_COMPACT_VIEWBOX.x} ${CORE_COMPACT_VIEWBOX.y} ${CORE_COMPACT_VIEWBOX.width} ${CORE_COMPACT_VIEWBOX.height}`
    : `0 0 ${CORE_VIEWBOX.width} ${CORE_VIEWBOX.height}`;

  const scaleTicks = [];
  for (let a = -230; a <= 50; a += 5) {
    const major = a % 20 === 0;
    const p1 = polar(major ? 168 : 174, a);
    const p2 = polar(182, a);
    scaleTicks.push(
      <line
        key={a}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        className={major ? "acore-tick acore-tick-major" : "acore-tick"}
      />,
    );
  }
  const scaleNumbers = [-220, -180, -140, -100, -60, -20, 20].map((a) => {
    const p = polar(156, a);
    return (
      <text key={a} x={p.x} y={p.y + 3} className="acore-scale-num" textAnchor="middle">
        {String(Math.round((a + 230) / 2.8)).padStart(2, "0")}
      </text>
    );
  });

  const columnTicks = [];
  for (let y = 160; y <= 480; y += 10) {
    const major = (y - 160) % 50 === 0;
    columnTicks.push(
      <line
        key={y}
        x1={118}
        y1={y}
        x2={major ? 136 : 128}
        y2={y}
        className={major ? "acore-tick acore-tick-major" : "acore-tick"}
      />,
    );
  }

  return (
    <svg
      className={["acore-svg", className].filter(Boolean).join(" ")}
      viewBox={vb}
      role="img"
      aria-label="The Academy Core instrument"
      data-focus={focus}
      data-ambient={ambient && !reduced ? "on" : "off"}
      data-compact={compact ? "true" : "false"}
      focusable="false"
    >
      <defs>
        <linearGradient id="acore-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2a42" />
          <stop offset="0.45" stopColor="#0f1b2d" />
          <stop offset="1" stopColor="#152238" />
        </linearGradient>
        <linearGradient id="acore-metal-dark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#141f33" />
          <stop offset="1" stopColor="#0a1322" />
        </linearGradient>
        <linearGradient id="acore-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3dfa6" />
          <stop offset="0.5" stopColor="#c9a24c" />
          <stop offset="1" stopColor="#7a5b24" />
        </linearGradient>
        <linearGradient id="acore-blade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2b3b55" />
          <stop offset="0.6" stopColor="#101b2c" />
          <stop offset="1" stopColor="#0a1220" />
        </linearGradient>
        <radialGradient id="acore-lens" cx="50%" cy="50%" r="50%">
          <stop offset="0" className="acore-lens-stop-core" />
          <stop offset="0.55" className="acore-lens-stop-mid" />
          <stop offset="1" stopColor="#040910" />
        </radialGradient>
        <pattern id="acore-brush" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#ffffff" fillOpacity="0.035" />
        </pattern>
        <clipPath id="acore-lens-clip">
          <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R} />
        </clipPath>
        <filter id="acore-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* ---------------- Chassis ---------------- */}
      <g className="acore-chassis">
        <path
          d={`M 70,70 H ${CORE_CENTER.x} A ${BODY_R} ${BODY_R} 0 1 1 ${CORE_CENTER.x},570 H 70 A 14 14 0 0 1 56,556 V 84 A 14 14 0 0 1 70,70 Z`}
          fill="url(#acore-metal)"
          stroke="#5a4520"
          strokeWidth="1.5"
        />
        <path
          d={`M 70,70 H ${CORE_CENTER.x} A ${BODY_R} ${BODY_R} 0 1 1 ${CORE_CENTER.x},570 H 70 A 14 14 0 0 1 56,556 V 84 A 14 14 0 0 1 70,70 Z`}
          fill="url(#acore-brush)"
        />
        {/* edge light: the chassis is lit from the upper left like the Hall */}
        <path
          d={`M 70,70 H ${CORE_CENTER.x} A ${BODY_R} ${BODY_R} 0 0 1 ${CORE_CENTER.x + BODY_R * 0.71},${CORE_CENTER.y - BODY_R * 0.71}`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.14"
          strokeWidth="1.5"
        />
        {/* inset enamel panel */}
        <path
          d={`M 86,86 H ${CORE_CENTER.x} A ${BODY_R - 16} ${BODY_R - 16} 0 1 1 ${CORE_CENTER.x},554 H 86 A 8 8 0 0 1 78,546 V 94 A 8 8 0 0 1 86,86 Z`}
          fill="#0a1424"
          stroke="#c9a24c"
          strokeOpacity="0.22"
        />
        {/* corner screws */}
        {[
          [70, 84],
          [70, 556],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`} className="acore-screw">
            <circle cx={x} cy={y} r="5" />
            <line x1={x - 3} y1={y - 2} x2={x + 3} y2={y + 2} />
          </g>
        ))}
        {/* maker's plate */}
        <g className="acore-plate">
          <rect x="94" y="100" width="172" height="40" rx="3" />
          <text x="104" y="117" className="acore-plate-title">MOGZY ACADEMY</text>
          <text x="104" y="131" className="acore-plate-sub">CORE · MK I · No. 0001</text>
        </g>
      </g>

      {/* ---------------- Vernier column ---------------- */}
      <g className="acore-column">
        <rect x="100" y="156" width="18" height="328" rx="2" fill="url(#acore-brass)" />
        <rect x="104" y="160" width="4" height="320" fill="#0a1424" fillOpacity="0.55" />
        {columnTicks}
        <text x="142" y="166" className="acore-scale-num">00</text>
        <text x="142" y="486" className="acore-scale-num">32</text>
        {/* carriage: translated along y by the spring */}
        <g ref={carriageRef} className="acore-carriage" transform={`translate(0 ${initial.carriage})`}>
          <rect x="90" y="-11" width="60" height="22" rx="3" />
          <rect x="96" y="-5" width="16" height="10" rx="1" className="acore-carriage-window" />
          <path d="M 150,-6 L 160,0 L 150,6 Z" className="acore-carriage-pointer" />
          <line x1="118" y1="-6" x2="118" y2="6" className="acore-carriage-hair" />
        </g>
      </g>

      {/* ---------------- Contact pads + bays ---------------- */}
      <g className="acore-pads">
        {CORE_DESTINATIONS.map((d) => {
          const p = polar(PAD_R, d.angle);
          return (
            <g key={d.id} className="acore-pad" data-bay={d.id}>
              <circle cx={p.x} cy={p.y} r="9" className="acore-pad-ring" />
              <circle cx={p.x} cy={p.y} r="5" className="acore-pad-lamp" />
            </g>
          );
        })}
      </g>
      {!compact && (
        <g className="acore-bays">
          {CORE_DESTINATIONS.map((d) => {
            const from = polar(PAD_R + 10, d.angle);
            const to = bayAnchor(d.angle);
            return (
              <g key={d.id} className="acore-bay" data-bay={d.id}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="acore-conduit" />
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="acore-conduit-live" />
                <rect
                  x={to.x}
                  y={to.y - BAY_PLATE.height / 2}
                  width={BAY_PLATE.width}
                  height={BAY_PLATE.height}
                  rx="5"
                  className="acore-bay-plate"
                />
                <line
                  x1={to.x + 8}
                  y1={to.y - BAY_PLATE.height / 2 + 1}
                  x2={to.x + BAY_PLATE.width - 8}
                  y2={to.y - BAY_PLATE.height / 2 + 1}
                  className="acore-bay-highlight"
                />
                <rect
                  x={to.x + 12}
                  y={to.y - 16}
                  width="7"
                  height="32"
                  rx="2"
                  className="acore-bay-lamp"
                />
                <line
                  x1={to.x + BAY_PLATE.width - 14}
                  y1={to.y - 18}
                  x2={to.x + BAY_PLATE.width - 14}
                  y2={to.y + 18}
                  className="acore-bay-latch"
                />
              </g>
            );
          })}
        </g>
      )}

      {/* ---------------- Aperture assembly ---------------- */}
      <g className="acore-aperture">
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R} className="acore-bezel-outer" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 14} fill="url(#acore-metal-dark)" className="acore-bezel-face" />
        <g className="acore-scale">{scaleTicks}{scaleNumbers}</g>

        {/* lens */}
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R + 32} className="acore-lens-plate" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R} fill="url(#acore-lens)" className="acore-lens-glow" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R - 10} fill="url(#acore-lens)" filter="url(#acore-glow)" className="acore-lens-halo" />

        {/* measurement language, clipped to the lens. The clip sits on an
            untransformed group: a userSpaceOnUse clipPath is resolved in the
            referencing element's own coordinate system, so putting it on the
            translated group would move the circle off the lens entirely. */}
        <g clipPath="url(#acore-lens-clip)">
        <g transform={`translate(${CORE_CENTER.x} ${CORE_CENTER.y})`}>
          {/* idle: the slowest sweep */}
          <g className="acore-mode acore-mode-idle">
            <path d="M 0,0 L 118,-22 A 118 118 0 0 1 118,22 Z" className="acore-idle-sweep" />
          </g>
          {/* INQUIRY */}
          <g className="acore-mode acore-mode-leaguecraft">
            <path d="M 0,0 L 118,-40 A 118 118 0 0 1 118,40 Z" className="acore-probe-wedge" />
            <circle r="38" className="acore-probe-ring" />
            <circle r="72" className="acore-probe-ring acore-probe-ring-2" />
            <circle r="4" className="acore-probe-dot" />
          </g>
          {/* MEASURE */}
          <g className="acore-mode acore-mode-combat">
            <g className="acore-jaw acore-jaw-l">
              <line x1="0" y1="-40" x2="0" y2="40" />
              <path d="M 0,-40 h 9 v 6 h -9 Z M 0,34 h 9 v 6 h -9 Z" />
            </g>
            <g className="acore-jaw acore-jaw-r">
              <line x1="0" y1="-40" x2="0" y2="40" />
              <path d="M 0,-40 h -9 v 6 h 9 Z M 0,34 h -9 v 6 h 9 Z" />
            </g>
            <line x1="-26" y1="6" x2="26" y2="6" className="acore-dim-line" />
            <path d="M -26,6 l 7,-3.5 v 7 Z M 26,6 l -7,-3.5 v 7 Z" className="acore-dim-arrow" />
            <text y="-8" textAnchor="middle" className="acore-dim-text">Δ 1.000</text>
          </g>
          {/* STRATA */}
          <g className="acore-mode acore-mode-archives">
            {[0, 1, 2, 3, 4].map((i) => (
              <ellipse key={i} rx="74" ry="16" className={`acore-stratum acore-stratum-${i}`} />
            ))}
          </g>
          {/* OBSERVE */}
          <g className="acore-mode acore-mode-pro-play">
            <g className="acore-reticle">
              <circle r="54" />
              <circle r="18" />
              <line x1="-84" y1="0" x2="-26" y2="0" />
              <line x1="26" y1="0" x2="84" y2="0" />
              <line x1="0" y1="-84" x2="0" y2="-26" />
              <line x1="0" y1="26" x2="0" y2="84" />
              {[-54, -36, 36, 54].map((v) => (
                <g key={v}>
                  <line x1={v} y1="-5" x2={v} y2="5" />
                  <line x1="-5" y1={v} x2="5" y2={v} />
                </g>
              ))}
            </g>
            <circle r="5" className="acore-track-mark" />
          </g>
        </g>
        </g>

        {/* iris: six blades, each a half-plane in its own rotated frame */}
        <g clipPath="url(#acore-lens-clip)" className="acore-iris">
          {BLADES.map((rot, i) => (
            <g key={rot} transform={`translate(${CORE_CENTER.x} ${CORE_CENTER.y}) rotate(${rot})`}>
              <rect
                ref={(el) => { bladeRefs.current[i] = el; }}
                x={initial.opening}
                y="-140"
                width="160"
                height="280"
                fill="url(#acore-blade)"
              />
              <line
                ref={(el) => { edgeRefs.current[i] = el; }}
                x1={initial.opening}
                y1="-140"
                x2={initial.opening}
                y2="140"
                className="acore-blade-edge"
              />
            </g>
          ))}
        </g>
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R + 4} className="acore-iris-rim" />

        {/* bezel-riding index cursor */}
        <g
          ref={cursorRef}
          className="acore-cursor"
          transform={`rotate(${initial.angle} ${CORE_CENTER.x} ${CORE_CENTER.y})`}
        >
          <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 8} className="acore-cursor-ring" />
          <path
            d={`M ${CORE_CENTER.x + BEZEL_R - 6},${CORE_CENTER.y - 7} L ${CORE_CENTER.x + PAD_R - 14},${CORE_CENTER.y} L ${CORE_CENTER.x + BEZEL_R - 6},${CORE_CENTER.y + 7} Z`}
            className="acore-cursor-pointer"
          />
          <circle cx={CORE_CENTER.x + BEZEL_R + 10} cy={CORE_CENTER.y} r="3.5" className="acore-cursor-lamp" />
          <path
            d={`M ${CORE_CENTER.x - BEZEL_R + 6},${CORE_CENTER.y - 5} L ${CORE_CENTER.x - BEZEL_R - 10},${CORE_CENTER.y} L ${CORE_CENTER.x - BEZEL_R + 6},${CORE_CENTER.y + 5} Z`}
            className="acore-cursor-tail"
          />
        </g>
      </g>

      {/* ---------------- Readout ---------------- */}
      <g className="acore-readout">
        <rect x="94" y="500" width="176" height="46" rx="3" />
        <text x="104" y="518" className="acore-readout-label">MODE</text>
        <text x="104" y="538" className="acore-readout-value">
          {readout}
          <tspan className="acore-readout-caret">_</tspan>
        </text>
      </g>
    </svg>
  );
}
