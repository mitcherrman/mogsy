/**
 * Academy Core V3.5 — the enlarged, living Core.
 *
 * The V3 crystal assembly is REUSED, not redrawn: `AcademyCoreInstrument` in
 * its `compact` form (bezel, scale, iris, crystal and all four destination
 * projections, driven by the same `focus` / `activating` / `media` props).
 * What is new is everything around it, so the Core reads as the engine of the
 * whole scene even at rest:
 *
 *   · a breathing halo and a periodic shockwave (a fresh one on every change
 *     of focus);
 *   · three gyroscopic rings in real CSS 3D — they spin about different axes
 *     and pass in front of and behind the crystal;
 *   · two flat rune rings turning against each other, and three comet arcs
 *     of flowing energy (conic gradients, one rotating element each);
 *   · a bearing needle that points at the book the Core is attending to
 *     (the engine rotates it; the V3 bezel cursor is hidden because its
 *     fixed per-channel angles are meaningless when the books move);
 *   · the mode readout, set on a curve over the top of the ring;
 *   · a larger crystal: the instrument's `lensScale` (V3.5 only) fills the dial's
 *     inner band, so the luminous lens, its projections and the iris all grow
 *     together while the dial, rings and orbit keep their size.
 *
 * Every animation is a transform / opacity keyframe on its own element; there
 * is no JS in the loop except the needle, which the engine writes.
 */
import { forwardRef, memo, type ReactNode } from "react";

import AcademyCoreInstrument, { type CoreMedia } from "@/pages/academy-core/AcademyCoreInstrument";
import { CORE_IDLE_READOUT, destinationById, type CoreFocus } from "@/pages/academy-core/academy-core-destinations";

/**
 * The crystal's scale on the dial in V3.5 (V3 uses 0.78). 0.96 makes the lens
 * ~23 % wider (~51 % more area) and fills the dark enamel band up to its edge:
 * lens r 118 -> 113 viewBox units inside the band's r 118, iris rim at ~117-120,
 * clear of the scale ticks (r 128+). The outer dial and rings are unchanged.
 */
export const V35_LENS_SCALE = 0.96;

export interface OrreryCoreProps {
  focus: CoreFocus;
  activating: CoreFocus | null;
  ambient: boolean;
  media: CoreMedia;
  /** The crystal's accessible button (the page owns its behaviour). */
  children: ReactNode;
}

/** 60 ticks, every fifth long: the flat outer scale. */
function ScaleRing() {
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180;
    const major = i % 6 === 0;
    const r1 = major ? 226 : 232;
    ticks.push(
      <line key={i} x1={250 + r1 * Math.cos(a)} y1={250 + r1 * Math.sin(a)} x2={250 + 240 * Math.cos(a)} y2={250 + 240 * Math.sin(a)}
        className={major ? "o35-tick o35-tick-major" : "o35-tick"} />,
    );
  }
  return (
    <svg viewBox="0 0 500 500" className="o35-ring-svg" focusable="false">
      <circle cx="250" cy="250" r="244" className="o35-ring-hair" />
      <circle cx="250" cy="250" r="222" className="o35-ring-hair o35-ring-hair-dim" />
      {ticks}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 250 250) translate(250 10)`}>
          <path d="M0,-9 L7.8,-4.5 L7.8,4.5 L0,9 L-7.8,4.5 L-7.8,-4.5 Z" className="o35-ring-hex" />
        </g>
      ))}
    </svg>
  );
}

/** Dashed rune arcs with small glyph marks: counter-rotates against the scale. */
function RuneRing() {
  return (
    <svg viewBox="0 0 500 500" className="o35-ring-svg" focusable="false">
      <circle cx="250" cy="250" r="196" className="o35-rune-dash" />
      <circle cx="250" cy="250" r="186" className="o35-rune-dash o35-rune-dash-b" />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 30 + 15} 250 250) translate(250 54)`}>
          <path d={i % 3 === 0 ? "M0,-7 L6,0 L0,7 L-6,0 Z" : i % 3 === 1 ? "M-5,-5 L5,-5 L0,6 Z" : "M-6,0 H6 M0,-6 V6"} className="o35-rune-glyph" />
        </g>
      ))}
    </svg>
  );
}

const OrreryCore = forwardRef<HTMLDivElement, OrreryCoreProps>(function OrreryCore(
  { focus, activating, ambient, media, children },
  needleRef,
) {
  const dest = destinationById(focus);
  const readout = dest ? dest.readout : CORE_IDLE_READOUT;
  const arcId = "o35-readout-arc";

  return (
    <div
      className="o35-core"
      data-focus={focus}
      data-activating={activating ?? ""}
      data-ambient={ambient ? "on" : "off"}
      data-testid="academy-core-v35-core"
    >
      <div className="o35-core-halo" />
      <div className="o35-core-halo o35-core-halo-inner" />
      {/* a ring of light released on every change of focus (and, slowly, at rest) */}
      <div className="o35-pulse" key={`${focus}|${activating ?? ""}`} />
      <div className="o35-pulse o35-pulse-idle" />

      {/* flat rings, turning in the plane of the dial */}
      <div className="o35-ring o35-ring-scale"><ScaleRing /></div>
      <div className="o35-ring o35-ring-rune"><RuneRing /></div>

      {/* flowing energy: one bright arc with a fading tail per ring */}
      <div className="o35-comet o35-comet-a" />
      <div className="o35-comet o35-comet-b" />
      <div className="o35-comet o35-comet-c" />

      {/* gyroscopic rings — real 3D, depth-sorted against the crystal */}
      <div className="o35-gyro">
        <div className="o35-gyro-ring o35-gyro-a" />
        <div className="o35-gyro-ring o35-gyro-b" />
        <div className="o35-gyro-ring o35-gyro-c" />
      </div>

      {/* the Core's attention: the needle points at the book it is reading */}
      <div className="o35-needle" ref={needleRef}>
        <span className="o35-needle-tip" />
        <span className="o35-needle-lamp" />
      </div>

      {/* mode readout on a curve over the top of the rings */}
      <svg className="o35-readout-svg" viewBox="0 0 500 500" aria-hidden focusable="false">
        <defs><path id={arcId} d="M 92,250 A 158 158 0 0 1 408,250" /></defs>
        <text className="o35-readout-text" textAnchor="middle" dy="-4">
          <textPath href={`#${arcId}`} startOffset="50%">MODE · {readout}</textPath>
        </text>
      </svg>

      {/* the dial absorbs the pointer over its own disc only: books passing behind
          the Core stay reachable everywhere the Core does not cover them */}
      <div className="o35-dial-block" aria-hidden />

      {/* the V3 crystal assembly, unchanged */}
      <div className="o35-instrument">
        <AcademyCoreInstrument focus={focus} activating={activating} compact ambient={ambient} media={media} lensScale={V35_LENS_SCALE} />
        {children}
      </div>
    </div>
  );
});

export default memo(OrreryCore);
