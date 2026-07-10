/**
 * VideoKnowledgeCore — deterministic Remotion port of the live
 * BroadcastKnowledgeCore + SvgCrystalCore pair.
 *
 * The live components are wall-clock/RAF/Math.random driven and mutate DOM
 * refs for performance, so they cannot render per-frame. This port:
 *   - reuses their EXPORTED geometry + config (crest spikes, ticks, orbit
 *     particle config, crystal facets/bevels, lerpCycleVisuals), so the
 *     shapes and palette are literally the broadcast's;
 *   - re-computes every animated value from frame-derived time with the same
 *     formulas (comments cite the source lines' behavior);
 *   - replaces the one Math.random() (conduction-wave scheduling) with a
 *     mulberry32 stream seeded by question index;
 *   - integrates the stateful accumulators (ring rotation, particle angles,
 *     wave schedule) numerically from the sequence start at a fixed 60 Hz
 *     step, which is cheap and exactly reproducible per frame.
 *
 * The 3D core (HextechCore3D, three.js useFrame) is intentionally not used —
 * SvgCrystalCore is the broadcast's own sanctioned visual fallback and reads
 * identically at 1080p.
 */
import React, { useMemo } from "react";
import {
  MAIN_SPIKES,
  ACCENT_SPIKES,
  INNER_DIAMONDS,
  TICK_MARKS,
  PARTICLE_CONFIG,
} from "@/components/quiz-broadcast/BroadcastKnowledgeCore";
import {
  HEX_POINTS,
  INNER_HEX_POINTS,
  MICRO_HEX_POINTS,
  FACET_PATHS,
  FACET_FILLS,
  INNER_FACET_PATHS,
  INNER_FACET_FILLS,
  BEVEL_EDGES,
  BEVEL_STROKES,
  SIDE_FACES,
  SIDE_FACE_COLORS,
  INT_PARTICLE_CFG,
  CAUSTIC_CFG,
} from "@/components/quiz-broadcast/SvgCrystalCore";
import { mulberry32 } from "@/components/quiz-broadcast/HextechOverloadFX";
import { lerpCycleVisuals } from "@/components/quiz-broadcast/KnowledgeCoreConfig";
import { corePulse, type VideoPhaseState } from "./videoPhase";

const f = (n: number) => n.toFixed(2);
const STEP_MS = 1000 / 60;

/* ────────────────────────────────────────────────────────────────────────
   Deterministic integration of the live RAF accumulators.
   Simulates the same update rules from t=0 to localMs at a fixed step.
   ──────────────────────────────────────────────────────────────────────── */

interface SimState {
  outerAngle: number;
  innerAngle: number;
  particleAngles: number[];
  swirlAngles: [number, number];
  causticAngles: number[];
  intAngles: number[];
  waveStart: number;
  waveStrength: number;
}

function simulate(
  localMs: number,
  questionIndex: number,
  pulseAt: (ms: number) => number,
  overloadAt: (ms: number) => number,
): SimState {
  const v = lerpCycleVisuals(questionIndex);
  const rng = mulberry32((questionIndex * 2654435761) >>> 0);

  const st: SimState = {
    outerAngle: 0,
    innerAngle: 180,
    particleAngles: PARTICLE_CONFIG.map((p) => p.startAngle),
    swirlAngles: [0, 180],
    causticAngles: CAUSTIC_CFG.map((c) => c.startAngle),
    intAngles: INT_PARTICLE_CFG.map((p) => p.startAngle),
    waveStart: -1e9,
    waveStrength: 0,
  };
  // First conduction heartbeat at 800 ms (live: 2500 ms after mount). The
  // live core mounts once per broadcast, so its waves are already flowing
  // when a question starts; the video core restarts per question — an early
  // first wave keeps the crest as alive as the broadcast's steady state.
  let nextWaveAt = 800;

  const dt = STEP_MS / 1000;
  for (let t = 0; t < localMs; t += STEP_MS) {
    const pulse = pulseAt(t);
    const overload = overloadAt(t);

    // Ring rotation (BroadcastKnowledgeCore)
    const rotDps = v.ringSpeed * 13 * (1 + pulse * 1.6);
    st.outerAngle = (st.outerAngle + rotDps * dt) % 360;
    st.innerAngle = ((st.innerAngle - rotDps * 0.55 * dt) % 360 + 360) % 360;

    // Conduction wave schedule — random interval replaced by seeded stream
    if (t >= nextWaveAt) {
      st.waveStart = t;
      st.waveStrength = overload > 0 ? 0.5 + overload * 0.5 : 0.22 + v.glowStrength * 0.15;
      nextWaveAt = t + (overload > 0 ? 1500 - overload * 1050 : 5200 + rng() * 1800);
    }

    // Outer orbital particles
    const speedMult = v.particleSpeed * (1 + pulse * 1.55);
    for (let i = 0; i < PARTICLE_CONFIG.length; i++) {
      const erratic = v.erraticMotion * Math.sin(t / 750 + i * 1.4) * 0.32;
      st.particleAngles[i] += (PARTICLE_CONFIG[i].baseSpeed * speedMult + erratic) * dt;
    }

    // Crystal swirls / caustics / internal orbiters (SvgCrystalCore)
    st.swirlAngles[0] = (st.swirlAngles[0] + (55 + pulse * 160) * dt) % 360;
    st.swirlAngles[1] = ((st.swirlAngles[1] - (38 + pulse * 120) * dt) % 360 + 360) % 360;
    CAUSTIC_CFG.forEach((c, i) => {
      st.causticAngles[i] = ((st.causticAngles[i] + c.speed * (1 + pulse * 1.6) * dt) % 360 + 360) % 360;
    });
    const intSpeedMult = 0.5 + v.crystalBrightness * 0.5 + pulse * 1.6;
    INT_PARTICLE_CFG.forEach((p, i) => {
      st.intAngles[i] += p.speed * intSpeedMult * dt;
    });
  }
  return st;
}

/* ────────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────────── */

export const VideoKnowledgeCore: React.FC<{
  state: VideoPhaseState;
  questionIndex: number;
  /** Time-of-reveal in local ms (burst anchor), from the shared timeline. */
  revealAtMs: number;
  /** Pulse/overload evaluated at arbitrary local times, for the simulation. */
  pulseAt: (ms: number) => number;
  overloadAt: (ms: number) => number;
  compact?: boolean;
}> = ({ state, questionIndex, revealAtMs, pulseAt, overloadAt, compact = false }) => {
  const now = state.localMs;
  const v = lerpCycleVisuals(questionIndex);
  const pulse = corePulse(state);

  const sim = useMemo(
    () => simulate(now, questionIndex, pulseAt, overloadAt),
    [now, questionIndex, pulseAt, overloadAt],
  );

  // Burst = reveal moment
  const burstElapsed = now - revealAtMs; // negative before reveal

  // ── Conduction wave band opacities ─────────────────────────────────────
  const wp = (now - sim.waveStart) / 750;
  const waveR = 46 + wp * 52;
  const band = (bandR: number) =>
    wp < 0 || wp > 1
      ? 0
      : sim.waveStrength * Math.exp(-((waveR - bandR) ** 2) / 130) * (1 - wp * 0.25);

  // ── Auras / bloom / burst ring ─────────────────────────────────────────
  const breathe = Math.sin(now / 3400) * 0.042;
  const auraScale = v.auraScale * (1 + breathe + pulse * 0.3);
  const auraOpacity = Math.min(1, 0.28 + v.glowStrength * 0.55 + pulse * 0.14);
  const midScale = 1 + breathe * 0.6 + pulse * 0.2;
  const midOpacity = Math.min(1, v.glowStrength * 0.42 + pulse * 0.22);
  const bloomOpacity = Math.min(0.9, pulse * v.glowStrength * 0.75);
  const burstActive = burstElapsed >= 0 && burstElapsed < 900;
  const bp = burstActive ? burstElapsed / 900 : 0;

  // ── Crystal values (SvgCrystalCore formulas) ───────────────────────────
  const cBreath = Math.sin(now / 2800) * 0.055 + Math.sin(now / 1650) * 0.022;
  const cFlicker =
    (Math.sin(now / 87) * 0.5 + Math.sin(now / 133) * 0.5) *
    (0.015 + pulse * 0.05 + v.crystalBrightness * 0.02);
  const coreR = Math.max(7, 10 + cBreath * 3.5 + pulse * 10);
  const coreOpacity = Math.min(1, 0.58 + v.crystalBrightness * 0.34 + pulse * 0.26 + cFlicker);
  const crystalBurst = burstElapsed >= 0 && burstElapsed < 440 ? (1 - burstElapsed / 440) * 0.58 : 0;
  const glowBreath = Math.sin(now / 2600) * 0.06;
  const crystalGlow = Math.min(0.95, v.crystalBrightness + pulse * 0.55 + glowBreath);

  const activeCount = Math.round(v.particleCount);

  return (
    <div
      className={`relative flex items-center justify-center ${
        compact ? "h-full w-full" : "h-[78%] w-[92%]"
      }`}
    >
      <div className="relative h-full w-full">
        {/* ── Outer aura nebula ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-28%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(28,78,255,0.38) 0%, rgba(55,130,255,0.16) 38%, rgba(18,48,200,0.05) 65%, transparent 75%)",
            transform: `scale(${f(auraScale)})`,
            opacity: auraOpacity,
          }}
        />
        {/* ── Mid aura ring ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-8%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(75,155,255,0.32) 0%, rgba(38,95,255,0.16) 45%, transparent 70%)",
            transform: `scale(${f(midScale)})`,
            opacity: midOpacity,
          }}
        />

        {/* ── Crest SVG (same markup/gradients as BroadcastKnowledgeCore) ── */}
        <svg viewBox="0 0 200 200" className="h-full w-full" style={{ overflow: "visible" }} aria-hidden>
          <defs>
            <linearGradient id="vkcGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f5e090" />
              <stop offset="35%" stopColor="#d4a820" />
              <stop offset="70%" stopColor="#b8891c" />
              <stop offset="100%" stopColor="#8c6010" />
            </linearGradient>
            <linearGradient id="vkcGoldBright" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff5b8" />
              <stop offset="50%" stopColor="#e8c040" />
              <stop offset="100%" stopColor="#c09020" />
            </linearGradient>
          </defs>

          <circle cx="100" cy="100" r="90" fill="#030610" opacity="0.88" />
          <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(40,80,200,0.12)" strokeWidth="12" />

          {/* Outer crest — rotation from the deterministic simulation */}
          <g
            transform={`rotate(${f(sim.outerAngle)}, 100, 100)`}
            style={{ filter: "drop-shadow(0 0 3.5px rgba(220,168,28,0.72))" }}
          >
            <circle cx="100" cy="100" r="76" fill="none" stroke="url(#vkcGold)" strokeWidth="1.2" opacity="0.68" />
            {MAIN_SPIKES.map((d, i) => (
              <path key={i} d={d} fill="url(#vkcGold)" />
            ))}
            {ACCENT_SPIKES.map((d, i) => (
              <path key={i} d={d} fill="url(#vkcGoldBright)" opacity="0.72" />
            ))}
            {TICK_MARKS.map((t, i) => (
              <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="url(#vkcGoldBright)" strokeWidth="0.8" opacity="0.50" />
            ))}

            {/* Conduction glow overlays */}
            <g style={{ opacity: band(82), filter: "drop-shadow(0 0 6px rgba(140,210,255,0.95))" }}>
              {MAIN_SPIKES.map((d, i) => (
                <path key={i} d={d} fill="#cfe9ff" />
              ))}
            </g>
            <g style={{ opacity: band(76) }}>
              {ACCENT_SPIKES.map((d, i) => (
                <path key={i} d={d} fill="#dff2ff" />
              ))}
            </g>
            <g style={{ opacity: band(74) }}>
              {TICK_MARKS.map((t, i) => (
                <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#cfe9ff" strokeWidth="1.0" />
              ))}
            </g>
          </g>

          {/* Inner ring — counter-rotation */}
          <g
            transform={`rotate(${f(sim.innerAngle)}, 100, 100)`}
            style={{ filter: "drop-shadow(0 0 2px rgba(220,168,28,0.55))" }}
          >
            <circle cx="100" cy="100" r="61" fill="none" stroke="url(#vkcGold)" strokeWidth="1.1" opacity="0.55" />
            <circle cx="100" cy="100" r="57" fill="none" stroke="url(#vkcGoldBright)" strokeWidth="0.5" opacity="0.32" />
            {INNER_DIAMONDS.map((d, i) => (
              <path key={i} d={d} fill="url(#vkcGoldBright)" opacity="0.62" />
            ))}
            <g style={{ opacity: band(60) }}>
              {INNER_DIAMONDS.map((d, i) => (
                <path key={i} d={d} fill="#cfe9ff" />
              ))}
            </g>
          </g>

          {/* Crystal frame ring + first conduction band */}
          <circle cx="100" cy="100" r="51" fill="none" stroke="url(#vkcGold)" strokeWidth="0.8" opacity="0.40" />
          <circle cx="100" cy="100" r="51" fill="none" stroke="#bfe4ff" strokeWidth="1.6" style={{ opacity: band(51) }} />
        </svg>

        {/* ── Central crystal (SvgCrystalCore port) ── */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <svg viewBox="0 0 200 200" className="h-full w-full" style={{ overflow: "visible" }}>
            <defs>
              <radialGradient id="vscOuter" cx="42%" cy="36%" r="78%">
                <stop offset="0%" stopColor="#123a78" />
                <stop offset="30%" stopColor="#081f4c" />
                <stop offset="65%" stopColor="#040e26" />
                <stop offset="100%" stopColor="#010510" />
              </radialGradient>
              <radialGradient id="vscInner" cx="40%" cy="34%" r="70%">
                <stop offset="0%" stopColor="#3e92f2" />
                <stop offset="30%" stopColor="#1250c0" />
                <stop offset="62%" stopColor="#092a78" />
                <stop offset="100%" stopColor="#04123e" />
              </radialGradient>
              <radialGradient id="vscMicro" cx="46%" cy="42%" r="62%">
                <stop offset="0%" stopColor="#c2ecff" />
                <stop offset="24%" stopColor="#4aa2f8" />
                <stop offset="58%" stopColor="#1244ac" />
                <stop offset="100%" stopColor="#061a52" />
              </radialGradient>
              <radialGradient id="vscCoreGlow" cx="50%" cy="48%" r="55%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="12%" stopColor="#eaf7ff" />
                <stop offset="30%" stopColor="#8ecbff" />
                <stop offset="58%" stopColor="#2a62e8" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#0d2888" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="vscSpecular" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.90" />
                <stop offset="22%" stopColor="#aaddff" stopOpacity="0.52" />
                <stop offset="58%" stopColor="#4488ff" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#2255cc" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="vscCaustic" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#88deff" stopOpacity="0" />
                <stop offset="38%" stopColor="#b8eeff" stopOpacity="1" />
                <stop offset="62%" stopColor="#b8eeff" stopOpacity="1" />
                <stop offset="100%" stopColor="#88deff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="vscSwirl" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6fd4ff" stopOpacity="0" />
                <stop offset="45%" stopColor="#a4e6ff" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#4aa2f8" stopOpacity="0" />
              </linearGradient>
            </defs>

            <g style={{ filter: "drop-shadow(0 0 10px rgba(40,130,255,0.86))" }}>
              <polygon points={HEX_POINTS} fill="url(#vscOuter)" />
              {SIDE_FACES.map((pts, i) => (
                <polygon key={i} points={pts} fill={SIDE_FACE_COLORS[i]} />
              ))}
              {FACET_PATHS.map((d, i) => (
                <path key={i} d={d} fill={FACET_FILLS[i]} />
              ))}
              <polygon points={HEX_POINTS} fill="none" stroke="rgba(2,8,24,0.72)" strokeWidth="4.5" />
              <polygon points={INNER_HEX_POINTS} fill="url(#vscInner)" />
              {INNER_FACET_PATHS.map((d, i) => (
                <path key={i} d={d} fill={INNER_FACET_FILLS[i]} />
              ))}
              <polygon points={MICRO_HEX_POINTS} fill="url(#vscMicro)" />

              {/* Energy swirl arcs */}
              {[0, 1].map((i) => {
                const sOp =
                  (0.1 + v.crystalBrightness * 0.28 + pulse * 0.45) *
                  (0.65 + Math.sin(now / 1400 + i * 2.4) * 0.35);
                return (
                  <path
                    key={i}
                    d="M 100,78 A 22,22 0 0 1 122,100"
                    fill="none"
                    stroke="url(#vscSwirl)"
                    strokeWidth={i === 0 ? 2.2 : 1.4}
                    strokeLinecap="round"
                    transform={`rotate(${f(sim.swirlAngles[i])}, 100, 100)`}
                    opacity={Math.min(0.85, sOp)}
                  />
                );
              })}

              {/* Caustic light beams */}
              {CAUSTIC_CFG.map((c, i) => {
                const cOp =
                  (0.05 + v.crystalBrightness * 0.11 + pulse * 0.09) *
                  (0.55 + Math.sin(now / 2100 + i * 1.5) * 0.4);
                return (
                  <ellipse
                    key={i}
                    cx="100"
                    cy="100"
                    rx={c.rx}
                    ry={c.ry}
                    fill="url(#vscCaustic)"
                    transform={`rotate(${f(sim.causticAngles[i])}, 100, 100)`}
                    opacity={Math.min(0.24, cOp)}
                  />
                );
              })}

              {/* Internal energy particles — rings orbit, ring 3 rises */}
              {INT_PARTICLE_CFG.map((p, i) => {
                const isRiser = i >= 9;
                let px: number, py: number, op: number;
                if (isRiser) {
                  const riseSpeed = 5.5 + v.crystalBrightness * 5 + pulse * 14;
                  const period = 52 / riseSpeed;
                  const tCycle = ((now / 1000 + i * 1.37) % period) / period;
                  py = 126 - tCycle * 52;
                  const sway = Math.sin(now / 900 + i * 2.2) * (3.5 + pulse * 3);
                  px = 100 + Math.cos(p.startAngle) * p.baseR * 0.45 + sway;
                  const fade = Math.sin(tCycle * Math.PI);
                  op = Math.min(0.9, fade * (0.14 + v.crystalBrightness * 0.55 + pulse * 0.35));
                } else {
                  let r = p.baseR;
                  if (pulse > 0.04 && state.phase === "question") r = p.baseR * (1 - pulse * 0.58);
                  if (burstElapsed >= 0 && burstElapsed < 600) {
                    r = p.baseR * (1 + Math.sin((burstElapsed / 600) * Math.PI) * 1.9);
                  }
                  px = 100 + Math.cos(sim.intAngles[i]) * r;
                  py = 100 + Math.sin(sim.intAngles[i]) * r;
                  const twinkle = 0.48 + Math.sin(now / 680 + i * 1.9) * 0.42;
                  op = Math.min(0.92, (0.18 + v.crystalBrightness * 0.52 + pulse * 0.3) * twinkle);
                }
                return <circle key={i} cx={f(px)} cy={f(py)} r={p.size} fill="#a8e8ff" opacity={op} />;
              })}

              {/* Energy core */}
              <circle cx="100" cy="100" r={f(coreR)} fill="url(#vscCoreGlow)" opacity={coreOpacity} />

              {/* Edge highlights */}
              <line x1="100.00" y1="55.00" x2="138.97" y2="77.50" stroke="#88eeff" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
              <line x1="61.03" y1="77.50" x2="100.00" y2="55.00" stroke="#66ccff" strokeWidth="0.9" strokeLinecap="round" opacity="0.36" />
              <line x1="100.00" y1="62.00" x2="132.91" y2="81.00" stroke="#44aaff" strokeWidth="0.6" strokeLinecap="round" opacity="0.28" />

              {/* Beveled hex rim */}
              {BEVEL_EDGES.map((e, i) => (
                <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={BEVEL_STROKES[i]} strokeWidth="1.4" strokeLinecap="round" />
              ))}
              <polygon points={INNER_HEX_POINTS} fill="none" stroke="rgba(100,180,255,0.38)" strokeWidth="0.5" />
              {FACET_PATHS.map((d, i) => (
                <path key={i} d={d} fill="none" stroke="rgba(120,200,255,0.16)" strokeWidth="0.4" />
              ))}

              {/* Specular catch */}
              <ellipse cx="108" cy="84" rx="13" ry="10" fill="url(#vscSpecular)" opacity="0.75" />

              {/* Burst flash */}
              <circle cx="100" cy="100" r="45" fill="white" opacity={crystalBurst} />
            </g>
          </svg>

          {/* Animated brightness overlay */}
          <div
            className="pointer-events-none absolute inset-[26%] rounded-full"
            style={{
              background: [
                "radial-gradient(circle at 50% 48%, rgba(230,246,255,0.55) 0%, rgba(140,205,255,0.26) 18%, transparent 42%)",
                "radial-gradient(circle at 64% 68%, rgba(38,96,255,0.12) 0%, transparent 40%)",
              ].join(", "),
              opacity: crystalGlow,
            }}
          />
        </div>

        {/* ── Bloom flash ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-4%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(180,225,255,0.62) 0%, rgba(100,175,255,0.28) 36%, rgba(38,95,255,0.07) 58%, transparent 70%)",
            opacity: bloomOpacity,
          }}
        />

        {/* ── Burst shockwave ring ── */}
        {burstActive && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[6%] rounded-full"
            style={{
              border: "1.5px solid rgba(100,200,255,0.82)",
              boxShadow: "0 0 14px rgba(100,200,255,0.50), inset 0 0 8px rgba(100,200,255,0.28)",
              transform: `scale(${f(1 + bp * 2.4)})`,
              opacity: (1 - bp) * 0.78,
            }}
          />
        )}

        {/* ── Outer orbital particles ── */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ overflow: "visible" }}>
          <div className="absolute left-1/2 top-1/2">
            {PARTICLE_CONFIG.map((p, i) => {
              if (i >= activeCount) return null;
              const rDrift = p.orbitRadius * (1 + v.erraticMotion * Math.sin(now / 2400 + i * 2.1) * 0.11);
              const burstOffset =
                burstElapsed >= 0 && burstElapsed < 650
                  ? Math.sin((burstElapsed / 650) * Math.PI) * 26 * v.glowStrength
                  : 0;
              const r = rDrift + burstOffset;
              const twinkle = 0.55 + Math.sin(now / 850 + i * 2.3) * 0.35;
              return (
                <div
                  key={i}
                  aria-hidden
                  className="absolute"
                  style={{
                    width: p.size,
                    height: p.size,
                    borderRadius: "50%",
                    background: `rgba(${p.color}, 0.92)`,
                    boxShadow: `0 0 ${(p.size * 2.8).toFixed(1)}px rgba(${p.color}, 0.72)`,
                    marginLeft: -p.size / 2,
                    marginTop: -p.size / 2,
                    transform: `translate(${f(Math.cos(sim.particleAngles[i]) * r)}px, ${f(Math.sin(sim.particleAngles[i]) * r)}px)`,
                    opacity: Math.min(1, v.particleBrightness * twinkle),
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* ── Subtle Mogsy wordmark ── */}
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
};
