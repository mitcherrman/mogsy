import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Compass, GraduationCap } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";
import { markAcademyWelcomeHandled } from "@/lib/welcome/academy-welcome";
import { useViewportTier } from "@/pages/dev/mogzy-entry-v2/useViewportTier";
import academyLibraryDesktop from "@/academy/hub/academy-library-desktop.png";

import AcademyTome from "./AcademyTome";
import ChapterPlate from "./ChapterPlate";
import InkText, { InkPhrase, RevealSlot } from "./InkText";
import { ACADEMY_CHAPTERS, type AcademyChapter } from "./academyChapters";
import {
  EYEBROW_WORD_PACE,
  HEADING_OFFSET,
  HEADING_WORD_PACE,
  sentencesOf,
} from "./phrases";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { slotCount, slotWriteMs, useRevealSequence } from "./useRevealSequence";
import { useTomeAudio } from "./tomeAudio";

/**
 * The Academy introduction (HI1) — the room immediately behind the Mogzy door.
 *
 * ROUTING AND STATE ARE HI1's, UNCHANGED. A real route rather than an overlay:
 * "/" hands first-time visitors here and returning ones straight to the hub,
 * both exits record an outcome before navigating, `/welcome` stays directly
 * navigable and replayable forever, and the legacy popup is untouched. None of
 * that is this file's business beyond calling `markAcademyWelcomeHandled`.
 *
 * WHAT HI1-C CHANGED IS THE PRESENTATION, COMPLETELY. HI1 shipped three stages
 * with a Continue button under each — correct, and unmistakably a wizard. This
 * is one continuous scene instead: a tome opens in front of the visitor and
 * writes itself, sentence by sentence, illustration by illustration. HI1-C2 then
 * made each spread a PERFORMANCE with a curtain call: the writing and the
 * painting run as two concurrent, deliberately desynchronised channels; the
 * finished page then waits — indefinitely — and pressing Next physically turns
 * the sheet, old words still on it, with a page-turn sound as it lifts.
 *
 * ONE CONTROL WITH TWO MEANINGS. Every input — the button, a click anywhere on
 * the scene, Space, the arrow keys — means the same thing: "I'm ready". While a
 * page is still being written that FINISHES it; once it is finished it TURNS
 * it. An impatient tap can never cost the visitor words they have not read,
 * which is the whole reason the control is dual-purpose rather than a Next.
 * While the sheet itself is mid-turn, every input is ignored: a burst of
 * clicks turns exactly one page, never two, and can never stack sheets or
 * flip sounds.
 *
 * NOT TRAPPED, EVER — BUT NEVER SWEPT ALONG EITHER. Each chapter writes itself
 * out on its own; the page turn is always the visitor's. Back re-reads a
 * chapter; Skip to the Academy leaves for the hub from any chapter, recording
 * the same outcome Start Exploring records. Browser Back leaves the route
 * rather than stepping through chapters — the chapters are component state,
 * not history entries, and pushing six entries per visit would make Back feel
 * broken from wherever the visitor lands next.
 *
 * REDUCED MOTION IS A DIFFERENT EXPERIENCE, NOT A DEGRADED ONE. The clock stops
 * and every chapter opens complete and still: the same words, the same artwork,
 * the same chapters, turned by the visitor at their own pace — no turning
 * sheet, no materialisation, no waiting. No content exists only inside an
 * animation — the writing is in the document from the moment its slot opens,
 * which is what makes this true for a screen reader as well as for a
 * motion-sensitive reader.
 */

/** How long the physical page turn holds the stage. Matches the CSS. */
const TURN_MS = 820;

export default function AcademyWelcomePage() {
  const navigate = useNavigate();
  const prefersReducedMotion = usePrefersReducedMotion();
  const tier = useViewportTier();
  const exitsRef = useRef<HTMLButtonElement>(null);
  const audio = useTomeAudio();

  // The outgoing chapter, while its sheet is physically turning. All input is
  // ignored until the sheet lands; the sequence clock holds with it.
  const [turning, setTurning] = useState<{ chapter: AcademyChapter } | null>(null);
  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    },
    [],
  );

  const seq = useRevealSequence({
    chapters: ACADEMY_CHAPTERS,
    reducedMotion: prefersReducedMotion,
    paused: turning !== null,
  });
  const { chapter, chapterIndex, step, complete, released, artRevealed, instant, isFinale } = seq;

  // Portrait phones read a single page; everything else reads the spread. A
  // landscape phone is wide and ~360px tall, which is the spread's own shape.
  const isPhonePortrait = tier === "phone";
  const isLandscapePhone = tier === "phone-landscape";
  const variant = isPhonePortrait ? "page" : isLandscapePhone ? "panel" : "spread";
  // Vertical room the controls need, so the tome sizes itself around them
  // rather than pushing them under the fold — the exact failure of the popup
  // this replaces.
  const chrome = isLandscapePhone ? 132 : 208;

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

  /**
   * The one advance action, wrapped around the sequence's own so the page can
   * stage the physical turn and the sounds. Mid-reveal: finish the page and
   * silence the pen at once. Complete: lift the sheet, sound the paper, hold
   * the incoming chapter's clock until the sheet lands. Mid-turn: nothing —
   * this single early return is the whole burst-click story.
   */
  const handleAdvance = useCallback(() => {
    if (turning) return;
    if (!seq.complete) {
      audio.stopScribble();
      seq.advance();
      return;
    }
    if (seq.isFinale) return;
    audio.stopScribble();
    // As the page BEGINS lifting, not after it lands.
    audio.pageTurn();
    if (!prefersReducedMotion) {
      setTurning({ chapter: seq.chapter });
      turnTimerRef.current = setTimeout(() => setTurning(null), TURN_MS);
    }
    seq.advance();
  }, [turning, seq, audio, prefersReducedMotion]);

  const handleBack = useCallback(() => {
    if (turning) return;
    audio.stopScribble();
    seq.back();
  }, [turning, seq, audio]);

  // The pen's sound, synchronised to the writing itself: each slot arriving on
  // its own beat scratches for as long as its ink visibly takes, and nothing
  // scratches during the breaths between sentences (each scribble is scheduled
  // for exactly its write window and ends there). HI1-C3's windows are two to
  // three seconds rather than one, so there is much more continuous scratching
  // and much less silence — which is the sound of the cadence it is fixing. Skips, page turns and Back
  // land content instantly, so they stop the pen instead (handleAdvance /
  // handleBack); this effect only ever starts sound for a slot arriving on
  // the clock.
  const prevStepRef = useRef(step);
  const prevChapterRef = useRef(chapterIndex);
  useEffect(() => {
    const prevStep = prevStepRef.current;
    const prevChapter = prevChapterRef.current;
    prevStepRef.current = step;
    prevChapterRef.current = chapterIndex;
    if (prefersReducedMotion || instant) return;
    if (chapterIndex !== prevChapter) return;
    if (step === prevStep + 1 && step > 0) {
      const ms = slotWriteMs(chapter, step - 1);
      if (ms > 0) audio.scribble(ms);
    }
  }, [step, chapterIndex, instant, chapter, audio, prefersReducedMotion]);
  // Leaving the route mid-write must not leave a pen scratching.
  useEffect(() => () => audio.stopScribble(), [audio]);

  // The scene itself is the control. Clicking a button or a link means that
  // control, not "I'm ready"; and a click that ends a text selection is someone
  // reading, not someone hurrying.
  const onSceneClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, a, [role='button']")) return;
      if (typeof window !== "undefined" && window.getSelection?.()?.toString()) return;
      handleAdvance();
    },
    [handleAdvance],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      // A focused control owns its own keys — Space and Enter on the advance
      // button must activate it once, not once here and once there.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("button, a, input, textarea, select, [contenteditable]")) return;

      if (e.key === " " || e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        handleAdvance();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAdvance, handleBack]);

  // The one place focus is moved. Everywhere else the advance control keeps it,
  // which is what a keyboard visitor wants while pressing it repeatedly — but
  // that control unmounts at the finale, and focus falling to <body> at the
  // moment of the actual decision would be the worst possible time to lose it.
  // Keyed off `released`, not `complete`: the exits are the finale's last slot,
  // so they appear the moment it opens. Waiting for the ink to settle would
  // leave the advance control on screen underneath two live choices.
  const exitsVisible = isFinale && released;
  useEffect(() => {
    if (exitsVisible) exitsRef.current?.focus?.({ preventScroll: true });
  }, [exitsVisible]);

  const isSpread = variant === "spread";

  // The live illustration channel. During a spread's page turn the LEFT page
  // keeps the OUTGOING chapter's art — physically, the left page is not the
  // sheet that is turning, and wiping it early is exactly the "content swap"
  // this pass removes. The landing sheet then covers it, and the new chapter's
  // art washes in on its own beat after the turn.
  const art =
    turning && isSpread ? (
      <RevealSlot revealed className="tome-ghost flex h-full w-full items-center justify-center">
        <ChapterPlate art={turning.chapter.art} />
      </RevealSlot>
    ) : (
      <RevealSlot revealed={artRevealed} className="flex h-full w-full items-center justify-center">
        <ChapterPlate art={chapter.art} />
      </RevealSlot>
    );

  const body = (
    <ChapterWriting
      chapter={chapter}
      step={step}
      headingId={`tome-chapter-${chapter.id}`}
      exits={
        chapter.finale ? (
          <div className="tome-exits">
            <ExitButton
              buttonRef={exitsRef}
              onClick={startExploring}
              testId="academy-welcome-explore"
              Icon={Compass}
              label="Start Exploring"
              detail="Head into the Academy and look around."
              primary
            />
            {/* Genuinely a peer, not a trap door: both routes into the product are
                legitimate, and the tutorial must never read as the price of entry. */}
            <ExitButton
              onClick={startTutorial}
              testId="academy-welcome-tutorial"
              Icon={GraduationCap}
              label="Start the tutorial"
              detail="A guided run through a Ranked duel."
            />
            <p className="tome-footnote">
              The tutorial takes about five minutes. No account needed either way.
            </p>
          </div>
        ) : null
      }
    />
  );

  return (
    <main
      data-testid="academy-welcome"
      data-chapter={chapter.id}
      data-chapter-index={chapterIndex}
      data-step={step}
      data-complete={complete ? "true" : "false"}
      data-art={artRevealed ? "true" : "false"}
      data-turning={turning ? "true" : "false"}
      data-instant={instant ? "true" : "false"}
      className="academy-welcome relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#04070f]"
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
      {/* The room. Dimmer than HI1's, because the tome is now the subject  */}
      {/* rather than a caption over a wallpaper — but the same plate the   */}
      {/* hub uses, so this is literally the room they are about to enter,  */}
      {/* and it is warm in cache by the time /lol renders. Phones skip it: */}
      {/* the mobile plate is ~1.9 MB, which is not a reasonable first-visit*/}
      {/* cost for something sitting at 14% opacity.                        */}
      {/* ---------------------------------------------------------------- */}
      <img
        src={academyLibraryDesktop}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-[0.14] md:block"
        style={{ objectPosition: "center 52%" }}
      />
      {/* The doors giving way. One gesture, on arrival, never repeated. */}
      <div
        className="tome-doors pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(70% 56% at 50% 46%, rgba(201,168,76,0.20) 0%, rgba(127,214,239,0.06) 46%, transparent 78%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 34%, rgba(2,4,10,0.5) 72%, rgba(2,4,10,0.92) 100%)",
        }}
      />

      {/* ---------------------------------------------------------------- */}
      {/* The scene                                                          */}
      {/* ---------------------------------------------------------------- */}
      {/* Normal document flow with min-h rather than a fixed h-screen box, so
          a 360px-tall landscape phone scrolls instead of clipping its
          controls. */}
      <div
        onClick={onSceneClick}
        className={[
          "relative z-10 flex flex-1 flex-col items-center justify-center px-4 sm:px-6",
          isLandscapePhone ? "py-3" : "py-5 sm:py-7",
        ].join(" ")}
      >
        <div className="tome-opening w-full">
          {/* NOT keyed by chapter: the tome is the stage and must persist
              across page turns — the turning leaf lives inside it, and a
              remount would tear the sheet out mid-air. Chapter changes swap
              the pages' content; the reveal slots' data-revealed transitions
              restart every ink animation without any remounting. */}
          <AcademyTome
            art={art}
            body={body}
            turning={
              turning
                ? {
                    art: (
                      <RevealSlot revealed className="tome-ghost flex h-full w-full items-center justify-center">
                        <ChapterPlate art={turning.chapter.art} />
                      </RevealSlot>
                    ),
                    body: (
                      <ChapterWriting
                        chapter={turning.chapter}
                        step={slotCount(turning.chapter)}
                        ghost
                      />
                    ),
                  }
                : null
            }
            variant={variant}
            chrome={chrome}
          />
        </div>

        {/* The advance control. Present until the finale is fully open, at
            which point the two exits ARE the controls and a third one here
            would only muddy the decision. */}
        {!exitsVisible && (
          <button
            type="button"
            onClick={handleAdvance}
            data-testid="academy-welcome-advance"
            data-mode={complete ? "next" : "reveal"}
            className={["tome-advance group", isLandscapePhone ? "mt-3" : "mt-5 sm:mt-6"].join(" ")}
          >
            <span>{complete ? "Next" : "Skip reveal"}</span>
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        )}

        {/* -------------------------------------------------------------- */}
        {/* The rail — back, the ribbon, and the low-key exit               */}
        {/* -------------------------------------------------------------- */}
        <div
          className={[
            "flex w-full max-w-3xl shrink-0 items-center justify-between gap-4",
            isLandscapePhone ? "mt-2" : "mt-4",
          ].join(" ")}
        >
          <div className="flex-1">
            {seq.canGoBack && (
              <button
                type="button"
                onClick={handleBack}
                data-testid="academy-welcome-back"
                className="tome-quiet"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            )}
          </div>

          <ChapterRibbon index={chapterIndex} count={ACADEMY_CHAPTERS.length} />

          <div className="flex flex-1 justify-end">
            {/* Named by its destination, not by the act of leaving — someone
                who already knows Mogzy should not have to sit through an
                introduction, and should not have to interpret a bare "Skip".
                It performs exactly what Start Exploring performs. It disappears
                at the finale, where the two paths ARE the exit. */}
            {!exitsVisible && (
              <button
                type="button"
                onClick={startExploring}
                data-testid="academy-welcome-skip"
                className="tome-quiet"
              >
                <span className="sm:hidden">Skip intro</span>
                <span className="hidden sm:inline">Skip to the Academy</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A chapter's right-hand page: eyebrow, heading, the body copy sentence by
 * sentence, marginalia, and (on the finale) the exits.
 *
 * Rendered twice per page turn: live on the incoming spread, and as a GHOST on
 * the front face of the turning sheet — the outgoing words must visibly ride
 * the paper as it lifts. The ghost is presentation only: no ids (the live
 * heading keeps its), no live region, no controls (the finale never turns), and
 * a `tome-ghost` wrapper class the CSS uses to hold every ink animation at its
 * finished frame. Slot numbering must match slotCount() in useRevealSequence:
 * the heading is slot 0, each SENTENCE (see phrases.ts) takes the next slot,
 * then marginalia, then the finale's exits.
 */
function ChapterWriting({
  chapter,
  step,
  ghost = false,
  headingId,
  exits = null,
}: {
  chapter: AcademyChapter;
  step: number;
  ghost?: boolean;
  headingId?: string;
  exits?: React.ReactNode;
}) {
  const lines = chapter.lines.map((line) => sentencesOf(line));
  const sentenceTotal = lines.reduce((n, ss) => n + ss.length, 0);
  const marginaliaSlot = 1 + sentenceTotal;
  const exitsSlot = marginaliaSlot + (chapter.marginalia?.length ? 1 : 0);

  let sentenceIndex = 0;
  return (
    <div
      className={["tome-writing", ghost ? "tome-ghost" : ""].join(" ")}
      // The chapter as a whole is announced, so a screen reader hears a
      // complete page rather than a trickle of fragments. The visual reveal is
      // decoration over text that is already in the document.
      aria-live={ghost ? undefined : "polite"}
      aria-atomic={ghost ? undefined : "true"}
    >
      <RevealSlot revealed={step > 0} className="w-full">
        <p className="tome-eyebrow">
          <InkText as="span" text={chapter.eyebrow} pace={EYEBROW_WORD_PACE} />
        </p>
        <h1 id={ghost ? undefined : headingId} className="tome-heading">
          <InkText as="span" text={chapter.heading} pace={HEADING_WORD_PACE} offset={HEADING_OFFSET} />
        </h1>
      </RevealSlot>

      {lines.map((sentences, lineIdx) => {
        const start = sentenceIndex;
        sentenceIndex += sentences.length;
        return (
          <p key={chapter.lines[lineIdx]} className="tome-body">
            {sentences.map((sentence, j) => (
              <InkPhrase
                key={`${j}-${sentence.text}`}
                text={sentence.text}
                revealed={step > 1 + start + j}
                trailingSpace={j < sentences.length - 1}
              />
            ))}
          </p>
        );
      })}

      {chapter.marginalia?.length ? (
        <RevealSlot revealed={step > marginaliaSlot} className="w-full">
          <ul className="tome-marginalia">
            {chapter.marginalia.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </RevealSlot>
      ) : null}

      {/* The two real exits. Conditionally mounted, unlike everything above:
          a focusable control sitting invisibly in the tab order is a trap, and
          this is the one slot that contains controls. Never on a ghost — the
          finale is the last page and its sheet never turns. */}
      {!ghost && chapter.finale && step > exitsSlot && exits}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Chapter position, as the gilt edges of the pages already turned.
 *
 * Deliberately not carousel dots. Dots announce "this is a slideshow with N
 * slides", which is the single strongest signal of the format this redesign
 * exists to escape — but position still has to be legible, and a screen reader
 * still has to be told where it is, hence the real list semantics underneath.
 */
function ChapterRibbon({ index, count }: { index: number; count: number }) {
  return (
    <ol className="tome-ribbon" aria-label="Chapter progress">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          aria-current={i === index ? "step" : undefined}
          data-past={i <= index ? "true" : "false"}
        >
          <span className="sr-only">
            {`Chapter ${i + 1} of ${count}${i === index ? " (current)" : ""}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One of the two exits on the last page. */
function ExitButton({
  buttonRef,
  onClick,
  testId,
  Icon,
  label,
  detail,
  primary = false,
}: {
  buttonRef?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  testId: string;
  Icon: React.ElementType;
  label: string;
  detail: string;
  primary?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-primary={primary ? "true" : "false"}
      className="tome-exit"
    >
      <Icon className="tome-exit-icon" aria-hidden="true" />
      <span className="tome-exit-label">{label}</span>
      <span className="tome-exit-detail">{detail}</span>
    </button>
  );
}
