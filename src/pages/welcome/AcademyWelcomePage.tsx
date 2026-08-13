import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

import SEOHead from "@/components/SEOHead";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";
import { markAcademyWelcomeHandled } from "@/lib/welcome/academy-welcome";
import { useViewportTier, type ViewportTier } from "@/pages/dev/mogzy-entry-v2/useViewportTier";
import academyLibraryDesktop from "@/academy/hub/academy-library-desktop.png";

import AcademyModeCard from "./AcademyModeCard";
import { ACADEMY_MODES } from "./academyModes";

/**
 * The Academy introduction (HI1) — the room immediately behind the Mogzy door.
 *
 * A real route rather than an overlay on /lol. The introduction is substantial
 * enough to be its own product state: it owns the whole viewport, it is
 * directly navigable and replayable, and it never obstructs the hub.
 *
 * Three stages, forward-only by explicit control:
 *   0 — who Mogzy is for
 *   1 — what is inside
 *   2 — how to begin
 *
 * Browser Back deliberately leaves the route rather than stepping back through
 * the stages. The stages are component state, not history entries; pushing three
 * entries per visit would make Back feel broken from the hub, and intercepting
 * Back to fake it is exactly the surprising navigation this should avoid. The
 * explicit Back control moves within the experience.
 *
 * Reachable at any time, including after completion — that is what makes it
 * usable later as Getting Started / Help / QA / demo material.
 */

const STAGE_COUNT = 3;

export default function AcademyWelcomePage() {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const tier = useViewportTier();
  const [stage, setStage] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Skip the focus move on first paint: stealing focus on arrival is its own
  // small hostility, and the heading is already the first thing in the document.
  const mounted = useRef(false);

  const isLandscapePhone = tier === "phone-landscape";

  // The whole content region swaps between stages, so move focus to the new
  // heading — otherwise a keyboard or screen-reader user is left pointing at a
  // button that no longer exists and hears nothing about the change.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [stage]);

  const finish = useCallback(
    (outcome: "explored" | "tutorial") => {
      markAcademyWelcomeHandled(outcome);
      // replace: once a choice is made the introduction is behind them — it
      // should not sit one Back press away from wherever they just landed.
      navigate(outcome === "tutorial" ? RANKED_TUTORIAL_ROUTE : LEAGUE_HOME_ROUTE, {
        replace: true,
      });
    },
    [navigate],
  );

  const startExploring = useCallback(() => finish("explored"), [finish]);
  const startTutorial = useCallback(() => finish("tutorial"), [finish]);

  // Enter-only, and deliberately NOT wrapped in AnimatePresence.
  //
  // The obvious construction here is <AnimatePresence mode="wait"> so the old
  // stage fades out before the new one fades in. It deadlocks: mode="wait"
  // holds the incoming child until the outgoing child's exit transition
  // reports completion, and if the key changes again while that exit is still
  // running — a visitor double-tapping Continue, or a resize landing mid
  // transition — the exit never completes and the new stage never mounts. The
  // result is a live page with correct state and an empty content area, which
  // is exactly the kind of dead end an introduction must never produce.
  //
  // Keying the element by stage is enough: React remounts it, so initial →
  // animate replays on every change and the transition can never strand.
  const motionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <main
      data-testid="academy-welcome"
      data-stage={stage}
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#04070f]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <SEOHead
        title="Welcome to Mogzy's Academy"
        description="A short introduction to Mogzy — League of Legends quizzes, ranked duels, combat simulation, and game knowledge."
        noindex
      />

      {/* ---------------------------------------------------------------- */}
      {/* Ground — the library the visitor is about to walk into.           */}
      {/* ---------------------------------------------------------------- */}
      {/* Desktop reuses the hub's own background, so the introduction and the
          room behind it are literally the same place — and the image is already
          warm in cache by the time /lol renders. Phones get a painted ground
          instead: the mobile plate is ~1.9 MB, which is not a reasonable cost
          on a first visit for something sitting at 18% opacity behind text. */}
      <img
        src={academyLibraryDesktop}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-[0.18] md:block"
        style={{ objectPosition: "center 62%" }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(78% 55% at 50% 34%, rgba(201,168,76,0.13) 0%, rgba(127,214,239,0.05) 42%, transparent 74%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 38%, rgba(2,4,10,0.45) 72%, rgba(2,4,10,0.85) 100%)",
        }}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Content                                                           */}
      {/* ---------------------------------------------------------------- */}
      {/* Normal document flow with min-h rather than a fixed h-screen box:
          this is what keeps a 360px-tall landscape phone scrollable instead of
          clipping its controls, which is exactly how the old popup failed. */}
      <div
        className={[
          "relative z-10 flex flex-1 flex-col px-5 sm:px-6 md:px-8",
          isLandscapePhone ? "py-3" : "py-6",
        ].join(" ")}
      >
        <motion.div
          key={stage}
          {...motionProps}
          className="flex flex-1 flex-col items-center justify-center"
        >
          {stage === 0 && <WelcomeStage headingRef={headingRef} tier={tier} />}
          {stage === 1 && <ModesStage headingRef={headingRef} />}
          {stage === 2 && (
            <ChoiceStage
              headingRef={headingRef}
              onExplore={startExploring}
              onTutorial={startTutorial}
            />
          )}
        </motion.div>

        {/* Primary continuation sits directly under the content it belongs to,
            above the quieter navigation rail — so the eye lands on the one
            thing to do next, not on the progress dots. */}
        {stage < STAGE_COUNT - 1 && (
          <div
            className={[
              "mx-auto flex w-full max-w-5xl shrink-0 justify-center",
              isLandscapePhone ? "mt-3" : "mt-7",
            ].join(" ")}
          >
            <PrimaryButton onClick={() => setStage((s) => s + 1)} testId="academy-welcome-continue">
              Continue
            </PrimaryButton>
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Footer rail — progress, back, and the low-key exit             */}
        {/* -------------------------------------------------------------- */}
        <div
          className={[
            "mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-4",
            isLandscapePhone ? "mt-2" : "mt-6",
          ].join(" ")}
        >
          <div className="flex-1">
            {stage > 0 && (
              <button
                type="button"
                onClick={() => setStage((s) => s - 1)}
                className="rounded-md px-2 py-2 text-xs font-medium text-[#cfc4a5]/60 transition-colors hover:text-[#f0d78c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c]/70"
              >
                Back
              </button>
            )}
          </div>

          <StageProgress stage={stage} />

          <div className="flex flex-1 justify-end">
            {/* Only while there is still an introduction to skip. On the final
                stage the two real choices ARE the exit, and a third control
                beside them would just muddy the decision. */}
            {stage < STAGE_COUNT - 1 && (
              <button
                type="button"
                onClick={startExploring}
                data-testid="academy-welcome-skip"
                className="rounded-md px-2 py-2 text-xs font-medium text-[#cfc4a5]/60 transition-colors hover:text-[#f0d78c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c]/70"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Stages                                                                     */
/* -------------------------------------------------------------------------- */

type HeadingRef = React.RefObject<HTMLHeadingElement>;

function StageHeading({
  headingRef,
  children,
  className = "",
}: {
  headingRef: HeadingRef;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      ref={headingRef}
      // Focus target for the stage change. Not in the tab order — tabIndex -1
      // makes it programmatically focusable only.
      tabIndex={-1}
      className={[
        "ranked-title text-balance text-center leading-[1.15] text-transparent",
        "focus:outline-none",
        className,
      ].join(" ")}
      style={{
        backgroundImage:
          "linear-gradient(180deg, #fff3cf 0%, #f0d78c 38%, #c9a84c 72%, #8f7738 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        textShadow: "0 2px 5px rgba(0,0,0,0.6)",
      }}
    >
      {children}
    </h1>
  );
}

function WelcomeStage({
  headingRef,
  tier,
}: {
  headingRef: HeadingRef;
  tier: ViewportTier;
}) {
  // A landscape phone is ~360px tall: the portrait composition would push the
  // Continue button under the fold. That tier gets a much smaller mascot and
  // tighter rhythm so the whole stage still fits without scrolling — the exact
  // failure mode the old popup had, where its only escape control ended up
  // off-screen.
  const isLandscapePhone = tier === "phone-landscape";
  const isPhone = tier === "phone" || isLandscapePhone;

  return (
    <div className="flex max-w-2xl flex-col items-center">
      {/* Mogzy carried the visitor through the door; he introduces the room —
          the same pose they just saw on the threshold, which is the point.
          Decorative: the heading and body already say everything he does.

          `base` is not a stylistic preference. It is the ONLY mascot asset with
          a real alpha channel — every reaction pose (holdingBook, explaining,
          cheering, …) is stored as RGB on solid black, so on this lit ground
          they render as a black rectangle. See the same note in MogzyEntryV2. */}
      <MogzyMascot
        pose="base"
        decorative
        loading="eager"
        className={
          isLandscapePhone ? "h-16 w-auto" : isPhone ? "h-28 w-auto" : "h-44 w-auto sm:h-52"
        }
        style={{ filter: "drop-shadow(0 0 34px rgba(201,168,76,0.4))" }}
      />

      <StageHeading
        headingRef={headingRef}
        className={
          isLandscapePhone
            ? "mt-3 text-[clamp(1.2rem,3.4vw,1.7rem)]"
            : "mt-5 text-[clamp(1.6rem,5vw,3rem)]"
        }
      >
        Welcome to the Academy
      </StageHeading>

      <p
        className={[
          "text-balance text-center leading-relaxed text-[#cfc4a5]/85",
          isLandscapePhone ? "mt-2.5 text-[13px]" : "mt-5 text-[15px] sm:text-lg",
        ].join(" ")}
      >
        Learn the systems behind League. Test what you already know. Dig into the
        numbers behind every fight.
      </p>
    </div>
  );
}

function ModesStage({ headingRef }: { headingRef: HeadingRef }) {
  return (
    <div className="flex w-full max-w-5xl flex-col items-center">
      <StageHeading headingRef={headingRef} className="text-[clamp(1.4rem,4vw,2.4rem)]">
        What&rsquo;s inside
      </StageHeading>

      {/* Two columns on a portrait phone rather than one: four single-file cards
          turn the stage into a scroll, and the plates stay legible at half width.
          Four columns from `sm` up — NOT `lg`. A landscape phone is 740×360, so
          an lg breakpoint would leave it on two columns and each 7:8 plate would
          be taller than the whole viewport. */}
      <div className="mt-6 grid w-full grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 sm:gap-x-6">
        {ACADEMY_MODES.map((mode) => (
          <AcademyModeCard key={mode.id} mode={mode} />
        ))}
      </div>
    </div>
  );
}

function ChoiceStage({
  headingRef,
  onExplore,
  onTutorial,
}: {
  headingRef: HeadingRef;
  onExplore: () => void;
  onTutorial: () => void;
}) {
  return (
    <div className="flex w-full max-w-xl flex-col items-center">
      <StageHeading headingRef={headingRef} className="text-[clamp(1.5rem,4.4vw,2.6rem)]">
        How do you want to start?
      </StageHeading>

      <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:max-w-sm">
        <PrimaryButton onClick={onExplore} testId="academy-welcome-explore" full>
          Start Exploring
        </PrimaryButton>

        {/* Genuinely secondary, not a trap door: both routes into the product
            are legitimate, and the tutorial must never read as the price of
            entry. Outline weight says "also fine", not "lesser". */}
        <button
          type="button"
          onClick={onTutorial}
          data-testid="academy-welcome-tutorial"
          className="w-full rounded-xl border border-[#c9a84c]/45 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-[#f0d78c] transition-colors hover:bg-[#c9a84c]/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#04070f]"
        >
          Take the guided tutorial
        </button>

        <p className="text-balance text-center text-xs text-[#cfc4a5]/60">
          Tutorial takes about five minutes. No account needed.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared controls                                                            */
/* -------------------------------------------------------------------------- */

function PrimaryButton({
  onClick,
  children,
  testId,
  full = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        full ? "w-full" : "min-w-[12rem]",
        "rounded-xl bg-gradient-to-r from-[#c9a84c] to-[#a8862f] px-8 py-3",
        "text-sm font-bold text-[#1a1530] shadow-[0_6px_20px_rgba(201,168,76,0.22)]",
        "transition-colors hover:from-[#d4b35c] hover:to-[#b8923f]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c]/80",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-[#04070f]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Three diamonds, echoing the divider under the title on the entrance screen. */
function StageProgress({ stage }: { stage: number }) {
  return (
    <ol className="flex shrink-0 items-center gap-2.5" aria-label="Introduction progress">
      {Array.from({ length: STAGE_COUNT }, (_, i) => (
        <li key={i} aria-current={i === stage ? "step" : undefined}>
          <span className="sr-only">
            {`Step ${i + 1} of ${STAGE_COUNT}${i === stage ? " (current)" : ""}`}
          </span>
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
            <path
              d="M6 0.5 L11.5 6 L6 11.5 L0.5 6 Z"
              fill={i === stage ? "#f0d78c" : "transparent"}
              stroke="#c9a84c"
              strokeWidth="1"
              opacity={i === stage ? 1 : 0.45}
            />
          </svg>
        </li>
      ))}
    </ol>
  );
}
