import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

import SEOHead from "@/components/SEOHead";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

import { ACADEMY_EMBLEMS, EMBLEM_LAYOUT, PARALLAX_RANGE } from "./AcademyEmblems";
import { useLaunchChime } from "./useLaunchChime";
import { useViewportTier } from "./useViewportTier";

/**
 * Mogzy entrance — Academy edition.
 *
 * A full-screen, layout-free entry: dark, centre-dominant, with the legacy
 * launch chime. Four decorative Academy emblems frame a centred mascot and the
 * single "Enter Mogzy" control.
 *
 * The composition is fixed to the viewport and never scrolls. Desktop keeps the
 * accepted four-corner arrangement; narrower tiers re-place the emblems rather
 * than scaling the desktop layout down (see EMBLEM_LAYOUT).
 *
 * The emblems are decorative only — never buttons or links.
 */

const ACADEMY_TITLE = "Mogzy’s Academy of Leaguecraft and Technology";

/**
 * Canonical root metadata. Kept in step with index.html, which is the source
 * of truth for the homepage title/description (see site-config.ts for the
 * list of files to update on a domain change). https://mogzy.lol/ is listed
 * in the sitemap, so the root render must be indexable — unlike the dev
 * preview, which is noindex.
 */
const ROOT_SEO_TITLE = "Mogzy — League of Legends Quiz & Game Knowledge";
const ROOT_SEO_DESCRIPTION =
  "Test your League of Legends knowledge on Mogzy: LoL quiz, item builds, champion abilities and cooldowns, esports trivia, and game knowledge challenges.";

export interface MogzyEntryV2Props {
  /**
   * Which metadata to emit. "dev" (default) is the noindex preview at
   * /dev/mogzy-entry-v2; "root" is the production homepage at /.
   * Purely a metadata switch — the rendered screen is identical.
   */
  seo?: "dev" | "root";
}

/** Chime (~400ms) overlaps the transition; navigate as the veil peaks. */
const ENTRY_DURATION_MS = 780;
const ENTRY_DURATION_REDUCED_MS = 220;

const GOLD = "#c9a84c";
const GOLD_BRIGHT = "#f0d78c";
const IVORY = "#f0e6d2";

/** Four-point star + rule, echoing the ornament above the concept title. */
function TitleOrnamentTop({ width }: { width: number }) {
  return (
    <svg width={width} height="18" viewBox="0 0 120 18" fill="none" aria-hidden="true">
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
function TitleOrnamentBottom({ width }: { width: number }) {
  return (
    <svg width={width} height="12" viewBox="0 0 300 12" fill="none" aria-hidden="true">
      <path d="M150 1.5 L154.5 6 L150 10.5 L145.5 6 Z" fill={GOLD_BRIGHT} opacity="0.85" />
      <path d="M10 6 H141" stroke={GOLD} strokeWidth="1" opacity="0.45" />
      <path d="M159 6 H290" stroke={GOLD} strokeWidth="1" opacity="0.45" />
      <circle cx="6" cy="6" r="1.6" fill={GOLD} opacity="0.5" />
      <circle cx="294" cy="6" r="1.6" fill={GOLD} opacity="0.5" />
    </svg>
  );
}

export default function MogzyEntryV2({ seo = "dev" }: MogzyEntryV2Props = {}) {
  const navigate = useNavigate();
  const playLaunchChime = useLaunchChime();
  const prefersReducedMotion = useReducedMotion();
  const tier = useViewportTier();

  const [entering, setEntering] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const enteringRef = useRef(false);

  const isPhone = tier === "phone" || tier === "phone-landscape";
  const isLandscapePhone = tier === "phone-landscape";

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
  /* Pointer parallax — pointer-driven, so it is off on touch tiers          */
  /* ---------------------------------------------------------------------- */

  const parallaxRange = PARALLAX_RANGE[tier];

  useEffect(() => {
    if (prefersReducedMotion || parallaxRange === 0) return;
    const onMove = (e: PointerEvent) => {
      setPointer({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [prefersReducedMotion, parallaxRange]);

  /* ---------------------------------------------------------------------- */
  /* Derived motion values                                                  */
  /* ---------------------------------------------------------------------- */

  // Emblems are real content, so they sit well above atmospheric opacity —
  // but still below the centre so focus never leaves the mascot.
  const emblemOpacity = useMemo(() => {
    if (entering) return 0;
    return hovered ? 0.94 : 0.76;
  }, [entering, hovered]);

  const glowScale = entering ? 3.4 : hovered ? 1.18 : 1;
  const glowOpacity = entering ? 1 : hovered ? 0.95 : 0.65;

  const loop = prefersReducedMotion
    ? undefined
    : { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const };

  const glowSize = isLandscapePhone ? 300 : isPhone ? 340 : 460;

  const titleBlock = (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: entering ? 0 : 1, y: 0 }}
      transition={{ duration: entering ? 0.4 : 1.1, ease: "easeOut" }}
    >
      <TitleOrnamentTop width={isPhone ? 84 : 120} />
      {/* Warm gold gradient clipped to the glyphs.
          Keep the text-shadow tight: a wide blur across Cinzel's dense
          letterforms merges between glyphs and reads as a lit rectangular
          slab behind the whole title block, not a glow.
          The line break is explicit so the title always sets in two balanced
          lines; natural wrapping gives an awkward three-line rag. */}
      <h1
        className={[
          "ranked-title text-center font-medium leading-[1.2] tracking-[0.015em]",
          isPhone ? "mt-2" : "mt-4",
          isLandscapePhone
            ? "text-[clamp(0.95rem,2.1vw,1.3rem)]"
            : isPhone
              ? "text-[clamp(1.05rem,5.2vw,1.6rem)]"
              : "text-[clamp(1.6rem,3.6vw,3rem)]",
        ].join(" ")}
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
      <div className={isPhone ? "mt-1.5" : "mt-3"}>
        <TitleOrnamentBottom width={isPhone ? 210 : 300} />
      </div>
    </motion.div>
  );

  return (
    <main
      className="relative h-[100dvh] w-full overflow-hidden bg-[#04070f]"
      data-testid="mogzy-entry-v2"
      data-entering={entering ? "true" : "false"}
      data-tier={tier}
      style={{
        // Respect device safe areas (notches, home indicator, punch-holes).
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {seo === "root" ? (
        <SEOHead title={ROOT_SEO_TITLE} description={ROOT_SEO_DESCRIPTION} path="/" />
      ) : (
        <SEOHead
          title={ACADEMY_TITLE}
          description="Mogzy — League of Legends knowledge, ranked duels, and combat theorycrafting."
          noindex
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Layer 1 — the four Academy emblems (decorative)                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-0">
        {ACADEMY_EMBLEMS.map((emblem) => {
          const place = EMBLEM_LAYOUT[tier][emblem.key];
          const dx = parallaxRange === 0 ? 0 : pointer.x * parallaxRange * emblem.depth;
          const dy = parallaxRange === 0 ? 0 : pointer.y * parallaxRange * emblem.depth;
          // On entry everything is drawn toward the centre of the screen.
          const pullX = entering ? (50 - place.x) * 2.6 : 0;
          const pullY = entering ? (50 - place.y) * 2.6 : 0;

          return (
            // Static wrapper carries the vertical centring transform: the four
            // emblems have different intrinsic heights, so anchoring by their
            // centre (rather than their top) is what keeps them balanced and
            // stops the bottom pair running off the screen edge.
            <div
              key={emblem.key}
              className="absolute -translate-y-1/2"
              style={{
                left: `${place.x}%`,
                top: `${place.y}%`,
                width: place.width,
                marginLeft: -place.width / 2,
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
                  animate={prefersReducedMotion || entering ? undefined : { y: [0, -7, 0] }}
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
                  {/* Emblem art already contains its gold label + divider, so
                      no second HTML label is rendered. Screen-blended because
                      these PNGs have no alpha; see AcademyEmblems.tsx. */}
                  <img
                    src={emblem.src}
                    alt={emblem.label}
                    width={place.width}
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
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
        aria-hidden="true"
        style={{
          width: glowSize,
          height: glowSize,
          marginLeft: -glowSize / 2,
          marginTop: -glowSize / 2,
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
      {/* Layer 3 — title, mascot, call to action                           */}
      {/* ---------------------------------------------------------------- */}
      {/* On phones the title is parked at the top and the mascot/CTA stay
          optically centred, so the emblem bands above and below never collide
          with the centre column. Wider tiers keep the accepted single centred
          stack. */}
      {isPhone && (
        <div
          className="absolute inset-x-0 z-10 flex justify-center px-4"
          style={{ top: isLandscapePhone ? "3%" : "5%" }}
        >
          {titleBlock}
        </div>
      )}

      {/* On portrait phones the title sits above the upper emblem band, so the
          mascot/CTA column is nudged down to sit optically between the two
          emblem rows instead of dead-centre (which would clip the upper band). */}
      <div
        className={[
          "relative z-10 flex h-full w-full flex-col items-center justify-center px-4",
          tier === "phone" ? "pt-[9vh]" : "",
        ].join(" ")}
      >
        {!isPhone && titleBlock}

        <motion.button
          type="button"
          onClick={handleEnter}
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          initial={{ opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: entering ? 1.14 : 1 }}
          whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
          transition={{ duration: entering ? 0.7 : 0.8, ease: "easeOut" }}
          className={[
            "relative z-10 flex flex-col items-center rounded-2xl focus:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[#f0d78c]/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#04070f]",
            isLandscapePhone ? "mt-0 gap-3 px-6 py-2" : isPhone ? "mt-0 gap-4 px-8 py-3" : "mt-7 gap-5 px-8 py-4",
          ].join(" ")}
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
            {/* The mascot artwork has a real alpha channel, so it needs no
                blend mode, mask, or local backdrop — it composites directly
                over the page. drop-shadow follows the transparent silhouette,
                giving the glow its actual shape. */}
            <MogzyMascot
              pose="base"
              decorative
              loading="eager"
              className={
                isLandscapePhone
                  ? "h-24 w-auto"
                  : isPhone
                    ? "h-28 w-auto"
                    : "h-36 sm:h-40 md:h-44 w-auto"
              }
              style={{
                filter: hovered
                  ? "drop-shadow(0 0 34px rgba(201,168,76,0.55))"
                  : "drop-shadow(0 0 22px rgba(201,168,76,0.32))",
                transition: "filter 400ms ease",
              }}
            />
          </motion.div>

          <div className="flex flex-col items-center gap-2">
            <motion.span
              className={[
                "ranked-title font-semibold uppercase tracking-[0.16em]",
                isLandscapePhone ? "text-base" : isPhone ? "text-lg" : "text-xl sm:text-2xl md:text-[1.75rem]",
              ].join(" ")}
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
              animate={{
                width: hovered ? (isPhone ? 168 : 208) : isPhone ? 118 : 132,
                opacity: hovered ? 0.9 : 0.5,
              }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>
        </motion.button>

        {/* Interaction hint — the legacy line, kept verbatim */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: entering ? 0 : 1 }}
          transition={{ delay: entering ? 0 : 1.1, duration: entering ? 0.3 : 0.9 }}
          className={[
            "relative z-10 text-[11px] uppercase tracking-[0.4em] text-[#7fd6ef]/55",
            isLandscapePhone ? "mt-3" : isPhone ? "mt-5" : "mt-7",
          ].join(" ")}
        >
          tap to enter
        </motion.p>
      </div>

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
