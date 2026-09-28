/**
 * HUB6.1 — ONE question, openable from anywhere a stage draws it.
 *
 * Stage Focus draws a stage's rounds as a path, lane or card row rather than
 * as HUB3's paged timeline, but a question opened from there must be the SAME
 * question inspector: the frozen `QuestionReviewCard`, in a Popover on a fine
 * pointer and in HUB3's `QuestionReviewSheet` on touch, with the same focus
 * handling, Escape and scroll behaviour. This is that trigger for a single
 * round. It is deliberately the timeline's own wiring — the same card, the
 * same sheet, the same popover classes and test ids — not a second inspector.
 *
 * Before the stage's frozen review has loaded there is nothing to open, so
 * the trigger is disabled rather than a tab stop that does nothing.
 */
import { useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { QuestionReviewSheet, useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { questionIconLabel } from "@/components/quiz/workspace/questionIcons";
import type { ReviewRound } from "@/lib/ranked-public/contracts";

export default function QuestionInspector({
  round,
  position,
  total,
  children,
  className = "",
  style,
  testId = "inspector-question",
  extra,
}: {
  /** The round's frozen review, or null while it is pending/unavailable. */
  round: ReviewRound | null;
  /** 1-based position of the round in its stage, and the stage's round count. */
  position: number;
  total: number;
  /** The face the stage draws for this question. */
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  /** Extra data attributes for the trigger. */
  extra?: Record<string, string>;
}) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const label = round ? questionIconLabel(round, position, total) : `Question ${position} of ${total}`;

  const trigger = (
    <button
      type="button"
      ref={coarse ? ref : undefined}
      data-testid={testId}
      data-round={position}
      data-loaded={round ? "true" : "false"}
      data-open={open ? "true" : undefined}
      aria-label={label}
      title={label}
      disabled={!round}
      aria-haspopup={coarse && round ? "dialog" : undefined}
      onClick={coarse ? () => setOpen(true) : undefined}
      className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${className}`}
      style={style}
      {...extra}
    >
      {children}
    </button>
  );

  if (coarse) {
    return (
      <>
        {trigger}
        <QuestionReviewSheet
          round={open ? round : null}
          position={position}
          total={total}
          label={label}
          onClose={() => setOpen(false)}
          returnFocusTo={() => ref.current}
        />
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {round && (
        <PopoverContent
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          // The timeline's popover, exactly: see `QuestionTimeline` for why
          // it is instant (`!animate-none`), capped by the measured height,
          // and re-inked with `lc-vellum` inside the portal.
          className="lc-vellum lc-vellum--card !animate-none max-h-[min(24rem,var(--radix-popper-available-height))] w-[min(29rem,calc(100vw-2rem))] overflow-y-auto rounded border p-3.5"
          style={{ borderColor: LEAGUECRAFT_INK.rule, boxShadow: "0 22px 48px -26px rgba(0,0,0,0.7)" }}
          data-testid="question-review-popover"
        >
          <QuestionReviewCard round={round} position={position} total={total} />
        </PopoverContent>
      )}
    </Popover>
  );
}
