import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

import SEOHead from "@/components/SEOHead";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

import { ACADEMY_EMBLEMS } from "./AcademyEmblems";
import { useLaunchChime } from "./useLaunchChime";

/**
 * Mogzy entrance — Academy edition (dev-only visual concept).
 *
 * Same composition and mood as the previous V2 pass: full-screen, layout-free,
 * dark, centre-dominant, with the legacy launch chime. The abstract corner
 * fragments are replaced by the four real Academy emblems, and the Academy
 * title now crowns the composition.
 *
 * The faithful pre-Mogzy original stays untouched at /dev/legacy-entry.
 * Not wired to production: no app state is read or written, and the route is
 * not linked from any navigation.
 */

const ACADEMY_TITLE = "Mogzy’s Academy of Leaguecraft and Technology";

/** Pointer travel in px at depth 1. Small on purpose — a drift, not a swing. */
const PARALLAX_RANGE = 15;

/** Chime (~400ms) overlaps the transition; navigate as the veil peaks. */
const ENTRY_DURATION_MS = 780;
const ENTRY_DURATION_REDUCED_MS = 220;

const GOLD = "#c9a84c";
const GOLD_BRIGHT = "#f0d78c";
const IVORY = "#f0e6d2";

/** Four-point star + rule, echoing the ornament above the concept title. */
function TitleOrnamentTop() {
  return (
    <svg width="120" height="18" viewBox="0 0 120 18" fill="none" aria-hidden="true">
      <path
        d="M60 1 L62.2 6.8 L68 9 L62.2 11.2 L60 17 L57.8 11.2 L52 9 L57.8 6.8 Z"
        fill={GOLD_BRIGHT}
        opacity="0.9"
      />
      <path d="M6 9 H48" stroke={GOLD} strokeWidth="1" opacity="0.5" />
      <path d="M72 9 H114" stroke={GOLD} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

/** Diamond-and-rule divider beneath the title. */
function TitleOrnamentBottom() {
  return (
    <svg width="300" height="12" viewBox="0 0 300 12" fill="none" aria-hidden="true">
      <path d="M150 1.5 L154.5 6 L150 10.5 L145.5 6 Z" fill={GOLD_BRIGHT} opacity="0.85" />
      <path d="M10 6 H141" stroke={GOLD} strokeWidth="1" opacity="0.45" />
      <path d="M159 6 H290" stroke={GOLD} strokeWidth="1" opacity="0.45" />
      <circle cx="6" cy="6" r="1.6" fill={GOLD} opacity="0.5" />
      <circle cx="294" cy="6" r="1.6" fill={GOLD} opacity="0.5" />
    </svg>
  );
}

export default function MogzyEntryV2() {
  const navigate = useNavigate();
  const playLaunchChime = useLaunchChime();
  const prefersReducedMotion = useReducedMotion();

  const [entering, setEntering] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const enteringRef = useRef(false);

  /* ---------------------------------------------------------------------- */
  /* Entry transition                                                       */
  /* ---------------------------------------------------------------------- */

  const handleEnter = useCallback(() => {
    if (enteringRef.current) return;
    enteringRef.current = true;

    // 1. chime first, so it leads the visual transition
    playLaunchChime();
    // 2-4. glow intensifies, emblems pull inward, veil closes (see variants)
    setEntering(true);
    // 5. hand off to the live League entry point
    window.setTimeout(
      () => navigate(LEAGUE_HOME_ROUTE, { replace: true }),
      prefersReducedMotion ? ENTRY_DURATION_REDUCED_MS : ENTRY_DURATION_MS,
    );
  }, [navigate, playLaunchChime, prefersReducedMotion]);

  // Enter / Space activation, carried over from the legacy screen including its
  // guards against hijacking modifier chords and typing in fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      handleEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleEnter]);

  /* ---------------------------------------------------------------------- */
  /* Pointer parallax                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (prefersReducedMotion) return;
    const onMove = (e: PointerEvent) => {
      setPointer({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [prefersReducedMotion]);

  /* ---------------------------------------------------------------------- */
  /* Derived motion values                                                  */
  /* ---------------------------------------------------------------------- */

  // Emblems are real content now, so they sit well above the old fragments'
  // opacity — but still below the centre so focus never leaves the mascot.
  const emblemOpacity = useMemo(() => {
    if (entering) return 0;
    return hovered ? 0.94 : 0.76;
  }, [entering, hovered]);

  const glowScale = entering ? 3.4 : hovered ? 1.18 : 1;
  const glowOpacity = entering ? 1 : hovered ? 0.95 : 0.65;

  const loop = prefersReducedMotion
    ? undefined
    : { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const };

  return (
    <main
      className="relative min-h-dvh w-full overflow-hidden bg-[#04070f] flex flex-col items-center justify-center px-4"
      data-testid="mogzy-entry-v2"
      data-entering={entering ? "true" : "false"}
    >
      <SEOHead
        title={ACADEMY_TITLE}
        description="Mogzy — League of Legends knowledge, ranked duels, and combat theorycrafting."
        noindex
      />

      {/* ---------------------------------------------------------------- */}
      {/* Layer 1 — the four Academy corner emblems                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-0">
        {ACADEMY_EMBLEMS.map((emblem) => {
          const dx = prefersReducedMotion ? 0 : pointer.x * PARALLAX_RANGE * emblem.depth;
          const dy = prefersReducedMotion ? 0 : pointer.y * PARALLAX_RANGE * emblem.depth;
          // On entry everything is drawn toward the centre of the screen.
          const pullX = entering ? (50 - emblem.x) * 2.6 : 0;
          const pullY = entering ? (50 - emblem.y) * 2.6 : 0;

          return (
            // Static wrapper carries the vertical centring transform: the four
            // emblems have different intrinsic heights, so anchoring by their
            // centre (rather than their top) is what keeps them balanced and
            // stops the bottom pair running off the screen edge.
            <div
              key={emblem.key}
              className="absolute -translate-y-1/2"
              style={{
                left: `${emblem.x}%`,
                top: `${emblem.y}%`,
                width: emblem.width,
                marginLeft: -emblem.width / 2,
              }}
            >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{
                opacity: emblemOpacity,
                x: dx + pullX,
                y: dy + pullY,
                scale: entering ? 0.62 : 1,
              }}
              transition={{
                opacity: { duration: entering ? 0.5 : 1.6, ease: "easeOut" },
                x: { type: "spring", stiffness: entering ? 90 : 40, damping: entering ? 18 : 24 },
                y: { type: "spring", stiffness: entering ? 90 : 40, damping: entering ? 18 : 24 },
                scale: { duration: 0.7, ease: "easeIn" },
              }}
            >
              {/* Slow independent breathing */}
              <motion.div
                animate={
                  prefersReducedMotion || entering ? undefined : { y: [0, -7, 0] }
                }
                transition={
                  prefersReducedMotion || entering
                    ? undefined
                    : {
                        duration: 9,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: emblem.idleDelay,
                      }
                }
              >
                {/* Emblem art already contains its gold label + divider, so no
                    second HTML label is rendered. Screen-blended because these
                    PNGs have no alpha; see AcademyEmblems.tsx. */}
                <img
                  src={emblem.src}
                  alt={emblem.label}
                  width={emblem.width}
                  draggable={false}
                  className="block w-full h-auto select-none"
                  style={{
                    mixBlendMode: "screen",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 66% 62% at 50% 46%, #000 58%, transparent 100%)",
                    maskImage:
                      "radial-gradient(ellipse 66% 62% at 50% 46%, #000 58%, transparent 100%)",
                    filter: hovered
                      ? "brightness(1.18) saturate(1.08)"
                      : "brightness(1) saturate(1)",
                    transition: "filter 400ms ease",
                  }}
                />
              </motion.div>
            </motion.div>
            </div>
          );
        })}
      </div>

      {/* Vignette — keeps the edges dark so the centre always wins */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 34%, rgba(2,4,10,0.30) 66%, rgba(2,4,10,0.72) 100%)",
        }}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Layer 2 — central glow                                            */}
      {/* ---------------------------------------------------------------- */}
      <motion.div
        className="pointer-events-none absolute rounded-full"
        aria-hidden="true"
        style={{
          width: 460,
          height: 460,
          background:
            "radial-gradient(circle, rgba(201,168,76,0.26) 0%, rgba(127,214,239,0.10) 45%, transparent 70%)",
          filter: "blur(52px)",
        }}
        animate={{
          scale: prefersReducedMotion || entering ? glowScale : [glowScale, glowScale * 1.1, glowScale],
          opacity: prefersReducedMotion || entering ? glowOpacity : [glowOpacity * 0.8, glowOpacity, glowOpacity * 0.8],
        }}
        transition={entering ? { duration: 0.7, ease: "easeIn" } : loop}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Layer 3 — Academy title, mascot, call to action                   */}
      {/* ---------------------------------------------------------------- */}
      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: entering ? 0 : 1, y: 0 }}
        transition={{ duration: entering ? 0.4 : 1.1, ease: "easeOut" }}
      >
        <TitleOrnamentTop />
        {/* Warm gold gradient clipped to the glyphs.
            Keep the text-shadow tight: a wide blur across Cinzel's dense
            letterforms merges between glyphs and reads as a lit rectangular
            slab behind the whole title block, not a glow.
            The line break is explicit so the title always sets in the two
            balanced lines the concept art uses; leaving it to natural wrapping
            gives an awkward three-line rag at desktop widths. */}
        <h1
          className="ranked-title mt-4 text-center text-[clamp(1.6rem,3.6vw,3rem)] font-medium leading-[1.2] tracking-[0.015em]"
          style={{
            backgroundImage: `linear-gradient(180deg, ${IVORY} 0%, ${GOLD_BRIGHT} 48%, ${GOLD} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 0 10px rgba(201,168,76,0.20), 0 2px 3px rgba(0,0,0,0.6)",
          }}
        >
          <span className="block text-balance">Mogzy’s Academy of</span>
          <span className="block text-balance">Leaguecraft and Technology</span>
        </h1>
        <div className="mt-3">
          <TitleOrnamentBottom />
        </div>
      </motion.div>

      <motion.button
        type="button"
        onClick={handleEnter}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{
          opacity: 1,
          scale: entering ? 1.14 : 1,
        }}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
        transition={{ duration: entering ? 0.7 : 0.8, ease: "easeOut" }}
        className="relative z-10 mt-7 flex flex-col items-center gap-5 rounded-2xl px-8 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c]/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#04070f]"
        aria-label="Enter Mogzy"
      >
        <motion.div
          animate={prefersReducedMotion || entering ? undefined : { y: [0, -8, 0] }}
          transition={
            prefersReducedMotion || entering
              ? undefined
              : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }
          }
        >
          {/* The mascot PNG has no alpha channel (colorType 2) — its black
              backdrop is baked in. Rather than touch the source artwork, we
              screen-blend it against the near-black page so the black drops
              out, and feather the edges with a radial mask. A drop-shadow is
              deliberately NOT used here: on an opaque image it would trace a
              rectangular halo. The glow comes from layer 2 behind instead. */}
          <MogzyMascot
            pose="base"
            decorative
            loading="eager"
            className="h-36 sm:h-40 md:h-44 w-auto"
            style={{
              mixBlendMode: "screen",
              WebkitMaskImage:
                "radial-gradient(ellipse 62% 58% at 50% 50%, #000 62%, transparent 100%)",
              maskImage:
                "radial-gradient(ellipse 62% 58% at 50% 50%, #000 62%, transparent 100%)",
              filter: hovered
                ? "brightness(1.16) saturate(1.12)"
                : "brightness(1) saturate(1)",
              transition: "filter 400ms ease",
            }}
          />
        </motion.div>

        <div className="flex flex-col items-center gap-2">
          <motion.span
            className="ranked-title text-xl sm:text-2xl md:text-[1.75rem] font-semibold uppercase tracking-[0.16em]"
            animate={{
              textShadow: hovered
                ? "0 0 26px rgba(201,168,76,0.5), 0 1px 0 rgba(2,6,16,0.8)"
                : "0 0 16px rgba(201,168,76,0.22), 0 1px 0 rgba(2,6,16,0.8)",
            }}
            transition={{ duration: 0.4 }}
          >
            Enter Mogzy
          </motion.span>
          {/* Hairline rule, widening on hover — the "door" opening */}
          <motion.span
            className="block h-px bg-gradient-to-r from-transparent via-[#f0d78c] to-transparent"
            animate={{ width: hovered ? 208 : 132, opacity: hovered ? 0.9 : 0.5 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>
      </motion.button>

      {/* Interaction hint — the legacy line, kept verbatim */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: entering ? 0 : 1 }}
        transition={{ delay: entering ? 0 : 1.1, duration: entering ? 0.3 : 0.9 }}
        className="relative z-10 mt-7 text-[11px] uppercase tracking-[0.4em] text-[#7fd6ef]/55"
      >
        tap to enter
      </motion.p>

      {/* Entry veil — the brief flash toward the product */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-50"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(240,215,140,0.95) 0%, rgba(127,214,239,0.5) 35%, rgba(4,7,15,1) 78%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: entering ? 1 : 0 }}
        transition={{
          duration: prefersReducedMotion ? 0.18 : 0.62,
          ease: "easeIn",
          delay: entering && !prefersReducedMotion ? 0.16 : 0,
        }}
      />
    </main>
  );
}
