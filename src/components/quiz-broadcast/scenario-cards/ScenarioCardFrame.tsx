import type { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * Shared cinematic shell for full-bleed scenario cards.
 *
 * Provides the gold frame, the slow Ken Burns background pan/zoom
 * (14s mirror loop, scale 1.08 → 1.14, drift -8/-6 — the exact constants
 * previously duplicated in ChampionSplashCard and CombatCooldownSubjectCard),
 * the inner vignette, and the gold inner ring. Content and gradients are
 * supplied by each card so existing visuals stay pixel-identical.
 */
export function ScenarioCardFrame({
  backgroundUrl,
  backgroundAlt,
  onBackgroundError,
  gradientClass,
  lightStreak = false,
  children,
}: {
  backgroundUrl: string | null;
  backgroundAlt: string;
  onBackgroundError?: () => void;
  /** Tailwind gradient classes for the readability overlay. */
  gradientClass: string;
  /** Moving light streak (champion splash treatment). */
  lightStreak?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="relative h-[94%] w-[94%] overflow-hidden rounded-2xl border border-[#d4b35a]/30 bg-black/40 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.85)]">
      {/* slow Ken Burns pan/zoom */}
      <motion.div
        className="absolute inset-[-6%]"
        initial={{ scale: 1.08, x: 0, y: 0 }}
        animate={{ scale: 1.14, x: -8, y: -6 }}
        transition={{ duration: 14, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      >
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt={backgroundAlt}
            onError={onBackgroundError}
            className="h-full w-full object-cover"
            style={{ objectPosition: "60% 50%" }}
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-900 to-slate-800" />
        )}
      </motion.div>

      {/* moving light streak */}
      {lightStreak && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-y-1/2 -left-1/3 w-1/3 rotate-[18deg] bg-gradient-to-r from-transparent via-white/8 to-transparent"
          initial={{ x: "-30%", opacity: 0 }}
          animate={{ x: "260%", opacity: [0, 0.5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", repeatDelay: 4 }}
        />
      )}

      {/* readability gradient + cinematic vignette */}
      <div className={`pointer-events-none absolute inset-0 ${gradientClass}`} />
      <div className="pointer-events-none absolute inset-0 [box-shadow:inset_0_0_120px_rgba(0,0,0,0.6)]" />

      {/* gold inner border */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-[#d4b35a]/20" />

      {children}
    </div>
  );
}
