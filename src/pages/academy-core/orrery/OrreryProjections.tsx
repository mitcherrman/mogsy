/**
 * Academy Core V3.5 — the two redesigned crystal projections.
 *
 * Both are handed to the shared `AcademyCoreInstrument` through its opt-in
 * `projectionOverrides` and drawn in the lens's LOCAL space: origin at the
 * crystal centre, lens radius 118, already clipped to the lens, inside the
 * room's own mode group (so the mode fade, the iris and the room colour are
 * the instrument's, unchanged). V3 never passes them.
 *
 * LEAGUECRAFT — five roles around a concealed Lux. The five role icons on the
 * pentagon (r 76, the V3 Pro Play / P2C Leaguecraft arrangement and styling),
 * and in the centre, where the scroll/quill was, Lux's real champion icon in a
 * hexagonal chamber closed by six corner-hinged frosted-glass shutters. At rest
 * she is completely concealed; reaching for the Leaguecraft BOOK (hover /
 * keyboard focus) turns the shutters slowly open and reveals her; leaving
 * closes them. No loop: nothing moves on its own.
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
 * is 104; the Lux chamber is a pointy-top hexagon of corner radius 56 aligned
 * with it, inside the role icons' ring (r 76, icon rings r 9: inner edge 67).
 */
import type { ReactNode } from "react";
import { LUX_WINDOW_RADIUS, TEAM_ICON_R, TEAM_ARC_R, TEAM_STEP_DEG, teamSlot, type MatchupMedia } from "./orrery-projections-data";

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Leaguecraft — five roles around a concealed Lux                    */
/* ------------------------------------------------------------------ */

/** The five role icons: the arrangement of the V3 Pro Play / P2C Leaguecraft composition (r 76, 72 deg apart, top first). */
const ROLE_R = 76;
function RoleIcons({ roles }: { roles: readonly string[] }) {
  return (
    <g data-testid="academy-core-v35-roles">
      {roles.slice(0, 5).map((href, i) => {
        const t = (-90 + i * 72) * DEG;
        return (
          <g key={href} transform={`translate(${(ROLE_R * Math.cos(t)).toFixed(1)} ${(ROLE_R * Math.sin(t)).toFixed(1)})`} className="acore-role">
            <circle r="9" className="acore-role-ring" />
            <image href={href} x="-6" y="-6" width="12" height="12" className="acore-media acore-role-icon" />
          </g>
        );
      })}
    </g>
  );
}

/** The portrait chamber's corner radius (pointy-top hexagon), inside the ring of role icons. */
const RC = LUX_WINDOW_RADIUS;
const hex = (r: number) => [-90, -30, 30, 90, 150, 210]
  .map((a) => `${(r * Math.cos(a * DEG)).toFixed(2)},${(r * Math.sin(a * DEG)).toFixed(2)}`)
  .join(" ");

/**
 * The shutters: the chamber's own geometry. The window is divided into six
 * identical triangles (centre, corner k, corner k+1); shutter k is hinged at
 * corner k and pivots outward about it, under the frame. At rest (0 deg) the six
 * close the window completely. Pivoting by an angle theta opens a central
 * aperture (a hexagon of inradius R sin theta) and the shutters never overlap:
 * the reveal grows evenly with theta (theta/60 of the window), and at 60 deg
 * every shutter has swung out of the window. Drawn once, in the hinge's
 * coordinates, and repeated by 60 deg rotations about the centre.
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
const SHUTTERS = [0, 1, 2, 3, 4, 5] as const;

/** Places shutter k: about the centre by 60k deg, then at its hinge (corner k). The pivot group turns about the hinge. */
function AtHinge({ k, children }: { k: number; children: ReactNode }) {
  return (
    <g transform={`rotate(${60 * k}) translate(${HINGE.x} ${HINGE.y})`}>
      <g className="o35-shutter-pivot">{children}</g>
    </g>
  );
}

function Shutter({ k }: { k: number }) {
  return (
    <AtHinge k={k}>
      <g className="o35-shutter" data-testid={`academy-core-v35-shutter-${k}`}>
        <polygon points={SHUTTER_POINTS} fill="url(#o35-frost-tint)" className="o35-shutter-body" />
        <polygon points={SHUTTER_SHEEN} fill="url(#o35-glass-sheen)" className="o35-shutter-sheen" />
        <polygon points={SHUTTER_POINTS} className="o35-shutter-edge-dark" />
        <polygon points={SHUTTER_POINTS} className="o35-shutter-edge" />
      </g>
    </AtHinge>
  );
}

/**
 * LEAGUECRAFT: the five role icons on their pentagon, and in the centre, where
 * the scroll/quill was, Lux behind the chamber's iris of six frosted-glass
 * shutters. At rest the iris is closed and she cannot be made out: through
 * frosted glass only a soft, pale blur of colour shows. Reaching for the
 * Leaguecraft book (hover / keyboard focus) turns the six shutters slowly
 * outward on their corner hinges and reveals her; leaving closes them again.
 * Nothing moves on its own. The motion is CSS (academy-core-v35.css).
 */
export function LuxMysteryProjection({ portrait, roles = [] }: { portrait: string | null; roles?: readonly string[] }) {
  const win = hex(RC);
  return (
    <g className="o35-lux" data-testid="academy-core-v35-lux">
      <defs>
        <clipPath id="o35-lux-window"><polygon points={win} /></clipPath>
        {/* where the glass is: the frosted copy of the portrait shows only there (a hairline stroke closes the seams) */}
        <mask id="o35-lux-glass-mask" maskUnits="userSpaceOnUse" x="-118" y="-118" width="236" height="236">
          {SHUTTERS.map((k) => (
            <AtHinge key={k} k={k}><polygon points={SHUTTER_POINTS} fill="#ffffff" stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" /></AtHinge>
          ))}
        </mask>
        {/* frosted glass: what is behind it is softened past recognition and paled, with a faint refraction */}
        <filter id="o35-frost" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="6" />
          <feColorMatrix type="saturate" values="0.6" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.78" intercept="0.14" />
            <feFuncG type="linear" slope="0.78" intercept="0.15" />
            <feFuncB type="linear" slope="0.78" intercept="0.18" />
          </feComponentTransfer>
        </filter>
        <linearGradient id="o35-frost-tint" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="0.55" stopColor="#e8edf4" stopOpacity="0.1" />
          <stop offset="1" stopColor="#c7d0dc" stopOpacity="0.26" />
        </linearGradient>
        <linearGradient id="o35-glass-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.4" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="o35-lux-vignette" cx="50%" cy="46%" r="58%">
          <stop offset="0.62" stopColor="#0a0f24" stopOpacity="0" /><stop offset="1" stopColor="#0a0f24" stopOpacity="0.5" />
        </radialGradient>
      </defs>

      <RoleIcons roles={roles} />

      <polygon points={hex(RC + 3.5)} className="o35-lux-halo" />
      <g clipPath="url(#o35-lux-window)">
        {/* the chamber: a dark backing, the portrait, a soft vignette */}
        <polygon points={win} className="o35-lux-backing" />
        {portrait && (
          <image href={portrait} x={-RC} y={-RC} width={2 * RC} height={2 * RC} preserveAspectRatio="xMidYMid slice" className="acore-media o35-lux-image" data-testid="academy-core-v35-lux-portrait" />
        )}
        <polygon points={win} fill="url(#o35-lux-vignette)" />
        {/* through the glass: the portrait frosted (blurred, paled) and a touch magnified, which reads as refraction */}
        {portrait && (
          <g mask="url(#o35-lux-glass-mask)">
            <polygon points={win} className="o35-lux-frost-base" />
            <image href={portrait} x={-RC} y={-RC} width={2 * RC} height={2 * RC} preserveAspectRatio="xMidYMid slice" filter="url(#o35-frost)" className="acore-media o35-lux-frost" transform="scale(1.08)" />
          </g>
        )}
        {/* the shutters, inside the window: they swing out under the frame, never past it */}
        {SHUTTERS.map((k) => <Shutter key={k} k={k} />)}
      </g>
      <polygon points={win} className="o35-lux-frame" />
      {/* the six hinges, one at each corner of the chamber */}
      {SHUTTERS.map((k) => (
        <polygon key={k} points="0,-3.4 2.5,0 0,3.4 -2.5,0" transform={`rotate(${60 * k}) translate(${HINGE.x} ${HINGE.y})`} className="o35-shutter-hinge" />
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
