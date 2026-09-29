/**
 * The pieces every question timeline shares — Ranked's (`QuestionTimeline`)
 * and History's (`HistoryQuestionTimeline`, HUB6.3D): the icon's art, and the
 * fine-pointer Popover that opens a question's review card. Moved here
 * verbatim so both tracks draw the same art and open the same card.
 */
import { HelpCircle, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import ModuleSigil from "@/components/quiz/workspace/ModuleSigil";
import { resolveQuestionIcon } from "@/components/quiz/workspace/questionIcons";
import type { ReviewRound } from "@/lib/ranked-public/contracts";

export function IconFace({ round }: { round: ReviewRound | null }) {
  if (!round) {
    return (
      <HelpCircle
        className="h-4 w-4"
        style={{ color: "rgba(96,68,28,0.35)" }}
        aria-hidden="true"
      />
    );
  }
  const icon = resolveQuestionIcon(round.iconHint);
  if (icon.glyph === "meta_reflex") {
    return (
      <Zap
        className="h-4 w-4"
        style={{ color: LEAGUECRAFT_INK.brass }}
        aria-hidden="true"
      />
    );
  }
  if (!icon.src) {
    // HUB6.2: a Mastery module with no proven art wears its module sigil,
    // not the "no picture" question mark.
    if (round.kind === "mastery_slice") return <ModuleSigil kind="mastery_slice" />;
    if (round.kind === "order_forge") return <ModuleSigil kind="order_forge" />;
    return (
      <HelpCircle
        className="h-4 w-4"
        style={{ color: LEAGUECRAFT_INK.brass }}
        aria-hidden="true"
      />
    );
  }
  /**
   * A CATEGORY mark is printed quieter than an entity portrait — but only
   * just.
   *
   * The category tiles are real League art (the Objectives tile is the Elder
   * Dragon; Summoners is Flash; Items is Infinity Edge), so at full strength
   * they read as "this question is about Flash", which is the false
   * specificity this phase set out to remove. The first attempt at separating
   * them — `sepia(0.6) saturate(0.65)` at 55% opacity — over-corrected: Flash
   * and the Elder Dragon are recognised BY their colour, and dulled that far
   * they stopped being recognisable at all, which trades one wrong reading
   * for a worse one.
   *
   * So the parchment mutes them rather than erasing them: most of the colour
   * survives, the sheet warms them a little, and the difference from an entity
   * portrait is carried mostly by the ring and the label. A reader can still
   * tell Flash from a champion portrait at 28px, which is the actual job.
   */
  return (
    <img
      src={icon.src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      data-specific={icon.specific ? "true" : "false"}
      className="h-full w-full rounded-[3px] object-cover"
      style={
        icon.specific
          ? undefined
          : { opacity: 0.88, filter: "sepia(0.18) saturate(0.92) brightness(0.97)" }
      }
    />
  );
}

/** One icon's fine-pointer review Popover (the trigger is the icon). */
export function QuestionPopover({
  open,
  onOpenChange,
  round,
  position,
  total,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  round: ReviewRound | null;
  position: number;
  total: number;
  children: React.ReactElement;
  /** HUB6.3E (History only): the question's factual context, under the
   *  card. Ranked passes nothing and is unchanged. */
  footer?: React.ReactNode;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {round && (
        <PopoverContent
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          // Long content scrolls inside the card rather than growing
          // past the viewport; the flip is Radix's, the ceiling is
          // ours, and together they are what makes an icon at the
          // bottom-right of the screen still openable.
          /**
           * `!animate-none` is a CORRECTNESS fix, not a taste one.
           *
           * The shared `PopoverContent` carries `animate-in` /
           * `animate-out`, and Radix's `Presence` keeps a closing
           * layer MOUNTED until its exit animation fires
           * `animationend`. Where that event never arrives — a
           * backgrounded tab is the easy way to see it — the card
           * stays in the DOM at full opacity forever and every
           * question the reader opened stacks up on the page. It was
           * reproduced exactly that way in the preview.
           *
           * It has to be a class rather than an inline style:
           * Radix's popper spreads `animation: undefined` AFTER the
           * caller's `style`, which DELETES an inline `animation`
           * (verified in the DOM). `!important` then removes any
           * dependence on class-merge ordering, and it makes
           * `animationName` read "none" — the condition `Presence`
           * unmounts on immediately.
           *
           * The card therefore opens and closes instantly, which is
           * also the least motion this surface could have, so
           * reduced-motion needs no separate branch.
           */
          /**
           * A QUICK INSPECTOR, not a scrolling debug panel.
           *
           * Wide (~460px) and short: the earlier 320px column turned
           * a four-option question into a tall scroller, and the
           * thing a reader wants here is to glance at one question
           * and move to the next. The internal scroll is a backstop
           * for genuinely long content rather than the normal case.
           *
           * The height cap is `min(24rem, available)` and the second
           * term matters: `--radix-popper-available-height` is the
           * space Radix actually measured on the side it chose,
           * already net of `collisionPadding`. Capping on `72vh`
           * instead overflowed the viewport by a few pixels whenever
           * the row sat closer to an edge than 24rem — measured at
           * 4px past the fold on a 1280x800 window.
           *
           * `lc-vellum` re-applies the parchment ink INSIDE the
           * portal — this content renders outside the ledger's
           * subtree, so without it the card would print dark-theme
           * text on a light sheet. `lc-vellum--card` gives it the
           * sheet's TONE without the torn silhouette: a floating
           * card with burnt edges reads as a scrap, and this one has
           * to be a bounded, scrollable box.
           */
          className="lc-vellum lc-vellum--card !animate-none max-h-[min(24rem,var(--radix-popper-available-height))] w-[min(29rem,calc(100vw-2rem))] overflow-y-auto rounded border p-3.5"
          style={{
            borderColor: LEAGUECRAFT_INK.rule,
            boxShadow: "0 22px 48px -26px rgba(0,0,0,0.7)",
          }}
          data-testid="question-review-popover"
        >
          <QuestionReviewCard
            round={round}
            position={position}
            total={total}
          />
          {footer}
        </PopoverContent>
      )}
    </Popover>
  );
}
