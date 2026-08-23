/**
 * MALT B1 — the question timeline inside one Ranked match record.
 *
 * A row of small icons, one per round, in the middle of the record where the
 * empty space used to be. It is the record's payload: a Ranked result that
 * says only "won, +22" is a ledger line, and a Ranked result that shows what
 * you were tested on is a study record.
 *
 * PAGING BELONGS TO THE MATCH, NOT TO THE LIST
 * ────────────────────────────────────────────
 * Five icons at a time, and the arrows page within THIS record only. Each
 * match owns its own page index, so stepping match A's timeline to 6-10
 * leaves every other row exactly where it was. Paging the whole History list
 * to see one match's later questions would be the wrong object moving.
 *
 * THE ICONS ARE PLACEHOLDERS UNTIL THE REVIEW LANDS — AND THAT IS TRUE
 * ────────────────────────────────────────────────────────────────────
 * The row already knows how many rounds the match had (`finalRoundNumber` off
 * the history entry), so the timeline renders its full length immediately and
 * fills in subject art and outcome as the per-match review arrives. A match
 * whose review never arrives keeps the placeholders: the count is still a
 * fact, and the shape does not jump when the data lands.
 *
 * ONE POPOVER PER RECORD
 * ──────────────────────
 * Every icon is its own Radix `Popover`, but the OPEN one is this component's
 * state, so clicking a second question swaps the card rather than stacking
 * two. Radix owns the parts that are easy to get wrong by hand: anchoring to
 * the clicked icon, flipping near a viewport edge instead of overflowing,
 * Escape, click-away, and returning focus to the icon that opened it.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight, HelpCircle, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import {
  questionIconLabel,
  questionOutcome,
  resolveQuestionIcon,
  type QuestionOutcome,
} from "@/components/quiz/workspace/questionIcons";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";

/** How many icons a page shows. The product's number, not a derived one. */
export const TIMELINE_PAGE_SIZE = 5;

/**
 * The state ring. Restrained on purpose: a timeline of ten icons each wearing
 * a coloured halo is a Christmas tree, and the record has to stay readable as
 * a COLUMN of matches. So an outcome moves the border and nothing else — no
 * fill, no glow, no badge.
 *
 * Printed depths, not lit ones — the same jade and rubric the verdict labels
 * use, so a row's mark and its questions' marks are one palette on paper.
 */
const OUTCOME_RING: Record<QuestionOutcome, string> = {
  correct: "rgba(31,92,60,0.62)",
  incorrect: "rgba(122,40,32,0.62)",
  unanswered: "rgba(96,68,28,0.28)",
};

function IconFace({ round }: { round: ReviewRound | null }) {
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

export default function QuestionTimeline({
  roundCount,
  review,
  matchId,
  className = "",
}: {
  /** How many rounds the match had. Known from the history row before any
   *  review is fetched, which is what lets the timeline render immediately. */
  roundCount: number;
  /** The loaded review, or null while it is pending or unavailable. */
  review: MatchReviewView | null;
  matchId: string;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  // The review is the authority on how many rounds there were once it lands —
  // a match can end on round 5 with five rows, and a legacy row could disagree
  // with the result's own count. Until then the history row's number stands.
  const total = review ? review.rounds.length : Math.max(0, roundCount);
  if (total === 0) return null;

  const pages = Math.ceil(total / TIMELINE_PAGE_SIZE);
  const current = Math.min(page, pages - 1);
  const start = current * TIMELINE_PAGE_SIZE;
  const slots = Array.from(
    { length: Math.min(TIMELINE_PAGE_SIZE, total - start) },
    (_, i) => start + i,
  );

  const step = (delta: number) => {
    setOpen(null);
    setPage((p) => Math.max(0, Math.min(pages - 1, p + delta)));
  };

  return (
    /**
     * A FIXED-WIDTH track, centred in the row.
     *
     * The record is read down the page as a column, and the two obvious
     * layouts both break that: centring the cluster itself makes a two-round
     * match's icons start at a different x from a five-round match's, and
     * letting the track size to its contents does the same. So the track is a
     * constant width (five icons plus both arrow slots), centred once, with
     * its contents left-aligned inside it — every row's first question sits on
     * the same vertical line, however long the match was.
     */
    <div
      className={`flex items-center justify-center ${className}`}
      data-testid="question-timeline"
      data-match-id={matchId}
      data-page={current}
      data-total={total}
    >
      <div className="flex w-[13rem] items-center gap-1">
        {/* The arrow SLOT is always reserved even when there is no arrow to
            put in it, which is what keeps the icons aligned between a paging
            match and a short one. The control itself still only exists when
            it can do something. */}
        <span className="flex w-[18px] shrink-0 justify-center">
          {pages > 1 && (
            <button
              type="button"
              data-testid="timeline-prev"
              aria-label="Earlier questions"
              disabled={current === 0}
              onClick={() => step(-1)}
              /* Legible without being loud: the chevron sits in its own
                 small ruled tile, in ink rather than in a 60%-alpha brass
                 that vanished against the sheet. It is still the quietest
                 control on the row. */
              className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border transition-colors disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ borderColor: "rgba(96,68,28,0.34)", color: LEAGUECRAFT_INK.brass }}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </span>

      <ul className="flex items-center gap-1" data-testid="timeline-icons">
        {slots.map((index) => {
          const round = review?.rounds[index] ?? null;
          const outcome = round ? questionOutcome(round) : "unanswered";
          const label = round
            ? questionIconLabel(round, index + 1, total)
            : `Question ${index + 1} of ${total}`;
          const isOpen = open === index;
          return (
            <li key={index}>
              <Popover
                open={isOpen}
                onOpenChange={(next) => setOpen(next ? index : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-testid="timeline-icon"
                    data-round={index + 1}
                    data-outcome={outcome}
                    data-loaded={round ? "true" : "false"}
                    aria-label={label}
                    title={label}
                    // A timeline with no review yet has nothing to open, and a
                    // control that opens nothing should not be a tab stop.
                    disabled={!round}
                    className="lc-question-icon flex h-7 w-7 items-center justify-center overflow-hidden rounded-[4px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                    data-open={isOpen ? "true" : undefined}
                    style={{
                      background: LEAGUECRAFT_INK.inset,
                      borderColor: isOpen
                        ? LEAGUECRAFT_INK.strong
                        : OUTCOME_RING[outcome],
                    }}
                  >
                    <IconFace round={round} />
                  </button>
                </PopoverTrigger>
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
                      position={index + 1}
                      total={total}
                    />
                  </PopoverContent>
                )}
              </Popover>
            </li>
          );
        })}
      </ul>

        <span className="flex w-[18px] shrink-0 justify-center">
          {pages > 1 && (
            <button
              type="button"
              data-testid="timeline-next"
              aria-label="Later questions"
              disabled={current >= pages - 1}
              onClick={() => step(1)}
              className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border transition-colors disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ borderColor: "rgba(96,68,28,0.34)", color: LEAGUECRAFT_INK.brass }}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
