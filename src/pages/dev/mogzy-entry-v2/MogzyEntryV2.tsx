import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

import SEOHead from "@/components/SEOHead";
import { startEntryMusic } from "@/components/audio/EntryMusicController";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

import AcademyFacade from "./AcademyFacade";
import {
  DOOR_ASPECT,
  DOOR_BOARD,
  DOOR_RISE,
  DOOR_WIDTH,
  PARALLAX_RANGE,
  PARAPET_ABOVE_TITLE,
  PLAQUE_GAP,
  SKY_PARALLAX_DEPTH,
  doorWidthFor,
} from "./AcademyScene";
import { useLaunchChime } from "./useLaunchChime";
import { useViewportTier } from "./useViewportTier";

/**
 * Mogzy entrance — Academy edition.
 *
 * A full-screen, layout-free entry: dark, centre-dominant, with the legacy
 * launch chime. The visitor is standing directly in front of the Academy's main
 * door, close enough that the building runs off every edge of the frame: the
 * title is carved into the wall, the door is cut through the wall beneath it,
 * and Mogzy waits on the threshold to show them in.
 *
 * The composition is fixed to the viewport and never scrolls. Because the
 * masonry has to line up with content flexbox positions at runtime, this
 * component measures the title block and the mascot and hands AcademyFacade the
 * two anchors it needs — the wall's top edge and the door's position. Nothing
 * about the building is guessed from the viewport alone.
 *
 * The façade is decorative throughout — never buttons or links. The single
 * interactive target is the central "Enter Mogzy" control.
 */

/** Never let the wall swallow the frame entirely; keep a sliver of sky. */
const MIN_SKY = 8;

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
const GOLD_DIM = "#8f7738";

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

  /* ---------------------------------------------------------------------- */
  /* Façade anchors                                                         */
  /* ---------------------------------------------------------------------- */

  const titleRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  // Sensible pre-measurement values so the very first paint is already a
  // plausible façade rather than a wall covering the whole screen.
  const [anchors, setAnchors] = useState({
    parapetY: 140,
    doorCx: 0,
    doorTop: 340,
    doorWidth: 320,
    groundY: 840,
    mascotCy: 440,
  });

  // Layout effect, not effect: this runs before paint, so the wall is never
  // seen in the wrong place. Re-measured on resize and — importantly — once
  // the display face has loaded, because Cinzel is heavier than the fallback
  // and swapping it in moves the whole centre column.
  useLayoutEffect(() => {
    const measure = () => {
      const title = titleRef.current?.getBoundingClientRect();
      const mascot = mascotRef.current?.getBoundingClientRect();
      if (!title || !mascot) return;

      const doorWidth = doorWidthFor(DOOR_WIDTH[tier], window.innerWidth);
      const doorTop = mascot.top - DOOR_RISE[tier];
      // The wall's base is the door's own threshold, so the building lands on
      // one line instead of the door floating on a wall of its own.
      const groundY =
        doorTop + doorWidth * DOOR_ASPECT * (DOOR_BOARD.threshold / DOOR_BOARD.height);

      setAnchors({
        parapetY: Math.max(MIN_SKY, title.top - PARAPET_ABOVE_TITLE[tier]),
        doorCx: mascot.left + mascot.width / 2,
        doorTop,
        doorWidth,
        groundY,
        mascotCy: mascot.top + mascot.height / 2,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (titleRef.current) observer.observe(titleRef.current);
    if (mascotRef.current) observer.observe(mascotRef.current);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure).catch(() => undefined);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tier]);

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
    // 1b. this click is the gesture the autoplay policy wants, so it is also
    //     where the entry music is allowed to start. Fire and forget: it never
    //     throws or rejects, and nothing below is allowed to wait on it — a
    //     blocked or missing track must leave the entrance exactly as it was.
    void startEntryMusic();
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

  // The façade is the room the visitor is standing in, so unlike the old
  // decorative emblems it stays at full strength — it is dark by construction,
  // not by opacity. It only fades once they commit to entering.
  const facadeOpacity = entering ? 0 : 1;

  // Only the sky is far enough away to move with the pointer; the wall is at
  // arm's length and stays put.
  const skyDrift = useMemo(
    () =>
      parallaxRange === 0
        ? { x: 0, y: 0 }
        : {
            x: pointer.x * parallaxRange * SKY_PARALLAX_DEPTH,
            y: pointer.y * parallaxRange * SKY_PARALLAX_DEPTH * 0.35,
          },
    [parallaxRange, pointer.x, pointer.y],
  );

  const glowScale = entering ? 3.4 : hovered ? 1.18 : 1;
  const glowOpacity = entering ? 1 : hovered ? 0.95 : 0.65;

  const loop = prefersReducedMotion
    ? undefined
    : { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const };

  const glowSize = isLandscapePhone ? 300 : isPhone ? 340 : 460;

  const titleBlock = (
    // No panel. The title is an inscription in the dark, held only by its own
    // ornaments and the faintest wash of light behind it — a boxed plaque made
    // the building read as a rendered façade and put a bright rectangle above
    // the mascot. The wrapper is what gets measured for the roofline, so it
    // must stay a plain box: no transform, no animated offset.
    <div
      ref={titleRef}
      className={[
        "relative flex flex-col items-center",
        isLandscapePhone ? "px-5 py-1.5" : isPhone ? "px-1 py-2" : "px-10 py-4",
      ].join(" ")}
      style={{
        background:
          "radial-gradient(70% 130% at 50% 45%, rgba(240,215,140,0.030) 0%, rgba(240,215,140,0.008) 45%, transparent 78%)",
      }}
    >
      <motion.div
        className="flex flex-col items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: entering ? 0 : 1 }}
        transition={{ duration: entering ? 0.4 : 1.1, ease: "easeOut" }}
      >
      {/* Landscape phones drop the ornaments: they cost ~50px of plaque
          height, and on a 360-390px-tall screen that is exactly the stone the
          door's arch needs to stand in below the sign. The inscription alone
          still reads as engraved. */}
      {!isLandscapePhone && <TitleOrnamentTop width={isPhone ? 84 : 120} />}
      {/* Warm gold gradient clipped to the glyphs.
          Keep the text-shadow tight: a wide blur across Cinzel's dense
          letterforms merges between glyphs and reads as a lit rectangular
          slab behind the whole title block, not a glow.
          The line break is explicit so the title always sets in two balanced
          lines; natural wrapping gives an awkward three-line rag. */}
      <h1
        className={[
          "ranked-title text-center font-medium leading-[1.2] tracking-[0.015em]",
          isLandscapePhone ? "mt-0" : isPhone ? "mt-2" : "mt-4",
          isLandscapePhone
            ? "text-[clamp(0.95rem,2.1vw,1.3rem)]"
            : isPhone
              ? // Trimmed from 5.2vw: the plaque's frame costs width, and at
                // 5.2vw the second line wraps onto a third at 390px.
                "text-[clamp(1rem,4.7vw,1.5rem)]"
              : "text-[clamp(1.6rem,3.6vw,3rem)]",
        ].join(" ")}
        // Dimmer than the call to action on purpose. The focal order is Mogzy,
        // then the doorway, then "Enter Mogzy" — the academy's name is the
        // last thing the eye should land on, so the gradient starts at gold
        // rather than ivory and carries no glow.
        style={{
          backgroundImage: `linear-gradient(
            180deg,
            #fff3cf 0%,
            ${GOLD_BRIGHT} 38%,
            ${GOLD} 72%,
            ${GOLD_DIM} 100%
          )`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          opacity: 1,
          textShadow:
            "0 1px 0 rgba(255,245,210,0.12), 0 2px 4px rgba(0,0,0,0.68)",
        }}
      >
        <span className="block text-balance">Mogzy’s Academy of</span>
        <span className="block text-balance">Leaguecraft and Technology</span>
      </h1>
      {!isLandscapePhone && (
        <div className={isPhone ? "mt-1.5" : "mt-3"}>
          <TitleOrnamentBottom width={isPhone ? 210 : 300} />
        </div>
      )}
      </motion.div>
    </div>
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
      {/* Layer 1 — the Academy façade (decorative)                         */}
      {/* ---------------------------------------------------------------- */}
      {/* No parallax and no hover scale on this layer: the wall is an arm's
          length away and it has a door cut in it that has to stay put under
          the mascot. Only the sky behind it drifts, below. Entering walks the
          visitor through the door, so the building grows past the frame. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{
          opacity: facadeOpacity,
          scale: entering ? 1.16 : 1,
        }}
        transition={{
          opacity: { duration: entering ? 0.45 : 1.4, ease: "easeOut" },
          scale: { duration: 0.75, ease: "easeIn" },
        }}
        style={{ transformOrigin: `${anchors.doorCx}px ${anchors.mascotCy}px` }}
      >
        <AcademyFacade
          tier={tier}
          parapetY={anchors.parapetY}
          doorCx={anchors.doorCx}
          doorTop={anchors.doorTop}
          doorWidth={anchors.doorWidth}
          groundY={anchors.groundY}
          lit={hovered}
          entering={entering}
          still={Boolean(prefersReducedMotion)}
          skyDrift={skyDrift}
        />
      </motion.div>

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
      {/* Layer 2 — light spilling out of the doorway                       */}
      {/* ---------------------------------------------------------------- */}
      {/* Anchored to the door, not the viewport centre: the light has to look
          like it is coming out of the opening. A screen-centred glow on a flat
          wall just reads as a smudge. */}
      <motion.div
        className="pointer-events-none absolute rounded-full"
        aria-hidden="true"
        style={{
          left: anchors.doorCx,
          top: anchors.mascotCy,
          width: glowSize,
          height: glowSize,
          marginLeft: -glowSize / 2,
          marginTop: -glowSize / 2,
          background:
            "radial-gradient(circle, rgba(201,168,76,0.24) 0%, rgba(127,214,239,0.09) 45%, transparent 70%)",
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
      {/* On phones the title is parked near the top and the mascot/CTA stay
          optically centred below it. It is parked low enough to leave a band of
          sky and roofline above it — the plaque has to read as mounted on the
          wall, which means there has to be some wall-top above it. Wider tiers
          keep the accepted single centred stack. */}
      {isPhone && (
        <div
          className="absolute inset-x-0 z-10 flex justify-center px-4"
          // Landscape phones are only ~390px tall: sky, parapet, plaque, arch,
          // mascot, CTA and hint do not all fit. That tier gets the tightest
          // crop — the plaque goes right to the top edge and the roofline is
          // understood to be above the frame.
          style={{ top: isLandscapePhone ? "2%" : "12%" }}
        >
          {titleBlock}
        </div>
      )}

      {/* On portrait phones the title is parked at the top, so the mascot/CTA
          column is nudged down a little to sit optically centred in what is
          left rather than dead-centre of the whole screen. */}
      <div
        className={[
          "relative z-10 flex h-full w-full flex-col items-center justify-center px-4",
          // Phones park the plaque at the top, so the entrance column is nudged
          // down to sit optically centred in the wall below it — and far enough
          // down that the door's arch has wall to stand in rather than pushing
          // up behind the plaque.
          tier === "phone" ? "pt-[13vh]" : "",
          isLandscapePhone ? "pt-[14vh]" : "",
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={[
            "relative z-10 flex flex-col items-center rounded-2xl focus:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[#f0d78c]/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#04070f]",
            isLandscapePhone ? "gap-3 px-6 py-2" : isPhone ? "gap-4 px-8 py-3" : "gap-5 px-8 py-4",
          ].join(" ")}
          // The wall the door's arch stands in; see AcademyScene.PLAQUE_GAP.
          // On phones the plaque is parked absolutely, so this is the only
          // thing separating them.
          style={{ marginTop: isPhone ? 0 : PLAQUE_GAP[tier] }}
          aria-label="Enter Mogzy"
        >
          {/* This wrapper is the door's anchor, so it must not move: the door
              is cut into a wall that does not scale, and a control that grew
              on hover would slide Mogzy off the threshold. The hover and press
              feedback lives in the mascot and the light inside the doorway
              instead — see facadeOpacity and MogzyMascot's filter below. */}
          <div ref={mascotRef} className="relative flex items-center justify-center">
            <motion.div
              className="relative"
              animate={
                entering
                  ? { scale: 1.18, y: -6 }
                  : prefersReducedMotion
                    ? { scale: hovered ? 1.05 : 1 }
                    : { scale: hovered ? 1.05 : 1, y: [0, -8, 0] }
              }
              transition={
                entering
                  ? { duration: 0.7, ease: "easeIn" }
                  : {
                      scale: { duration: 0.4, ease: "easeOut" },
                      y: prefersReducedMotion
                        ? { duration: 0 }
                        : { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
                    }
              }
            >
              {/* The mascot artwork has a real alpha channel, so it needs no
                  blend mode, mask, or local backdrop — it composites directly
                  over the page. drop-shadow follows the transparent
                  silhouette, giving the glow its actual shape. */}
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
          </div>

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
