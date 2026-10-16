/**
 * Academy Core V3.5 — the open magical space behind the orrery.
 *
 * Replaces the V3 room (wall, pilasters, bench). Pure decoration, aria-hidden,
 * and deliberately cheap: gradients, one SVG star field per depth, a handful of
 * Hextech fragments and three light shafts — every continuous effect is a CSS
 * `transform` / `opacity` animation, which runs on the compositor. The three
 * `data-parallax` layers are moved a few pixels against the pointer by the
 * engine (they are plain wrappers, so their children keep their own animation).
 *
 * Restraint is the brief: deep navy, soft haze, blue / violet / gold energy,
 * nothing that competes with the Core and the books.
 */
import { memo, useMemo } from "react";

/** Small deterministic PRNG so the sky is identical on every render and in every capture. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Star { x: number; y: number; r: number; o: number }

function makeStars(seed: number, n: number, rMin: number, rMax: number): Star[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    x: +(r() * 1000).toFixed(1),
    y: +(r() * 700).toFixed(1),
    r: +(rMin + r() * (rMax - rMin)).toFixed(2),
    o: +(0.25 + r() * 0.65).toFixed(2),
  }));
}

/** [left %, top %, size px, rotation°, drift s, delay s, variant] */
const FRAGMENTS: ReadonlyArray<readonly [number, number, number, number, number, number, "hex" | "shard" | "gem"]> = [
  [6, 14, 34, 12, 19, -3, "hex"],
  [14, 62, 22, -18, 23, -9, "shard"],
  [27, 8, 18, 30, 17, -6, "gem"],
  [44, 88, 26, 6, 21, -12, "hex"],
  [58, 6, 28, -24, 25, -2, "shard"],
  [71, 78, 20, 40, 18, -8, "gem"],
  [83, 18, 38, 8, 22, -5, "hex"],
  [92, 54, 24, -30, 20, -14, "shard"],
  [96, 86, 18, 14, 16, -1, "gem"],
  [38, 28, 14, 0, 15, -10, "gem"],
];

function Fragment({ kind }: { kind: "hex" | "shard" | "gem" }) {
  const id = `o35-frag-${kind}`;
  return (
    <svg viewBox="-20 -20 40 40" className="o35-frag-svg" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bcd6ff" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#5a73e8" stopOpacity="0.7" />
          <stop offset="1" stopColor="#c9a24c" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {kind === "hex" && (
        <>
          <polygon points="0,-17 14.7,-8.5 14.7,8.5 0,17 -14.7,8.5 -14.7,-8.5" fill={`url(#${id})`} fillOpacity="0.22" stroke="#9fc0ff" strokeOpacity="0.7" strokeWidth="1.1" />
          <polygon points="0,-8 6.9,-4 6.9,4 0,8 -6.9,4 -6.9,-4" fill="none" stroke="#f3dfa6" strokeOpacity="0.6" strokeWidth="0.9" />
        </>
      )}
      {kind === "shard" && (
        <polygon points="-3,-18 9,-4 4,17 -9,5" fill={`url(#${id})`} fillOpacity="0.55" stroke="#c9d9ff" strokeOpacity="0.75" strokeWidth="0.9" />
      )}
      {kind === "gem" && (
        <>
          <polygon points="0,-14 11,-3 0,15 -11,-3" fill={`url(#${id})`} fillOpacity="0.7" stroke="#e7efff" strokeOpacity="0.8" strokeWidth="0.9" />
          <polyline points="-11,-3 11,-3" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="0.8" fill="none" />
        </>
      )}
    </svg>
  );
}

function StarField({ stars, className }: { stars: Star[]; className?: string }) {
  // Three groups twinkle out of step. Each group is its OWN <svg> element: opacity
  // on an <svg> root is a compositor animation, whereas opacity on a <g> inside
  // one repaints the whole sky every frame.
  const groups = [0, 1, 2].map((g) => stars.filter((_, i) => i % 3 === g));
  return (
    <>
      {groups.map((group, g) => (
        <svg
          key={g}
          className={`o35-stars o35-twinkle o35-twinkle-${g} ${className ?? ""}`}
          viewBox="0 0 1000 700"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          {group.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#dbe8ff" fillOpacity={s.o} />)}
        </svg>
      ))}
    </>
  );
}

function OrreryEnvironment({ composed = false }: { composed?: boolean }) {
  const far = useMemo(() => makeStars(7, composed ? 54 : 96, 0.45, 0.95), [composed]);
  const near = useMemo(() => makeStars(31, composed ? 20 : 34, 0.9, 1.7), [composed]);

  return (
    <div className="o35-env" aria-hidden data-testid="academy-core-v35-env">
      <div className="o35-sky" />
      <div className="o35-parallax" data-parallax data-depth="0.12">
        <div className="o35-aurora o35-aurora-violet" />
        <div className="o35-aurora o35-aurora-blue" />
        <div className="o35-aurora o35-aurora-gold" />
      </div>
      <div className="o35-shafts">
        <div className="o35-shaft o35-shaft-1" />
        <div className="o35-shaft o35-shaft-2" />
        <div className="o35-shaft o35-shaft-3" />
      </div>
      <div className="o35-parallax" data-parallax data-depth="0.25"><StarField stars={far} /></div>
      <div className="o35-parallax" data-parallax data-depth="0.5"><StarField stars={near} className="o35-stars-near" /></div>
      <div className="o35-parallax" data-parallax data-depth="0.85">
        {FRAGMENTS.slice(0, composed ? 6 : FRAGMENTS.length).map(([l, t, size, rot, dur, delay, kind], i) => (
          <div
            key={i}
            className="o35-frag"
            style={{
              left: `${l}%`, top: `${t}%`, width: size, height: size,
              ["--rot" as string]: `${rot}deg`, ["--dur" as string]: `${dur}s`, ["--delay" as string]: `${delay}s`,
              opacity: size > 30 ? 0.55 : 0.8,
            }}
          >
            <Fragment kind={kind} />
          </div>
        ))}
      </div>
      <div className="o35-vignette" />
    </div>
  );
}

export default memo(OrreryEnvironment);
