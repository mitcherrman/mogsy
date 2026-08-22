import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Compass, GraduationCap } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { RANKED_TUTORIAL_ROUTE } from "@/lib/ranked-tutorial/onboarding";
import { markAcademyWelcomeHandled } from "@/lib/welcome/academy-welcome";
import {
  ACADEMY_SIGN_IN_ROUTE,
  leagueRankLabel,
  readAcademyRegistration,
  saveAcademyRegistration,
} from "@/lib/welcome/academy-registration";
import { adoptAcademyIdentity } from "@/lib/welcome/provisional-identity";
import { useViewportTier } from "@/pages/dev/mogzy-entry-v2/useViewportTier";
import academyLibraryDesktop from "@/academy/hub/academy-library-desktop.png";

import AcademyTome from "./AcademyTome";
import ChapterPlate, { type RegisterMirror } from "./ChapterPlate";
import { FinaleDiscoveryPage, FinaleLibraryPage } from "./FinaleSpread";
import { InkBlock, RevealSlot } from "./InkText";
import RegistrationForm, { type RegistrationValue } from "./RegistrationForm";
import { ACADEMY_CHAPTERS, type AcademyChapter } from "./academyChapters";
import { chapterBlocks } from "./cadence";
import { SCENE_PADDING, TOME_CHROME } from "./tomeChrome";
import { CRITICAL_SCENE_IMAGES, TOME_DISPLAY_FONT } from "./sceneAssets";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useSceneReady } from "./useSceneReady";
import { slotCount, slotRevealMs, useRevealSequence } from "./useRevealSequence";
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
 * composes itself, a block at a time. Each spread is a PERFORMANCE with a
 * curtain call: the copy and the artwork run as two concurrent, deliberately
 * desynchronised channels; the finished page then waits — indefinitely — and
 * pressing Next physically turns the sheet, old words still on it, with a
 * page-turn sound as it lifts.
 *
 * AND IT IS FAST NOW. The reveal used to animate every WORD of every line on
 * its own delay, at a pace slow enough to read as handwriting; a two-line
 * chapter took the better part of ten seconds before it would offer Next. The
 * unit is now a BLOCK — a whole short paragraph, arriving in one piece, roughly
 * half a second after the one before it — and the copy itself was cut to two or
 * three short blocks a chapter. The longest spread in the book is under three
 * seconds end to end. Every number is in cadence.ts and nowhere else.
 *
 * THE PAPER HAS CHAMPIONS IN IT. Ahri stands behind Mogzy on the opening left
 * page and Jinx behind the words facing him. One per page, never two, faint
 * enough to pass under running text, clipped by the page box — see AcademyTome's
 * PageChampion. They ride the illustration channel as a single layer rather than
 * arriving one at a time. The last spread prints none, on either page: it is
 * already carrying four drawn symbols, an animated chart and a picture.
 *
 * ONE CONTROL, ONE MEANING: NEXT (HI1 polish). Every input — the button, a
 * click anywhere on the scene, Space, the arrow keys — means "next page", and
 * it always turns one. If the page is still writing itself, the press lands the
 * rest of it AND turns, in the same interaction: the words the visitor skipped
 * are not lost, they ride the turning sheet in full (the leaf's front face is
 * the outgoing chapter at its LAST slot — see `turning` below), so a press
 * still never costs anyone a sentence.
 *
 * That replaces a dual-purpose control which finished the reveal on the first
 * press and turned on the second. It read as correct and tested as correct, and
 * it was still wrong: a visitor who has decided to move on presses a button
 * called Next and the book does not turn, so they press it again. One control,
 * one outcome, one press. The two pages that own their own forward action are
 * the exceptions and always were — the register will not be turned past
 * unanswered, and there is nothing after the finale — and on those a press
 * still lands the reveal, which is all there is left for it to do.
 *
 * While the sheet itself is mid-turn, every input is ignored: a burst of clicks
 * turns exactly one page, never two, and can never stack sheets or flip sounds.
 *
 * NOT TRAPPED, EVER — BUT NEVER SWEPT ALONG EITHER. Each chapter writes itself
 * out on its own; the page turn is always the visitor's. Back re-reads a
 * chapter; Skip to the Academy leaves for the hub from any chapter, recording
 * the same outcome Enter the Academy records. Browser Back leaves the route
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
 *
 * AND IT IS A REAL GATE (HI1-C5B). Until the register is answered the rail
 * carries no exit at all: "Skip to the Academy" does not exist yet, because an
 * exit beside a required question is an invitation to answer it with a shrug.
 * It appears the moment a registration exists — on this page, and on every page
 * after it — so the introduction stops being mandatory the instant the one
 * thing it needs has been given. The visitor is still never STUCK: Back
 * re-reads the arrival, and Sign In below the form is a real way out for
 * someone who is not a new user at all.
 *
 * WHAT THE REGISTER COLLECTS IS DURABLE USER DATA, NOT ONBOARDING STATE. The
 * name becomes profiles.display_name and the rank becomes profiles.league_rank;
 * this page writes the local half and asks for adoption, and the identity
 * bridge in App.tsx finishes the job whenever an account appears. See
 * lib/welcome/provisional-identity.ts for the first-write-wins rules that stop
 * a replay from ever overwriting an established account.
 *
 * FIVE SPREADS, AND THE LAST ONE IS COMPOSED RATHER THAN TEMPLATED. Chapters
 * one to four are the same object — plate left, words right. The finale is not:
 * its LEFT page is the library and only the library, one sentence under the
 * title with champion, item, rune and the Elder Dragon drawn large beneath it;
 * its RIGHT page runs pro data, then discovery, then the doors — the copy that
 * introduces the graph, the graph itself (restored from the chapter it was
 * drawn for, 75d60da9), the closing line with a Teemo emote as its accent, and
 * the two exits. The chapter's copy therefore crosses the gutter. It costs the
 * sequence nothing — the slot COUNT is unchanged, only where each slot lands —
 * and it is the only page allowed to break the template, because it is the only
 * page that is not a chapter. See FinaleSpread.tsx.
 *
 * REDUCED MOTION IS A DIFFERENT EXPERIENCE, NOT A DEGRADED ONE. The clock stops
 * and every chapter opens complete and still: the same words, the same artwork,
 * the same chapters, turned by the visitor at their own pace — no turning
 * sheet, no materialisation, no waiting. No content exists only inside an
 * animation — the writing is in the document from the moment its slot opens,
 * which is what makes this true for a screen reader as well as for a
 * motion-sensitive reader.
 */

/**
 * THE BOOK DOES NOT MOVE (HI1 polish).
 *
 * The scene is a centred column — tome, forward control, rail — and the two
 * control blocks used to be conditionally MOUNTED inside it. A centred column
 * whose height changes re-centres, so dropping the forward control on the
 * register and on the finale slid the tome down the screen by ~29px and back
 * up again on the next turn. Measured, not guessed: 1440x900, y 51.03 with the
 * control present and 80.11 without it, at identical size.
 *
 * Both blocks now RESERVE their height whether or not anything is inside them
 * (`tome-controls` / `tome-rail`, sized from tomeChrome.ts), so the column is a
 * constant of the viewport. Nothing is transformed and nothing is overlaid —
 * the rows are simply honest about the room they were always going to take.
 * The tome's own size never depended on them: it is sized against `budget`,
 * which is a constant per viewport shape, and it is the same 955.64 x 690.97 at
 * 1440x900 as it was before this pass.
 */

/** How long the physical page turn holds the stage. Matches the CSS. */
const TURN_MS = 980;

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
  //
  // SEEDED FROM THE STORED RECORD. /welcome is replayable forever, and someone
  // replaying it has already answered this — presenting them an empty register
  // and requiring them to type their own name again to get past a page they
  // have seen before would be the introduction forgetting them.
  const [registration, setRegistration] = useState<RegistrationValue>(() => {
    const stored = readAcademyRegistration();
    return stored ? { username: stored.username, rank: stored.rank } : { username: "", rank: "" };
  });
  // Whether this device has a registration AT ALL — the one thing the rail's
  // exit is gated on. Initialised from storage so a replaying visitor is not
  // re-gated, and raised (never lowered) the moment the register is answered.
  const [registered, setRegistered] = useState(() => readAcademyRegistration() !== null);
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
  // this replaces. RESERVED rather than measured, which is what keeps the tome
  // still: see tomeChrome.ts and the note above.
  const chromeKey = isLandscapePhone ? "compact" : "regular";
  const chrome = TOME_CHROME[chromeKey];

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

  /**
   * Next. One press, one page (HI1 polish).
   *
   * A press on a page that is still writing itself does BOTH things at once:
   * it lands every remaining slot and then turns. It used to do only the
   * first, and require a second press to turn — which is a button labelled
   * Next that does not go next, and the reason this pass exists.
   *
   * Nothing is lost by turning early. `seq.advance()` runs first, so the
   * chapter is complete before `turnPage` captures it, and the leaf's front
   * face renders that chapter at its LAST slot: the skipped words are on the
   * sheet, in full, as it lifts. Both state updates are in one React event, so
   * the intermediate `step = total` never paints — the visitor sees a finished
   * page ride away, which is exactly what happened.
   *
   * TWO PAGES STILL DO NOT TURN, and both were exceptions before this change.
   * The finale is the last page. The register is waiting for an answer, and
   * turning past it would be the sequence deciding, on the visitor's behalf,
   * that they did not want a name — its own submit is the forward control, and
   * it is the one that calls `turnPage`. On both, a press still lands the
   * reveal, which is all there is left for a press to do.
   *
   * Mid-turn: nothing. This single early return is the whole burst-click story.
   */
  const handleAdvance = useCallback(() => {
    if (turning) return;
    if (!seq.complete) {
      audio.stopScribble();
      seq.advance();
    }
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
   * synchronously and cannot throw (see saveAcademyRegistration), so the local
   * identity is real before anything else is attempted. The adoption is
   * fire-and-forget: at /welcome there is usually no session at all, and on the
   * occasions there is, a cold backend must not hold a page turn. Whatever it
   * does or does not manage, the identity bridge in App.tsx will finish the job
   * the next time an account is present — so the page turns on the next line
   * regardless, which is the only behaviour a first impression can afford.
   *
   * `setRegistered` is what opens the rail's exit. It is raised here rather
   * than derived from storage on every render because storage can be blocked
   * (private mode), and a visitor who answered the register must not be gated
   * by a write they could not see fail.
   */
  const handleRegistered = useCallback(
    (value: { username: string; rank: Exclude<RegistrationValue["rank"], ""> }) => {
      if (turning) return;
      saveAcademyRegistration({ username: value.username, rank: value.rank });
      setRegistered(true);
      // Writes profiles.display_name / profiles.league_rank if and only if a
      // session exists and those fields are not already the account's own. The
      // catch is a floor under a function that already catches everything: a
      // rejection escaping here would surface as an unhandled error on the
      // first screen a new visitor ever sees.
      void adoptAcademyIdentity().catch(() => undefined);
      turnPage();
    },
    [turning, turnPage],
  );

  /**
   * "Already have an account?" — the register's escape hatch.
   *
   * Hands off to the EXISTING auth screen rather than growing a second login:
   * /auth already owns sign-in, the confirmation resend, the forgotten-password
   * path and the guest-upgrade panel. `ACADEMY_SIGN_IN_ROUTE` carries
   * `returnTo=/lol`, which /auth validates through safeReturnPath() and then
   * navigates to on success — so a returning account holder lands in the hub
   * and is never dropped back into chapters three to five of an introduction
   * they do not need.
   *
   * The introduction is marked handled on the way out, for the same reason: the
   * strongest possible signal that someone is not a new user is that they said
   * so. Not `replace`, unlike the finale's exits — those are decisions, this is
   * a detour, and Back should return to the book rather than past it.
   */
  const startSignIn = useCallback(() => {
    markAcademyWelcomeHandled("signed-in");
    navigate(ACADEMY_SIGN_IN_ROUTE);
  }, [navigate]);

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
      const ms = slotRevealMs(chapter, step - 1);
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
  //
  // AND THE LAST SPREAD'S LEFT PAGE IS NOT AN ILLUSTRATION AT ALL. It is the
  // title, the one sentence that names what the library holds, and the four
  // icons that name it again — a composed page rather than a plate in a box
  // (see FinaleSpread). It still arrives on this slot because this slot IS the
  // left page; it simply brings its own reveal slots instead of riding one
  // wash. The finale's actual drawing, the graph, is on the facing page.
  const art =
    turning && isSpread ? (
      <RevealSlot revealed className="tome-ghost flex h-full w-full items-center justify-center">
        {/* The same mirror the live card had a moment ago — the register must
            ride the turn showing what it was showing, not blank. */}
        <ChapterPlate art={turning.chapter.art} register={registerMirror} />
      </RevealSlot>
    ) : isFinale ? (
      <FinaleLibraryPage
        chapter={chapter}
        step={step}
        headingId={`tome-chapter-${chapter.id}`}
      />
    ) : (
      <RevealSlot revealed={artRevealed} className="flex h-full w-full items-center justify-center">
        <ChapterPlate art={chapter.art} register={registerMirror} />
      </RevealSlot>
    );

  // The page's champion drawings, on the same channel and for the same reason
  // as the illustration above: a turning spread keeps showing the OUTGOING
  // chapter's paper until the sheet lands, so the drawing does not fade out
  // from under a page that is still on screen.
  const backdropChapter = turning?.chapter ?? chapter;

  /* Two labels and nothing else. The exits used to carry a line of explanation
     each and a footnote under them; on a page whose whole job is to CLOSE, that
     reads as a dashboard rather than as an ending. */
  const exits = (
    <div className="tome-exits">
      <ExitButton
        buttonRef={exitsRef}
        onClick={startExploring}
        testId="academy-welcome-explore"
        Icon={Compass}
        label="Enter the Academy"
        primary
      />
      {/* Genuinely a peer, not a trap door: both routes into the product are
          legitimate, and the tutorial must never read as the price of entry. */}
      <ExitButton
        onClick={startTutorial}
        testId="academy-welcome-tutorial"
        Icon={GraduationCap}
        label="Start the tutorial"
      />
    </div>
  );

  // The right page. Four chapters out of five are the same templated writing;
  // the finale composes its own (see FinaleSpread).
  const body = isFinale ? (
    <FinaleDiscoveryPage
      chapter={chapter}
      step={step}
      terminalSlot={1 + chapterBlocks(chapter.lines).length}
      artRevealed={artRevealed}
      terminal={exits}
    />
  ) : (
    <ChapterWriting
      chapter={chapter}
      step={step}
      headingId={`tome-chapter-${chapter.id}`}
      onSignIn={startSignIn}
      terminal={
        chapter.registration ? (
          <RegistrationForm
            value={registration}
            onChange={setRegistration}
            onSubmit={handleRegistered}
          />
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
      data-registered={registered ? "true" : "false"}
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
        data-testid="academy-welcome-scene"
        className="tome-scene relative z-10 flex flex-1 flex-col items-center justify-center px-4 sm:px-6"
        /* The scene's own padding is part of the chrome budget the tome sizes
           itself against, so it is stated here from the same table rather than
           as a Tailwind class the budget cannot see. */
        style={{ paddingTop: SCENE_PADDING[chromeKey] / 2, paddingBottom: SCENE_PADDING[chromeKey] / 2 }}
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
            champions={backdropChapter.champions}
            championsVisible={artRevealed || turning !== null}
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
            chrome={chrome.budget}
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* The forward control                                                */}
        {/* ---------------------------------------------------------------- */}
        {/* THE ROW IS ALWAYS HERE; the button inside it is not. That is the
            whole of the tome-stability fix on this side: the row reserves its
            height from tomeChrome.ts whether or not it has a control in it, so
            dropping the button on the register and on the finale no longer
            re-centres the column and slides the book down the screen. It is
            `aria-hidden` when empty rather than merely childless, so nothing
            announces an empty group. */}
        <div
          className="tome-controls"
          data-testid="academy-welcome-controls"
          data-occupied={!exitsVisible && !formVisible ? "true" : "false"}
          style={{ ["--tome-controls-h" as string]: `${chrome.controls}px` } as CSSProperties}
        >
          {/* Present until the page's own forward action takes over: the
              register's submit, or the finale's two exits. A third control
              beside either would only muddy the decision. */}
          {!exitsVisible && !formVisible && (
            <button
              type="button"
              onClick={handleAdvance}
              data-testid="academy-welcome-advance"
              data-mode="next"
              /* What the press will do to the REVEAL, for tests and for anyone
                 debugging the cadence. It deliberately does not change the
                 label: one control, one word, one outcome. */
              data-reveal={complete ? "complete" : "partial"}
              className="tome-advance group"
            >
              <span>Next</span>
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* The rail — back, the ribbon, and the low-key exit               */}
        {/* -------------------------------------------------------------- */}
        {/* Reserved exactly like the row above it, and for the same reason:
            Back appears on chapter two and the exit appears once the register
            is answered, and neither may move the book. */}
        <div
          className="tome-rail"
          data-testid="academy-welcome-rail"
          style={{ ["--tome-rail-h" as string]: `${chrome.rail}px` } as CSSProperties}
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
                It performs exactly what Enter the Academy performs. It disappears
                at the finale, where the two paths ARE the exit.

                AND IT DOES NOT EXIST BEFORE THE REGISTER IS ANSWERED (HI1-C5B).
                An exit offered beside a required question is an invitation to
                answer it with a shrug — and the two answers behind it are the
                only reason the introduction asks for anything at all. Gated on
                a registration EXISTING rather than on the chapter index, so a
                returning visitor replaying the introduction keeps their exit on
                page one: they have already given what it is being withheld
                for. */}
            {!exitsVisible && registered && (
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
 * A chapter's right-hand page: eyebrow, heading, the body copy block by block,
 * and — on the register — its terminal control.
 *
 * FOUR CHAPTERS OUT OF FIVE. The finale composes its own two pages instead (see
 * FinaleSpread), which is why the only terminal this renders now is the
 * register's form.
 *
 * Rendered twice per page turn: live on the incoming spread, and as a GHOST on
 * the front face of the turning sheet — the outgoing words must visibly ride
 * the paper as it lifts. The ghost is presentation only: no ids (the live
 * heading keeps its), no live region, no controls, and a `tome-ghost` wrapper
 * class the CSS uses to hold every ink animation at its finished frame.
 *
 * SLOT NUMBERING MUST MATCH slotCount() in useRevealSequence. The chapter
 * label and heading are slot 0, together; each BLOCK of copy (see cadence.ts —
 * one authored line, arriving whole) takes the next slot; then ONE terminal
 * slot, which is the finale's exits or the register's form. The two kinds of
 * terminal are one slot on purpose: they are the same thing to the sequence, a
 * control that belongs to the page rather than to the tome, arriving last.
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
  onSignIn,
}: {
  chapter: AcademyChapter;
  step: number;
  ghost?: boolean;
  headingId?: string;
  /** The finale's exits, or the register's form. Never rendered on a ghost. */
  terminal?: React.ReactNode;
  /**
   * The register's quiet way out for a returning visitor. A handler rather than
   * a node, because the markup and the slot arithmetic that decides when it is
   * live belong together — see the render below.
   */
  onSignIn?: () => void;
}) {
  const blocks = chapterBlocks(chapter.lines);
  const terminalSlot = 1 + blocks.length;
  const signInSlot = terminalSlot + (chapter.registration ? 1 : 0);

  return (
    <div
      className={["tome-writing", ghost ? "tome-ghost" : ""].join(" ")}
      // The chapter as a whole is announced, so a screen reader hears a
      // complete page rather than a trickle of fragments. The visual reveal is
      // decoration over text that is already in the document.
      aria-live={ghost ? undefined : "polite"}
      aria-atomic={ghost ? undefined : "true"}
    >
      {/* The chapter label and its heading are ONE beat: they arrive together,
          which is what makes the top of the page read as a title rather than as
          two things taking turns. */}
      <RevealSlot revealed={step > 0} className="w-full">
        <p className="tome-eyebrow">{chapter.eyebrow}</p>
        <h1 id={ghost ? undefined : headingId} className="tome-heading">
          {chapter.heading}
        </h1>
      </RevealSlot>

      {blocks.map((text, i) => (
        <InkBlock key={text} text={text} revealed={step > 1 + i} />
      ))}

      {/* Conditionally mounted, unlike everything above — see the note on
          ghosts and the tab order at the top of this component. */}
      {!ghost && step > terminalSlot && terminal}

      {/* The last thing on the last slot of the register, and the reason it is
          a slot at all: a new visitor has read the register, filled it in and
          seen its button before this line exists to be read. A returning
          visitor scanning for it finds it exactly where an escape hatch belongs
          — at the bottom, after the page's own business.

          MOUNTED FROM THE START, REVEALED LAST. Unlike the terminal slot above
          it, this one holds its space in the layout the whole time: the
          register is a form someone is typing into, and a line appearing under
          it would shove the field they are looking at. So the row is always in
          flow and only its INK waits — which is exactly the contract every
          other slot on the page already keeps.

          The button is `disabled` until its slot opens, which is what stops a
          transparent control from being a tab trap or a stray click target; the
          conditional mount the exits use would not reserve the space, and
          `aria-hidden` alone would not stop a keyboard reaching it. */}
      {!ghost && chapter.registration && onSignIn && (
        <RevealSlot revealed={step > signInSlot} className="w-full">
          <p className="tome-signin" aria-hidden={step > signInSlot ? undefined : "true"}>
            <span className="tome-signin-lead">Already have an account?</span>
            <button
              type="button"
              onClick={onSignIn}
              disabled={step <= signInSlot}
              data-testid="academy-welcome-signin"
              className="tome-signin-action"
            >
              Sign In
            </button>
          </p>
        </RevealSlot>
      )}
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
  primary = false,
}: {
  buttonRef?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  testId: string;
  Icon: React.ElementType;
  label: string;
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
    </button>
  );
}
