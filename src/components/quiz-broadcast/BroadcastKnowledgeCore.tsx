/**
 * BroadcastKnowledgeCore — Hextech Knowledge Engine broadcast identity object.
 *
 * A living Hextech artifact that grows in power as the broadcast progresses.
 * Replaces the QR/website panel when both showQrCode and showWebsite are OFF.
 *
 * Visual hierarchy (bottom → top):
 *   Outer aura nebula
 *   → Mid aura ring
 *   → Outer gold crest (slow rotation)
 *   → Inner gold ring (counter-rotation)
 *   → Blue crystal — multi-layer gem (V2 art pass)
 *       Outer dark shell
 *       → Side face depth planes (6 trapezoids)
 *       → Outer facet highlights
 *       → Inner crystal shell
 *       → Inner facet highlights
 *       → Micro core hex
 *       → Caustic light beams (3, RAF-rotating)
 *       → Internal energy particles (16, RAF-orbiting)
 *       → Energy core (pulse)
 *       → Edge highlights
 *       → Inner glow highlight
 *       → Burst flash
 *   → Crystal inner brightness overlay
 *   → Bloom flash
 *   → Burst shockwave ring
 *   → Orbital particles (3 rings, RAF-driven)
 *
 * Architecture:
 *   - Single RAF loop mounted once, reads props through refs.
 *   - Zero React re-renders during animation — all updates via direct style/setAttribute.
 *   - CSS drop-shadow on SVG <g> groups (not SVG filter elements) for GPU efficiency.
 *   - Internal crystal particles use SVG <circle> setAttribute (no layout thrash).
 */

import { useEffect, useRef } from "react";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import { lerpCycleVisuals } from "./KnowledgeCoreConfig";

/* ────────────────────────────────────────────────────────────────────────
   Geometry constants — computed once at module load
   ──────────────────────────────────────────────────────────────────────── */

const f = (n: number) => n.toFixed(2);

// SVG viewBox is 0 0 200 200, center at (100, 100).
function makeSpikeD(
  angleDeg: number,
  outerR: number,
  shoulderR: number,
  innerR: number,
  shoulderW: number,
): string {
  const a = (angleDeg * Math.PI) / 180;
  const perp = a + Math.PI / 2;
  const ox = 100 + Math.cos(a) * outerR;
  const oy = 100 + Math.sin(a) * outerR;
  const lx = 100 + Math.cos(a) * shoulderR + Math.cos(perp) * shoulderW;
  const ly = 100 + Math.sin(a) * shoulderR + Math.sin(perp) * shoulderW;
  const ix = 100 + Math.cos(a) * innerR;
  const iy = 100 + Math.sin(a) * innerR;
  const rx = 100 + Math.cos(a) * shoulderR - Math.cos(perp) * shoulderW;
  const ry = 100 + Math.sin(a) * shoulderR - Math.sin(perp) * shoulderW;
  return `M ${f(ox)},${f(oy)} L ${f(lx)},${f(ly)} L ${f(ix)},${f(iy)} L ${f(rx)},${f(ry)} Z`;
}

// 8 main crest spikes at every 45°
const MAIN_SPIKES = [0, 45, 90, 135, 180, 225, 270, 315].map((a) =>
  makeSpikeD(a, 93, 79, 66, 7.5),
);
// 8 small accent spikes at 22.5° offsets (between main spikes)
const ACCENT_SPIKES = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a) =>
  makeSpikeD(a, 82, 76, 70, 3.5),
);
// 6 small inner-ring diamonds
const INNER_DIAMONDS = [0, 60, 120, 180, 240, 300].map((a) =>
  makeSpikeD(a, 64, 61, 57, 2.5),
);
// 16 tick marks around outer ring
const TICK_MARKS = Array.from({ length: 16 }, (_, i) => {
  const a = (i * 22.5 * Math.PI) / 180;
  return {
    x1: f(100 + Math.cos(a) * 72),
    y1: f(100 + Math.sin(a) * 72),
    x2: f(100 + Math.cos(a) * 76),
    y2: f(100 + Math.sin(a) * 76),
  };
});

// Crystal: pointy-top hexagon, center (100,100).
// Outer shell r=45, inner shell r=38, micro core r=26.
// Vertices i=0..5 at angles 90°, 30°, -30°, -90°, -150°, 150° (SVG y-down).
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

// Outer facet triangles: center → outer edge. Lighting from upper-right.
const FACET_PATHS = Array.from({ length: 6 }, (_, i) => {
  const [x1, y1] = HEX_VERTS[i];
  const [x2, y2] = HEX_VERTS[(i + 1) % 6];
  return `M 100,100 L ${f(x1)},${f(y1)} L ${f(x2)},${f(y2)} Z`;
});
const FACET_OPACITIES = [0.30, 0.18, 0.09, 0.05, 0.09, 0.20];

// Inner facet triangles: center → inner hex edge (second depth layer).
const INNER_FACET_PATHS = Array.from({ length: 6 }, (_, i) => {
  const [x1, y1] = INNER_HEX_VERTS[i];
  const [x2, y2] = INNER_HEX_VERTS[(i + 1) % 6];
  return `M 100,100 L ${f(x1)},${f(y1)} L ${f(x2)},${f(y2)} Z`;
});
const INNER_FACET_OPACITIES = [0.38, 0.22, 0.11, 0.05, 0.11, 0.26];

// Side face trapezoids: outer hex edge → inner hex edge.
// Creates the illusion of crystal thickness (depth planes on the rim).
const SIDE_FACES = Array.from({ length: 6 }, (_, i) => {
  const [ox1, oy1] = HEX_VERTS[i];
  const [ox2, oy2] = HEX_VERTS[(i + 1) % 6];
  const [ix1, iy1] = INNER_HEX_VERTS[i];
  const [ix2, iy2] = INNER_HEX_VERTS[(i + 1) % 6];
  return `${f(ox1)},${f(oy1)} ${f(ox2)},${f(oy2)} ${f(ix2)},${f(iy2)} ${f(ix1)},${f(iy1)}`;
});
// Light from upper-right: face 0 (top) is most lit, face 3 (bottom) is darkest.
const SIDE_FACE_COLORS = [
  "rgba(80,168,255,0.38)",  // face 0: top — lit
  "rgba(46,112,218,0.24)",  // face 1: top-right
  "rgba(16,64,168,0.15)",   // face 2: bottom-right
  "rgba(8,36,126,0.10)",    // face 3: bottom — shadow
  "rgba(14,56,150,0.15)",   // face 4: bottom-left
  "rgba(34,96,198,0.23)",   // face 5: top-left
];

/* ────────────────────────────────────────────────────────────────────────
   Internal crystal particle system — 16 particles in 3 orbit rings
   Contained inside the crystal (radii 7, 15, 24 — well within r=45 hex)
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
const INT_PARTICLE_COUNT = INT_PARTICLE_CFG.length; // 16

/* ────────────────────────────────────────────────────────────────────────
   Caustic beam config — 3 ellipses slowly rotating inside the crystal
   ──────────────────────────────────────────────────────────────────────── */

const CAUSTIC_CFG = [
  { rx: 24, ry: 2.4, startAngle: 0,   speed: 11  }, // deg/sec
  { rx: 20, ry: 2.0, startAngle: 120, speed: -8  },
  { rx: 16, ry: 1.7, startAngle: 240, speed: 17  },
] as const;

/* ────────────────────────────────────────────────────────────────────────
   Outer orbital particle system — 3 concentric orbit rings, 16 particles
   ──────────────────────────────────────────────────────────────────────── */

interface ParticleInfo {
  orbitRadius: number;
  startAngle: number;
  baseSpeed: number;
  size: number;
  color: string;
  orbitIndex: number;
}

const ORBIT_RINGS = [
  { r: 36, count: 4,  speed: 0.55, size: 2.5, color: "136,221,255" },
  { r: 52, count: 5,  speed: 0.38, size: 2.0, color: "68,153,255"  },
  { r: 68, count: 7,  speed: 0.28, size: 1.5, color: "34,102,204"  },
] as const;

const PARTICLE_CONFIG: ParticleInfo[] = (() => {
  const out: ParticleInfo[] = [];
  ORBIT_RINGS.forEach((ring, orbitIndex) => {
    for (let j = 0; j < ring.count; j++) {
      out.push({
        orbitRadius: ring.r,
        startAngle: (j / ring.count) * Math.PI * 2 + orbitIndex * 0.9,
        baseSpeed: ring.speed,
        size: ring.size,
        color: ring.color,
        orbitIndex,
      });
    }
  });
  return out;
})();

const MAX_PARTICLES = PARTICLE_CONFIG.length; // 16

/* ────────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────────── */

interface Props {
  phase: BroadcastPhase;
  /** 1-based question index drives cycle progression. */
  questionIndex: number;
  phaseStartedAt: number;
  phaseDurationMs: number;
  /** Compact layout for 9:16 Shorts footer placement. */
  compact?: boolean;
}

export function BroadcastKnowledgeCore({
  phase,
  questionIndex,
  phaseStartedAt,
  phaseDurationMs,
  compact = false,
}: Props) {
  // Props → refs so the single RAF loop always reads latest values
  const phaseRef           = useRef(phase);
  const phaseStartedAtRef  = useRef(phaseStartedAt);
  const phaseDurationMsRef = useRef(phaseDurationMs);
  const questionIndexRef   = useRef(questionIndex);
  phaseRef.current           = phase;
  phaseStartedAtRef.current  = phaseStartedAt;
  phaseDurationMsRef.current = phaseDurationMs;
  questionIndexRef.current   = questionIndex;

  // ── Outer element refs ───────────────────────────────────────────────
  const outerRingRef   = useRef<SVGGElement>(null);
  const innerRingRef   = useRef<SVGGElement>(null);
  const auraRef        = useRef<HTMLDivElement>(null);
  const midAuraRef     = useRef<HTMLDivElement>(null);
  const crystalGlowRef = useRef<HTMLDivElement>(null);
  const bloomRef       = useRef<HTMLDivElement>(null);
  const burstRingRef   = useRef<HTMLDivElement>(null);
  const particleRefs   = useRef<(HTMLDivElement | null)[]>([]);

  // ── Crystal inner element refs (V2 art pass) ─────────────────────────
  const crystalCoreRef  = useRef<SVGCircleElement>(null);
  const crystalBurstRef = useRef<SVGCircleElement>(null);
  const causticRefs     = useRef<(SVGEllipseElement | null)[]>([]);
  const intParticleRefs = useRef<(SVGCircleElement | null)[]>([]);

  // Single RAF — mounted once for the lifetime of the component
  useEffect(() => {
    // Outer particle angles
    const angles = PARTICLE_CONFIG.map((p) => p.startAngle);
    // Internal crystal particle angles
    const intAngles = INT_PARTICLE_CFG.map((p) => p.startAngle);
    // Caustic beam angles (degrees)
    const causticAngles = CAUSTIC_CFG.map((c) => c.startAngle);

    let outerAngle = 0;
    let innerAngle = Math.PI;
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

      // ── Countdown pulse: 0→1 over final 3 s of question phase ───────
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

      // ── Ring rotation ────────────────────────────────────────────────
      const rotDps = v.ringSpeed * 13 * (1 + pulse * 1.6);
      outerAngle = (outerAngle + rotDps * dt) % 360;
      innerAngle = ((innerAngle - rotDps * 0.55 * dt) % 360 + 360) % 360;
      outerRingRef.current?.setAttribute("transform", `rotate(${f(outerAngle)}, 100, 100)`);
      innerRingRef.current?.setAttribute("transform", `rotate(${f(innerAngle)}, 100, 100)`);

      // ── Outer aura ───────────────────────────────────────────────────
      const breathe    = Math.sin(now / 3400) * 0.042;
      const auraScale  = v.auraScale * (1 + breathe + pulse * 0.30);
      const auraOpacity= Math.min(1, 0.28 + v.glowStrength * 0.55 + pulse * 0.14);
      if (auraRef.current) {
        auraRef.current.style.transform = `scale(${f(auraScale)})`;
        auraRef.current.style.opacity   = String(auraOpacity.toFixed(3));
      }

      const midScale   = 1 + breathe * 0.6 + pulse * 0.20;
      const midOpacity = Math.min(1, v.glowStrength * 0.42 + pulse * 0.22);
      if (midAuraRef.current) {
        midAuraRef.current.style.transform = `scale(${f(midScale)})`;
        midAuraRef.current.style.opacity   = String(midOpacity.toFixed(3));
      }

      // ── Crystal inner brightness overlay ────────────────────────────
      const glowBreath        = Math.sin(now / 2600) * 0.06;
      const crystalBrightness = Math.min(0.95, v.crystalBrightness + pulse * 0.55 + glowBreath);
      if (crystalGlowRef.current) {
        crystalGlowRef.current.style.opacity = String(crystalBrightness.toFixed(3));
      }

      // ── Bloom flash ──────────────────────────────────────────────────
      if (bloomRef.current) {
        bloomRef.current.style.opacity = String(
          Math.min(0.90, pulse * v.glowStrength * 0.75).toFixed(3),
        );
      }

      // ── Outer burst shockwave ring ───────────────────────────────────
      if (burstRingRef.current) {
        const be = now - burstStartMs;
        if (burstStartMs > 0 && be < 900) {
          const bp = be / 900;
          burstRingRef.current.style.display   = "block";
          burstRingRef.current.style.transform = `scale(${f(1 + bp * 2.4)})`;
          burstRingRef.current.style.opacity   = String(((1 - bp) * 0.78).toFixed(3));
        } else {
          burstRingRef.current.style.display = "none";
        }
      }

      // ── Outer orbital particles ──────────────────────────────────────
      const activeCount = Math.round(v.particleCount);
      const speedMult   = v.particleSpeed * (1 + pulse * 1.55);

      PARTICLE_CONFIG.forEach((p, i) => {
        const el = particleRefs.current[i];
        if (!el) return;

        if (i >= activeCount) { el.style.opacity = "0"; return; }

        const erratic = v.erraticMotion * Math.sin(now / 750 + i * 1.4) * 0.32;
        angles[i] += (p.baseSpeed * speedMult + erratic) * dt;

        const rDrift    = p.orbitRadius * (1 + v.erraticMotion * Math.sin(now / 2400 + i * 2.1) * 0.11);
        const be        = now - burstStartMs;
        const burstOffset =
          burstStartMs > 0 && be < 650
            ? Math.sin((be / 650) * Math.PI) * 26 * v.glowStrength
            : 0;

        const r = rDrift + burstOffset;
        el.style.transform = `translate(${f(Math.cos(angles[i]) * r)}px, ${f(Math.sin(angles[i]) * r)}px)`;

        const twinkle = 0.55 + Math.sin(now / 850 + i * 2.3) * 0.35;
        el.style.opacity = String(Math.min(1, v.particleBrightness * twinkle).toFixed(3));
      });

      // ── Crystal energy core pulse ────────────────────────────────────
      // Two-frequency breathing makes the core feel like a real energy source.
      const cBreath = Math.sin(now / 2800) * 0.055 + Math.sin(now / 1650) * 0.022;
      const coreEl  = crystalCoreRef.current;
      if (coreEl) {
        const coreR = 12 + cBreath * 3.5 + pulse * 9;
        coreEl.setAttribute("r", f(Math.max(8, coreR)));
        coreEl.style.opacity = String(
          Math.min(1, 0.52 + v.crystalBrightness * 0.38 + pulse * 0.28).toFixed(3),
        );
      }

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

      // ── Internal crystal particles ───────────────────────────────────
      const intSpeedMult = 0.5 + v.crystalBrightness * 0.5 + pulse * 1.6;
      INT_PARTICLE_CFG.forEach((p, i) => {
        const el = intParticleRefs.current[i];
        if (!el) return;

        intAngles[i] += p.speed * intSpeedMult * dt;

        // Countdown: particles spiral inward toward core
        let r = p.baseR;
        if (pulse > 0.04 && phase === "question") {
          r = p.baseR * (1 - pulse * 0.58);
        }

        // Reveal burst: particles explode briefly outward through facets
        const be = now - burstStartMs;
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

      // ── Crystal burst flash (brief white fill at reveal moment) ─────
      const burstEl = crystalBurstRef.current;
      if (burstEl) {
        const be = now - burstStartMs;
        if (burstStartMs > 0 && be < 440) {
          burstEl.style.opacity = String(((1 - be / 440) * 0.58).toFixed(3));
        } else {
          burstEl.style.opacity = "0";
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // mount once — reads all props through refs

  return (
    <div
      className={`relative flex items-center justify-center ${
        compact ? "h-full w-full" : "h-[78%] w-[92%]"
      }`}
    >
      <div className="relative h-full w-full">
        {/* ── Outer aura nebula ──────────────────────────────────────────── */}
        <div
          ref={auraRef}
          aria-hidden
          className="pointer-events-none absolute inset-[-28%] rounded-full will-change-transform"
          style={{
            background:
              "radial-gradient(circle, rgba(28,78,255,0.38) 0%, rgba(55,130,255,0.16) 38%, rgba(18,48,200,0.05) 65%, transparent 75%)",
          }}
        />

        {/* ── Mid aura ring ──────────────────────────────────────────────── */}
        <div
          ref={midAuraRef}
          aria-hidden
          className="pointer-events-none absolute inset-[-8%] rounded-full will-change-transform"
          style={{
            background:
              "radial-gradient(circle, rgba(75,155,255,0.32) 0%, rgba(38,95,255,0.16) 45%, transparent 70%)",
          }}
        />

        {/* ── Main SVG ───────────────────────────────────────────────────── */}
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full"
          style={{ overflow: "visible" }}
          aria-hidden
        >
          <defs>
            {/* Gold gradients — crest/rings (unchanged) */}
            <linearGradient id="kcGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#f5e090" />
              <stop offset="35%"  stopColor="#d4a820" />
              <stop offset="70%"  stopColor="#b8891c" />
              <stop offset="100%" stopColor="#8c6010" />
            </linearGradient>
            <linearGradient id="kcGoldBright" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#fff5b8" />
              <stop offset="50%"  stopColor="#e8c040" />
              <stop offset="100%" stopColor="#c09020" />
            </linearGradient>

            {/* Crystal: outer dark shell — deep rich blue, near-black at rim */}
            <radialGradient id="kcCrystalOuter" cx="40%" cy="35%" r="75%">
              <stop offset="0%"   stopColor="#1c4a82" />
              <stop offset="28%"  stopColor="#0c2a58" />
              <stop offset="62%"  stopColor="#061528" />
              <stop offset="100%" stopColor="#030c18" />
            </radialGradient>

            {/* Crystal: inner shell — brighter blue, visible through outer */}
            <radialGradient id="kcCrystalInner" cx="38%" cy="33%" r="68%">
              <stop offset="0%"   stopColor="#58aaff" />
              <stop offset="26%"  stopColor="#1c60cc" />
              <stop offset="58%"  stopColor="#0d3888" />
              <stop offset="100%" stopColor="#071a52" />
            </radialGradient>

            {/* Crystal: micro core hex — bright cyan-blue, deepest layer */}
            <radialGradient id="kcCrystalMicro" cx="42%" cy="37%" r="65%">
              <stop offset="0%"   stopColor="#9ed8ff" />
              <stop offset="22%"  stopColor="#4294ec" />
              <stop offset="56%"  stopColor="#1a4eb8" />
              <stop offset="100%" stopColor="#0a2666" />
            </radialGradient>

            {/* Crystal: energy core — near white-hot at center */}
            <radialGradient id="kcCoreGlow" cx="50%" cy="48%" r="55%">
              <stop offset="0%"   stopColor="#ffffff" />
              <stop offset="16%"  stopColor="#ddf0ff" />
              <stop offset="42%"  stopColor="#7ebeff" />
              <stop offset="72%"  stopColor="#2858dd" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#0d2888" stopOpacity="0"    />
            </radialGradient>

            {/* Crystal: specular highlight — offset to simulate gem refraction */}
            <radialGradient id="kcCrystalGlow" cx="40%" cy="35%" r="65%">
              <stop offset="0%"   stopColor="#ffffff"  stopOpacity="0.90" />
              <stop offset="22%"  stopColor="#aaddff"  stopOpacity="0.52" />
              <stop offset="58%"  stopColor="#4488ff"  stopOpacity="0.16" />
              <stop offset="100%" stopColor="#2255cc"  stopOpacity="0"    />
            </radialGradient>

            {/* Caustic beam — center-bright linear, fades to transparent at ends */}
            <linearGradient id="kcCaustic" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%"   stopColor="#88deff" stopOpacity="0"   />
              <stop offset="38%"  stopColor="#b8eeff" stopOpacity="1"   />
              <stop offset="62%"  stopColor="#b8eeff" stopOpacity="1"   />
              <stop offset="100%" stopColor="#88deff" stopOpacity="0"   />
            </linearGradient>
          </defs>

          {/* Dark backing circle */}
          <circle cx="100" cy="100" r="90" fill="#030610" opacity="0.88" />

          {/* Subtle inner background ring — gives depth behind crystal */}
          <circle
            cx="100" cy="100" r="88"
            fill="none"
            stroke="rgba(40,80,200,0.12)"
            strokeWidth="12"
          />

          {/* ── Outer crest (slow clockwise rotation) ─────────────────── */}
          <g
            ref={outerRingRef}
            style={{ filter: "drop-shadow(0 0 3.5px rgba(220,168,28,0.72))" }}
          >
            <circle
              cx="100" cy="100" r="76"
              fill="none"
              stroke="url(#kcGold)"
              strokeWidth="1.2"
              opacity="0.68"
            />
            {MAIN_SPIKES.map((d, i) => (
              <path key={i} d={d} fill="url(#kcGold)" />
            ))}
            {ACCENT_SPIKES.map((d, i) => (
              <path key={i} d={d} fill="url(#kcGoldBright)" opacity="0.72" />
            ))}
            {TICK_MARKS.map((t, i) => (
              <line
                key={i}
                x1={t.x1} y1={t.y1}
                x2={t.x2} y2={t.y2}
                stroke="url(#kcGoldBright)"
                strokeWidth="0.8"
                opacity="0.50"
              />
            ))}
          </g>

          {/* ── Inner ring (counter-clockwise rotation) ───────────────── */}
          <g
            ref={innerRingRef}
            style={{ filter: "drop-shadow(0 0 2px rgba(220,168,28,0.55))" }}
          >
            <circle
              cx="100" cy="100" r="61"
              fill="none"
              stroke="url(#kcGold)"
              strokeWidth="1.1"
              opacity="0.55"
            />
            <circle
              cx="100" cy="100" r="57"
              fill="none"
              stroke="url(#kcGoldBright)"
              strokeWidth="0.5"
              opacity="0.32"
            />
            {INNER_DIAMONDS.map((d, i) => (
              <path key={i} d={d} fill="url(#kcGoldBright)" opacity="0.62" />
            ))}
          </g>

          {/* Crystal frame ring */}
          <circle
            cx="100" cy="100" r="51"
            fill="none"
            stroke="url(#kcGold)"
            strokeWidth="0.8"
            opacity="0.40"
          />

          {/* ── Blue crystal — multi-layer gem (V2 art pass) ──────────── */}
          <g style={{ filter: "drop-shadow(0 0 10px rgba(40,130,255,0.86))" }}>

            {/* Layer 1: Outer dark shell — rich deep blue base */}
            <polygon points={HEX_POINTS} fill="url(#kcCrystalOuter)" />

            {/* Layer 2: Side face depth planes — 6 trapezoids create crystal thickness */}
            {SIDE_FACES.map((pts, i) => (
              <polygon key={i} points={pts} fill={SIDE_FACE_COLORS[i]} />
            ))}

            {/* Layer 3: Outer facet highlights — surface light from upper-right */}
            {FACET_PATHS.map((d, i) => (
              <path key={i} d={d} fill="#88ddff" opacity={FACET_OPACITIES[i]} />
            ))}

            {/* Layer 4: Inner crystal shell — brighter second depth plane */}
            <polygon points={INNER_HEX_POINTS} fill="url(#kcCrystalInner)" />

            {/* Layer 5: Inner facet highlights — light trapped and bouncing inside */}
            {INNER_FACET_PATHS.map((d, i) => (
              <path key={i} d={d} fill="#aaeeff" opacity={INNER_FACET_OPACITIES[i]} />
            ))}

            {/* Layer 6: Micro core hex — tertiary depth, bright cyan-blue */}
            <polygon points={MICRO_HEX_POINTS} fill="url(#kcCrystalMicro)" />

            {/* Layer 7: Caustic light beams — RAF-driven very slow rotation */}
            {CAUSTIC_CFG.map((c, i) => (
              <ellipse
                key={i}
                ref={(el: SVGEllipseElement | null) => { causticRefs.current[i] = el; }}
                cx="100" cy="100"
                rx={c.rx} ry={c.ry}
                fill="url(#kcCaustic)"
                opacity="0"
              />
            ))}

            {/* Layer 8: Internal energy particles — drifting inside crystal volume */}
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

            {/* Layer 9: Energy core — white-hot pulsing center point */}
            <circle
              ref={crystalCoreRef}
              cx="100" cy="100"
              r="12"
              fill="url(#kcCoreGlow)"
              opacity="0.60"
            />

            {/* Layer 10: Edge highlights — sharp cyan catches on top-facing edges */}
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

            {/* Layer 11: Outer hex rim — clean edge definition */}
            <polygon
              points={HEX_POINTS}
              fill="none"
              stroke="#4488ff"
              strokeWidth="0.9"
              opacity="0.62"
            />

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

            {/* Layer 14: Specular highlight — upper-right offset, gem refraction */}
            <ellipse
              cx="106" cy="87"
              rx="21" ry="17"
              fill="url(#kcCrystalGlow)"
            />

            {/* Layer 15: Crystal burst flash — brief white fill at reveal moment */}
            <circle
              ref={crystalBurstRef}
              cx="100" cy="100"
              r="45"
              fill="white"
              opacity="0"
            />
          </g>
        </svg>

        {/* ── Crystal animated brightness overlay ────────────────────────── */}
        {/* Two radial gradients layered: primary specular top-left, counter-catch bottom-right */}
        <div
          ref={crystalGlowRef}
          aria-hidden
          className="pointer-events-none absolute inset-[26%] rounded-full will-change-[opacity]"
          style={{
            background: [
              "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.65) 0%, rgba(200,238,255,0.38) 20%, transparent 52%)",
              "radial-gradient(circle at 64% 68%, rgba(38,96,255,0.16) 0%, transparent 44%)",
            ].join(", "),
            opacity: 0.32,
          }}
        />

        {/* ── Bloom flash (countdown pulse + reveal) ─────────────────────── */}
        <div
          ref={bloomRef}
          aria-hidden
          className="pointer-events-none absolute inset-[-4%] rounded-full will-change-[opacity]"
          style={{
            background:
              "radial-gradient(circle, rgba(180,225,255,0.62) 0%, rgba(100,175,255,0.28) 36%, rgba(38,95,255,0.07) 58%, transparent 70%)",
            opacity: 0,
          }}
        />

        {/* ── Burst shockwave ring ────────────────────────────────────────── */}
        <div
          ref={burstRingRef}
          aria-hidden
          className="pointer-events-none absolute inset-[6%] rounded-full will-change-transform"
          style={{
            display: "none",
            border: "1.5px solid rgba(100,200,255,0.82)",
            boxShadow: "0 0 14px rgba(100,200,255,0.50), inset 0 0 8px rgba(100,200,255,0.28)",
          }}
        />

        {/* ── Outer particle system ───────────────────────────────────────── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ overflow: "visible" }}
        >
          <div className="absolute left-1/2 top-1/2">
            {PARTICLE_CONFIG.map((p, i) => (
              <div
                key={i}
                ref={(el) => { particleRefs.current[i] = el; }}
                aria-hidden
                className="absolute will-change-transform"
                style={{
                  width: p.size,
                  height: p.size,
                  borderRadius: "50%",
                  background: `rgba(${p.color}, 0.92)`,
                  boxShadow: `0 0 ${(p.size * 2.8).toFixed(1)}px rgba(${p.color}, 0.72)`,
                  marginLeft: -p.size / 2,
                  marginTop:  -p.size / 2,
                  opacity: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Subtle Mogsy wordmark ──────────────────────────────────────── */}
        {!compact && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex items-center justify-center">
            <span
              className="select-none text-[0.62vmin] font-black uppercase tracking-[0.60em] text-[#6ab0e8]"
              style={{ opacity: 0.18 }}
            >
              mogsy
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
