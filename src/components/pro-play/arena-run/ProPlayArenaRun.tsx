/**
 * PPQ2-INT — one Pro Play run, inside the canonical arena.
 *
 * The caller owns the controller (`useProPlayArenaController`), so the same
 * component serves the live API and an injected fixture transport. This file
 * only chooses WHICH arena frame to show:
 *
 *  - a question on the stage (pre-answer, locked or revealed) → the live
 *    arena from `composeProPlayArenaStage`;
 *  - no question (first load, an error with nothing on stage, the finished
 *    run) → the arena's own empty frame with a neutral Pro Play panel.
 *
 * Answering happens only through the canonical grid (`onSelectOption` →
 * `controller.selectOption`, whose ref gate makes it exactly-once). The reveal
 * stays on the stage until Next. The arena is the report publisher; this
 * component never publishes.
 *
 * The end panel is deliberately plain (server score, received verdicts, two
 * actions): the end-screen tone is an open owner question (PPQ1 Q3), so it
 * says only what is true.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";

import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { Button } from "@/components/ui/button";
import { usePracticeAutoAdvance, usePracticeRevealPause } from "@/components/quiz/practice-arena/usePracticeAutoAdvance";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";
import { SITE_DOMAIN } from "@/lib/site-config";
import type { ProPlayArenaController, ProPlayRunPip } from "@/lib/pro-play/arena";
import { cn } from "@/lib/utils";
import { composeProPlayArenaStage, DOCK_SCROLL_MARGIN } from "./composeProPlayArenaStage";
import { proPlayExplanationDensity, proPlayRevealHoldMs } from "./proPlayAutoAdvance";
import { ProPlayOneScreenChrome, ProPlayRouteChrome } from "./ProPlayRouteChrome";

export interface ProPlayArenaRunProps {
  controller: ProPlayArenaController;
  /** Where "Back to Pro Play" goes. */
  exitTo?: string;
  /** Rendered above the arena (the shell's chrome row). Overrides `backLink`. */
  chrome?: ReactNode;
  /**
   * PPQ2-E: the route's way back (`ProPlayRouteChrome` to `exitTo`) in the
   * HUD band. On the empty frames it is phone-only (their panels carry the
   * way back; the loading panel gains one from `lg`).
   */
  backLink?: boolean;
  /** W26Q: the way-back label ("Back to Worlds"); default "Back to Pro Play". */
  exitLabel?: string;
  /**
   * W26Q: shown under the server's message when a PRESET quiz cannot start
   * (`PP_PRESET_UNAVAILABLE`) — why there is no quiz, in the scope's terms.
   */
  unavailableNote?: string;
  /**
   * W26Q-UX: `one-screen` (the Worlds 2026 Quiz) is the phone one-screen arena
   * frame with nothing scrolling at any width, a header row that carries the
   * position and the site's name, and a graded reveal that moves the run on by
   * itself after its hold, with no Next / See results control. The default is
   * the Pro Play Quiz exactly as it was.
   */
  presentation?: "standard" | "one-screen";
}

/** The server refused a preset session for lack of verified questions. */
const PRESET_UNAVAILABLE = "PP_PRESET_UNAVAILABLE";

/**
 * PPQ2-E — the arena frame's glow bleeds 0.25rem past the shell on each side
 * (`.ranked-shell::before`). Inside a centred desktop column that is harmless,
 * but where the frame is as wide as the viewport it is real horizontal
 * overflow: 394/390 on the loading, error and end frames on a phone (the
 * shared empty frame does not take PPQ2-A's `phoneStacked` bleed rule), and
 * 1028/1024 on every frame at 1024 (PPQ2-A A5, shared by all full-bleed
 * arenas). A mobile browser answers 4px of overflow by zooming the page out.
 * `overflow-x: clip` trims the bleed at the page edge for this route only: it
 * is not a scroll container, so nothing gains a scrollbar and sticky or fixed
 * descendants are unaffected; the dock and popovers are portalled outside.
 */
const FRAME_CLIP = "overflow-x-clip";

/**
 * W26Q-UX — the compact stage: a phone (below `lg`) shorter than 760px, which
 * covers a 360x640 portrait phone and every landscape phone. MVFIT1's own
 * short-phone band, and the query Practice uses for the same budget. Off in
 * jsdom (no `matchMedia`).
 */
export const PRO_PLAY_COMPACT_QUERY = "(max-width: 1023.98px) and (max-height: 760px)";

function useCompactStage(enabled: boolean): boolean {
  const read = () => enabled && typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(PRO_PLAY_COMPACT_QUERY).matches;
  const [compact, setCompact] = useState(read);
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(PRO_PLAY_COMPACT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [enabled]);
  return enabled && compact;
}

/** Either reduced-motion switch: the OS preference or the app's own. */
function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    || document.documentElement.classList.contains("reduce-motion");
}

/**
 * Focus was not put anywhere on purpose: nothing, the page body, or the
 * answer grid (whose control just locked or unmounted). Only then may the
 * arena move it.
 */
function focusStranded(): boolean {
  const active = document.activeElement;
  return !active || active === document.body
    || active.closest?.('[data-surface-region="answers"]') !== null;
}

/**
 * Bring `el` fully into view below the fixed HUD band, scrolling to `anchor`'s
 * top, and only when `el` is not already in view: on a height-locked desktop
 * stage this is a no-op. Instant: the stage was just replaced, so there is
 * nothing to travel through (and nothing to reduce under Reduce Motion).
 */
function revealBelowHud(el: HTMLElement, anchor: HTMLElement = el) {
  const hudBottom = document.querySelector("nav.global-hud")?.getBoundingClientRect().bottom ?? 0;
  const box = el.getBoundingClientRect();
  if (box.top >= hudBottom && box.bottom <= window.innerHeight) return;
  const top = anchor.getBoundingClientRect().top + window.scrollY - hudBottom - 8;
  window.scrollTo?.({ top: Math.max(0, top), behavior: "auto" });
}

const SUMMARY_KEY = "summary";

/**
 * PPQ2-E — THE TWO STAGE SWAPS THAT HAPPEN UNDER THE PLAYER.
 *
 * Next (or a resync, or Play again) mounts a new question, and See results
 * replaces the stage with the end panel. In both, the control the player was
 * on unmounts, so focus fell to the page body; and below `lg` the page keeps
 * its scroll offset, which was the reveal footer's. The end panel is far
 * shorter than the revealed question, so after See results its heading and
 * score sat above the viewport (390x844), and a new stem could too.
 *
 * So on exactly those transitions (the question on stage changed, or the end
 * panel replaced a question), and only when focus was stranded:
 *  - a new question: focus moves to its stem (the stage's `h2`, made
 *    programmatically focusable), which a screen reader announces once;
 *  - the end panel: focus moves to its "Quiz complete" heading;
 *  - the target is brought into view below the HUD only if it is not already.
 * Nothing happens on the first question of a page load, on ordinary renders,
 * or within one question (select, lock, reveal: the Next control and the
 * reveal footer own those). Loading and error frames never move focus.
 */
function useStageHandoff(root: RefObject<HTMLDivElement>, stageKey: string | null) {
  // undefined = nothing has been on stage yet in this mount.
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    if (stageKey === null) return; // a loading / error frame: keep the last stage
    previous.current = stageKey;
    if (before === undefined || before === stageKey) return;
    const el = root.current;
    if (!el || !focusStranded()) return;
    if (stageKey === SUMMARY_KEY) {
      const heading = el.querySelector<HTMLElement>("[data-pro-play-summary-heading]");
      const panel = el.querySelector<HTMLElement>('[data-testid="pro-play-summary"]');
      if (!heading || !panel) return;
      heading.focus({ preventScroll: true });
      revealBelowHud(panel);
      return;
    }
    const stem = el.querySelector<HTMLElement>('[data-testid="ranked-question"] [data-surface-region="prompt"] h2');
    if (!stem) return;
    stem.tabIndex = -1;
    stem.focus({ preventScroll: true });
    // The arena header strip names the new position; show it with the stem.
    revealBelowHud(stem, el.querySelector<HTMLElement>('[data-testid="ranked-header"]') ?? stem);
  }, [root, stageKey]);
}

/** 44px touch target below `lg`; 36px where the stage height is definite. */
const ACTION_BOX = "h-11 min-w-[8.5rem] shrink-0 lg:h-9";

/**
 * Next / See results. Takes focus when it appears if focus was left on the
 * page body or inside the (now locked) answer grid, so a keyboard player can
 * read the reveal and continue without hunting for the control.
 *
 * Below `lg` the page scrolls, and the reveal footer can land across the fold
 * (measured: footer 745–877 at 390×844 on a four-way question), where the
 * app's floating Report pill covers its left edge — the explanation. So the
 * WHOLE footer is brought into view above the dock, by the least amount, not
 * only this control: from `sm` the explanation sits beside the control and can
 * be taller than it. This is independent of focus: the footer is the reveal.
 */
function NextControl({ label, enabled, onNext }: { label: string; enabled: boolean; onNext: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focusStranded()) el.focus({ preventScroll: true });
    const target = el.closest<HTMLElement>("[data-pp-reveal-footer]") ?? el;
    const margin = parseFloat(getComputedStyle(target).scrollMarginBottom) || 0;
    if (target.getBoundingClientRect().bottom > window.innerHeight - margin) {
      target.scrollIntoView?.({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    }
  }, []);
  return (
    <Button ref={ref} type="button" data-testid="pro-play-next" onClick={onNext} disabled={!enabled}
      // The fallback target when there is no footer around it.
      className={cn(ACTION_BOX, DOCK_SCROLL_MARGIN)}>
      {label}
    </Button>
  );
}

/**
 * The HUD row's one control slot, reserved from the first frame. The row is as
 * tall as its control, so a control that appeared only with the reveal would
 * take its height out of the stage at that moment (measured: 736 → 696px at
 * 1440×900). An invisible box of the same size holds the slot instead.
 */
function ActionReserve() {
  return <span aria-hidden data-pro-play-action-reserve className={`invisible inline-block ${ACTION_BOX}`} />;
}

function TryAgainControl({ enabled, onTryAgain }: { enabled: boolean; onTryAgain: () => void }) {
  return (
    <Button type="button" variant="outline" data-testid="pro-play-try-again" onClick={onTryAgain}
      disabled={!enabled} className={ACTION_BOX}>
      Try again
    </Button>
  );
}

const PIP_TONE: Record<ProPlayRunPip["state"], string> = {
  correct: "border-[#3fb6a8]/70 bg-[#3fb6a8]/20 text-[#7fe3d6]",
  incorrect: "border-[#c0584f]/70 bg-[#c0584f]/15 text-[#f09a90]",
  unobserved: "border-[#b9934c]/30 bg-transparent text-muted-foreground",
  current: "border-[#e8c97a] bg-[#e8c97a]/10 text-[#e8c97a]",
  upcoming: "border-[#b9934c]/20 bg-transparent text-muted-foreground/60",
};

function RunPips({ pips }: { pips: ProPlayRunPip[] }) {
  return (
    <ol aria-label="Questions" className="flex flex-wrap justify-center gap-1.5">
      {pips.map((p) => (
        <li key={p.number} data-pip-state={p.state}
          aria-label={`Question ${p.number}: ${p.state === "unobserved" ? "answered" : p.state}`}
          className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums", PIP_TONE[p.state])}>
          {p.state === "correct" ? <Check aria-hidden className="h-3.5 w-3.5" />
            : p.state === "incorrect" ? <X aria-hidden className="h-3.5 w-3.5" />
            : p.number}
        </li>
      ))}
    </ol>
  );
}

function FramePanel({ testId, eyebrow, children }: { testId: string; eyebrow: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="ranked-panel mx-auto w-full max-w-xl space-y-3 p-6 text-center">
      <div className="ranked-eyebrow">{eyebrow}</div>
      {children}
    </div>
  );
}

export default function ProPlayArenaRun({
  controller,
  exitTo = PRO_PLAY_ROUTE,
  chrome,
  backLink = false,
  exitLabel = "Back to Pro Play",
  unavailableNote,
  presentation = "standard",
}: ProPlayArenaRunProps) {
  const { state, projection } = controller;
  const oneScreen = presentation === "one-screen";
  // W26Q: "Pro Play Quiz", or the preset's own name ("Worlds 2026 Quiz").
  const mode = projection.header.eyebrow;

  // One-screen: the only control a question ever carries is the recovery one
  // (Try again over an errored question). There is no Next / See results; the
  // HUD row's reserve is held by the stylesheet, not by an invisible button.
  const action = projection.error && projection.surface ? (
    <TryAgainControl enabled={projection.error.enabled} onTryAgain={controller.tryAgain} />
  ) : oneScreen ? null : projection.next ? (
    <NextControl label={projection.next.label} enabled={projection.next.enabled} onNext={controller.next} />
  ) : <ActionReserve />;

  const rootRef = useRef<HTMLDivElement>(null);

  // W26Q-UX: THE AUTO-ADVANCE. Armed only by a reveal the server graded
  // (`projection.reveal`), keyed on the session and question so a restart or a
  // replay can never be advanced by a stale timer. `controller.next` is the
  // same exactly-once advance the button used (it refuses while a request is in
  // flight and resyncs when the grade carried no next question).
  const footerRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotionPreference();
  const compact = useCompactStage(oneScreen);
  const holdMs = oneScreen && state.session && state.question
    ? proPlayRevealHoldMs(projection.reveal, state.question.choices.length, reducedMotion)
    : null;
  const revealKey = holdMs !== null && state.session && state.question
    ? `${state.session.session_id}:${state.question.question_id}`
    : null;
  const paused = usePracticeRevealPause(footerRef, revealKey !== null);
  usePracticeAutoAdvance({ revealKey, holdMs, paused, onAdvance: controller.next });

  const view = composeProPlayArenaStage({
    state,
    projection,
    onSelectOption: controller.selectOption,
    action,
    oneScreen: oneScreen ? {
      advance: holdMs !== null ? { holdMs, paused } : null,
      footerRef,
      densityTier: proPlayExplanationDensity(projection.reveal?.explanation),
      compact,
    } : undefined,
  });

  // What occupies the stage: a question (by its server id), the end panel, or
  // nothing (loading / error frames).
  const stageKey = view ? state.question?.question_id ?? null : projection.terminal ? SUMMARY_KEY : null;
  useStageHandoff(rootRef, stageKey);

  const rootClass = cn(FRAME_CLIP, oneScreen && "pp-one-screen");
  const oneScreenChrome = (emptyFrame: boolean) => (
    <ProPlayOneScreenChrome to={exitTo} label={exitLabel} brand={SITE_DOMAIN} emptyFrame={emptyFrame}
      number={state.question?.number ?? null} total={state.session?.total ?? 0}
      correct={state.session && state.session.answered > 0 ? state.session.score : null} />
  );

  if (view) {
    return (
      <div ref={rootRef} data-testid="pro-play-arena" data-pro-play-phase={projection.phase} className={rootClass}>
        <CanonicalArena view={view}
          chrome={chrome ?? (oneScreen ? oneScreenChrome(false) : backLink ? <ProPlayRouteChrome to={exitTo} label={exitLabel} /> : undefined)} />
      </div>
    );
  }

  const exit = (
    <Button variant="outline" asChild className="min-h-[44px] flex-1">
      <Link to={exitTo}>{exitLabel}</Link>
    </Button>
  );

  let intro: ReactNode;
  if (projection.terminal) {
    const t = projection.terminal;
    intro = (
      <FramePanel testId="pro-play-summary" eyebrow={mode}>
        {/* PPQ2-E: focused when this panel replaces the last question. */}
        <h2 data-pro-play-summary-heading tabIndex={-1} className="ranked-title text-xl font-semibold outline-none">
          Quiz complete
        </h2>
        <p className="text-4xl font-bold tabular-nums" data-testid="pro-play-final-score">
          {t.score} / {t.total}
        </p>
        <RunPips pips={t.pips} />
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button type="button" data-testid="pro-play-restart" onClick={controller.restart}
            disabled={state.busy !== null} className="min-h-[44px] flex-1">
            Play again
          </Button>
          {exit}
        </div>
      </FramePanel>
    );
  } else if (projection.error) {
    const e = projection.error;
    // A preset with too few verified questions is an honest state, not a
    // fault: the server's message in the ordinary tone, plus why.
    const unavailable = e.code === PRESET_UNAVAILABLE;
    intro = (
      <FramePanel testId={unavailable ? "pro-play-unavailable" : "pro-play-error"} eyebrow={mode}>
        <p role="alert" className={cn("text-sm", unavailable ? "text-foreground" : "text-destructive")}>{e.message}</p>
        {unavailable && unavailableNote ? (
          <p data-testid="pro-play-unavailable-note" className="text-xs text-muted-foreground">{unavailableNote}</p>
        ) : null}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button type="button" data-testid="pro-play-try-again" onClick={controller.tryAgain}
            disabled={!e.enabled} className="min-h-[44px] flex-1">
            Try again
          </Button>
          {exit}
        </div>
      </FramePanel>
    );
  } else {
    intro = (
      <FramePanel testId="pro-play-loading" eyebrow={mode}>
        <p role="status" className="text-sm text-muted-foreground">
          {projection.header.title || "Preparing questions…"}
        </p>
        {backLink && !chrome ? (
          <Link to={exitTo} data-testid="pro-play-loading-back"
            className="hidden text-xs text-muted-foreground/70 underline underline-offset-2 hover:text-muted-foreground lg:inline">
            {exitLabel}
          </Link>
        ) : null}
      </FramePanel>
    );
  }

  return (
    <div ref={rootRef} data-testid="pro-play-arena" data-pro-play-phase={projection.phase} className={rootClass}>
      <CanonicalArena view={null}
        chrome={chrome ?? (oneScreen ? oneScreenChrome(true) : backLink ? <ProPlayRouteChrome to={exitTo} label={exitLabel} fromLg={false} /> : undefined)}
        recovering={{ eyebrow: mode, message: "", intro }} />
    </div>
  );
}
