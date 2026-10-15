/**
 * Academy Core V3 — the Four-Book Hextech Navigator (the machine itself).
 *
 * A single crafted mechanism built AROUND four ornate League books: a tall
 * arched chassis of deep-blue enamel and aged brass with four bevelled book
 * cradles — the upper, larger pair for Leaguecraft and Pro Play, the lower,
 * slightly smaller pair for Combat Simulation and Mogzy Archives — all wired
 * by engraved channels to a central Hextech crystal under a six-blade iris.
 * Each channel carries a brass locking arm that slides home to its book when
 * that room is focused, and the crystal projects the room's own imagery.
 *
 * The BOOKS are HTML (`AcademyHubBook`, the Hall's own closed volume with its
 * champion splash, shared frame and real title) overlaid by the page on the
 * cradles drawn here; `BOOK_SLOTS` is the one geometry both sides read. The
 * crystal button and the readout are HTML too. This file draws only what is
 * decorative and animates what is mechanical.
 *
 * Motion: the iris opening, the bezel cursor and the four locking arms are
 * Framer springs writing SVG attributes (settled springs cost nothing);
 * state colour, channel energy and projections are CSS transitions keyed on
 * `data-focus`; three slow keyframes idle and are paused off-screen. Reduced
 * motion snaps everything. No requestAnimationFrame loop, no canvas.
 *
 * `compact` (phones) draws the crystal assembly alone as a band between the
 * two book tiers; the chassis and cradles are not drawn there.
 */
import { useEffect, useRef } from "react";
import { useMotionValueEvent, useSpring } from "framer-motion";

import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import {
  CORE_DESTINATIONS,
  CORE_IDLE_READOUT,
  destinationById,
  type CoreFocus,
} from "./academy-core-destinations";

/* ----------------------------------------------------------------------- */
/* Geometry — one coordinate system, shared with the page's HTML overlays.  */
/* ----------------------------------------------------------------------- */

export const CORE_VIEWBOX = { width: 960, height: 820 } as const;
/** Phone band: the crystal assembly with its channel stubs. */
export const CORE_COMPACT_VIEWBOX = { x: 250, y: 352, width: 460, height: 340 } as const;

/** Crystal centre. */
export const CORE_CENTER = { x: 480, y: 520 } as const;
const BEZEL_R = 150;
/** Lens radius in the crystal's LOCAL units (the V2 assembly, drawn at r=118, scaled). */
const LENS_LOCAL_R = 118;
const LENS_SCALE = 0.78; // 118 → ~92 on the chassis

export interface BookSlot { x: number; y: number; w: number; h: number }
/** The four cradles. Upper pair 220 wide, lower pair 186 (≈ 85 %), all 1:1.5. */
export const BOOK_SLOTS: Record<string, BookSlot> = {
  leaguecraft: { x: 232, y: 44, w: 220, h: 330 },
  "pro-play": { x: 508, y: 44, w: 220, h: 330 },
  "combat-lab": { x: 82, y: 488, w: 186, h: 279 },
  archives: { x: 692, y: 488, w: 186, h: 279 },
};

/** Where each channel leaves its cradle and the angle the cursor points at. */
const CHANNELS: Record<string, { from: { x: number; y: number }; angle: number; armDx: number; armDy: number }> = {
  leaguecraft: { from: { x: 420, y: 374 }, angle: -122, armDx: -28, armDy: -36 },
  "pro-play": { from: { x: 540, y: 374 }, angle: -58, armDx: 28, armDy: -36 },
  "combat-lab": { from: { x: 268, y: 560 }, angle: 166, armDx: -44, armDy: 10 },
  archives: { from: { x: 692, y: 560 }, angle: 14, armDx: 44, armDy: 10 },
};
const IDLE_ANGLE = 90;

const IRIS_OPENING: Record<CoreFocus, number> = {
  idle: 58, leaguecraft: 104, "pro-play": 88, "combat-lab": 48, archives: 94,
};

const BLADES = [0, 60, 120, 180, 240, 300];
const DEG = Math.PI / 180;

function polar(r: number, deg: number, c = CORE_CENTER) {
  return { x: c.x + r * Math.cos(deg * DEG), y: c.y + r * Math.sin(deg * DEG) };
}
function hexPath(r: number): string {
  const pts = [0, 60, 120, 180, 240, 300].map((a) => {
    const t = (a - 90) * DEG;
    return `${(r * Math.cos(t)).toFixed(2)},${(r * Math.sin(t)).toFixed(2)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}
function facetPath(i: number, rIn: number, rOut: number): string {
  const a0 = (i * 60 - 90) * DEG;
  const a1 = ((i + 1) * 60 - 90) * DEG;
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(rIn, a0)} L ${p(rOut, a0)} L ${p(rOut, a1)} L ${p(rIn, a1)} Z`;
}

/* ----------------------------------------------------------------------- */

/** Real media the page hands the crystal — cover splashes already in cache. */
export interface CoreMedia {
  /** Splash URL per room (the cover art), projected as a circular crop. */
  art?: Partial<Record<string, string | null>>;
  /** Up to four icons from the latest Patch Brief, carried on the strata. */
  strataIcons?: readonly string[];
  strataLabel?: string | null;
  measureShards?: readonly [string, string];
  observeRoles?: readonly string[];
}

export interface AcademyCoreInstrumentProps {
  focus: CoreFocus;
  /** The book being activated (click → navigate), for the arm's final push. */
  activating?: CoreFocus | null;
  compact?: boolean;
  ambient?: boolean;
  media?: CoreMedia;
  className?: string;
}

export default function AcademyCoreInstrument({
  focus,
  activating = null,
  compact = false,
  ambient = true,
  media = {},
  className,
}: AcademyCoreInstrumentProps) {
  const reduced = useReducedMotionPreference();
  const dest = destinationById(focus);
  const targetAngle = dest ? CHANNELS[dest.id].angle : IDLE_ANGLE;

  // Springs tuned for a ~450–550 ms swing (brief: 400–650, coherent across parts).
  const angle = useSpring(targetAngle, { stiffness: 150, damping: 20, mass: 0.9 });
  const opening = useSpring(IRIS_OPENING[focus], { stiffness: 190, damping: 22 });
  const arms = {
    leaguecraft: useSpring(0, { stiffness: 220, damping: 24 }),
    "pro-play": useSpring(0, { stiffness: 220, damping: 24 }),
    "combat-lab": useSpring(0, { stiffness: 220, damping: 24 }),
    archives: useSpring(0, { stiffness: 220, damping: 24 }),
  } as const;

  useEffect(() => {
    const set = (s: { set: (v: number) => void; jump: (v: number) => void }, v: number) =>
      reduced ? s.jump(v) : s.set(v);
    set(angle, targetAngle);
    set(opening, IRIS_OPENING[focus]);
    for (const id of Object.keys(arms) as Array<keyof typeof arms>) {
      // 0 = parked at the crystal, 1 = engaged on the book, 1.35 = the activation push.
      set(arms[id], activating === id ? 1.35 : focus === id ? 1 : 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, activating, targetAngle, reduced]);

  const initial = useRef({ angle: targetAngle, opening: IRIS_OPENING[focus] }).current;
  const cursorRef = useRef<SVGGElement>(null);
  const bladeRefs = useRef<(SVGRectElement | null)[]>([]);
  const edgeRefs = useRef<(SVGLineElement | null)[]>([]);
  const armRefs = useRef<Record<string, SVGGElement | null>>({});

  useMotionValueEvent(angle, "change", (a) => {
    cursorRef.current?.setAttribute("transform", `rotate(${a} ${CORE_CENTER.x} ${CORE_CENTER.y})`);
  });
  useMotionValueEvent(opening, "change", (d) => {
    const x = String(d);
    for (const r of bladeRefs.current) r?.setAttribute("x", x);
    for (const l of edgeRefs.current) { l?.setAttribute("x1", x); l?.setAttribute("x2", x); }
  });
  for (const id of Object.keys(arms) as Array<keyof typeof arms>) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useMotionValueEvent(arms[id], "change", (t) => {
      const c = CHANNELS[id];
      armRefs.current[id]?.setAttribute("transform", `translate(${(c.armDx * t).toFixed(2)} ${(c.armDy * t).toFixed(2)})`);
    });
  }

  const readout = dest ? dest.readout : CORE_IDLE_READOUT;
  const vb = compact
    ? `${CORE_COMPACT_VIEWBOX.x} ${CORE_COMPACT_VIEWBOX.y} ${CORE_COMPACT_VIEWBOX.width} ${CORE_COMPACT_VIEWBOX.height}`
    : `0 0 ${CORE_VIEWBOX.width} ${CORE_VIEWBOX.height}`;

  /* ---- static detail ---- */
  const scaleTicks = [];
  for (let a = 0; a < 360; a += 6) {
    const major = a % 30 === 0;
    const p1 = polar(major ? 128 : 133, a);
    const p2 = polar(140, a);
    scaleTicks.push(<line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className={major ? "acore-tick acore-tick-major" : "acore-tick"} />);
  }
  const brush = [];
  for (let a = 0; a < 360; a += 3) {
    const p1 = polar(BEZEL_R - 12, a);
    const p2 = polar(BEZEL_R - 1, a);
    brush.push(<line key={a} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="acore-bezel-brush" />);
  }
  const rivets = [-150, -120, -60, -30, 30, 60, 120, 150, 210, 240].map((a) => {
    const p = polar(BEZEL_R + 7, a);
    return <circle key={a} cx={p.x} cy={p.y} r="2.6" className="acore-rivet" />;
  });
  const facets = [0, 1, 2, 3, 4, 5].map((i) => (
    <path key={i} d={facetPath(i, 54, LENS_LOCAL_R)} className={`acore-facet acore-facet-${i % 3}`} />
  ));
  const strataIcons = (media.strataIcons ?? []).slice(0, 4);
  const roles = (media.observeRoles ?? []).slice(0, 5);
  const art = media.art ?? {};

  // Chassis: an arched reliquary — narrower at the crown where the upper pair
  // sits, flaring to the lower cradles, standing on a brass base plate.
  const body = "M 196,14 H 764 Q 790,14 804,36 L 934,282 Q 944,300 944,322 V 776 Q 944,796 924,796 H 36 Q 16,796 16,776 V 322 Q 16,300 26,282 L 156,36 Q 170,14 196,14 Z";
  const inset = "M 206,32 H 754 Q 772,32 782,50 L 912,296 Q 920,310 920,328 V 760 Q 920,776 904,776 H 56 Q 40,776 40,760 V 328 Q 40,310 48,296 L 178,50 Q 188,32 206,32 Z";

  const cradle = (id: string) => {
    const s = BOOK_SLOTS[id];
    const m = 12;
    return (
      <g key={id} className="acore-cradle" data-bay={id}>
        <rect x={s.x - m} y={s.y - m} width={s.w + 2 * m} height={s.h + 2 * m} rx="10" className="acore-cradle-recess" />
        <rect x={s.x - m + 3} y={s.y - m + 3} width={s.w + 2 * m - 6} height={s.h + 2 * m - 6} rx="8" className="acore-cradle-bevel" />
        {/* holding clips, top and bottom */}
        {[s.y - m - 2, s.y + s.h + m - 8].map((y) => (
          <rect key={y} x={s.x + s.w / 2 - 22} y={y} width="44" height="10" rx="3" className="acore-cradle-clip" />
        ))}
        {/* energy rim shown while the room is live */}
        <rect x={s.x - m} y={s.y - m} width={s.w + 2 * m} height={s.h + 2 * m} rx="10" className="acore-cradle-live" />
      </g>
    );
  };

  const channel = (id: string) => {
    const c = CHANNELS[id];
    const to = polar(BEZEL_R + 4, c.angle);
    return (
      <g key={id} className="acore-channel" data-bay={id}>
        <line x1={c.from.x} y1={c.from.y} x2={to.x} y2={to.y} className="acore-channel-groove" />
        <line x1={c.from.x} y1={c.from.y} x2={to.x} y2={to.y} className="acore-channel-live" />
        {/* the locking arm: parked at the crystal, slides home to the book */}
        <g ref={(el) => { armRefs.current[id] = el; }} className="acore-arm">
          <line x1={to.x} y1={to.y} x2={to.x + (c.from.x - to.x) * 0.36} y2={to.y + (c.from.y - to.y) * 0.36} className="acore-arm-bar" />
          <circle cx={to.x + (c.from.x - to.x) * 0.36} cy={to.y + (c.from.y - to.y) * 0.36} r="5" className="acore-arm-pin" />
        </g>
        <circle cx={c.from.x} cy={c.from.y} r="6" className="acore-channel-socket" />
      </g>
    );
  };

  return (
    <svg
      className={["acore-svg", className].filter(Boolean).join(" ")}
      viewBox={vb}
      role="img"
      aria-label="The Academy Core instrument"
      data-focus={focus}
      data-activating={activating ?? ""}
      data-ambient={ambient && !reduced ? "on" : "off"}
      data-compact={compact ? "true" : "false"}
      focusable="false"
    >
      <defs>
        <linearGradient id="acore-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#223656" /><stop offset="0.5" stopColor="#101d31" /><stop offset="1" stopColor="#1a2a44" />
        </linearGradient>
        <linearGradient id="acore-enamel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f2140" /><stop offset="1" stopColor="#081426" />
        </linearGradient>
        <linearGradient id="acore-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e6b4" /><stop offset="0.45" stopColor="#c9a24c" /><stop offset="1" stopColor="#6f5220" />
        </linearGradient>
        <linearGradient id="acore-brass-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8d294" /><stop offset="0.5" stopColor="#a8843a" /><stop offset="1" stopColor="#5d4418" />
        </linearGradient>
        <linearGradient id="acore-blade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#334a6d" /><stop offset="0.55" stopColor="#13213a" /><stop offset="1" stopColor="#0a1322" />
        </linearGradient>
        <radialGradient id="acore-bezel-face" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#2a3f62" /><stop offset="0.6" stopColor="#101c30" /><stop offset="1" stopColor="#0a1322" />
        </radialGradient>
        <linearGradient id="acore-facet-0" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="acore-crystal-stop-hi" /><stop offset="1" className="acore-crystal-stop-mid" />
        </linearGradient>
        <linearGradient id="acore-facet-1" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" className="acore-crystal-stop-mid" /><stop offset="1" className="acore-crystal-stop-lo" />
        </linearGradient>
        <linearGradient id="acore-facet-2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" className="acore-crystal-stop-lo" /><stop offset="1" className="acore-crystal-stop-hi" />
        </linearGradient>
        <radialGradient id="acore-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" className="acore-crystal-stop-core" />
          <stop offset="0.5" className="acore-crystal-stop-hi" stopOpacity="0.55" />
          <stop offset="1" stopColor="#040910" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="acore-reflect" cx="50%" cy="50%" r="50%">
          <stop offset="0" className="acore-crystal-stop-hi" stopOpacity="0.3" />
          <stop offset="0.6" className="acore-crystal-stop-hi" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <pattern id="acore-brush" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#ffffff" fillOpacity="0.035" />
        </pattern>
        {/* clips in the crystal's LOCAL space (origin at the crystal centre) */}
        <clipPath id="acore-lens-clip"><circle r={LENS_LOCAL_R} /></clipPath>
        <clipPath id="acore-art-clip"><circle r="46" /></clipPath>
        <clipPath id="acore-mark-clip"><circle r="20" /></clipPath>
        {[0, 1, 2, 3].map((i) => (
          <clipPath key={i} id={`acore-strata-clip-${i}`}><circle r="10" /></clipPath>
        ))}
        <filter id="acore-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="12" /></filter>
        <filter id="acore-drop" x="-10%" y="-10%" width="125%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>

      {!compact && (
        <g className="acore-chassis" filter="url(#acore-drop)">
          <rect x="24" y="788" width="912" height="18" rx="4" fill="url(#acore-brass-v)" />
          <rect x="60" y="804" width="40" height="10" rx="2" className="acore-foot" />
          <rect x="860" y="804" width="40" height="10" rx="2" className="acore-foot" />
          <path d={body} fill="url(#acore-metal)" stroke="#5a4520" strokeWidth="1.5" />
          <path d={body} fill="url(#acore-brush)" />
          <path d="M 196,14 H 764 Q 790,14 804,36 L 934,282" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.6" />
          <path d="M 944,322 V 776 Q 944,796 924,796 H 36" fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="2" />
          <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r="300" fill="url(#acore-reflect)" className="acore-reflect" />
          <path d={inset} fill="url(#acore-enamel)" stroke="#c9a24c" strokeOpacity="0.28" />
          {[[70, 756], [890, 756], [214, 50], [746, 50]].map(([x, y]) => (
            <g key={`${x}-${y}`} className="acore-screw"><circle cx={x} cy={y} r="5" /><line x1={x - 3} y1={y - 2} x2={x + 3} y2={y + 2} /></g>
          ))}
          {/* crown ornament in the gap between the upper books; the maker's plate
              sits on the base, left of the readout */}
          <g className="acore-crown" transform="translate(480 200)">
            <path d={hexPath(16)} className="acore-crown-gem" />
            <path d={hexPath(22)} className="acore-crown-ring" />
            <line x1="0" y1="-60" x2="0" y2="-24" className="acore-channel-groove" />
            <line x1="0" y1="24" x2="0" y2="150" className="acore-channel-groove" />
          </g>
          <g className="acore-plate">
            <rect x="286" y="752" width="150" height="28" rx="3" />
            <text x="296" y="765" className="acore-plate-title" style={{ fontSize: 9 }}>MOGZY ACADEMY</text>
            <text x="296" y="775" className="acore-plate-sub">HEXTECH CORE · MK III</text>
          </g>
          {/* the four cradles and their channels */}
          {CORE_DESTINATIONS.map((d) => cradle(d.id))}
          {CORE_DESTINATIONS.map((d) => channel(d.id))}
          {/* readout under the crystal */}
          <g className="acore-readout">
            <rect x="392" y="690" width="176" height="46" rx="3" />
            <text x="402" y="708" className="acore-readout-label">MODE</text>
            <text x="402" y="728" className="acore-readout-value">{readout}<tspan className="acore-readout-caret">_</tspan></text>
          </g>
        </g>
      )}
      {compact && (
        <g className="acore-compact-band">
          {CORE_DESTINATIONS.map((d) => {
            const c = CHANNELS[d.id];
            const to = polar(BEZEL_R + 4, c.angle);
            const mid = polar(BEZEL_R + 70, c.angle);
            return (
              <g key={d.id} className="acore-channel" data-bay={d.id}>
                <line x1={mid.x} y1={mid.y} x2={to.x} y2={to.y} className="acore-channel-groove" />
                <line x1={mid.x} y1={mid.y} x2={to.x} y2={to.y} className="acore-channel-live" />
                <circle cx={mid.x} cy={mid.y} r="6" className="acore-channel-socket" />
              </g>
            );
          })}
        </g>
      )}

      {/* ---------------- the crystal assembly ---------------- */}
      <g className="acore-aperture">
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 30} fill="url(#acore-core-glow)" filter="url(#acore-glow)" className="acore-lens-halo" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R + 2} className="acore-bezel-shadow" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R} className="acore-bezel-outer" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 14} fill="url(#acore-bezel-face)" className="acore-bezel-face" />
        <g className="acore-bezel-brush-group">{brush}</g>
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 1} className="acore-bezel-light" />
        {rivets}
        <g className="acore-scale">{scaleTicks}</g>
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r="118" className="acore-enamel-band" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r="117" className="acore-hairline" />
        <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r="100" className="acore-hairline" />

        {/* everything from here is authored around (0,0) at r=118 and scaled onto the chassis */}
        <g transform={`translate(${CORE_CENTER.x} ${CORE_CENTER.y}) scale(${LENS_SCALE})`}>
          <g className="acore-crystal">
            <circle r={LENS_LOCAL_R} className="acore-lens-plate" />
            {facets}
            <path d={hexPath(54)} className="acore-crystal-core" />
            <path d={hexPath(LENS_LOCAL_R)} className="acore-crystal-edge" />
            <circle r={LENS_LOCAL_R} fill="url(#acore-core-glow)" className="acore-crystal-glow" />
          </g>

          {/* projections */}
          <g clipPath="url(#acore-lens-clip)">
            <g className="acore-mode acore-mode-idle">
              <path d="M 0,0 L 118,-22 A 118 118 0 0 1 118,22 Z" className="acore-idle-sweep" />
            </g>
            {/* INQUIRY — the specimen (Ryze) under the magnifier */}
            <g className="acore-mode acore-mode-leaguecraft">
              <path d="M 0,0 L 118,-40 A 118 118 0 0 1 118,40 Z" className="acore-probe-wedge" />
              <circle r="74" className="acore-probe-ring acore-probe-ring-2" />
              <g className="acore-specimen">
                <g clipPath="url(#acore-art-clip)">
                  <circle r="46" className="acore-specimen-plate" />
                  {art.leaguecraft && <image href={art.leaguecraft} x="-62" y="-46" width="156" height="92" preserveAspectRatio="xMidYMid slice" className="acore-media" />}
                </g>
                <circle r="48" className="acore-magnifier" />
                <line x1="36" y1="36" x2="66" y2="66" className="acore-magnifier-handle" />
              </g>
            </g>
            {/* MEASURE — calipers close on the specimen (Akali), shards, range arc */}
            <g className="acore-mode acore-mode-combat">
              <g clipPath="url(#acore-art-clip)">
                <circle r="46" className="acore-specimen-plate" />
                {art["combat-lab"] && <image href={art["combat-lab"]} x="-62" y="-46" width="156" height="92" preserveAspectRatio="xMidYMid slice" className="acore-media acore-media-dim" />}
              </g>
              <path d="M -84,62 A 100 100 0 0 1 84,62" className="acore-range-arc" />
              {[-60, -30, 0, 30, 60].map((a) => {
                const t = (a - 90) * DEG;
                return <line key={a} x1={96 * Math.cos(t)} y1={96 * Math.sin(t) + 62} x2={104 * Math.cos(t)} y2={104 * Math.sin(t) + 62} className="acore-range-tick" />;
              })}
              <g className="acore-jaw acore-jaw-l">
                <line x1="0" y1="-52" x2="0" y2="52" /><path d="M 0,-52 h 9 v 6 h -9 Z M 0,46 h 9 v 6 h -9 Z" />
                {media.measureShards && <image href={media.measureShards[0]} x="-26" y="-9" width="18" height="18" className="acore-media acore-shard" />}
              </g>
              <g className="acore-jaw acore-jaw-r">
                <line x1="0" y1="-52" x2="0" y2="52" /><path d="M 0,-52 h -9 v 6 h 9 Z M 0,46 h -9 v 6 h 9 Z" />
                {media.measureShards && <image href={media.measureShards[1]} x="8" y="-9" width="18" height="18" className="acore-media acore-shard" />}
              </g>
              <line x1="-40" y1="60" x2="40" y2="60" className="acore-dim-line" />
              <path d="M -40,60 l 7,-3.5 v 7 Z M 40,60 l -7,-3.5 v 7 Z" className="acore-dim-arrow" />
              <text y="-62" textAnchor="middle" className="acore-dim-text">Δ 1.000</text>
            </g>
            {/* STRATA — records (Viktor) under the latest patch's icons */}
            <g className="acore-mode acore-mode-archives">
              <g clipPath="url(#acore-art-clip)">
                <circle r="46" className="acore-specimen-plate" />
                {art.archives && <image href={art.archives} x="-62" y="-46" width="156" height="92" preserveAspectRatio="xMidYMid slice" className="acore-media acore-media-dim" />}
              </g>
              {[0, 1, 2, 3, 4].map((i) => <ellipse key={i} rx="76" ry="16" className={`acore-stratum acore-stratum-${i}`} />)}
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
              {media.strataLabel && <text y="86" textAnchor="middle" className="acore-strata-label">{media.strataLabel.toUpperCase()}</text>}
            </g>
            {/* OBSERVE — the reticle tracks the pro-scene mark (Ahri) */}
            <g className="acore-mode acore-mode-pro-play">
              <g className="acore-reticle">
                <circle r="58" /><circle r="22" />
                <line x1="-84" y1="0" x2="-28" y2="0" /><line x1="28" y1="0" x2="84" y2="0" />
                <line x1="0" y1="-84" x2="0" y2="-28" /><line x1="0" y1="28" x2="0" y2="84" />
                {[-54, -40, 40, 54].map((v) => (<g key={v}><line x1={v} y1="-5" x2={v} y2="5" /><line x1="-5" y1={v} x2="5" y2={v} /></g>))}
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
                  {art["pro-play"] && <image href={art["pro-play"]} x="-30" y="-20" width="68" height="40" preserveAspectRatio="xMidYMid slice" className="acore-media" />}
                </g>
                <circle r="21" className="acore-mark-ring" />
              </g>
            </g>
          </g>

          {/* iris */}
          <g clipPath="url(#acore-lens-clip)" className="acore-iris">
            {BLADES.map((rot, i) => (
              <g key={rot} transform={`rotate(${rot})`}>
                <rect ref={(el) => { bladeRefs.current[i] = el; }} x={initial.opening} y="-140" width="160" height="280" fill="url(#acore-blade)" />
                <line ref={(el) => { edgeRefs.current[i] = el; }} x1={initial.opening} y1="-140" x2={initial.opening} y2="140" className="acore-blade-edge" />
              </g>
            ))}
          </g>
          <circle r={LENS_LOCAL_R + 4} className="acore-iris-rim" />
          <circle r={LENS_LOCAL_R + 1} className="acore-iris-rim-light" />
        </g>

        {/* bezel-riding index cursor */}
        <g ref={cursorRef} className="acore-cursor" transform={`rotate(${initial.angle} ${CORE_CENTER.x} ${CORE_CENTER.y})`}>
          <circle cx={CORE_CENTER.x} cy={CORE_CENTER.y} r={BEZEL_R - 7} className="acore-cursor-ring" />
          <path d={`M ${CORE_CENTER.x + BEZEL_R - 6},${CORE_CENTER.y - 7} L ${CORE_CENTER.x + BEZEL_R + 22},${CORE_CENTER.y} L ${CORE_CENTER.x + BEZEL_R - 6},${CORE_CENTER.y + 7} Z`} className="acore-cursor-pointer" />
          <circle cx={CORE_CENTER.x + BEZEL_R + 10} cy={CORE_CENTER.y} r="3.5" className="acore-cursor-lamp" />
          <path d={`M ${CORE_CENTER.x - BEZEL_R + 6},${CORE_CENTER.y - 5} L ${CORE_CENTER.x - BEZEL_R - 10},${CORE_CENTER.y} L ${CORE_CENTER.x - BEZEL_R + 6},${CORE_CENTER.y + 5} Z`} className="acore-cursor-tail" />
        </g>
      </g>
    </svg>
  );
}
