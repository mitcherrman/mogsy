/**
 * Academy Pulse — the shared scene kit: choreography variants, the art
 * resolver, and the small animated pieces every scene draws from.
 *
 * MOTION GRAMMAR. A scene is a `motion.div` with three states — `enter`
 * (before), `show`, `exit` — and its pieces declare how THEY arrive with one of
 * the variants below; the scene's own variants only orchestrate (stagger and
 * delay). Under reduced motion, `MotionConfig reducedMotion="always"` (set by
 * the shell) strips transforms so every arrival becomes a plain fade, and
 * count-ups land on their final value at once.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { animate, motion, type Variants } from "framer-motion";

import { MOGZY_MASCOT_ASSETS, MOGZY_MASCOT_ASSETS_COMPACT } from "@/components/mascot/mascot-assets";
import type { PulseItem, PulseMascot } from "../model/pulse-types";

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_IN: [number, number, number, number] = [0.6, 0, 0.84, 0];

/* ------------------------------------------------------------------ art */

export interface PulseArt {
  championIcon(name: string | undefined): string | null;
  championSplash(name: string | undefined): string | null;
}

export const PulseArtContext = createContext<PulseArt>({
  championIcon: () => null,
  championSplash: () => null,
});
export const usePulseArt = () => useContext(PulseArtContext);

/** The small WebP plate for a pose (every PulseMascot has one), falling back to the source. */
export function mascotSrc(pose: PulseMascot): string {
  return MOGZY_MASCOT_ASSETS_COMPACT[pose] ?? MOGZY_MASCOT_ASSETS[pose];
}

export const MASCOT_NAME: Record<PulseMascot, string> = {
  base: "Mogzy",
  cheering: "Cheering Mogzy",
  thinking: "Thinking Mogzy",
  explaining: "Professor Mogzy",
  holdingBook: "Scholar Mogzy",
  peeking: "Peeking Mogzy",
  raisingHand: "Eager Mogzy",
};

/* ------------------------------------------------------------- props */

export interface SceneProps<T extends PulseItem> {
  item: T;
  reduced: boolean;
  /** A meaningful interaction: holds the rotation. */
  onInteract(): void;
  /** Open the expanded view on this scene. */
  onExpand(): void;
}

/* ---------------------------------------------------------- variants */

/** The scene root: orchestrates its children's arrival and departure. */
export const sceneRoot = (delay = 0.12, stagger = 0.075): Variants => ({
  enter: { opacity: 1 },
  show: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { delayChildren: delay, staggerChildren: stagger } },
  // the whole scene dims and softens as it leaves, while its pieces fall away in reverse
  exit: {
    opacity: 0,
    scale: 0.975,
    filter: "blur(6px)",
    transition: { duration: 0.34, ease: EASE_IN, staggerChildren: 0.03, staggerDirection: -1 },
  },
});

/** Rise out of light. */
export const rise: Variants = {
  enter: { opacity: 0, y: 12, filter: "blur(5px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.22, ease: EASE_IN } },
};

/** Pop in with a little overshoot (seals, badges, medallions). */
export const pop: Variants = {
  enter: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 380, damping: 22 } },
  exit: { opacity: 0, scale: 0.85, transition: { duration: 0.2, ease: EASE_IN } },
};

/** Slide in from the side the scene came from. */
export const slideIn: Variants = {
  enter: { opacity: 0, x: 22 },
  show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: EASE_OUT } },
  exit: { opacity: 0, x: -14, transition: { duration: 0.2, ease: EASE_IN } },
};

/** A horizontal light wipe (headlines, plates). */
export const wipe: Variants = {
  enter: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
  show: { opacity: 1, clipPath: "inset(0 0% 0 0)", transition: { duration: 0.7, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/** Fade only. */
export const fade: Variants = {
  enter: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

/* ------------------------------------------------------------ pieces */

/** A number that counts up once, writing text directly (no re-renders). */
export function CountUp({
  to,
  from = 0,
  delay = 0.35,
  duration = 1.2,
  reduced,
  format = (v: number) => Math.round(v).toLocaleString("en-US"),
  className,
}: {
  to: number;
  from?: number;
  delay?: number;
  duration?: number;
  reduced: boolean;
  format?: (v: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) { el.textContent = format(to); return; }
    el.textContent = format(from);
    const controls = animate(from, to, {
      delay,
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => { el.textContent = format(v); },
    });
    return () => controls.stop();
    // a scene mounts once per showing: the count runs once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span ref={ref} className={className}>{format(reduced ? to : from)}</span>;
}

/** Concentric rune rings (pure CSS rotation; paused with the scene off screen). */
export function RuneRings({ className }: { className?: string }) {
  return (
    <svg className={`apulse-runes ${className ?? ""}`} viewBox="0 0 100 100" aria-hidden focusable="false">
      <circle className="apulse-rune-a" cx="50" cy="50" r="47" pathLength={100} />
      <circle className="apulse-rune-b" cx="50" cy="50" r="40" pathLength={100} />
      <circle className="apulse-rune-c" cx="50" cy="50" r="33" pathLength={100} />
    </svg>
  );
}

/** A short burst of motes (decorative; none under reduced motion). */
export function Motes({ count = 10, reduced, className }: { count?: number; reduced: boolean; className?: string }) {
  if (reduced) return null;
  return (
    <span className={`apulse-motes ${className ?? ""}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + (i % 3) * 0.4;
        const d = 34 + ((i * 37) % 22);
        return (
          <i
            key={i}
            style={{
              ["--mx" as string]: `${Math.cos(a) * d}px`,
              ["--my" as string]: `${Math.sin(a) * d}px`,
              ["--md" as string]: `${0.5 + (i % 4) * 0.12}s`,
            }}
          />
        );
      })}
    </span>
  );
}

/** A champion image that removes itself if the art host cannot deliver it. */
export function ChampionArt({ src, className, alt = "" }: { src: string | null; className?: string; alt?: string }) {
  if (!src) return <span className={`apulse-art-missing ${className ?? ""}`} aria-hidden />;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      // the scene is already on screen when this mounts; low priority keeps it behind the page's own art
      fetchPriority="low"
      draggable={false}
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
    />
  );
}

/** A small uppercase label above a scene's headline. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.p variants={rise} className={`apulse-kicker ${className ?? ""}`}>{children}</motion.p>;
}
