/**
 * Academy Core V2 — the instrument.
 *
 * Mogzy's Hextech workshop invention: a D-shaped chassis of aged brass and
 * deep-blue enamel carrying a measuring aperture — a six-blade iris over a
 * faceted Hextech crystal — a vernier column on its flat side, a bezel-riding
 * index cursor, and, on desktop, four terminal bays mounted on brackets along
 * the chassis arc, each wired to a contact pad the cursor sweeps to. The page
 * overlays the bay LINKS as HTML (real text, real focus rings); this file
 * draws the plates they sit on.
 *
 * FIVE STATES, one `focus` prop. A state moves the articulated parts (cursor
 * angle, iris opening, vernier carriage), lights the matching pad / lamp /
 * conduit, re-tints the crystal, and projects the room's own language inside
 * the aperture — with REAL League media where the page has it:
 *
 *   leaguecraft  INQUIRY  — a champion specimen under a magnifying ring
 *   combat-lab   MEASURE  — caliper jaws close on a dimension; stat shards; a range arc
 *   archives     STRATA   — historical strata carrying the latest patch's icons
 *   pro-play     OBSERVE  — an observation reticle tracking a pro-scene champion; role marks
 *
 * V1 geometry and the spring/attribute motion system are retained exactly
 * (springs write SVG attributes; settled springs cost nothing; reduced motion
 * snaps). What changed is the material: bevels, enamel, rivets, a base plate,
 * drop shadows, Hextech reflections on the chassis, and the crystal.
 *
 * MEDIA. Every `<image>` here is rendered only once the page has prepared the
 * URL (so nothing decorative competes with the first paint) and sits inside a
 * reserved clip, so a late arrival never moves anything.
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
export const CORE_COMPACT_VIEWBOX = { x: 36, y: 52, width: 536, height: 548 } as const;

/** Aperture centre. The chassis's semicircle, the bezel and the arc of bays all share it. */
export const CORE_CENTER = { x: 300, y: 320 } as const;
const BODY_R = 250;
const BEZEL_R = 200;
const LENS_R = 118;
const PAD_R = 238;
const BAY_ANCHOR_R = 300;
export const BAY_PLATE = { width: 272, height: 66 } as const;

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
  idle: 58,
  leaguecraft: 104,
  "combat-lab": 48,
  archives: 94,
  "pro-play": 88,
};
const CARRIAGE_Y: Record<CoreFocus, number> = {
  idle: 320,
  leaguecraft: 214,
  "combat-lab": 296,
  archives: 436,
  "pro-play": 196,
};

const BLADES = [0, 60, 120, 180, 240, 300];

/** Pointy-top hexagon path of circumradius r around (0,0). */
function hexPath(r: number): string {
  const pts = [0, 60, 120, 180, 240, 300].map((a) => {
    const t = (a - 90) * DEG;
    return `${(r * Math.cos(t)).toFixed(2)},${(r * Math.sin(t)).toFixed(2)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}

/** One facet of the crystal: the trapezoid between inner and outer hexagon edges. */
function facetPath(i: number, rIn: number, rOut: number): string {
  const a0 = (i * 60 - 90) * DEG;
  const a1 = ((i + 1) * 60 - 90) * DEG;
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(rIn, a0)} L ${p(rOut, a0)} L ${p(rOut, a1)} L ${p(rIn, a1)} Z`;
}

/* ----------------------------------------------------------------------- */

/** Real media the page hands the instrument — all optional, all prepared first. */
export interface CoreMedia {
  /** 128px champion icon for the INQUIRY specimen (Leaguecraft's cover champion). */
  inquiryIcon?: string | null;
  /** 128px champion icon the OBSERVE reticle tracks (Pro Play's cover champion). */
  observeIcon?: string | null;
  /** Up to four icons from the latest Patch Brief, carried on the strata. */
  strataIcons?: readonly string[];
  /** The patch label engraved on the strata (e.g. "Patch 26.20"). */
  strataLabel?: string | null;
  /** Local stat-shard PNGs for MEASURE (left, right). */
  measureShards?: readonly [string, string];
  /** Local role-icon SVGs for OBSERVE, in lane order. */
  observeRoles?: readonly string[];
}

export interface AcademyCoreInstrumentProps {
  focus: CoreFocus;
  /** Phone crop: chassis only, no bay plates. */
  compact?: boolean;
  /** Pauses the ambient keyframes (page sets false when off-screen). */
  ambient?: boolean;
  media?: CoreMedia;
  className?: string;
}

export default function AcademyCoreInstrument({
  focus,
  compact = false,
  ambient = true,
  media = {},
  className,
}: AcademyCoreInstrumentProps) {
  const reduced = useReducedMotionPreference();
  const dest = destinationById(focus);
  const targetAngle = dest ? dest.angle : CORE_IDLE_ANGLE;

  // Springs settle and then cost nothing; `jump` is the reduced-motion path.
  // Tuned for a ~500 ms swing (brief: 400–650 ms, coherent across parts).
  const angle = useSpring(targetAngle, { stiffness: 150, damping: 20, mass: 0.9 });
  const opening = useSpring(IRIS_OPENING[focus], { stiffness: 190, damping: 22 });
  const carriage = useSpring(CARRIAGE_Y[focus], { stiffness: 140, damping: 21 });

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

  /* ---- static detail, built per render (cheap, no state) ---- */
  const scaleTicks = [];
  for (let a = -230; a <= 50; a += 5) {
    const major = a % 20 === 0;
    const p1 = polar(major ? 176 : 181, a);
    const p2 = polar(188, a);
    scaleTicks.push(
      <line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className={major ? "acore-tick acore-tick-major" : "acore-tick"} />,
    );
  }
  const scaleNumbers = [-220, -180, -140, -100, -60, -20, 20].map((a) => {
    const p = polar(163, a);
    return (
      <text key={a} x={p.x} y={p.y + 3} className="acore-scale-num" textAnchor="middle">
        {String(Math.round((a + 230) / 2.8)).padStart(2, "0")}
      </text>
    );
  });
  // Brushed bezel: fine radial hairlines across the face. Static, cheap.
  const brush = [];
  for (let a = 0; a < 360; a += 3) {
    const p1 = polar(BEZEL_R - 13, a);
    const p2 = polar(BEZEL_R - 1, a);
    brush.push(<line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="acore-bezel-brush" />);
  }
  const rivets = [-150, -110, -70, -30, 10, 50, 90, 130, 170, 210].map((a) => {
    const p = polar(BEZEL_R + 6, a);
    return <circle key={a} cx={p.x} cy={p.y} r="2.6" className="acore-rivet" />;
  });
  const columnTicks = [];
  for (let y = 160; y <= 480; y += 10) {
    const major = (y - 160) % 50 === 0;
    columnTicks.push(
      <line key={y} x1={118} y1={y} x2={major ? 136 : 128} y2={y} className={major ? "acore-tick acore-tick-major" : "acore-tick"} />,
    );
  }
  const facets = [0, 1, 2, 3, 4, 5].map((i) => (
    <path key={i} d={facetPath(i, 54, LENS_R)} className={`acore-facet acore-facet-${i % 3}`} />
  ));

  const body = `M 70,70 H ${CORE_CENTER.x} A ${BODY_R} ${BODY_R} 0 1 1 ${CORE_CENTER.x},570 H 70 A 14 14 0 0 1 56,556 V 84 A 14 14 0 0 1 70,70 Z`;
  const inset = `M 86,86 H ${CORE_CENTER.x} A ${BODY_R - 16} ${BODY_R - 16} 0 1 1 ${CORE_CENTER.x},554 H 86 A 8 8 0 0 1 78,546 V 94 A 8 8 0 0 1 86,86 Z`;

  const strataIcons = (media.strataIcons ?? []).slice(0, 4);
  const roles = (media.observeRoles ?? []).slice(0, 5);

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
          <stop offset="0" stopColor="#223656" />
          <stop offset="0.45" stopColor="#101d31" />
          <stop offset="1" stopColor="#1a2a44" />
        </linearGradient>
        <linearGradient id="acore-enamel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f2140" />
          <stop offset="1" stopColor="#081426" />
        </linearGradient>
        <linearGradient id="acore-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e6b4" />
          <stop offset="0.45" stopColor="#c9a24c" />
          <stop offset="1" stopColor="#6f5220" />
        </linearGradient>
        <linearGradient id="acore-brass-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8d294" />
          <stop offset="0.5" stopColor="#a8843a" />
          <stop offset="1" stopColor="#5d4418" />
        </linearGradient>
        <linearGradient id="acore-blade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#334a6d" />
          <stop offset="0.55" stopColor="#13213a" />
          <stop offset="1" stopColor="#0a1322" />
        </linearGradient>
        <radialGradient id="acore-bezel-face" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#2a3f62" />
          <stop offset="0.6" stopColor="#101c30" />
          <stop offset="1" stopColor="#0a1322" />
        </radialGradient>
        {/* the crystal: three facet tones + a bright core, re-tinted per state */}
        <linearGradient id="acore-facet-0" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="acore-crystal-stop-hi" />
          <stop offset="1" className="acore-crystal-stop-mid" />
        </linearGradient>
        <linearGradient id="acore-facet-1" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" className="acore-crystal-stop-mid" />
          <stop offset="1" className="acore-crystal-stop-lo" />
        </linearGradient>
        <linearGradient id="acore-facet-2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" className="acore-crystal-stop-lo" />
          <stop offset="1" className="acore-crystal-stop-hi" />
        </linearGradient>
        <radialGradient id="acore-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" className="acore-crystal-stop-core" />
          <stop offset="0.5" className="acore-crystal-stop-hi" stopOpacity="0.55" />
          <stop offset="1" stopColor="#040910" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="acore-reflect" cx="50%" cy="50%" r="50%">
          <stop offset="0" className="acore-crystal-stop-hi" stopOpacity="0.32" />
          <stop offset="0.6" className="acore-crystal-stop-hi" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <pattern id="acore-brush" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#ffffff" fillOpacity="0.035" />
        </pattern>
        <clipPath id="acore-lens-clip">
          <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R} />
        </clipPath>
        <clipPath id="acore-specimen-clip">
          <circle r="34" />
        </clipPath>
        <clipPath id="acore-mark-clip">
          <circle r="20" />
        </clipPath>
        {[0, 1, 2, 3].map((i) => (
          <clipPath key={i} id={`acore-strata-clip-${i}`}>
            <circle r="10" />
          </clipPath>
        ))}
        <filter id="acore-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id="acore-drop" x="-10%" y="-10%" width="125%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000" floodOpacity="0.55" />
        </filter>
        <filter id="acore-drop-sm" x="-10%" y="-20%" width="125%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* ---------------- Chassis ---------------- */}
      <g className="acore-chassis" filter="url(#acore-drop)">
        {/* base plate + feet: the machine stands on something */}
        <rect x="64" y="556" width="470" height="18" rx="4" fill="url(#acore-brass-v)" />
        <rect x="84" y="572" width="34" height="10" rx="2" className="acore-foot" />
        <rect x="430" y="572" width="34" height="10" rx="2" className="acore-foot" />
        <path d={body} fill="url(#acore-metal)" stroke="#5a4520" strokeWidth="1.5" />
        <path d={body} fill="url(#acore-brush)" />
        {/* bevel: lit from the upper left, shadowed at the lower right */}
        <path
          d={`M 70,70 H ${CORE_CENTER.x} A ${BODY_R} ${BODY_R} 0 0 1 ${CORE_CENTER.x + BODY_R * 0.71},${CORE_CENTER.y - BODY_R * 0.71}`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.16"
          strokeWidth="1.6"
        />
        <path
          d={`M ${CORE_CENTER.x + BODY_R * 0.71},${CORE_CENTER.y + BODY_R * 0.71} A ${BODY_R} ${BODY_R} 0 0 1 ${CORE_CENTER.x},570 H 70`}
          fill="none"
          stroke="#000000"
          strokeOpacity="0.45"
          strokeWidth="2"
        />
        {/* Hextech reflection on the body around the aperture */}
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r="236" fill="url(#acore-reflect)" className="acore-reflect" />
        {/* inset enamel panel */}
        <path d={inset} fill="url(#acore-enamel)" stroke="#c9a24c" strokeOpacity="0.28" />
        {/* rivets at the panel corners */}
        {[
          [92, 92],
          [92, 540],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`} className="acore-screw">
            <circle cx={x} cy={y} r="5" />
            <line x1={x - 3} y1={y - 2} x2={x + 3} y2={y + 2} />
          </g>
        ))}
        {/* maker's plate */}
        <g className="acore-plate">
          <rect x="104" y="104" width="172" height="40" rx="3" />
          <text x="114" y="121" className="acore-plate-title">MOGZY ACADEMY</text>
          <text x="114" y="135" className="acore-plate-sub">HEXTECH CORE · MK II · No. 0001</text>
        </g>
      </g>

      {/* ---------------- Vernier column ---------------- */}
      <g className="acore-column">
        <rect x="100" y="156" width="18" height="328" rx="2" fill="url(#acore-brass)" />
        <rect x="104" y="160" width="4" height="320" fill="#0a1424" fillOpacity="0.55" />
        {columnTicks}
        <text x="142" y="166" className="acore-scale-num">00</text>
        <text x="142" y="486" className="acore-scale-num">32</text>
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
                <g filter="url(#acore-drop-sm)">
                  <rect
                    x={to.x}
                    y={to.y - BAY_PLATE.height / 2}
                    width={BAY_PLATE.width}
                    height={BAY_PLATE.height}
                    rx="5"
                    className="acore-bay-plate"
                  />
                </g>
                <rect
                  x={to.x + 1}
                  y={to.y - BAY_PLATE.height / 2 + 1}
                  width={BAY_PLATE.width - 2}
                  height="3"
                  rx="1"
                  className="acore-bay-highlight"
                />
                <rect x={to.x + 12} y={to.y - 16} width="7" height="32" rx="2" className="acore-bay-lamp" />
                <line
                  x1={to.x + BAY_PLATE.width - 14}
                  y1={to.y - 18}
                  x2={to.x + BAY_PLATE.width - 14}
                  y2={to.y + 18}
                  className="acore-bay-latch"
                />
                {[to.x + 6, to.x + BAY_PLATE.width - 6].map((x) => (
                  <circle key={x} cx={x} cy={to.y + BAY_PLATE.height / 2 - 6} r="1.8" className="acore-rivet" />
                ))}
              </g>
            );
          })}
        </g>
      )}

      {/* ---------------- Aperture assembly ---------------- */}
      <g className="acore-aperture">
        {/* Hextech halo through the aperture, bright when focused */}
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R + 20} fill="url(#acore-core-glow)" filter="url(#acore-glow)" className="acore-lens-halo" />

        {/* bezel: outer brass ring, brushed face, bevel light/shadow, rivets */}
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R + 2} className="acore-bezel-shadow" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R} className="acore-bezel-outer" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 14} fill="url(#acore-bezel-face)" className="acore-bezel-face" />
        <g className="acore-bezel-brush-group">{brush}</g>
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 1} className="acore-bezel-light" />
        {rivets}
        <g className="acore-scale">{scaleTicks}{scaleNumbers}</g>

        {/* enamel band between scale and lens, with gold hairlines */}
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R + 34} className="acore-enamel-band" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R + 33} className="acore-hairline" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R + 14} className="acore-hairline" />

        {/* the crystal, seen through the iris */}
        <g transform={`translate(${CORE_CENTER.x} ${CORE_CENTER.y})`} className="acore-crystal">
          <circle r={LENS_R} className="acore-lens-plate" />
          {facets}
          <path d={hexPath(54)} className="acore-crystal-core" />
          <path d={hexPath(LENS_R)} className="acore-crystal-edge" />
          <circle r={LENS_R} fill="url(#acore-core-glow)" className="acore-crystal-glow" />
        </g>

        {/* projections, clipped to the lens. The clip sits on an untransformed
            group: a userSpaceOnUse clipPath resolves in the referencing
            element's own coordinate system. */}
        <g clipPath="url(#acore-lens-clip)">
          <g transform={`translate(${CORE_CENTER.x} ${CORE_CENTER.y})`}>
            {/* idle: the slowest sweep */}
            <g className="acore-mode acore-mode-idle">
              <path d="M 0,0 L 118,-22 A 118 118 0 0 1 118,22 Z" className="acore-idle-sweep" />
            </g>

            {/* INQUIRY — a specimen under the magnifier */}
            <g className="acore-mode acore-mode-leaguecraft">
              <path d="M 0,0 L 118,-40 A 118 118 0 0 1 118,40 Z" className="acore-probe-wedge" />
              <circle r="74" className="acore-probe-ring acore-probe-ring-2" />
              <g className="acore-specimen" clipPath="url(#acore-specimen-clip)">
                <circle r="34" className="acore-specimen-plate" />
                {media.inquiryIcon && (
                  <image href={media.inquiryIcon} x="-34" y="-34" width="68" height="68" preserveAspectRatio="xMidYMid slice" className="acore-media" />
                )}
              </g>
              <circle r="40" className="acore-magnifier" />
              <line x1="30" y1="30" x2="58" y2="58" className="acore-magnifier-handle" />
              {[0, 90, 180, 270].map((a) => {
                const t = a * DEG;
                return (
                  <line key={a} x1={44 * Math.cos(t)} y1={44 * Math.sin(t)} x2={52 * Math.cos(t)} y2={52 * Math.sin(t)} className="acore-probe-tick" />
                );
              })}
            </g>

            {/* MEASURE — caliper jaws, stat shards, a range arc */}
            <g className="acore-mode acore-mode-combat">
              <path d="M -84,62 A 100 100 0 0 1 84,62" className="acore-range-arc" />
              {[-60, -30, 0, 30, 60].map((a) => {
                const t = (a - 90) * DEG;
                return <line key={a} x1={96 * Math.cos(t)} y1={96 * Math.sin(t) + 62} x2={104 * Math.cos(t)} y2={104 * Math.sin(t) + 62} className="acore-range-tick" />;
              })}
              <g className="acore-jaw acore-jaw-l">
                <line x1="0" y1="-40" x2="0" y2="40" />
                <path d="M 0,-40 h 9 v 6 h -9 Z M 0,34 h 9 v 6 h -9 Z" />
                {media.measureShards && (
                  <image href={media.measureShards[0]} x="-26" y="-9" width="18" height="18" className="acore-media acore-shard" />
                )}
              </g>
              <g className="acore-jaw acore-jaw-r">
                <line x1="0" y1="-40" x2="0" y2="40" />
                <path d="M 0,-40 h -9 v 6 h 9 Z M 0,34 h -9 v 6 h 9 Z" />
                {media.measureShards && (
                  <image href={media.measureShards[1]} x="8" y="-9" width="18" height="18" className="acore-media acore-shard" />
                )}
              </g>
              <line x1="-26" y1="6" x2="26" y2="6" className="acore-dim-line" />
              <path d="M -26,6 l 7,-3.5 v 7 Z M 26,6 l -7,-3.5 v 7 Z" className="acore-dim-arrow" />
              <text y="-10" textAnchor="middle" className="acore-dim-text">Δ 1.000</text>
            </g>

            {/* STRATA — layered records carrying the latest patch */}
            <g className="acore-mode acore-mode-archives">
              {[0, 1, 2, 3, 4].map((i) => (
                <ellipse key={i} rx="76" ry="16" className={`acore-stratum acore-stratum-${i}`} />
              ))}
              <g className="acore-stratum-icons acore-stratum-0">
                {strataIcons.map((href, i) => (
                  <g key={href} transform={`translate(${-45 + i * 30} 0)`}>
                    <circle r="11" className="acore-strata-icon-ring" />
                    <g clipPath={`url(#acore-strata-clip-${i})`}>
                      <image href={href} x="-10" y="-10" width="20" height="20" preserveAspectRatio="xMidYMid slice" className="acore-media" />
                    </g>
                  </g>
                ))}
              </g>
              {media.strataLabel && (
                <text y="72" textAnchor="middle" className="acore-strata-label">{media.strataLabel.toUpperCase()}</text>
              )}
            </g>

            {/* OBSERVE — an enchanted observation lens */}
            <g className="acore-mode acore-mode-pro-play">
              <g className="acore-reticle">
                <circle r="58" />
                <circle r="22" />
                <line x1="-84" y1="0" x2="-28" y2="0" />
                <line x1="28" y1="0" x2="84" y2="0" />
                <line x1="0" y1="-84" x2="0" y2="-28" />
                <line x1="0" y1="28" x2="0" y2="84" />
                {[-54, -40, 40, 54].map((v) => (
                  <g key={v}>
                    <line x1={v} y1="-5" x2={v} y2="5" />
                    <line x1="-5" y1={v} x2="5" y2={v} />
                  </g>
                ))}
              </g>
              {roles.map((href, i) => {
                const t = (-90 + i * 72) * DEG;
                return (
                  <g key={href} transform={`translate(${(76 * Math.cos(t)).toFixed(1)} ${(76 * Math.sin(t)).toFixed(1)})`} className="acore-role">
                    <circle r="9" className="acore-role-ring" />
                    <image href={href} x="-6" y="-6" width="12" height="12" className="acore-media acore-role-icon" />
                  </g>
                );
              })}
              <g className="acore-track-mark">
                <g clipPath="url(#acore-mark-clip)">
                  <circle r="20" className="acore-mark-plate" />
                  {media.observeIcon && (
                    <image href={media.observeIcon} x="-20" y="-20" width="40" height="40" preserveAspectRatio="xMidYMid slice" className="acore-media" />
                  )}
                </g>
                <circle r="21" className="acore-mark-ring" />
              </g>
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
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={LENS_R + 1} className="acore-iris-rim-light" />

        {/* bezel-riding index cursor */}
        <g ref={cursorRef} className="acore-cursor" transform={`rotate(${initial.angle} ${CORE_CENTER.x} ${CORE_CENTER.y})`}>
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
        <rect x="104" y="500" width="176" height="46" rx="3" />
        <text x="114" y="518" className="acore-readout-label">MODE</text>
        <text x="114" y="538" className="acore-readout-value">
          {readout}
          <tspan className="acore-readout-caret">_</tspan>
        </text>
      </g>
    </svg>
  );
}
