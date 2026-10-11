/**
 * SCRUB-S1 — the Wave / XP lens scene.
 *
 * What the chronoscope shows at a checkpoint: the wave's formation standing
 * on a receding lane (melee front rank, casters behind, the cannon when the
 * wave carries one) and, beside it, the lane's LEVEL CREST — a ring of cyan
 * XP filling toward the next level around the level numeral.
 *
 * Drawn from the frame the instrument hands it. Between two checkpoints the
 * cannon crossfades, the lane's rune lines drift (controlled parallax) and
 * the ring fills toward the boundary; when the discrete level under the
 * reticle rises, the crest flares. All of it is transform, opacity and SVG
 * attribute changes inside a fixed box — nothing is laid out.
 *
 * Every figure is the authority's; `levelFill` is a drawing ratio supplied by
 * the adapter. Nothing here compares a state to the objective.
 */
import { useEffect, useRef, useState } from "react";
import type { ChronoscopeFrame } from "@/components/interaction-grammar/Chronoscope";
import type { WaveXpScene } from "@/lib/scrub/waveXpChronoscope";
import "./wave-xp-lens.css";

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Minion glyphs: chronoscope projections, not team art. */
function MeleeGlyph() {
  return (
    <g className="wx-minion wx-minion--melee">
      <ellipse cx="0" cy="22" rx="12" ry="3" className="wx-shadow" />
      <path d="M-7 20 L-7 6 Q-7 -2 0 -2 Q7 -2 7 6 L7 20 Z" className="wx-body" />
      <circle cx="0" cy="-7" r="5.5" className="wx-head" />
      <path d="M-13 4 Q-13 -4 -7 -5 L-7 13 Q-13 12 -13 4 Z" className="wx-shield" />
      <path d="M8 2 L13 -8" className="wx-blade" />
      <circle cx="-1.5" cy="-7.5" r="1" className="wx-eye" />
    </g>
  );
}
function CasterGlyph() {
  return (
    <g className="wx-minion wx-minion--caster">
      <ellipse cx="0" cy="20" rx="10" ry="2.6" className="wx-shadow" />
      <path d="M-5 18 L-5 6 Q-5 0 0 0 Q5 0 5 6 L5 18 Z" className="wx-body" />
      <path d="M-6 -2 L0 -13 L6 -2 Z" className="wx-hood" />
      <path d="M9 18 L9 -8" className="wx-staff" />
      <circle cx="9" cy="-10" r="2.6" className="wx-orb" />
      <circle cx="-1" cy="-4" r="0.9" className="wx-eye" />
    </g>
  );
}
function CannonGlyph() {
  return (
    <g className="wx-minion wx-minion--cannon">
      <ellipse cx="0" cy="30" rx="20" ry="4" className="wx-shadow" />
      <circle cx="-11" cy="24" r="6" className="wx-wheel" />
      <circle cx="11" cy="24" r="6" className="wx-wheel" />
      <path d="M-15 22 L-15 6 Q-15 -4 0 -4 Q15 -4 15 6 L15 22 Z" className="wx-body" />
      <path d="M4 2 L26 -12 L29 -8 L9 8 Z" className="wx-barrel" />
      <circle cx="-4" cy="4" r="3" className="wx-eye wx-eye--cannon" />
      <path d="M-15 10 L15 10" className="wx-band" />
    </g>
  );
}

/** Where each rank stands on the lane (viewBox 300×180). */
const MELEE_X = [88, 150, 212];
const CASTER_X = [112, 150, 188];

export function WaveXpLens({ frame }: { frame: ChronoscopeFrame<WaveXpScene> }) {
  const a = frame.from.scene;
  const b = frame.to.scene;
  const t = frame.t;
  const shown = frame.nearest.scene;

  // The ring fills toward the boundary when the next checkpoint is a level up,
  // so a level-up reads as the vessel overflowing rather than draining.
  const fill = b.level > a.level ? lerp(a.levelFill, 1, t) : lerp(a.levelFill, b.levelFill, t);
  const cannonOpacity = lerp(a.cannon > 0 ? 1 : 0, b.cannon > 0 ? 1 : 0, t);
  const meleeCount = Math.max(a.melee, b.melee);
  const casterCount = Math.max(a.caster, b.caster);
  const drift = (frame.from.scene === frame.to.scene ? 0 : t) * 26;

  // The crest flares when the level under the reticle rises.
  const prevLevel = useRef(shown.level);
  const [flare, setFlare] = useState(0);
  useEffect(() => {
    if (shown.level > prevLevel.current && frame.animate) setFlare((n) => n + 1);
    prevLevel.current = shown.level;
  }, [shown.level, frame.animate]);

  return (
    <div className="wx-lens" data-testid="wave-xp-lens" data-lane={shown.lane}
      data-level={shown.level} data-cannon={shown.cannonWave ? "true" : "false"}>
      <svg className="wx-lane" viewBox="0 0 300 180" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id="wx-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2d4a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#2f8fca" stopOpacity="0.22" />
          </linearGradient>
          <clipPath id="wx-lane-clip">
            <path d="M120 40 L180 40 L262 178 L38 178 Z" />
          </clipPath>
        </defs>
        {/* the lane: a receding road with engraved rune lines that drift with time */}
        <path d="M120 40 L180 40 L262 178 L38 178 Z" fill="url(#wx-ground)" className="wx-road" />
        <g clipPath="url(#wx-lane-clip)" className="wx-runes" style={{ transform: `translateY(${drift}px)` }}>
          {[-26, 0, 26, 52, 78, 104, 130, 156].map((y) => {
            const yy = 40 + y;
            const half = 30 + (yy - 40) * (92 / 138);
            return <line key={y} x1={150 - half} y1={yy} x2={150 + half} y2={yy} />;
          })}
        </g>
        <path d="M120 40 L38 178" className="wx-edge" />
        <path d="M180 40 L262 178" className="wx-edge" />
        <path d="M150 40 L150 178" className="wx-centre" />
        {/* the formation: casters behind, melee in front, the cannon behind them all */}
        <g style={{ opacity: cannonOpacity }} transform="translate(150 54) scale(0.95)">
          <CannonGlyph />
        </g>
        {Array.from({ length: casterCount }, (_, i) => (
          <g key={`c${i}`} transform={`translate(${CASTER_X[i] ?? 150} 92) scale(1.05)`}
            style={{ opacity: lerp(i < a.caster ? 1 : 0, i < b.caster ? 1 : 0, t) }}>
            <CasterGlyph />
          </g>
        ))}
        {Array.from({ length: meleeCount }, (_, i) => (
          <g key={`m${i}`} transform={`translate(${MELEE_X[i] ?? 150} 138) scale(1.35)`}
            style={{ opacity: lerp(i < a.melee ? 1 : 0, i < b.melee ? 1 : 0, t) }}>
            <MeleeGlyph />
          </g>
        ))}
      </svg>

      <div className="wx-crest" data-testid="wave-xp-crest">
        <svg viewBox="0 0 120 120" aria-hidden className="wx-crest-svg">
          <defs>
            <linearGradient id="wx-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#eafbff" />
              <stop offset="0.55" stopColor="#7fd6ef" />
              <stop offset="1" stopColor="#2f8fca" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={RING_R + 7} className="wx-ring-bezel" />
          <circle cx="60" cy="60" r={RING_R} className="wx-ring-track" />
          <circle cx="60" cy="60" r={RING_R} className="wx-ring-fill"
            strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - fill)}
            transform="rotate(-90 60 60)" />
          {/* eight engraved marks around the ring */}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1="60" y1="7" x2="60" y2="11" className="wx-ring-mark"
              transform={`rotate(${i * 45} 60 60)`} />
          ))}
          <circle key={flare} cx="60" cy="60" r={RING_R - 6} className="wx-flare" data-animate={frame.animate ? "true" : "false"} />
        </svg>
        <div className="wx-crest-text">
          <span className="wx-crest-eyebrow">Level</span>
          <span className="wx-crest-level" data-testid="wave-xp-level">{shown.level}</span>
          <span className="wx-crest-next" data-testid="wave-xp-next">
            {shown.nextLevelXpDisplay !== null ? `${shown.xpDisplay} / ${shown.nextLevelXpDisplay}` : shown.xpDisplay}
          </span>
        </div>
      </div>

      <div className="wx-caption" aria-hidden>
        <span className="wx-caption-item" data-testid="wave-xp-formation">
          {shown.melee} melee · {shown.caster} caster{shown.cannon > 0 ? ` · ${shown.cannon} cannon` : ""}
        </span>
        <span className="wx-caption-item wx-caption-item--xp">{shown.waveXpDisplay} XP this wave</span>
      </div>
    </div>
  );
}
