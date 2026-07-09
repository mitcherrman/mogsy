/**
 * BroadcastKnowledgeCore — Hextech Knowledge Engine broadcast identity object.
 *
 * A living Hextech artifact that grows in power as the broadcast progresses.
 * Replaces the QR/website panel when both showQrCode and showWebsite are OFF.
 *
 * Visual hierarchy (bottom → top):
 *   Outer aura nebula
 *   → Mid aura ring
 *   → Outer gold crest (slow rotation, SVG)
 *   → Inner gold ring (counter-rotation, SVG)
 *   → Central crystal:
 *       · HextechCore3D — React Three Fiber 3D core (default)
 *       · SvgCrystalCore — 2D SVG fallback (Suspense loading, no WebGL,
 *         webglcontextlost, or error-boundary recovery)
 *   → Bloom flash
 *   → Burst shockwave ring
 *   → Orbital particles (3 rings, RAF-driven)
 *
 * Architecture:
 *   - Single RAF loop for crest/aura/particles, mounted once, reads props
 *     through refs. Zero React re-renders during animation.
 *   - Crystal-internal animation lives inside HextechCore3D (useFrame) or
 *     SvgCrystalCore (its own RAF) respectively.
 *   - The 3D core is lazy-loaded so three.js never enters the bundle for
 *     pages that don't render the broadcast.
 */

import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import { lerpCycleVisuals } from "./KnowledgeCoreConfig";
import { SvgCrystalCore } from "./SvgCrystalCore";

const HextechCore3D = lazy(() => import("./HextechCore3D"));

/* ────────────────────────────────────────────────────────────────────────
   WebGL support detection + error boundary — 24/7 fallback safety
   ──────────────────────────────────────────────────────────────────────── */

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

interface BoundaryProps {
  fallback: ReactNode;
  onFail?: () => void;
  children: ReactNode;
}

class Core3DErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[KnowledgeCore] 3D core crashed, using SVG fallback", error, info);
    this.props.onFail?.();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

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
export const MAIN_SPIKES = [0, 45, 90, 135, 180, 225, 270, 315].map((a) =>
  makeSpikeD(a, 93, 79, 66, 7.5),
);
// 8 small accent spikes at 22.5° offsets (between main spikes)
export const ACCENT_SPIKES = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a) =>
  makeSpikeD(a, 82, 76, 70, 3.5),
);
// 6 small inner-ring diamonds
export const INNER_DIAMONDS = [0, 60, 120, 180, 240, 300].map((a) =>
  makeSpikeD(a, 64, 61, 57, 2.5),
);
// 16 tick marks around outer ring
export const TICK_MARKS = Array.from({ length: 16 }, (_, i) => {
  const a = (i * 22.5 * Math.PI) / 180;
  return {
    x1: f(100 + Math.cos(a) * 72),
    y1: f(100 + Math.sin(a) * 72),
    x2: f(100 + Math.cos(a) * 76),
    y2: f(100 + Math.sin(a) * 76),
  };
});

/* ────────────────────────────────────────────────────────────────────────
   Outer orbital particle system — 3 concentric orbit rings, 16 particles
   ──────────────────────────────────────────────────────────────────────── */

export interface ParticleInfo {
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

export const PARTICLE_CONFIG: ParticleInfo[] = (() => {
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

  // 3D core enablement — falls back permanently on any failure
  const [use3D, setUse3D] = useState(
    () => typeof window !== "undefined" && supportsWebGL(),
  );
  const disable3D = useCallback(() => setUse3D(false), []);

  // DOM refs — all animation writes go here, never through React state
  const outerRingRef = useRef<SVGGElement>(null);
  const innerRingRef = useRef<SVGGElement>(null);
  const auraRef      = useRef<HTMLDivElement>(null);
  const midAuraRef   = useRef<HTMLDivElement>(null);
  const bloomRef     = useRef<HTMLDivElement>(null);
  const burstRingRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Crest conduction glow overlays — blue energy travelling outward through
  // the gold crest, band by band (frame ring → inner diamonds → ticks →
  // accents → main spikes).
  const crestGlowFrameRef  = useRef<SVGCircleElement>(null);
  const crestGlowInnerRef  = useRef<SVGGElement>(null);
  const crestGlowTickRef   = useRef<SVGGElement>(null);
  const crestGlowAccentRef = useRef<SVGGElement>(null);
  const crestGlowMainRef   = useRef<SVGGElement>(null);

  // Single RAF — crest rings, auras, bloom, burst ring, outer particles.
  // Crystal-internal animation lives in HextechCore3D / SvgCrystalCore.
  useEffect(() => {
    const angles = PARTICLE_CONFIG.map((p) => p.startAngle);
    let outerAngle = 0;
    let innerAngle = Math.PI;
    let prevPhase = phaseRef.current;
    let burstStartMs = 0;
    // Conduction wave state
    let waveStart = -1e9;
    let waveStrength = 0;
    let nextWaveAt = performance.now() + 2500;
    let lastNow = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;

      const phase          = phaseRef.current;
      const phaseStartedAt = phaseStartedAtRef.current;
      const phaseDurationMs= phaseDurationMsRef.current;
      const v              = lerpCycleVisuals(questionIndexRef.current);

      // Detect reveal → trigger burst + a strong conduction wave
      if (phase === "reveal" && prevPhase !== "reveal") {
        burstStartMs = now;
        waveStart = now;
        waveStrength = 1;
        nextWaveAt = now + 900;
      }
      prevPhase = phase;

      // ── Countdown pulse: 0→1 over final 3 s of question phase ───────
      let pulse = 0;
      if (phase === "question" && phaseDurationMs > 0) {
        const remaining = Math.max(0, phaseDurationMs - (Date.now() - phaseStartedAt));
        if (remaining < 3000) pulse = 1 - remaining / 3000;
      } else if (phase === "reveal") {
        const elapsed = now - burstStartMs;
        // 550 ms peak hold before decaying into recovery
        pulse = elapsed < 550 ? 1.0 : Math.max(0, 1 - (elapsed - 550) / 1400);
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

      // ── Crest energy conduction ──────────────────────────────────────
      // Waves of blue energy travel outward from the crystal through the
      // crest bands. Idle: an occasional gentle heartbeat. Overload (final
      // ~5 s of countdown): faster, stronger waves. Reveal: one full-power
      // wave (triggered with the burst above).
      let overload = 0;
      if (phase === "question" && phaseDurationMs > 0) {
        const rem = Math.max(0, phaseDurationMs - (Date.now() - phaseStartedAt));
        if (rem < 3000) overload = 0.35 + (1 - rem / 3000) * 0.65;
        else if (rem < 5000) overload = ((5000 - rem) / 2000) * 0.35;
      }

      if (now >= nextWaveAt) {
        waveStart = now;
        waveStrength =
          overload > 0 ? 0.50 + overload * 0.50 : 0.22 + v.glowStrength * 0.15;
        nextWaveAt =
          now + (overload > 0
            ? 1500 - overload * 1050
            : 5200 + Math.random() * 1800);
      }

      // Slightly slower travel + wider gaussian band → the outward-moving
      // energy is easier to perceive against the gold
      const wp = (now - waveStart) / 750;
      const waveR = 46 + wp * 52; // travels 46 → 98 (crystal edge → spike tips)
      const setBand = (el: SVGElement | null, bandR: number) => {
        if (!el) return;
        if (wp < 0 || wp > 1) { el.style.opacity = "0"; return; }
        const op =
          waveStrength * Math.exp(-((waveR - bandR) ** 2) / 130) * (1 - wp * 0.25);
        el.style.opacity = op.toFixed(3);
      };
      setBand(crestGlowFrameRef.current, 51);
      setBand(crestGlowInnerRef.current, 60);
      setBand(crestGlowTickRef.current, 74);
      setBand(crestGlowAccentRef.current, 76);
      setBand(crestGlowMainRef.current, 82);

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

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // mount once — reads all props through refs

  // SVG crystal — Suspense fallback, WebGL-unavailable fallback, and
  // permanent fallback after any 3D failure. Never remove.
  const svgCore = (
    <SvgCrystalCore
      phase={phase}
      questionIndex={questionIndex}
      phaseStartedAt={phaseStartedAt}
      phaseDurationMs={phaseDurationMs}
    />
  );

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

        {/* ── Crest SVG: backing, gold crest, rings ──────────────────────── */}
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

            {/* Conduction glow overlays — icy-blue copies lit band-by-band
                as energy travels outward from the crystal */}
            <g
              ref={crestGlowMainRef}
              style={{ opacity: 0, filter: "drop-shadow(0 0 6px rgba(140,210,255,0.95))" }}
            >
              {MAIN_SPIKES.map((d, i) => (
                <path key={i} d={d} fill="#cfe9ff" />
              ))}
            </g>
            <g ref={crestGlowAccentRef} style={{ opacity: 0 }}>
              {ACCENT_SPIKES.map((d, i) => (
                <path key={i} d={d} fill="#dff2ff" />
              ))}
            </g>
            <g ref={crestGlowTickRef} style={{ opacity: 0 }}>
              {TICK_MARKS.map((t, i) => (
                <line
                  key={i}
                  x1={t.x1} y1={t.y1}
                  x2={t.x2} y2={t.y2}
                  stroke="#cfe9ff"
                  strokeWidth="1.0"
                />
              ))}
            </g>
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

            {/* Conduction glow overlay — inner diamond band */}
            <g ref={crestGlowInnerRef} style={{ opacity: 0 }}>
              {INNER_DIAMONDS.map((d, i) => (
                <path key={i} d={d} fill="#cfe9ff" />
              ))}
            </g>
          </g>

          {/* Crystal frame ring */}
          <circle
            cx="100" cy="100" r="51"
            fill="none"
            stroke="url(#kcGold)"
            strokeWidth="0.8"
            opacity="0.40"
          />
          {/* Conduction glow overlay — frame ring (first band the wave hits) */}
          <circle
            ref={crestGlowFrameRef}
            cx="100" cy="100" r="51"
            fill="none"
            stroke="#bfe4ff"
            strokeWidth="1.6"
            style={{ opacity: 0 }}
          />
        </svg>

        {/* ── Central crystal: 3D core with SVG fallback ─────────────────── */}
        {use3D ? (
          <Core3DErrorBoundary fallback={svgCore} onFail={disable3D}>
            <Suspense fallback={svgCore}>
              <HextechCore3D
                phase={phase}
                questionIndex={questionIndex}
                phaseStartedAt={phaseStartedAt}
                phaseDurationMs={phaseDurationMs}
                onFail={disable3D}
              />
            </Suspense>
          </Core3DErrorBoundary>
        ) : (
          svgCore
        )}

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
              className="select-none text-[0.62cqmin] font-black uppercase tracking-[0.60em] text-[#6ab0e8]"
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
