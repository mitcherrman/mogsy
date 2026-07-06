/**
 * SvgCrystalCore — the 2D SVG Hextech crystal, extracted from
 * BroadcastKnowledgeCore so it can serve as the permanent fallback for the
 * 3D core (HextechCore3D): Suspense loading state, WebGL-unavailable
 * environments, webglcontextlost recovery, and error-boundary recovery.
 *
 * Self-contained: renders its own absolutely-positioned 200×200 SVG that
 * aligns with the parent Knowledge Core coordinate space, and runs its own
 * RAF loop for all crystal-internal animation (energy core pulse/flicker,
 * swirl arcs, caustic beams, internal particles, burst flash, glow overlay).
 *
 * Layer stack (bottom → top):
 *   Outer dark shell
 *   → Side face depth planes (6 trapezoids)
 *   → Outer facets (alternating light/dark cuts)
 *   → Rim vignette
 *   → Inner crystal shell
 *   → Inner facets
 *   → Micro core hex
 *   → Energy swirl arcs (2, counter-rotating)
 *   → Caustic light beams (3)
 *   → Internal energy particles (16: 9 orbiters + 7 rising motes)
 *   → Energy core (white-hot, flickering)
 *   → Edge highlights + beveled hex rim
 *   → Specular catch
 *   → Burst flash
 *   → Animated brightness overlay (HTML div)
 */

import { useEffect, useRef } from "react";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import { lerpCycleVisuals } from "./KnowledgeCoreConfig";

const f = (n: number) => n.toFixed(2);

/* ────────────────────────────────────────────────────────────────────────
   Crystal geometry — pointy-top hexagon, center (100,100)
   Outer shell r=45, inner shell r=38, micro core r=26.
   ──────────────────────────────────────────────────────────────────────── */

function hexVerts(r: number): [number, number][] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((90 - i * 60) * Math.PI) / 180;
    return [100 + Math.cos(a) * r, 100 - Math.sin(a) * r] as [number, number];
  });
}
const HEX_VERTS       = hexVerts(45);
const INNER_HEX_VERTS = hexVerts(38);
const MICRO_HEX_VERTS = hexVerts(26);

const toPoints = (verts: [number, number][]) =>
  verts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

const HEX_POINTS       = toPoints(HEX_VERTS);
const INNER_HEX_POINTS = toPoints(INNER_HEX_VERTS);
const MICRO_HEX_POINTS = toPoints(MICRO_HEX_VERTS);

// Outer facet triangles: center → outer edge.
const FACET_PATHS = Array.from({ length: 6 }, (_, i) => {
  const [x1, y1] = HEX_VERTS[i];
  const [x2, y2] = HEX_VERTS[(i + 1) % 6];
  return `M 100,100 L ${f(x1)},${f(y1)} L ${f(x2)},${f(y2)} Z`;
});
// Alternating strong light/dark facets — the gem reads through hard value
// contrast between adjacent cuts, not through a uniform glow.
const FACET_FILLS = [
  "rgba(150,222,255,0.42)", // top — hit by light
  "rgba(10,28,80,0.55)",    // upper-right — shadow cut
  "rgba(90,170,255,0.20)",  // lower-right — bounce light
  "rgba(4,14,48,0.62)",     // bottom — deepest shadow
  "rgba(60,130,235,0.16)",  // lower-left
  "rgba(120,195,255,0.30)", // upper-left — secondary light
];

// Inner facet triangles: center → inner hex edge (second depth layer).
const INNER_FACET_PATHS = Array.from({ length: 6 }, (_, i) => {
  const [x1, y1] = INNER_HEX_VERTS[i];
  const [x2, y2] = INNER_HEX_VERTS[(i + 1) % 6];
  return `M 100,100 L ${f(x1)},${f(y1)} L ${f(x2)},${f(y2)} Z`;
});
const INNER_FACET_FILLS = [
  "rgba(180,235,255,0.40)",
  "rgba(12,36,100,0.42)",
  "rgba(110,190,255,0.20)",
  "rgba(6,20,64,0.48)",
  "rgba(80,150,245,0.16)",
  "rgba(150,215,255,0.28)",
];

// Bevel edge segments on the outer hex rim: top edges catch light, bottom
// edges fall into shadow — sells the hard gem cut.
const BEVEL_EDGES = Array.from({ length: 6 }, (_, i) => {
  const [x1, y1] = HEX_VERTS[i];
  const [x2, y2] = HEX_VERTS[(i + 1) % 6];
  return { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2) };
});
const BEVEL_STROKES = [
  "rgba(190,240,255,0.85)", // top edge — brightest
  "rgba(120,200,255,0.45)", // upper-right
  "rgba(30,70,160,0.55)",   // lower-right — shadow
  "rgba(8,20,60,0.80)",     // bottom — darkest
  "rgba(24,60,150,0.55)",   // lower-left
  "rgba(150,215,255,0.60)", // upper-left
];

// Side face trapezoids: outer hex edge → inner hex edge (crystal thickness).
const SIDE_FACES = Array.from({ length: 6 }, (_, i) => {
  const [ox1, oy1] = HEX_VERTS[i];
  const [ox2, oy2] = HEX_VERTS[(i + 1) % 6];
  const [ix1, iy1] = INNER_HEX_VERTS[i];
  const [ix2, iy2] = INNER_HEX_VERTS[(i + 1) % 6];
  return `${f(ox1)},${f(oy1)} ${f(ox2)},${f(oy2)} ${f(ix2)},${f(iy2)} ${f(ix1)},${f(iy1)}`;
});
// Light from upper-right: face 0 (top) is most lit, face 3 (bottom) darkest.
const SIDE_FACE_COLORS = [
  "rgba(80,168,255,0.38)",
  "rgba(46,112,218,0.24)",
  "rgba(16,64,168,0.15)",
  "rgba(8,36,126,0.10)",
  "rgba(14,56,150,0.15)",
  "rgba(34,96,198,0.23)",
];

/* ────────────────────────────────────────────────────────────────────────
   Internal particle system — 16 particles: rings 1–2 orbit, ring 3 rises
   ──────────────────────────────────────────────────────────────────────── */

interface IntParticle {
  baseR: number;
  startAngle: number;
  speed: number; // rad/sec
  size: number;  // SVG r attribute
}

const INT_RING_CFG = [
  { r: 7,  count: 4, speed: 0.24, size: 1.0  },
  { r: 15, count: 5, speed: 0.16, size: 0.85 },
  { r: 24, count: 7, speed: 0.10, size: 0.70 },
] as const;

const INT_PARTICLE_CFG: IntParticle[] = (() => {
  const out: IntParticle[] = [];
  INT_RING_CFG.forEach((ring, ri) => {
    for (let j = 0; j < ring.count; j++) {
      out.push({
        baseR: ring.r,
        startAngle: (j / ring.count) * Math.PI * 2 + ri * 0.85,
        speed: ring.speed,
        size: ring.size,
      });
    }
  });
  return out;
})();

/* ────────────────────────────────────────────────────────────────────────
   Caustic beam config — 3 ellipses slowly rotating inside the crystal
   ──────────────────────────────────────────────────────────────────────── */

const CAUSTIC_CFG = [
  { rx: 24, ry: 2.4, startAngle: 0,   speed: 11  }, // deg/sec
  { rx: 20, ry: 2.0, startAngle: 120, speed: -8  },
  { rx: 16, ry: 1.7, startAngle: 240, speed: 17  },
] as const;

/* ────────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────────── */

export interface SvgCrystalCoreProps {
  phase: BroadcastPhase;
  /** 1-based question index drives cycle progression. */
  questionIndex: number;
  phaseStartedAt: number;
  phaseDurationMs: number;
}

export function SvgCrystalCore({
  phase,
  questionIndex,
  phaseStartedAt,
  phaseDurationMs,
}: SvgCrystalCoreProps) {
  // Props → refs so the single RAF loop always reads latest values
  const phaseRef           = useRef(phase);
  const phaseStartedAtRef  = useRef(phaseStartedAt);
  const phaseDurationMsRef = useRef(phaseDurationMs);
  const questionIndexRef   = useRef(questionIndex);
  phaseRef.current           = phase;
  phaseStartedAtRef.current  = phaseStartedAt;
  phaseDurationMsRef.current = phaseDurationMs;
  questionIndexRef.current   = questionIndex;

  const crystalCoreRef  = useRef<SVGCircleElement>(null);
  const crystalBurstRef = useRef<SVGCircleElement>(null);
  const crystalGlowRef  = useRef<HTMLDivElement>(null);
  const causticRefs     = useRef<(SVGEllipseElement | null)[]>([]);
  const swirlRefs       = useRef<(SVGPathElement | null)[]>([]);
  const intParticleRefs = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    const intAngles     = INT_PARTICLE_CFG.map((p) => p.startAngle);
    const causticAngles = CAUSTIC_CFG.map((c) => c.startAngle);
    const swirlAngles   = [0, 180];

    let prevPhase = phaseRef.current;
    let burstStartMs = 0;
    let lastNow = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;

      const phase          = phaseRef.current;
      const phaseStartedAt = phaseStartedAtRef.current;
      const phaseDurationMs= phaseDurationMsRef.current;
      const v              = lerpCycleVisuals(questionIndexRef.current);

      // Detect reveal → trigger burst
      if (phase === "reveal" && prevPhase !== "reveal") burstStartMs = now;
      prevPhase = phase;

      // Countdown pulse: 0→1 over final 3 s of question phase
      let pulse = 0;
      if (phase === "question" && phaseDurationMs > 0) {
        const remaining = Math.max(0, phaseDurationMs - (Date.now() - phaseStartedAt));
        if (remaining < 3000) pulse = 1 - remaining / 3000;
      } else if (phase === "reveal") {
        const elapsed = now - burstStartMs;
        pulse = elapsed < 350 ? 1.0 : Math.max(0, 1 - (elapsed - 350) / 1400);
      } else if (phase === "explanation" || phase === "transition") {
        const elapsed = Date.now() - phaseStartedAt;
        pulse = Math.max(0, 0.38 - elapsed / 5000);
      }

      // ── Energy core pulse ────────────────────────────────────────────
      // Slow breathing + fast low-amplitude flicker = unstable magical
      // energy, not a lamp on a dimmer. Flicker amplitude grows with charge.
      const cBreath  = Math.sin(now / 2800) * 0.055 + Math.sin(now / 1650) * 0.022;
      const cFlicker =
        (Math.sin(now / 87) * 0.5 + Math.sin(now / 133) * 0.5) *
        (0.015 + pulse * 0.05 + v.crystalBrightness * 0.02);
      const coreEl = crystalCoreRef.current;
      if (coreEl) {
        const coreR = 10 + cBreath * 3.5 + pulse * 10;
        coreEl.setAttribute("r", f(Math.max(7, coreR)));
        coreEl.style.opacity = String(
          Math.min(1, 0.58 + v.crystalBrightness * 0.34 + pulse * 0.26 + cFlicker).toFixed(3),
        );
      }

      // ── Energy swirl arcs — magic circulating around the core ───────
      swirlAngles[0] = (swirlAngles[0] + (55 + pulse * 160) * dt) % 360;
      swirlAngles[1] = (swirlAngles[1] - (38 + pulse * 120) * dt + 360) % 360;
      swirlRefs.current.forEach((el, i) => {
        if (!el) return;
        el.setAttribute("transform", `rotate(${f(swirlAngles[i])}, 100, 100)`);
        const sOp =
          (0.10 + v.crystalBrightness * 0.28 + pulse * 0.45) *
          (0.65 + Math.sin(now / 1400 + i * 2.4) * 0.35);
        el.style.opacity = String(Math.min(0.85, sOp).toFixed(3));
      });

      // ── Caustic light beams ──────────────────────────────────────────
      CAUSTIC_CFG.forEach((c, i) => {
        causticAngles[i] =
          (causticAngles[i] + c.speed * (1 + pulse * 1.6) * dt + 360) % 360;
        const el = causticRefs.current[i];
        if (!el) return;
        el.setAttribute("transform", `rotate(${f(causticAngles[i])}, 100, 100)`);
        const cOp =
          (0.05 + v.crystalBrightness * 0.11 + pulse * 0.09) *
          (0.55 + Math.sin(now / 2100 + i * 1.5) * 0.40);
        el.style.opacity = String(Math.min(0.24, cOp).toFixed(3));
      });

      // ── Internal particles ───────────────────────────────────────────
      // Rings 1–2 orbit the core; ring 3 (i ≥ 9) rises as magic motes —
      // sparks drifting up through the gem like energy boiling off the core.
      const intSpeedMult = 0.5 + v.crystalBrightness * 0.5 + pulse * 1.6;
      INT_PARTICLE_CFG.forEach((p, i) => {
        const el = intParticleRefs.current[i];
        if (!el) return;

        const be = now - burstStartMs;
        const isRiser = i >= 9;

        if (isRiser) {
          // Rising mote: loop bottom→top; fade in at bottom, out near top.
          const riseSpeed = 5.5 + v.crystalBrightness * 5 + pulse * 14; // units/sec
          const period = 52 / riseSpeed; // travel distance 52 units
          const tCycle = ((now / 1000 + i * 1.37) % period) / period; // 0→1
          const py = 126 - tCycle * 52; // 126 (below core) → 74 (upper gem)
          const sway = Math.sin(now / 900 + i * 2.2) * (3.5 + pulse * 3);
          const px = 100 + Math.cos(p.startAngle) * p.baseR * 0.45 + sway;
          el.setAttribute("cx", f(px));
          el.setAttribute("cy", f(py));
          const fade = Math.sin(tCycle * Math.PI); // in/out at ends
          const op = fade * (0.14 + v.crystalBrightness * 0.55 + pulse * 0.35);
          el.style.opacity = String(Math.min(0.9, op).toFixed(3));
          return;
        }

        intAngles[i] += p.speed * intSpeedMult * dt;

        // Countdown: particles spiral inward toward core
        let r = p.baseR;
        if (pulse > 0.04 && phase === "question") {
          r = p.baseR * (1 - pulse * 0.58);
        }

        // Reveal burst: particles explode briefly outward through facets
        if (burstStartMs > 0 && be < 600) {
          const bp = be / 600;
          r = p.baseR * (1 + Math.sin(bp * Math.PI) * 1.9);
        }

        const px = 100 + Math.cos(intAngles[i]) * r;
        const py = 100 + Math.sin(intAngles[i]) * r;
        el.setAttribute("cx", f(px));
        el.setAttribute("cy", f(py));

        const twinkle = 0.48 + Math.sin(now / 680 + i * 1.9) * 0.42;
        const op = (0.18 + v.crystalBrightness * 0.52 + pulse * 0.30) * twinkle;
        el.style.opacity = String(Math.min(0.92, op).toFixed(3));
      });

      // ── Burst flash (brief white fill at reveal moment) ──────────────
      const burstEl = crystalBurstRef.current;
      if (burstEl) {
        const be = now - burstStartMs;
        if (burstStartMs > 0 && be < 440) {
          burstEl.style.opacity = String(((1 - be / 440) * 0.58).toFixed(3));
        } else {
          burstEl.style.opacity = "0";
        }
      }

      // ── Animated brightness overlay ──────────────────────────────────
      const glowBreath        = Math.sin(now / 2600) * 0.06;
      const crystalBrightness = Math.min(0.95, v.crystalBrightness + pulse * 0.55 + glowBreath);
      if (crystalGlowRef.current) {
        crystalGlowRef.current.style.opacity = String(crystalBrightness.toFixed(3));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // mount once — reads all props through refs

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Outer dark shell — near-black sapphire, saturated rim */}
          <radialGradient id="sccOuter" cx="42%" cy="36%" r="78%">
            <stop offset="0%"   stopColor="#123a78" />
            <stop offset="30%"  stopColor="#081f4c" />
            <stop offset="65%"  stopColor="#040e26" />
            <stop offset="100%" stopColor="#010510" />
          </radialGradient>

          {/* Inner shell — saturated royal blue, visible through outer */}
          <radialGradient id="sccInner" cx="40%" cy="34%" r="70%">
            <stop offset="0%"   stopColor="#3e92f2" />
            <stop offset="30%"  stopColor="#1250c0" />
            <stop offset="62%"  stopColor="#092a78" />
            <stop offset="100%" stopColor="#04123e" />
          </radialGradient>

          {/* Micro core hex — electric cyan-blue, deepest layer */}
          <radialGradient id="sccMicro" cx="46%" cy="42%" r="62%">
            <stop offset="0%"   stopColor="#c2ecff" />
            <stop offset="24%"  stopColor="#4aa2f8" />
            <stop offset="58%"  stopColor="#1244ac" />
            <stop offset="100%" stopColor="#061a52" />
          </radialGradient>

          {/* Energy core — tight white-hot point, fast falloff */}
          <radialGradient id="sccCoreGlow" cx="50%" cy="48%" r="55%">
            <stop offset="0%"   stopColor="#ffffff" />
            <stop offset="12%"  stopColor="#eaf7ff" />
            <stop offset="30%"  stopColor="#8ecbff" />
            <stop offset="58%"  stopColor="#2a62e8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0d2888" stopOpacity="0"    />
          </radialGradient>

          {/* Specular highlight — offset to simulate gem refraction */}
          <radialGradient id="sccSpecular" cx="40%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#ffffff"  stopOpacity="0.90" />
            <stop offset="22%"  stopColor="#aaddff"  stopOpacity="0.52" />
            <stop offset="58%"  stopColor="#4488ff"  stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2255cc"  stopOpacity="0"    />
          </radialGradient>

          {/* Caustic beam — center-bright linear, transparent at ends */}
          <linearGradient id="sccCaustic" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%"   stopColor="#88deff" stopOpacity="0"   />
            <stop offset="38%"  stopColor="#b8eeff" stopOpacity="1"   />
            <stop offset="62%"  stopColor="#b8eeff" stopOpacity="1"   />
            <stop offset="100%" stopColor="#88deff" stopOpacity="0"   />
          </linearGradient>

          {/* Energy swirl arc — cyan wisp, transparent at both tips */}
          <linearGradient id="sccSwirl" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#6fd4ff" stopOpacity="0"   />
            <stop offset="45%"  stopColor="#a4e6ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#4aa2f8" stopOpacity="0"   />
          </linearGradient>
        </defs>

        <g style={{ filter: "drop-shadow(0 0 10px rgba(40,130,255,0.86))" }}>
          {/* Layer 1: Outer dark shell — rich deep blue base */}
          <polygon points={HEX_POINTS} fill="url(#sccOuter)" />

          {/* Layer 2: Side face depth planes — crystal thickness */}
          {SIDE_FACES.map((pts, i) => (
            <polygon key={i} points={pts} fill={SIDE_FACE_COLORS[i]} />
          ))}

          {/* Layer 3: Outer facets — hard alternating light/dark gem cuts */}
          {FACET_PATHS.map((d, i) => (
            <path key={i} d={d} fill={FACET_FILLS[i]} />
          ))}

          {/* Layer 3b: Rim vignette — gem sits recessed in its gold setting */}
          <polygon
            points={HEX_POINTS}
            fill="none"
            stroke="rgba(2,8,24,0.72)"
            strokeWidth="4.5"
          />

          {/* Layer 4: Inner crystal shell — brighter second depth plane */}
          <polygon points={INNER_HEX_POINTS} fill="url(#sccInner)" />

          {/* Layer 5: Inner facets — same alternating cut pattern */}
          {INNER_FACET_PATHS.map((d, i) => (
            <path key={i} d={d} fill={INNER_FACET_FILLS[i]} />
          ))}

          {/* Layer 6: Micro core hex — tertiary depth, bright cyan-blue */}
          <polygon points={MICRO_HEX_POINTS} fill="url(#sccMicro)" />

          {/* Layer 6b: Energy swirl arcs — magic circulating around the core */}
          {[0, 1].map((i) => (
            <path
              key={i}
              ref={(el: SVGPathElement | null) => { swirlRefs.current[i] = el; }}
              d="M 100,78 A 22,22 0 0 1 122,100"
              fill="none"
              stroke="url(#sccSwirl)"
              strokeWidth={i === 0 ? 2.2 : 1.4}
              strokeLinecap="round"
              opacity="0"
            />
          ))}

          {/* Layer 7: Caustic light beams */}
          {CAUSTIC_CFG.map((c, i) => (
            <ellipse
              key={i}
              ref={(el: SVGEllipseElement | null) => { causticRefs.current[i] = el; }}
              cx="100" cy="100"
              rx={c.rx} ry={c.ry}
              fill="url(#sccCaustic)"
              opacity="0"
            />
          ))}

          {/* Layer 8: Internal energy particles */}
          {INT_PARTICLE_CFG.map((p, i) => (
            <circle
              key={i}
              ref={(el: SVGCircleElement | null) => { intParticleRefs.current[i] = el; }}
              cx="100" cy="100"
              r={p.size}
              fill="#a8e8ff"
              opacity="0"
            />
          ))}

          {/* Layer 9: Energy core — white-hot flickering center */}
          <circle
            ref={crystalCoreRef}
            cx="100" cy="100"
            r="10"
            fill="url(#sccCoreGlow)"
            opacity="0.60"
          />

          {/* Layer 10: Edge highlights — sharp cyan catches on top edges */}
          <line
            x1="100.00" y1="55.00" x2="138.97" y2="77.50"
            stroke="#88eeff" strokeWidth="1.3" strokeLinecap="round" opacity="0.55"
          />
          <line
            x1="61.03" y1="77.50" x2="100.00" y2="55.00"
            stroke="#66ccff" strokeWidth="0.9" strokeLinecap="round" opacity="0.36"
          />
          <line
            x1="100.00" y1="62.00" x2="132.91" y2="81.00"
            stroke="#44aaff" strokeWidth="0.6" strokeLinecap="round" opacity="0.28"
          />

          {/* Layer 11: Beveled hex rim — per-edge lit/shadow strokes */}
          {BEVEL_EDGES.map((e, i) => (
            <line
              key={i}
              x1={e.x1} y1={e.y1}
              x2={e.x2} y2={e.y2}
              stroke={BEVEL_STROKES[i]}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          ))}

          {/* Layer 12: Inner hex rim */}
          <polygon
            points={INNER_HEX_POINTS}
            fill="none"
            stroke="rgba(100,180,255,0.38)"
            strokeWidth="0.5"
          />

          {/* Layer 13: Outer facet edge lines — subtle geometry definition */}
          {FACET_PATHS.map((d, i) => (
            <path
              key={i} d={d}
              fill="none"
              stroke="rgba(120,200,255,0.16)"
              strokeWidth="0.4"
            />
          ))}

          {/* Layer 14: Specular highlight — small hard glass ping */}
          <ellipse
            cx="108" cy="84"
            rx="13" ry="10"
            fill="url(#sccSpecular)"
            opacity="0.75"
          />

          {/* Layer 15: Burst flash — brief white fill at reveal moment */}
          <circle
            ref={crystalBurstRef}
            cx="100" cy="100"
            r="45"
            fill="white"
            opacity="0"
          />
        </g>
      </svg>

      {/* Animated brightness overlay */}
      <div
        ref={crystalGlowRef}
        className="pointer-events-none absolute inset-[26%] rounded-full will-change-[opacity]"
        style={{
          background: [
            "radial-gradient(circle at 50% 48%, rgba(230,246,255,0.55) 0%, rgba(140,205,255,0.26) 18%, transparent 42%)",
            "radial-gradient(circle at 64% 68%, rgba(38,96,255,0.12) 0%, transparent 40%)",
          ].join(", "),
          opacity: 0.30,
        }}
      />
    </div>
  );
}
