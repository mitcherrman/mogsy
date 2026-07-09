/**
 * VideoFinalCountdown — deterministic Remotion port of the broadcast's
 * FinalCountdownOverlay (dramatic 3·2·1 with cinematic bars, shockwave,
 * seeded burst particles, and warm final-second pulse).
 *
 * Same markup and constants as the live overlay; the wall-clock rAF digit
 * tracker becomes a pure remaining-ms → digit mapping, framer-motion
 * transitions become keyframe interpolations on the digit's local age, and
 * Math.random particle scatter becomes a mulberry32 stream seeded by digit.
 */
import React from "react";
import { interpolate } from "remotion";
import { mulberry32 } from "@/components/quiz-broadcast/HextechOverloadFX";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const VideoFinalCountdown: React.FC<{
  /** ms until reveal (Infinity after reveal — overlay hidden). */
  remainingMs: number;
  questionIndex: number;
}> = ({ remainingMs, questionIndex }) => {
  let n: 0 | 1 | 2 | 3 = 0;
  if (remainingMs > 0 && remainingMs <= 3000) {
    if (remainingMs > 2000) n = 3;
    else if (remainingMs > 1000) n = 2;
    else n = 1;
  }
  if (n === 0) return null;

  // Age of the current digit (each digit owns a 1 s window).
  const age = (n === 3 ? 3000 : n === 2 ? 2000 : 1000) - remainingMs; // 0..1000
  const intensity = n === 3 ? 0.18 : n === 2 ? 0.28 : 0.38;

  // Entrance fade (live: 0.18 s crossfade via AnimatePresence)
  const fadeIn = interpolate(age, [0, 180], [0, 1], clamp);

  // Numeral: spring-like keyframed pop, matching the live 0.62 s sequence.
  const peak = n === 1 ? 1.38 : 1.24;
  const numScale = interpolate(age, [0, 310, 620], [0.55, peak, 1.05], clamp);
  const numY = interpolate(age, [0, 620], [-18, 0], clamp); // cqmin
  const numRot = interpolate(age, [0, 620], [n === 1 ? 4 : -3, 0], clamp);
  const numOpacity = interpolate(age, [0, 310], [0, 1], clamp);

  // Gold edge pressure: opacity [0, 0.9, 0.45] scale [1.05, 1, 1.015] over 0.9 s
  const edgeOpacity = interpolate(age, [0, 450, 900], [0, 0.9, 0.45], clamp);
  const edgeScale = interpolate(age, [0, 450, 900], [1.05, 1, 1.015], clamp);

  // Cinematic bars slide in over 0.22 s
  const barY = interpolate(age, [0, 220], [100, 0], clamp);

  // Shockwave ring: scale 0.15→2.4, opacity 0.9→0 over 0.85 s
  const shockScale = interpolate(age, [0, 850], [0.15, 2.4], clamp);
  const shockOpacity = interpolate(age, [0, 850], [0.9, 0], clamp);

  // Final-second warm pulse: opacity [0, 0.03, 0] over 0.35 s after 0.42 s
  const warmPulse =
    n === 1 ? interpolate(age, [420, 595, 770], [0, 0.03, 0], clamp) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-[45] overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: fadeIn }}>
        {/* scene darken / tension */}
        <div aria-hidden className="absolute inset-0 bg-black" style={{ opacity: intensity * fadeIn }} />

        {/* gold edge pressure */}
        <div
          aria-hidden
          className="absolute inset-0 [box-shadow:inset_0_0_0_2px_rgba(212,179,90,0.24),inset_0_0_120px_rgba(212,179,90,0.24)]"
          style={{ opacity: edgeOpacity, transform: `scale(${edgeScale})` }}
        />

        {/* cinematic bars */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[9%] bg-gradient-to-b from-black/90 to-transparent"
          style={{ transform: `translateY(${-barY}%)` }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[9%] bg-gradient-to-t from-black/90 to-transparent"
          style={{ transform: `translateY(${barY}%)` }}
        />

        {/* shockwave */}
        <div
          aria-hidden
          className="absolute h-[44cqmin] w-[44cqmin] rounded-full border border-[#f3dca0]/60"
          style={{ transform: `scale(${shockScale})`, opacity: shockOpacity }}
        />

        {/* burst particles — seeded, radial */}
        <BurstParticles seed={n * 7919 + questionIndex * 104729} count={n === 1 ? 34 : 24} ageMs={age} big={n === 1} />

        {/* numeral */}
        <div
          className="relative flex items-center justify-center"
          style={{
            opacity: numOpacity,
            transform: `translateY(${numY}cqmin) scale(${numScale}) rotate(${numRot}deg)`,
          }}
        >
          <div className="absolute -inset-[12cqmin] rounded-full bg-[radial-gradient(circle,rgba(243,220,160,0.34),rgba(212,179,90,0.16)_38%,transparent_70%)] blur-xl" />
          <div className="absolute -inset-[6cqmin] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_68%)]" />
          <span
            className="relative select-none bg-gradient-to-b from-white via-[#fff0b8] to-[#b7791f] bg-clip-text text-[26cqmin] font-black leading-none tracking-[-0.08em] text-transparent drop-shadow-[0_0_42px_rgba(243,220,160,0.85)]"
            style={{
              WebkitTextStroke: "2px rgba(255,255,255,0.22)",
              textShadow: "0 0 32px rgba(243,220,160,0.75), 0 10px 48px rgba(0,0,0,0.85)",
            }}
          >
            {n}
          </span>
        </div>

        {/* final-second atmospheric pulse */}
        {n === 1 && <div aria-hidden className="absolute inset-0 bg-[#c8952a]" style={{ opacity: warmPulse }} />}
      </div>
    </div>
  );
};

/** Radial burst particles — same layout rules as the live overlay, with the
 *  Math.random scatter drawn from a seeded stream. */
const BurstParticles: React.FC<{ seed: number; count: number; ageMs: number; big: boolean }> = ({
  seed,
  count,
  ageMs,
  big,
}) => {
  const rng = mulberry32(seed >>> 0);
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count;
    const dist = 24 + rng() * 34 + (big ? 18 : 0);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      size: 3 + rng() * 6,
      delay: rng() * 0.08 * 1000,
    };
  });

  return (
    <div className="absolute left-1/2 top-1/2">
      {particles.map((p, i) => {
        const t = Math.max(0, Math.min(1, (ageMs - p.delay) / 850));
        const opacity = interpolate(t, [0, 0.5, 1], [0, 1, 0], clamp);
        const scale = interpolate(t, [0, 0.5, 1], [0.2, 1.1, 0.2], clamp);
        const ease = 1 - (1 - t) ** 3; // easeOut
        return (
          <div
            key={i}
            className="absolute rounded-full bg-gradient-to-br from-white via-[#f3dca0] to-[#b8893a] shadow-[0_0_14px_rgba(243,220,160,0.9)]"
            style={{
              width: p.size,
              height: p.size,
              transform: `translate(${p.x * ease}vmin, ${p.y * ease}vmin) scale(${scale})`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};
