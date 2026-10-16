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
 * window, examined through three translucent Hextech glass panes (blue lens,
 * violet shard, pale-gold blade). The panes conceal different parts of her
 * face and drift through four arrangements on one 14 s loop; once per loop a
 * beam of arcane light crosses the glass and the portrait, and the pane edges
 * glint as it passes. Entering the room the panes slide in from the rim; when
 * the visitor reaches for the Leaguecraft BOOK (hover / keyboard) the panes
 * part a little to reveal more, and on activation they part fully. Everything
 * is CSS transform / opacity on SVG groups (academy-core-v35.css); no script.
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
import { LUX_GLASS_SCALE, LUX_WINDOW_RADIUS, TEAM_ICON_R, TEAM_ARC_R, TEAM_STEP_DEG, teamSlot, type MatchupMedia } from "./orrery-projections-data";

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Leaguecraft — Arcane Mystery: Lux                                  */
/* ------------------------------------------------------------------ */

/** The portrait window's corner radius (pointy-top hexagon). */
const RC = LUX_WINDOW_RADIUS;
const hex = (r: number) => [-90, -30, 30, 90, 150, 210]
  .map((a) => `${(r * Math.cos(a * DEG)).toFixed(2)},${(r * Math.sin(a * DEG)).toFixed(2)}`)
  .join(" ");

/** The three panes, each drawn around its own origin (their placement and motion are CSS). */
const PANES = [
  { id: "blue", points: "-26,-62 22,-48 16,58 -30,40", sheen: "-18,-50 10,-41 6,-6 -20,-12", streaks: [[-16, -40, 4, 40], [-6, -46, 12, 30]] },
  { id: "violet", points: "-34,-14 -8,-34 30,-22 36,10 8,30 -28,18", sheen: "-24,-12 -6,-26 20,-18 10,-4 -16,2", streaks: [[-20, 8, 22, -14]] },
  { id: "gold", points: "-62,-6 64,-22 60,-4 -58,8", sheen: "-50,-3 52,-17 50,-12 -48,1", streaks: [[-40, 0, 44, -12]] },
] as const;

function Pane({ pane }: { pane: (typeof PANES)[number] }) {
  return (
    <g className={`o35-pane-engage o35-pane-engage-${pane.id}`}>
      <g className={`o35-pane-drift o35-pane-drift-${pane.id}`}>
        <g className={`o35-pane o35-pane-${pane.id}`} data-testid={`academy-core-v35-pane-${pane.id}`}>
          <polygon points={pane.points} className="o35-pane-shadow" transform="translate(4 5)" />
          <polygon points={pane.points} fill={`url(#o35-glass-${pane.id})`} className="o35-pane-body" />
          <polygon points={pane.points} fill="url(#o35-glass-reed)" className="o35-pane-reed" />
          <polygon points={pane.sheen} fill="url(#o35-glass-sheen)" className="o35-pane-sheen" />
          {pane.streaks.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="o35-pane-streak" />
          ))}
          <polygon points={pane.points} className="o35-pane-edge-dark" />
          <polygon points={pane.points} className="o35-pane-edge" />
        </g>
      </g>
    </g>
  );
}

/** The panes' silhouettes only, for the refraction mask (same motion classes, so they move together). */
function PaneSilhouette({ pane }: { pane: (typeof PANES)[number] }) {
  return (
    <g className={`o35-pane-engage o35-pane-engage-${pane.id}`}>
      <g className={`o35-pane-drift o35-pane-drift-${pane.id}`}>
        <polygon points={pane.points} fill="#ffffff" />
      </g>
    </g>
  );
}

export function LuxMysteryProjection({ portrait }: { portrait: string | null }) {
  const win = hex(RC);
  const glass = `scale(${LUX_GLASS_SCALE.toFixed(4)})`;
  return (
    <g className="o35-lux" data-testid="academy-core-v35-lux">
      <defs>
        <clipPath id="o35-lux-window"><polygon points={win} /></clipPath>
        {/* where the glass is: the refracted copy of the portrait shows only there */}
        <mask id="o35-lux-glass-mask" maskUnits="userSpaceOnUse" x="-118" y="-118" width="236" height="236">
          <g transform={glass}>{PANES.map((p) => <PaneSilhouette key={p.id} pane={p} />)}</g>
        </mask>
        <linearGradient id="o35-glass-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bfe0ff" stopOpacity="0.62" /><stop offset="0.5" stopColor="#4f86e8" stopOpacity="0.38" /><stop offset="1" stopColor="#9cc6ff" stopOpacity="0.58" />
        </linearGradient>
        <linearGradient id="o35-glass-violet" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0d4ff" stopOpacity="0.62" /><stop offset="0.55" stopColor="#7a62e6" stopOpacity="0.42" /><stop offset="1" stopColor="#b9a6ff" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="o35-glass-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff3cf" stopOpacity="0.7" /><stop offset="0.5" stopColor="#e2c06e" stopOpacity="0.5" /><stop offset="1" stopColor="#fff8e2" stopOpacity="0.7" />
        </linearGradient>
        {/* fluted (reeded) glass: fine ribs that break up what is behind without blurring it */}
        <pattern id="o35-glass-reed" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(68)">
          <rect width="1.1" height="3.2" fill="#ffffff" fillOpacity="0.22" />
          <rect x="1.1" width="0.5" height="3.2" fill="#0a1030" fillOpacity="0.18" />
        </pattern>
        <linearGradient id="o35-glass-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
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

      {/* the window: a dark backing, the portrait, a soft vignette */}
      <polygon points={hex(RC + 5)} className="o35-lux-halo" />
      <g clipPath="url(#o35-lux-window)">
        <polygon points={win} className="o35-lux-backing" />
        <g className="o35-lux-portrait">
          {portrait && (
            <image href={portrait} x={-RC} y={-RC} width={2 * RC} height={2 * RC} preserveAspectRatio="xMidYMid slice" className="acore-media o35-lux-image" data-testid="academy-core-v35-lux-portrait" />
          )}
        </g>
        {/* refraction: through the glass Lux is magnified and displaced, so the panes hide by distorting, not by blurring */}
        {portrait && (
          <g mask="url(#o35-lux-glass-mask)">
            <image href={portrait} x={-RC} y={-RC} width={2 * RC} height={2 * RC} preserveAspectRatio="xMidYMid slice" className="acore-media o35-lux-refract" transform="translate(7 -5) scale(1.14)" />
          </g>
        )}
        <polygon points={win} fill="url(#o35-lux-vignette)" />
        {/* arcane light crossing the portrait once per loop */}
        <g className="o35-lux-beam-track">
          <rect x="-38" y="-130" width="76" height="260" fill="url(#o35-lux-beam)" className="o35-lux-beam" transform="rotate(24)" />
        </g>
      </g>
      <polygon points={win} className="o35-lux-frame" />

      {/* the glass, in front of the portrait (authored for a 157-unit portrait, scaled with the window) */}
      <g transform={glass}>
        {PANES.map((p) => <Pane key={p.id} pane={p} />)}
        {/* the same light, catching the glass as it passes */}
        <g className="o35-lux-beam-track o35-lux-beam-track-glass">
          <rect x="-10" y="-130" width="20" height="260" fill="url(#o35-lux-beam)" className="o35-lux-beam o35-lux-beam-glass" transform="rotate(24)" />
        </g>
      </g>
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
