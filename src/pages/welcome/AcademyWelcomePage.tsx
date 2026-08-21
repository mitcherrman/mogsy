import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Compass, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import SEOHead from "@/components/SEOHead";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";
import { markAcademyWelcomeHandled } from "@/lib/welcome/academy-welcome";
import {
  EMPTY_REGISTRATION,
  leagueRankLabel,
  resolveLinkDestination,
  saveAcademyRegistration,
  stashRegistrationPassword,
  type RegistrationValue,
} from "@/lib/welcome/academy-registration";
import { seedProfileDisplayName } from "@/lib/welcome/provisional-identity";
import { useViewportTier } from "@/pages/dev/mogzy-entry-v2/useViewportTier";
import academyLibraryDesktop from "@/academy/hub/academy-library-desktop.png";

import AcademyTome from "./AcademyTome";
import ChapterPlate, { type RegisterMirror } from "./ChapterPlate";
import InkText, { InkPhrase, RevealSlot } from "./InkText";
import RegistrationForm from "./RegistrationForm";
import { ACADEMY_CHAPTERS, type AcademyChapter, type DocketEntry } from "./academyChapters";
import {
  EYEBROW_WORD_PACE,
  HEADING_OFFSET,
  HEADING_WORD_PACE,
  sentencesOf,
} from "./phrases";
import { CRITICAL_SCENE_IMAGES, TOME_DISPLAY_FONT } from "./sceneAssets";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useSceneReady } from "./useSceneReady";
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
 * THE CURTAIN GOES UP ON A FINISHED STAGE (HI1-C4). Everything below used to
 * begin 260ms after mount, whatever state the page was in — which on a cold
 * arrival meant the tome, the heading's face and Mogzy himself resolving under
 * a sequence that had already started. The scene now waits on a real readiness
 * state (see useSceneReady): the painted book decoded, the display face loaded,
 * chapter one's illustration decoded. Only then does the tome rise and the
 * clock start. Nothing about the cadence past that first frame changed.
 *
 * THE REGISTER IS THE ONE PAGE THAT ANSWERS BACK (HI1-C5). Spread two is a
 * form: a name and a self-reported rank, written onto ruled lines in the book's
 * own hand, mirrored by a registration card on the facing page. It is the one
 * place the dual-purpose control above is deliberately HALF disabled — a tap
 * still finishes the writing, but the tome will not turn past an unanswered
 * register, and the page's forward action is the form's own button instead.
 * That is not a trap: "Skip to the Academy" is on the rail on this page as on
 * every other, and Back still re-reads the arrival. Everything the register
 * collects is device-local and additive (see lib/welcome/academy-registration),
 * and no password is stored by anything on this route.
 *
 * FIVE SPREADS, NOT SIX. Adding the register cost a beat, so Pro Data and
 * Archives — two spreads for one idea — became one, and the finale's exits
 * moved onto it. The sequence now ends on a page that says something rather
 * than on a page that only asks. See academyChapters.ts.
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
  // The stage, and only the stage: the painted book, the face the headings are
  // set in, and chapter one's illustration. Everything else on this page is
  // allowed to arrive whenever it arrives.
  const sceneReady = useSceneReady(CRITICAL_SCENE_IMAGES, TOME_DISPLAY_FONT);
  const [roomLoaded, setRoomLoaded] = useState(false);
  // The register's live answers. Owned here rather than inside the form because
  // the facing page's card mirrors them, and because a visitor who steps Back
  // to re-read the arrival and returns must find what they had already typed.
  const [registration, setRegistration] = useState<RegistrationValue>(EMPTY_REGISTRATION);
  // Ref callback rather than `onLoad` alone: on a warm arrival the plate is
  // already decoded before React attaches a listener, `load` never fires, and
  // the fade-in below would leave it at zero for ever.
  const roomRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setRoomLoaded(true);
  }, []);

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
    // Two reasons the clock holds, and they compose: a sheet is physically in
    // the air, or the stage is not up yet. Both are "do not write onto this".
    paused: turning !== null || !sceneReady,
  });
  const {
    chapter,
    chapterIndex,
    step,
    complete,
    released,
    artRevealed,
    instant,
    isFinale,
    isRegistration,
  } = seq;

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
      // The verification seam. `resolveLinkDestination()` returns null today —
      // there is no Verify / Link Accounts route in this app, and HI1-C5 is not
      // allowed to invent one — so this reads exactly as it did before. When
      // that page ships it becomes the destination for a visitor who ticked the
      // linking box, and it takes over the job of continuing to the hub.
      //
      // Only the EXPLORE path defers to it. Somebody who chose a guided
      // tutorial asked for the tutorial; diverting them into an account screen
      // instead would be answering a different question than the one they
      // pressed.
      const linkTo = outcome === "explored" ? resolveLinkDestination() : null;
      // replace: once a choice is made the introduction is behind them — it
      // should not sit one Back press away from wherever they just landed.
      navigate(linkTo ?? (outcome === "tutorial" ? RANKED_TUTORIAL_ROUTE : LEAGUE_HOME_ROUTE), {
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
  /**
   * Physically turn the page. The whole of the staging — the sound as the sheet
   * BEGINS lifting, the outgoing chapter held on the leaf, the clock paused
   * until it lands — lives here so that the two things that can turn a page
   * (the dual-purpose control, and the register's own submit) turn it
   * identically. A second, subtly different turn would be visible.
   */
  const turnPage = useCallback(() => {
    audio.stopScribble();
    audio.pageTurn();
    if (!prefersReducedMotion) {
      setTurning({ chapter: seq.chapter });
      turnTimerRef.current = setTimeout(() => setTurning(null), TURN_MS);
    }
    // `goNext`, not `advance`: the register's form is released a beat BEFORE
    // its chapter reports complete, so a visitor who fills it in quickly would
    // otherwise get a staged sheet over a page that never turned.
    seq.goNext();
  }, [seq, audio, prefersReducedMotion]);

  const handleAdvance = useCallback(() => {
    if (turning) return;
    if (!seq.complete) {
      audio.stopScribble();
      seq.advance();
      return;
    }
    // The two pages the tome does not turn by itself. The finale is the last
    // page and there is nothing after it; the register is waiting for an
    // answer, and turning past it on a stray tap would be the sequence
    // deciding, on the visitor's behalf, that they did not want a name.
    if (seq.isFinale || seq.isRegistration) return;
    turnPage();
  }, [turning, seq, audio, turnPage]);

  const handleBack = useCallback(() => {
    if (turning) return;
    audio.stopScribble();
    seq.back();
  }, [turning, seq, audio]);

  /**
   * The register has been answered. Everything that happens to it happens here.
   *
   * ORDER MATTERS, AND SO DOES WHAT IS AWAITED. The record is written
   * synchronously and cannot throw (see saveAcademyRegistration), so the
   * identity is real before anything else is attempted. The profile seed is
   * fire-and-forget on purpose: at /welcome there is usually no session at all,
   * and on the occasions there is, a cold backend must not hold a page turn.
   * The page therefore turns on the next line regardless of what the network
   * does, which is the only behaviour a first impression can afford.
   *
   * THE TOAST IS A NOTIFICATION, NOT COPY. It is deliberately not printed under
   * the password field, where it would read as a warning attached to leaving a
   * field blank; it arrives after the visitor has committed, says the one true
   * thing about what they just made, and goes away. Only for the no-password
   * case, which is the case it is about.
   */
  const handleRegistered = useCallback(
    (value: RegistrationValue & { rank: Exclude<RegistrationValue["rank"], ""> }) => {
      if (turning) return;
      const hasPassword = Boolean(value.password);
      saveAcademyRegistration({
        username: value.username,
        rank: value.rank,
        hasPassword,
        wantsLinking: value.wantsLinking,
      });
      // Memory only, for the life of this page — never storage, never a URL.
      if (hasPassword) stashRegistrationPassword(value.password);
      // Opportunistic and guarded; a no-op without a session or on a profile
      // that already has a name. See lib/welcome/provisional-identity.ts.
      void seedProfileDisplayName(value.username);
      if (!hasPassword) {
        toast("Account stays on this device until verified");
      }
      turnPage();
    },
    [turning, turnPage],
  );

  /** What the facing page's register card is showing right now. */
  const registerMirror = useMemo<RegisterMirror>(
    () => ({
      username: registration.username.replace(/\s+/g, " ").trim(),
      rankLabel: leagueRankLabel(registration.rank),
    }),
    [registration.username, registration.rank],
  );

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
      // A control, a label, a rule of the register — anything the visitor might
      // be aiming AT means itself, not "I'm ready". `[data-tome-interactive]`
      // covers the register's whitespace as well as its controls, so a miss
      // inside the form does not turn the page out from under it.
      if (
        (e.target as HTMLElement).closest(
          "button, a, [role='button'], input, select, textarea, label, [data-tome-interactive]",
        )
      ) {
        return;
      }
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

  /**
   * The register's form is on the page, and IT is the forward control.
   *
   * Keyed off `released` for the same reason the exits are: the form is the
   * register's last slot, so it appears the moment that slot opens rather than
   * a beat later, and leaving a "Next" on screen underneath a live form would
   * offer a way past it that does not work.
   *
   * Focus is deliberately NOT moved here, unlike at the finale. The first
   * control on this page is a text field, and stealing focus into it would open
   * the keyboard on every phone the moment the page turned — over a landscape
   * layout that has ~360px of height to begin with. The finale moves focus
   * because its control unmounts underneath the visitor; nothing unmounts here.
   */
  const formVisible = isRegistration && released;

  const isSpread = variant === "spread";

  // The live illustration channel. During a spread's page turn the LEFT page
  // keeps the OUTGOING chapter's art — physically, the left page is not the
  // sheet that is turning, and wiping it early is exactly the "content swap"
  // this pass removes. The landing sheet then covers it, and the new chapter's
  // art washes in on its own beat after the turn.
  const art =
    turning && isSpread ? (
      <RevealSlot revealed className="tome-ghost flex h-full w-full items-center justify-center">
        {/* The same mirror the live card had a moment ago — the register must
            ride the turn showing what it was showing, not blank. */}
        <ChapterPlate art={turning.chapter.art} register={registerMirror} />
      </RevealSlot>
    ) : (
      <RevealSlot revealed={artRevealed} className="flex h-full w-full items-center justify-center">
        <ChapterPlate art={chapter.art} register={registerMirror} />
      </RevealSlot>
    );

  const body = (
    <ChapterWriting
      chapter={chapter}
      step={step}
      headingId={`tome-chapter-${chapter.id}`}
      terminal={
        chapter.registration ? (
          <RegistrationForm
            value={registration}
            onChange={setRegistration}
            onSubmit={handleRegistered}
          />
        ) : chapter.finale ? (
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
            {/* "No account needed either way" was true when the introduction
                asked for nothing. The visitor now arrives here with a name, so
                the footnote says what is actually reassuring about that. */}
            <p className="tome-footnote">
              The tutorial takes about five minutes. Both paths keep the name you chose.
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
      data-gate={formVisible ? "registration" : "none"}
      data-instant={instant ? "true" : "false"}
      data-ready={sceneReady ? "true" : "false"}
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
      {/* Faded in on load rather than painted the instant it decodes (HI1-C4).
          At ~1.8 MB it is by some way the last thing on the screen to arrive,
          and a plate that snaps in behind a scene already in progress is a
          stage change — which is exactly what it looked like. It is
          deliberately NOT part of the readiness gate: nothing about the tome
          depends on it, and holding the introduction for a decoration at 14%
          opacity would be the arbitrary wait this pass exists to remove. */}
      <img
        src={academyLibraryDesktop}
        alt=""
        aria-hidden="true"
        ref={roomRef}
        loading="eager"
        decoding="async"
        onLoad={() => setRoomLoaded(true)}
        onError={() => setRoomLoaded(true)}
        data-loaded={roomLoaded ? "true" : "false"}
        className="tome-room pointer-events-none absolute inset-0 hidden h-full w-full object-cover md:block"
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
        {!exitsVisible && !formVisible && (
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
 * sentence, its annotation, and — on the two pages that have one — its terminal
 * control.
 *
 * Rendered twice per page turn: live on the incoming spread, and as a GHOST on
 * the front face of the turning sheet — the outgoing words must visibly ride
 * the paper as it lifts. The ghost is presentation only: no ids (the live
 * heading keeps its), no live region, no controls, and a `tome-ghost` wrapper
 * class the CSS uses to hold every ink animation at its finished frame.
 *
 * SLOT NUMBERING MUST MATCH slotCount() in useRevealSequence. The heading is
 * slot 0; each SENTENCE (see phrases.ts) takes the next slot; then ONE
 * annotation slot — marginalia, or the last spread's reference docket, never
 * both; then ONE terminal slot, which is the finale's exits or the register's
 * form. The two kinds of terminal are one slot on purpose: they are the same
 * thing to the sequence, a control that belongs to the page rather than to the
 * tome, arriving last.
 *
 * NO CONTROL IS EVER RENDERED ON A GHOST. A focusable control sitting
 * invisibly in the tab order is a trap, and the terminal slot is the only one
 * that contains controls. The finale's sheet never turns at all; the register's
 * does, immediately after its form was submitted, and the form's absence from
 * that half-second of turning paper is invisible and correct.
 */
function ChapterWriting({
  chapter,
  step,
  ghost = false,
  headingId,
  terminal = null,
}: {
  chapter: AcademyChapter;
  step: number;
  ghost?: boolean;
  headingId?: string;
  /** The finale's exits, or the register's form. Never rendered on a ghost. */
  terminal?: React.ReactNode;
}) {
  const lines = chapter.lines.map((line) => sentencesOf(line));
  const sentenceTotal = lines.reduce((n, ss) => n + ss.length, 0);
  const annotation = chapter.docket?.length || chapter.marginalia?.length;
  const annotationSlot = 1 + sentenceTotal;
  const terminalSlot = annotationSlot + (annotation ? 1 : 0);

  let sentenceIndex = 0;
  return (
    <div
      className={["tome-writing", ghost ? "tome-ghost" : ""].join(" ")}
      /* The one page that carries a chapter's writing AND the two exits. It is
         marked by what makes it dense rather than by its id, so the CSS that
         tightens it stays true if the last spread is ever rewritten — and so
         that a finale of no copy, which is what this used to be, would take
         none of it. Set on the writing rather than on <main> so a ghosted
         sheet is measured as the chapter it is showing. */
      data-crowded={chapter.finale && chapter.lines.length > 0 ? "true" : "false"}
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

      {chapter.docket?.length ? (
        <RevealSlot revealed={step > annotationSlot} className="w-full">
          <ReferenceDocket entries={chapter.docket} />
        </RevealSlot>
      ) : chapter.marginalia?.length ? (
        <RevealSlot revealed={step > annotationSlot} className="w-full">
          <ul className="tome-marginalia">
            {chapter.marginalia.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </RevealSlot>
      ) : null}

      {/* Conditionally mounted, unlike everything above — see the note on
          ghosts and the tab order at the top of this component. */}
      {!ghost && step > terminalSlot && terminal}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The last spread's right page — the reference side, as a ruled docket.
 *
 * The left page of that spread is a triangular composition of live, statistical
 * things (see ChapterPlate). This is its counterweight, and it is deliberately
 * the OPPOSITE kind of object: no diagram, no chart, no picture — three ruled
 * entries with leader rules between a name and what is in it, which is what a
 * reference shelf looks like when it is written down rather than drawn.
 *
 * A list, and not a set of links. The introduction promises destinations; it
 * does not navigate to them, and three live links arriving directly above the
 * final choice would compete with that choice for the same press. It is also
 * what keeps this page from feeling overcrowded — nothing here is a control.
 */
function ReferenceDocket({ entries }: { entries: DocketEntry[] }) {
  return (
    <ul className="tome-docket" data-testid="academy-welcome-docket">
      {entries.map((entry) => (
        <li key={entry.label} className="tome-docket-row">
          <span className="tome-docket-label">{entry.label}</span>
          <span className="tome-docket-rule" aria-hidden="true" />
          <span className="tome-docket-note">{entry.note}</span>
        </li>
      ))}
    </ul>
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
