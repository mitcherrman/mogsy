/**
 * Academy Core V3.5 — the two redesigned crystal projections.
 *
 * Both are handed to the shared `AcademyCoreInstrument` through its opt-in
 * `projectionOverrides` and drawn in the lens's LOCAL space: origin at the
 * crystal centre, lens radius 118, already clipped to the lens, inside the
 * room's own mode group (so the mode fade, the iris and the room colour are
 * the instrument's, unchanged). V3 never passes them.
 *
 * LEAGUECRAFT — "Arcane Mystery: Lux". One large subject: Lux's real champion
 * icon (the manifest's 128 px square, drawn ~1.25x at 1366 wide) in a hexagonal
 * window, behind the chamber's own iris: six identical glass shutters (blue
 * and violet alternating, pale-gold edges), each hinged at one corner of the
 * window. On one 14 s loop they pivot open together about their hinges,
 * rippling round the ring, so a central aperture widens over her face; they
 * hold open while a beam of arcane light crosses her, close almost fully, then
 * settle back to the partly open rest. Entering the room they swing in from
 * the corners; when the visitor reaches for the Leaguecraft BOOK (hover /
 * keyboard) they open further, and on activation they swing right out.
 * Everything is CSS rotation about the hinges on SVG groups
 * (academy-core-v35.css); no script.
 *
 * PRO PLAY — 5 v 5, in the Archives' language (a central circular subject in
 * a layered crystal field, small icon plates on a row) without its patch
 * content: five champion icons on an upper arc, five opposing on a mirrored
 * lower arc, team-tinted plates under each, and Summoner's Rift in the centre.
 *
 * GEOMETRY (local units). The iris's Pro Play opening is 88 (a hexagon with
 * that inradius): every icon's outer edge projects to <= 86 on the nearest
 * blade normal, so the iris never clips a portrait once open. Icons sit on
 * r 74 at 23 deg steps (r 12 each, 5.5 apart), 14 clear of the centre disc
 * (r 46 + its ring), well inside the lens (r 118). Leaguecraft's iris opening
 * is 104; the Lux window is a pointy-top hexagon of corner radius 86 (inradius
 * ~74.5) aligned with it, so the iris frames the portrait and never covers it.
 */
import type { ReactNode } from "react";
import { LUX_WINDOW_RADIUS, TEAM_ICON_R, TEAM_ARC_R, TEAM_STEP_DEG, teamSlot, type MatchupMedia } from "./orrery-projections-data";

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Leaguecraft — Arcane Mystery: Lux                                  */
/* ------------------------------------------------------------------ */

/** The portrait window's corner radius (pointy-top hexagon). */
const RC = LUX_WINDOW_RADIUS;
const hex = (r: number) => [-90, -30, 30, 90, 150, 210]
  .map((a) => `${(r * Math.cos(a * DEG)).toFixed(2)},${(r * Math.sin(a * DEG)).toFixed(2)}`)
  .join(" ");

/**
 * The shutters: the chamber's own geometry. The window is divided into six
 * identical triangles (centre, corner k, corner k+1); shutter k is hinged at
 * corner k and pivots outward about it, under the frame. Pivoting by an angle
 * theta opens a central aperture (a hexagon of inradius R sin theta) and the
 * shutters never overlap: the reveal grows evenly with theta (theta/60 of the
 * window), and at 60 deg every shutter has swung out of the window. Drawn once,
 * in the hinge's coordinates, and repeated by 60 deg rotations about the centre.
 */
type Pt = { x: number; y: number };
const HINGE: Pt = { x: 0, y: -RC }; // corner 0 (top); the other five are rotations of it
const NEXT: Pt = { x: RC * Math.cos(30 * DEG), y: RC / 2 }; // corner 1, relative to the hinge
const CENTRE: Pt = { x: 0, y: RC }; // the window centre, relative to the hinge
const pt = (p: Pt) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
const mix = (a: Pt, b: Pt, ka: number, kb: number): Pt => ({ x: a.x * ka + b.x * kb, y: a.y * ka + b.y * kb });
/** One shutter in its hinge's coordinates: the hinge, the next corner, the centre. */
export const SHUTTER_POINTS = `0,0 ${pt(NEXT)} ${pt(CENTRE)}`;
const SHUTTER_SHEEN = `0,0 ${pt(mix(NEXT, CENTRE, 0.55, 0))} ${pt(mix(NEXT, CENTRE, 0.12, 0.32))}`;
const SHUTTER_FACET = mix(NEXT, CENTRE, 0.5, 0.5); // a facet line from the hinge to the far edge's midpoint
const SHUTTERS = [0, 1, 2, 3, 4, 5] as const;

/** Places shutter k: about the centre by 60k deg, then at its hinge (corner k). Engage and drift pivot about the hinge. */
function AtHinge({ k, children }: { k: number; children: ReactNode }) {
  return (
    <g transform={`rotate(${60 * k}) translate(${HINGE.x} ${HINGE.y})`}>
      <g className="o35-shutter-engage">
        <g className={`o35-shutter-drift o35-shutter-k${k}`}>{children}</g>
      </g>
    </g>
  );
}

function Shutter({ k }: { k: number }) {
  const tint = k % 2 ? "violet" : "blue";
  return (
    <AtHinge k={k}>
      <g className={`o35-shutter o35-shutter-${tint}`} data-testid={`academy-core-v35-shutter-${k}`}>
        <polygon points={SHUTTER_POINTS} fill={`url(#o35-glass-${tint})`} className="o35-shutter-body" />
        <polygon points={SHUTTER_POINTS} fill="url(#o35-glass-reed)" className="o35-shutter-reed" />
        <polygon points={SHUTTER_SHEEN} fill="url(#o35-glass-sheen)" className="o35-shutter-sheen" />
        <line x1={0} y1={0} x2={SHUTTER_FACET.x.toFixed(2)} y2={SHUTTER_FACET.y.toFixed(2)} className="o35-shutter-facet" />
        <polygon points={SHUTTER_POINTS} className="o35-shutter-edge-dark" />
        <polygon points={SHUTTER_POINTS} className="o35-shutter-edge" />
      </g>
    </AtHinge>
  );
}

export function LuxMysteryProjection({ portrait }: { portrait: string | null }) {
  const win = hex(RC);
  return (
    <g className="o35-lux" data-testid="academy-core-v35-lux">
      <defs>
        <clipPath id="o35-lux-window"><polygon points={win} /></clipPath>
        {/* where the glass is: the refracted copy of the portrait shows only there */}
        <mask id="o35-lux-glass-mask" maskUnits="userSpaceOnUse" x="-118" y="-118" width="236" height="236">
          {SHUTTERS.map((k) => <AtHinge key={k} k={k}><polygon points={SHUTTER_POINTS} fill="#ffffff" /></AtHinge>)}
        </mask>
        <linearGradient id="o35-glass-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d8f3ff" stopOpacity="0.72" /><stop offset="0.55" stopColor="#2f97e8" stopOpacity="0.56" /><stop offset="1" stopColor="#0e4f8e" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="o35-glass-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6dcff" stopOpacity="0.72" /><stop offset="0.55" stopColor="#6c55da" stopOpacity="0.56" /><stop offset="1" stopColor="#35237e" stopOpacity="0.7" />
        </linearGradient>
        {/* fluted (reeded) glass: fine ribs that break up what is behind without blurring it */}
        <pattern id="o35-glass-reed" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(68)">
          <rect width="1.1" height="3.2" fill="#ffffff" fillOpacity="0.2" />
          <rect x="1.1" width="0.5" height="3.2" fill="#0a1030" fillOpacity="0.2" />
        </pattern>
        <linearGradient id="o35-glass-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="o35-lux-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff6dd" stopOpacity="0" />
          <stop offset="0.3" stopColor="#ffe9b8" stopOpacity="0.22" />
          <stop offset="0.46" stopColor="#fff3d6" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.54" stopColor="#dbe7ff" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#c9dcff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#c9dcff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="o35-lux-vignette" cx="50%" cy="46%" r="58%">
          <stop offset="0.62" stopColor="#0a0f24" stopOpacity="0" /><stop offset="1" stopColor="#0a0f24" stopOpacity="0.55" />
        </radialGradient>
      </defs>

      <polygon points={hex(RC + 5)} className="o35-lux-halo" />
      <g clipPath="url(#o35-lux-window)">
        {/* the window: a dark backing, the portrait, a soft vignette */}
        <polygon points={win} className="o35-lux-backing" />
        <g className="o35-lux-portrait">
          {portrait && (
            <image href={portrait} x={-RC} y={-RC} width={2 * RC} height={2 * RC} preserveAspectRatio="xMidYMid slice" className="acore-media o35-lux-image" data-testid="academy-core-v35-lux-portrait" />
          )}
        </g>
        {/* refraction: through the shutters Lux is magnified about the centre, so the glass hides by distorting, not by blurring */}
        {portrait && (
          <g mask="url(#o35-lux-glass-mask)">
            <image href={portrait} x={-RC} y={-RC} width={2 * RC} height={2 * RC} preserveAspectRatio="xMidYMid slice" className="acore-media o35-lux-refract" transform="scale(1.14)" />
          </g>
        )}
        <polygon points={win} fill="url(#o35-lux-vignette)" />
        {/* arcane light crossing the revealed face once per loop */}
        <g className="o35-lux-beam-track">
          <rect x="-38" y="-130" width="76" height="260" fill="url(#o35-lux-beam)" className="o35-lux-beam" transform="rotate(24)" />
        </g>
        {/* the shutters, inside the window: they swing out under the frame, never past it */}
        {SHUTTERS.map((k) => <Shutter key={k} k={k} />)}
        {/* the same light, catching the glass as it passes */}
        <g className="o35-lux-beam-track o35-lux-beam-track-glass">
          <rect x="-10" y="-130" width="20" height="260" fill="url(#o35-lux-beam)" className="o35-lux-beam o35-lux-beam-glass" transform="rotate(24)" />
        </g>
      </g>
      <polygon points={win} className="o35-lux-frame" />
      {/* the six hinges, one at each corner of the chamber */}
      {SHUTTERS.map((k) => (
        <polygon key={k} points="0,-4.6 3.4,0 0,4.6 -3.4,0" transform={`rotate(${60 * k}) translate(${HINGE.x} ${HINGE.y})`} className="o35-shutter-hinge" />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */

function arc(r: number, fromDeg: number, toDeg: number): string {
  const p = (d: number) => `${(r * Math.cos(d * DEG)).toFixed(2)},${(r * Math.sin(d * DEG)).toFixed(2)}`;
  return `M ${p(fromDeg)} A ${r} ${r} 0 0 1 ${p(toDeg)}`;
}

function Team({ side, icons }: { side: "top" | "bottom"; icons: readonly (string | null)[] }) {
  return (
    <g className={`o35-team o35-team-${side}`} data-testid={`academy-core-v35-team-${side}`}>
      {icons.slice(0, 5).map((href, i) => {
        const { x, y } = teamSlot(side, i);
        return (
          <g key={i} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`} className="o35-team-slot">
            <circle r={TEAM_ICON_R} className="o35-team-ring" />
            <g clipPath="url(#o35-team-clip)">
              <circle r={TEAM_ICON_R - 1} className="o35-team-plate" />
              {href && <image href={href} x={-(TEAM_ICON_R - 1)} y={-(TEAM_ICON_R - 1)} width={2 * (TEAM_ICON_R - 1)} height={2 * (TEAM_ICON_R - 1)} preserveAspectRatio="xMidYMid slice" className="acore-media o35-team-icon" />}
            </g>
          </g>
        );
      })}
    </g>
  );
}

export function MatchupProjection({ media }: { media: MatchupMedia | null }) {
  const span = 2 * TEAM_STEP_DEG + 12;
  return (
    <g data-testid="academy-core-v35-matchup">
      <defs><clipPath id="o35-team-clip"><circle r={TEAM_ICON_R - 1} /></clipPath></defs>
      {/* layered field: a tinted plate under each side and a fine trace outside it */}
      <path d={arc(TEAM_ARC_R, -90 - span, -90 + span)} className="o35-side-plate o35-side-top" />
      <path d={arc(TEAM_ARC_R, 90 - span, 90 + span)} className="o35-side-plate o35-side-bottom" />
      <path d={arc(TEAM_ARC_R + 18, -90 - span + 4, -90 + span - 4)} className="o35-side-trace o35-side-top" />
      <path d={arc(TEAM_ARC_R + 18, 90 - span + 4, 90 + span - 4)} className="o35-side-trace o35-side-bottom" />
      {/* Summoner's Rift */}
      <g className="o35-rift" data-testid="academy-core-v35-rift">
        <circle r="54" className="o35-rift-dash" />
        <g clipPath="url(#acore-art-clip)">
          <circle r="46" className="acore-specimen-plate" />
          {media?.rift && <image href={media.rift} x="-46" y="-46" width="92" height="92" preserveAspectRatio="xMidYMid slice" className="acore-media" />}
        </g>
        <circle r="47" className="o35-rift-ring" />
      </g>
      <Team side="top" icons={media?.blue ?? []} />
      <Team side="bottom" icons={media?.red ?? []} />
    </g>
  );
}
