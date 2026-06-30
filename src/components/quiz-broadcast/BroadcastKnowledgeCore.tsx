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
 *   → Blue crystal (faceted gem)
 *   → Crystal inner glow (animated brightness)
 *   → Bloom flash (countdown / reveal pulse)
 *   → Burst shockwave ring (reveal moment only)
 *   → Orbital particles (3 rings, RAF-driven)
 *
 * Architecture:
 *   - Single RAF loop mounted once, reads props through refs.
 *   - Zero React re-renders during animation — all updates via direct style/setAttribute.
 *   - CSS drop-shadow on SVG <g> groups (not SVG filter elements) for GPU efficiency.
 *   - Particle positions written directly to DOM transform.
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

// Crystal: pointy-top hexagon (r=45), vertices at 90°, 30°, -30°, -90°, -150°, 150°
const HEX_VERTS = Array.from({ length: 6 }, (_, i) => {
  const a = ((90 - i * 60) * Math.PI) / 180;
  // SVG y increases downward, so flip sin
  return [100 + Math.cos(a) * 45, 100 - Math.sin(a) * 45] as [number, number];
});
const HEX_POINTS = HEX_VERTS.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
// 6 facet triangles from center to each edge
const FACET_PATHS = Array.from({ length: 6 }, (_, i) => {
  const v1 = HEX_VERTS[i];
  const v2 = HEX_VERTS[(i + 1) % 6];
  return `M 100,100 L ${f(v1[0])},${f(v1[1])} L ${f(v2[0])},${f(v2[1])} Z`;
});
// Facet highlight intensities — top-right facets catch the magical light source
const FACET_OPACITIES = [0.28, 0.18, 0.09, 0.05, 0.09, 0.20];

/* ────────────────────────────────────────────────────────────────────────
   Particle configuration — 3 concentric orbit rings, 16 particles total
   ──────────────────────────────────────────────────────────────────────── */

interface ParticleInfo {
  orbitRadius: number;
  startAngle: number;
  baseSpeed: number; // rad/sec
  size: number;      // px
  color: string;     // RGB tuple string for rgba()
  orbitIndex: number;
}

const ORBIT_RINGS = [
  { r: 36, count: 4,  speed: 0.55, size: 2.5, color: "136,221,255" },
  { r: 52, count: 5,  speed: 0.38, size: 2.0, color: "68,153,255"  },
  { r: 68, count: 7,  speed: 0.28, size: 1.5, color: "34,102,204"  },
] as const;

const PARTICLE_CONFIG: ParticleInfo[] = (() => {
  const out: ParticleInfo[] = [];
  let globalIdx = 0;
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
      globalIdx++;
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

  // DOM refs — all animation writes go here, never through React state
  const outerRingRef   = useRef<SVGGElement>(null);
  const innerRingRef   = useRef<SVGGElement>(null);
  const auraRef        = useRef<HTMLDivElement>(null);
  const midAuraRef     = useRef<HTMLDivElement>(null);
  const crystalGlowRef = useRef<HTMLDivElement>(null);
  const bloomRef       = useRef<HTMLDivElement>(null);
  const burstRingRef   = useRef<HTMLDivElement>(null);
  const particleRefs   = useRef<(HTMLDivElement | null)[]>([]);

  // Single RAF — mounted once for the lifetime of the component
  useEffect(() => {
    const angles = PARTICLE_CONFIG.map((p) => p.startAngle);
    let outerAngle = 0;
    let innerAngle = Math.PI; // start counter-phase for visual interest
    let prevPhase = phaseRef.current;
    let burstStartMs = 0;
    let lastNow = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - lastNow) / 1000, 0.05); // seconds, capped
      lastNow = now;

      const phase          = phaseRef.current;
      const phaseStartedAt = phaseStartedAtRef.current;
      const phaseDurationMs= phaseDurationMsRef.current;
      const v              = lerpCycleVisuals(questionIndexRef.current);

      // Detect reveal → trigger burst
      if (phase === "reveal" && prevPhase !== "reveal") burstStartMs = now;
      prevPhase = phase;

      // ── Countdown pulse: 0→1 over final 3 s of question phase ───────────
      let pulse = 0;
      if (phase === "question" && phaseDurationMs > 0) {
        const remaining = Math.max(0, phaseDurationMs - (Date.now() - phaseStartedAt));
        if (remaining < 3000) pulse = 1 - remaining / 3000;
      } else if (phase === "reveal") {
        const elapsed = now - burstStartMs;
        // Peak at burst, then decay
        pulse = elapsed < 350 ? 1.0 : Math.max(0, 1 - (elapsed - 350) / 1400);
      } else if (phase === "explanation" || phase === "transition") {
        const elapsed = Date.now() - phaseStartedAt;
        // Soft settle — energy naturally decays
        pulse = Math.max(0, 0.38 - elapsed / 5000);
      }

      // ── Ring rotation ────────────────────────────────────────────────────
      const rotDps = v.ringSpeed * 13 * (1 + pulse * 1.6); // degrees/sec
      outerAngle = (outerAngle + rotDps * dt) % 360;
      innerAngle = ((innerAngle - rotDps * 0.55 * dt) % 360 + 360) % 360;
      outerRingRef.current?.setAttribute("transform", `rotate(${f(outerAngle)}, 100, 100)`);
      innerRingRef.current?.setAttribute("transform", `rotate(${f(innerAngle)}, 100, 100)`);

      // ── Outer aura ───────────────────────────────────────────────────────
      const breathe    = Math.sin(now / 3400) * 0.042;
      const auraScale  = v.auraScale * (1 + breathe + pulse * 0.30);
      const auraOpacity= Math.min(1, 0.28 + v.glowStrength * 0.55 + pulse * 0.14);
      if (auraRef.current) {
        auraRef.current.style.transform = `scale(${f(auraScale)})`;
        auraRef.current.style.opacity   = String(auraOpacity.toFixed(3));
      }

      // Mid aura (tighter, brighter ring)
      const midScale   = 1 + breathe * 0.6 + pulse * 0.20;
      const midOpacity = Math.min(1, v.glowStrength * 0.42 + pulse * 0.22);
      if (midAuraRef.current) {
        midAuraRef.current.style.transform = `scale(${f(midScale)})`;
        midAuraRef.current.style.opacity   = String(midOpacity.toFixed(3));
      }

      // ── Crystal glow ─────────────────────────────────────────────────────
      const crystalBrightness = Math.min(1, v.crystalBrightness + pulse * 0.48);
      if (crystalGlowRef.current) {
        crystalGlowRef.current.style.opacity = String(crystalBrightness.toFixed(3));
      }

      // ── Bloom flash (countdown + reveal) ────────────────────────────────
      if (bloomRef.current) {
        bloomRef.current.style.opacity = String(Math.min(0.85, pulse * v.glowStrength * 0.68).toFixed(3));
      }

      // ── Burst shockwave ring ─────────────────────────────────────────────
      if (burstRingRef.current) {
        const be = now - burstStartMs;
        if (burstStartMs > 0 && be < 900) {
          const bp    = be / 900;
          const bSc   = 1 + bp * 2.4;
          const bOp   = (1 - bp) * 0.78;
          burstRingRef.current.style.display   = "block";
          burstRingRef.current.style.transform = `scale(${f(bSc)})`;
          burstRingRef.current.style.opacity   = String(bOp.toFixed(3));
        } else {
          burstRingRef.current.style.display = "none";
        }
      }

      // ── Particles ────────────────────────────────────────────────────────
      const activeCount = Math.round(v.particleCount);
      const speedMult   = v.particleSpeed * (1 + pulse * 1.55);

      PARTICLE_CONFIG.forEach((p, i) => {
        const el = particleRefs.current[i];
        if (!el) return;

        if (i >= activeCount) {
          el.style.opacity = "0";
          return;
        }

        // Orbital drift (Cycle 3 erratic motion)
        const erratic = v.erraticMotion * Math.sin(now / 750 + i * 1.4) * 0.32;
        angles[i] += (p.baseSpeed * speedMult + erratic) * dt;

        // Radial drift
        const rDrift = p.orbitRadius * (1 + v.erraticMotion * Math.sin(now / 2400 + i * 2.1) * 0.11);

        // Burst: particles shoot outward briefly
        const be = now - burstStartMs;
        const burstOffset =
          burstStartMs > 0 && be < 650
            ? Math.sin((be / 650) * Math.PI) * 26 * v.glowStrength
            : 0;

        const r = rDrift + burstOffset;
        const x = Math.cos(angles[i]) * r;
        const y = Math.sin(angles[i]) * r;
        el.style.transform = `translate(${f(x)}px, ${f(y)}px)`;

        // Twinkle
        const twinkle   = 0.55 + Math.sin(now / 850 + i * 2.3) * 0.35;
        el.style.opacity = String(Math.min(1, v.particleBrightness * twinkle).toFixed(3));
      });

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
            <radialGradient id="kcCrystal" cx="38%" cy="32%" r="72%">
              <stop offset="0%"   stopColor="#c8f0ff" />
              <stop offset="22%"  stopColor="#55aaff" />
              <stop offset="62%"  stopColor="#1155cc" />
              <stop offset="100%" stopColor="#072266" />
            </radialGradient>
            <radialGradient id="kcCrystalGlow" cx="40%" cy="35%" r="65%">
              <stop offset="0%"   stopColor="#ffffff"  stopOpacity="0.95" />
              <stop offset="28%"  stopColor="#aaddff"  stopOpacity="0.60" />
              <stop offset="65%"  stopColor="#4488ff"  stopOpacity="0.20" />
              <stop offset="100%" stopColor="#2255cc"  stopOpacity="0"    />
            </radialGradient>
          </defs>

          {/* Dark backing circle */}
          <circle cx="100" cy="100" r="90" fill="#030610" opacity="0.88" />

          {/* Subtle inner background ring — gives depth */}
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
            {/* Connecting ring between spike bases */}
            <circle
              cx="100" cy="100" r="76"
              fill="none"
              stroke="url(#kcGold)"
              strokeWidth="1.2"
              opacity="0.68"
            />
            {/* 8 main diamond spikes */}
            {MAIN_SPIKES.map((d, i) => (
              <path key={i} d={d} fill="url(#kcGold)" />
            ))}
            {/* 8 small accent spikes */}
            {ACCENT_SPIKES.map((d, i) => (
              <path key={i} d={d} fill="url(#kcGoldBright)" opacity="0.72" />
            ))}
            {/* 16 tick marks around the ring */}
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
            {/* 6 small diamonds on inner ring */}
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

          {/* ── Blue crystal ──────────────────────────────────────────── */}
          <g style={{ filter: "drop-shadow(0 0 8px rgba(40,130,255,0.80))" }}>
            {/* Main hexagon fill */}
            <polygon points={HEX_POINTS} fill="url(#kcCrystal)" />
            {/* Facet highlight triangles (simulated lighting from top-right) */}
            {FACET_PATHS.map((d, i) => (
              <path key={i} d={d} fill="#88ddff" opacity={FACET_OPACITIES[i]} />
            ))}
            {/* Facet edge lines */}
            {FACET_PATHS.map((d, i) => (
              <path
                key={i} d={d}
                fill="none"
                stroke="rgba(100,180,255,0.22)"
                strokeWidth="0.4"
              />
            ))}
            {/* Crystal outer edge */}
            <polygon
              points={HEX_POINTS}
              fill="none"
              stroke="#4488ff"
              strokeWidth="0.8"
              opacity="0.55"
            />
            {/* Inner glow highlight (top-left offset = gem facet catch) */}
            <ellipse
              cx="95" cy="90"
              rx="20" ry="17"
              fill="url(#kcCrystalGlow)"
            />
          </g>
        </svg>

        {/* ── Crystal animated brightness overlay ────────────────────────── */}
        <div
          ref={crystalGlowRef}
          aria-hidden
          className="pointer-events-none absolute inset-[26%] rounded-full will-change-[opacity]"
          style={{
            background:
              "radial-gradient(circle at 38% 36%, rgba(200,240,255,0.72) 0%, rgba(100,185,255,0.38) 32%, transparent 65%)",
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
              "radial-gradient(circle, rgba(148,210,255,0.52) 0%, rgba(78,148,255,0.22) 38%, transparent 65%)",
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

        {/* ── Particle system ────────────────────────────────────────────── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ overflow: "visible" }}
        >
          {/* Center anchor — particles translate relative to this */}
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
                  // Center the dot on the anchor point
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
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
