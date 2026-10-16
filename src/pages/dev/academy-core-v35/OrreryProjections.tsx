/**
 * Academy Core V3.5 — the two redesigned crystal projections.
 *
 * Both are handed to the shared `AcademyCoreInstrument` through its opt-in
 * `projectionOverrides` and drawn in the lens's LOCAL space: origin at the
 * crystal centre, lens radius 118, already clipped to the lens, inside the
 * room's own mode group (so the mode fade, the iris and the room colour are
 * the instrument's, unchanged). V3 never passes them.
 *
 * LEAGUECRAFT — the composition that was Pro Play's: the targeting reticle
 * that locks on, the five real role icons on the pentagon (r 76), and, where
 * Ahri's portrait was, a scroll-and-quill emblem: the knowledge symbol of the
 * flagship mode, drawn as vector art so it stays crisp at its real ~48 px.
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
 * (r 46 + its ring), well inside the lens (r 118).
 */
import { TEAM_ICON_R, TEAM_ARC_R, TEAM_STEP_DEG, teamSlot, type MatchupMedia } from "./orrery-projections-data";

const DEG = Math.PI / 180;

/** The same reticle the V3 Pro Play projection draws (it rotates to lock on). */
function Reticle() {
  return (
    <g className="acore-reticle">
      <circle r="58" /><circle r="22" />
      <line x1="-84" y1="0" x2="-28" y2="0" /><line x1="28" y1="0" x2="84" y2="0" />
      <line x1="0" y1="-84" x2="0" y2="-28" /><line x1="0" y1="28" x2="0" y2="84" />
      {[-54, -40, 40, 54].map((v) => (<g key={v}><line x1={v} y1="-5" x2={v} y2="5" /><line x1="-5" y1={v} x2="5" y2={v} /></g>))}
    </g>
  );
}

/** Scroll and quill on a Hextech medallion (r 26). */
function StudyEmblem() {
  return (
    <g className="o35-study-emblem" data-testid="academy-core-v35-study-emblem">
      <defs>
        <radialGradient id="o35-emblem-plate" cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor="#3a2d8f" /><stop offset="0.7" stopColor="#1b1446" /><stop offset="1" stopColor="#0e0a2a" />
        </radialGradient>
        <radialGradient id="o35-emblem-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stopColor="#ffe9b8" stopOpacity="0.5" /><stop offset="1" stopColor="#ffe9b8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="o35-parchment" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8e2" /><stop offset="0.55" stopColor="#f2e0ad" /><stop offset="1" stopColor="#d9bc7c" />
        </linearGradient>
        <linearGradient id="o35-roll" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e6a2c" /><stop offset="0.45" stopColor="#fbe8b6" /><stop offset="1" stopColor="#7c5a22" />
        </linearGradient>
        <linearGradient id="o35-feather" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8f7ae6" /><stop offset="0.45" stopColor="#e3dbff" /><stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="o35-nib" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c4" /><stop offset="1" stopColor="#b8862f" />
        </linearGradient>
      </defs>
      <circle r="33" fill="url(#o35-emblem-glow)" className="o35-emblem-glow" />
      <g className="o35-emblem-float">
        {/* the medallion */}
        <circle r="26" fill="url(#o35-emblem-plate)" />
        <circle r="23" className="o35-emblem-inner-ring" />
        <circle r="26.5" className="acore-mark-ring" />
        <g transform="translate(-3 1)">
          {/* the scroll: sheet between two rolls */}
          <path d="M -10,-10 C -8.6,-3.5 -11.2,2.8 -9.8,8.8 L 10.2,8.8 C 11.4,2.8 9,-3.5 10.4,-10 Z" fill="url(#o35-parchment)" stroke="#8a6a2e" strokeWidth="0.7" />
          {[-5.6, -2.4, 0.8, 4].map((y, i) => (
            <line key={y} x1="-6.6" y1={y} x2={[5.8, 4.2, 6.2, 1.8][i]} y2={y} className="o35-emblem-ink" />
          ))}
          <rect x="-13" y="-14.2" width="26" height="6" rx="3" fill="url(#o35-roll)" stroke="#5d4519" strokeWidth="0.7" />
          <rect x="-13" y="7.2" width="26" height="6" rx="3" fill="url(#o35-roll)" stroke="#5d4519" strokeWidth="0.7" />
          {[[-13.4, -11.2], [13.4, -11.2], [-13.4, 10.2], [13.4, 10.2]].map(([x, y]) => (
            <g key={`${x},${y}`}>
              <circle cx={x} cy={y} r="3.4" fill="#e7c879" stroke="#5d4519" strokeWidth="0.7" />
              <circle cx={x} cy={y} r="1.2" fill="#5d4519" />
            </g>
          ))}
        </g>
        {/* the quill, crossing the scroll */}
        <g transform="translate(-2 1)">
          <path d="M 5,1 Q 3.4,-14.6 19,-19 Q 16.6,-5.2 5,1 Z" fill="url(#o35-feather)" stroke="#6b55c9" strokeWidth="0.6" />
          {[0.3, 0.5, 0.7].map((t) => {
            const x = 5 + 14 * t;
            const y = 1 - 20 * t;
            return <line key={t} x1={x} y1={y} x2={x - 3.6} y2={y - 1.2} className="o35-emblem-barb" />;
          })}
          <line x1="1.8" y1="6.4" x2="18" y2="-18" className="o35-emblem-shaft" />
          <path d="M 4.1,0.4 L 6.3,1.9 L 1.2,7.6 Z" fill="url(#o35-nib)" stroke="#5d4519" strokeWidth="0.5" />
        </g>
        {/* a glint off the tip */}
        <path d="M 19,-23.5 L 19.9,-21 L 22.4,-20.1 L 19.9,-19.2 L 19,-16.7 L 18.1,-19.2 L 15.6,-20.1 L 18.1,-21 Z" className="o35-emblem-glint" />
      </g>
    </g>
  );
}

export function StudyProjection({ roles }: { roles: readonly string[] }) {
  return (
    <g data-testid="academy-core-v35-study">
      <Reticle />
      {roles.slice(0, 5).map((href, i) => {
        const t = (-90 + i * 72) * DEG;
        return (
          <g key={href} transform={`translate(${(76 * Math.cos(t)).toFixed(1)} ${(76 * Math.sin(t)).toFixed(1)})`} className="acore-role">
            <circle r="9" className="acore-role-ring" />
            <image href={href} x="-6" y="-6" width="12" height="12" className="acore-media acore-role-icon" />
          </g>
        );
      })}
      <StudyEmblem />
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
