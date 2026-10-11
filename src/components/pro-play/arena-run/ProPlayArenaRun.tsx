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
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";

import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { Button } from "@/components/ui/button";
import { PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";
import type { ProPlayArenaController, ProPlayRunPip } from "@/lib/pro-play/arena";
import { cn } from "@/lib/utils";
import { composeProPlayArenaStage, DOCK_SCROLL_MARGIN } from "./composeProPlayArenaStage";
import { ProPlayRouteChrome } from "./ProPlayRouteChrome";

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
}

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

export default function ProPlayArenaRun({ controller, exitTo = PRO_PLAY_ROUTE, chrome, backLink = false }: ProPlayArenaRunProps) {
  const { state, projection } = controller;

  const action = projection.error && projection.surface ? (
    <TryAgainControl enabled={projection.error.enabled} onTryAgain={controller.tryAgain} />
  ) : projection.next ? (
    <NextControl label={projection.next.label} enabled={projection.next.enabled} onNext={controller.next} />
  ) : <ActionReserve />;

  const rootRef = useRef<HTMLDivElement>(null);
  const view = composeProPlayArenaStage({
    state,
    projection,
    onSelectOption: controller.selectOption,
    action,
  });

  // What occupies the stage: a question (by its server id), the end panel, or
  // nothing (loading / error frames).
  const stageKey = view ? state.question?.question_id ?? null : projection.terminal ? SUMMARY_KEY : null;
  useStageHandoff(rootRef, stageKey);

  if (view) {
    return (
      <div ref={rootRef} data-testid="pro-play-arena" data-pro-play-phase={projection.phase} className={FRAME_CLIP}>
        <CanonicalArena view={view} chrome={chrome ?? (backLink ? <ProPlayRouteChrome to={exitTo} /> : undefined)} />
      </div>
    );
  }

  const exit = (
    <Button variant="outline" asChild className="min-h-[44px] flex-1">
      <Link to={exitTo}>Back to Pro Play</Link>
    </Button>
  );

  let intro: ReactNode;
  if (projection.terminal) {
    const t = projection.terminal;
    intro = (
      <FramePanel testId="pro-play-summary" eyebrow="Pro Play Quiz">
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
    intro = (
      <FramePanel testId="pro-play-error" eyebrow="Pro Play Quiz">
        <p role="alert" className="text-sm text-destructive">{e.message}</p>
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
      <FramePanel testId="pro-play-loading" eyebrow="Pro Play Quiz">
        <p role="status" className="text-sm text-muted-foreground">
          {projection.header.title || "Preparing questions…"}
        </p>
        {backLink && !chrome ? (
          <Link to={exitTo} data-testid="pro-play-loading-back"
            className="hidden text-xs text-muted-foreground/70 underline underline-offset-2 hover:text-muted-foreground lg:inline">
            Back to Pro Play
          </Link>
        ) : null}
      </FramePanel>
    );
  }

  return (
    <div ref={rootRef} data-testid="pro-play-arena" data-pro-play-phase={projection.phase} className={FRAME_CLIP}>
      <CanonicalArena view={null}
        chrome={chrome ?? (backLink ? <ProPlayRouteChrome to={exitTo} fromLg={false} /> : undefined)}
        recovering={{ eyebrow: "Pro Play Quiz", message: "", intro }} />
    </div>
  );
}
