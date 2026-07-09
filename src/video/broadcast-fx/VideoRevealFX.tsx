/**
 * VideoRevealFX — deterministic Remotion port of the broadcast FXLayer
 * (gold coin shower + sparkle field shown while the reveal is active).
 *
 * Same styling and motion rules as BroadcastRenderer's GoldCoinShower /
 * SparkleField; the per-mount Math.random() parameters come from a
 * mulberry32 stream seeded by question index, and all positions are pure
 * functions of time since the reveal.
 */
import React, { useMemo } from "react";
import { interpolate } from "remotion";
import { mulberry32 } from "@/components/quiz-broadcast/HextechOverloadFX";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const VideoRevealFX: React.FC<{
  /** ms since the reveal moment (negative before reveal → hidden). */
  sinceRevealMs: number;
  questionIndex: number;
}> = ({ sinceRevealMs, questionIndex }) => {
  const { coins, sparks } = useMemo(() => {
    const rng = mulberry32((questionIndex * 48271 + 7) >>> 0);
    return {
      coins: Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: rng() * 100,
        delay: rng() * 1.4 * 1000,
        duration: (2.4 + rng() * 1.6) * 1000,
        size: 6 + rng() * 8,
        drift: (rng() - 0.5) * 60,
      })),
      sparks: Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: rng() * 100,
        top: 30 + rng() * 50,
        delay: rng() * 1.2 * 1000,
      })),
    };
  }, [questionIndex]);

  if (sinceRevealMs < 0) return null;
  // Layer fade-in (live: AnimatePresence 0.4 s)
  const layerOpacity = interpolate(sinceRevealMs, [0, 400], [0, 1], clamp);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" style={{ opacity: layerOpacity }}>
      {/* Gold coin shower */}
      {coins.map((c) => {
        const t = (sinceRevealMs - c.delay) / c.duration;
        if (t < 0 || t > 1) return null;
        const ease = t * t; // easeIn fall
        const y = -10 + ease * 130; // -10% → 120%
        const opacity = interpolate(t, [0, 0.15, 0.85, 1], [0, 1, 1, 0], clamp);
        return (
          <div
            key={c.id}
            className="absolute rounded-full bg-gradient-to-br from-[#fff3c2] via-[#f3dca0] to-[#b8893a] shadow-[0_0_10px_rgba(243,220,160,0.7)]"
            style={{
              left: `${c.left}%`,
              top: 0,
              width: c.size,
              height: c.size,
              transform: `translateY(${y}cqh) translateX(${c.drift * t}px) rotate(${540 * t}deg)`,
              opacity,
            }}
          />
        );
      })}

      {/* Sparkle field — live sparks pulse twice (repeat: 1) */}
      {sparks.map((s) => {
        const cycle = 1400;
        const local = sinceRevealMs - s.delay;
        if (local < 0 || local > cycle * 2) return null;
        const t = (local % cycle) / cycle;
        const pulse = Math.sin(t * Math.PI);
        return (
          <div
            key={s.id}
            className="absolute h-1 w-1 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              transform: `scale(${pulse})`,
              opacity: pulse,
            }}
          />
        );
      })}
    </div>
  );
};
