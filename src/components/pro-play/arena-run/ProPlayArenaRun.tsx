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
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";

import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { Button } from "@/components/ui/button";
import { PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";
import type { ProPlayArenaController, ProPlayRunPip } from "@/lib/pro-play/arena";
import { cn } from "@/lib/utils";
import { composeProPlayArenaStage } from "./composeProPlayArenaStage";

export interface ProPlayArenaRunProps {
  controller: ProPlayArenaController;
  /** Where "Back to Pro Play" goes. */
  exitTo?: string;
  /** Rendered above the arena (the shell's chrome row). */
  chrome?: ReactNode;
  /** PPQ2-D — positional tablet reveal content; used only after grading. */
  revealSlots?: ReadonlyArray<ReactNode | null>;
}

/** 44px touch target below `lg`; 36px where the stage height is definite. */
const ACTION_BOX = "h-11 min-w-[8.5rem] shrink-0 lg:h-9";

/**
 * Next / See results. Takes focus when it appears if focus was left on the
 * page body or inside the (now locked) answer grid, so a keyboard player can
 * read the reveal and continue without hunting for the control.
 */
function NextControl({ label, enabled, onNext }: { label: string; enabled: boolean; onNext: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    const stranded = !active || active === document.body
      || active.closest?.('[data-surface-region="answers"]') !== null;
    const el = ref.current;
    if (!stranded || !el) return;
    el.focus({ preventScroll: true });
    // Below `lg` the page scrolls and the control can land just under the
    // fold (measured: 850/844 at 390×844); bring it in, by the least amount.
    if (el.getBoundingClientRect().bottom > window.innerHeight) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  }, []);
  return (
    <Button ref={ref} type="button" data-testid="pro-play-next" onClick={onNext} disabled={!enabled}
      className={ACTION_BOX}>
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

export default function ProPlayArenaRun({ controller, exitTo = PRO_PLAY_ROUTE, chrome, revealSlots }: ProPlayArenaRunProps) {
  const { state, projection } = controller;

  const action = projection.error && projection.surface ? (
    <TryAgainControl enabled={projection.error.enabled} onTryAgain={controller.tryAgain} />
  ) : projection.next ? (
    <NextControl label={projection.next.label} enabled={projection.next.enabled} onNext={controller.next} />
  ) : <ActionReserve />;

  const view = composeProPlayArenaStage({
    state,
    projection,
    onSelectOption: controller.selectOption,
    hudAction: action,
    revealSlots,
  });

  if (view) {
    return (
      <div data-testid="pro-play-arena" data-pro-play-phase={projection.phase}>
        <CanonicalArena view={view} chrome={chrome} />
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
        <h2 className="ranked-title text-xl font-semibold">Quiz complete</h2>
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
      </FramePanel>
    );
  }

  return (
    <div data-testid="pro-play-arena" data-pro-play-phase={projection.phase}>
      <CanonicalArena view={null} chrome={chrome} recovering={{ eyebrow: "Pro Play Quiz", message: "", intro }} />
    </div>
  );
}
