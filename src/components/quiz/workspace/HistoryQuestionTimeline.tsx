/**
 * HUB6.3D — History's persistent question timeline.
 *
 * The Ranked track (`QuestionTimeline`) is a compact five-icon rail sized for
 * a column of match records. A Daily stage is a different object: a Time
 * Trial can play thirty questions, a Survival run forty, and the stage row has
 * the width for far more than five. So History gets its own track, opted into
 * with `QuestionTimeline`'s `history` prop — Ranked rows never see it.
 *
 * WHAT CHANGED FROM THE RANKED TRACK
 * ──────────────────────────────────
 *   * AS MANY ICONS AS FIT. No fixed page size and no width cap: the track
 *     measures itself and shows every icon that fits cleanly. Paging arrows
 *     exist only when the stage has more questions than the row has room for,
 *     and then sit together at the END of the track, so every stage's first
 *     question stays on the same vertical line whether it pages or not.
 *   * LARGER ICONS, and larger again on the selected stage.
 *   * THE HISTORY OUTCOME IS THE AUTHORITY. Each position's result is the
 *     History DTO's `outcome` (via `RoundVM`), never the review payload —
 *     which cannot say "timeout", and arrives later. The icon's result is
 *     right before its art has loaded.
 *   * RESULTS ARE NEVER COLOUR ALONE. Correct: a green ring and a ✓ badge.
 *     Incorrect: a red ring and a × badge. Timeout: a dashed slate ring and a
 *     clock badge — a result of its own, not a grey "unanswered". A module
 *     (a Meta Reflex block, a Journey) that is not unanimous reads "3/5" in
 *     its badge, with a segment strip in child order across its top edge.
 *   * CROSS-HIGHLIGHT. Given a set of occurrence ids (`historyHighlight`),
 *     the positions holding them are lit and the rest step back.
 *
 * What did NOT change: the art priority (`IconFace`: proven art first, then
 * the module sigil), the one-open-at-a-time Popover on a fine pointer, the
 * bottom sheet on touch, and 44px targets on touch.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, HelpCircle, Layers, RotateCcw, X, Zap } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { IconFace, QuestionPopover } from "@/components/quiz/workspace/questionTimelineParts";
import { QuestionReviewSheet, useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import type { QuestionResult, RoundVM } from "@/components/quiz/workspace/historyViewModel";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";

export interface HistoryTimelineMode {
  /** The stage's positions, from `buildStageViewModel` — the outcome source. */
  rounds: RoundVM[];
  /** `selected`: the selected stage's row, which gets larger icons. */
  size?: "row" | "selected";
  /** Occurrence ids to light; everything else steps back. Null: no highlight. */
  highlight?: ReadonlySet<string> | null;
  /** HUB6.3E: the highlight is a lock (not a hover preview). A lock pages
   *  the rail to its first lit icon when none is on the current page; a
   *  preview never moves the rail. */
  locked?: boolean;
  /** HUB6.3E: a question's factual context, shown under its review card in
   *  the Popover and the Sheet (so it never depends on hover). */
  detail?: (round: RoundVM) => React.ReactNode;
}

/** px at a 16px root; scaled by the live root size when measured. */
export const HISTORY_GEOMETRY = {
  fine: { row: { slot: 32, gap: 5, arrow: 26, badge: 14 }, selected: { slot: 38, gap: 6, arrow: 28, badge: 16 } },
  coarse: { row: { slot: 44, gap: 4, arrow: 44, badge: 16 }, selected: { slot: 48, gap: 4, arrow: 44, badge: 17 } },
} as const;

type Verdict = QuestionResult | "mixed" | null;

/** Printed inks, one step stronger than the Ranked ring. */
const RESULT_INK: Record<QuestionResult, string> = {
  correct: "#2c7a4b",
  incorrect: "#a3372a",
  timeout: "#44607c",
};

const RING: Record<Exclude<Verdict, null> | "none", { color: string; style: "solid" | "dashed" }> = {
  correct: { color: RESULT_INK.correct, style: "solid" },
  incorrect: { color: RESULT_INK.incorrect, style: "solid" },
  timeout: { color: RESULT_INK.timeout, style: "dashed" },
  mixed: { color: "rgba(138,106,44,0.78)", style: "solid" },
  none: { color: "rgba(96,68,28,0.28)", style: "solid" },
};

const RESULT_WORD: Record<QuestionResult, string> = {
  correct: "correct",
  incorrect: "incorrect",
  timeout: "timed out",
};

const UNIT_LABEL: Record<string, string> = {
  meta_reflex: "Meta Reflex",
  journey: "Journey",
  review_replay: "Review replay",
};

const rem = (px: number) => `${px / 16}rem`;

/** The sentence a screen reader gets: position, subject, result. */
export function historyIconLabel(round: RoundVM, total: number): string {
  const first = round.occurrences[0];
  const subject = round.occurrences.length > 1
    ? UNIT_LABEL[round.unit ?? ""] ?? "Module"
    : first?.publicCategory?.label ?? UNIT_LABEL[round.unit ?? ""] ?? "Question";
  let result: string;
  if (round.occurrences.length > 1) {
    const played = round.correct + round.incorrect + round.timeout;
    result = `${round.correct} of ${played} correct`;
    if (round.timeout > 0) result += `, ${round.timeout} timed out`;
  } else {
    result = round.verdict && round.verdict !== "mixed" ? RESULT_WORD[round.verdict] : "result unknown";
  }
  const strike = strikeOf(round);
  return `Question ${round.position} of ${total}, ${subject}, ${result}${strike ? `, strike ${strike}` : ""}`;
}

/** HUB6.3C Free: the strike this position produced (a Journey child can be
 *  the striking question), from the server's per-question marker. */
export function strikeOf(round: RoundVM): number | null {
  return round.occurrences.find((o) => o.strikeIndex !== null)?.strikeIndex ?? null;
}

/** A Survival strike: a notched rubric tab on the icon's top-left corner
 *  with the strike's number — a mark of its own, not a colour. */
function StrikeTab({ index, size }: { index: number; size: number }) {
  return (
    <span
      aria-hidden="true"
      data-testid="timeline-strike"
      data-strike={index}
      className="pointer-events-none absolute z-[2] flex items-center justify-center rounded-[3px] border font-black tabular-nums leading-none"
      style={{
        left: -4, top: -5, height: rem(size), minWidth: rem(size), padding: "0 2px",
        fontSize: rem(size * 0.62), background: "#7a2820", borderColor: "#f6ecd2", color: "#fff3df",
        clipPath: "polygon(0 0, 100% 0, 100% 72%, 50% 100%, 0 72%)",
      }}
    >
      {index}
    </span>
  );
}

/** Width of the track, and the live root scale (HUB4: 200% text). */
function useTrackWidth(ref: RefObject<HTMLElement>): { width: number; k: number } {
  const [state, setState] = useState({ width: 0, k: 1 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const k = Number.isFinite(root) && root > 0 ? root / 16 : 1;
      // The CONTENT box: a stacked stage indents its rail with padding, and
      // `clientWidth` counts padding.
      const style = getComputedStyle(el);
      const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const width = Math.max(0, el.clientWidth - pad);
      setState((s) => (s.width === width && s.k === k ? s : { width, k }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return state;
}

/** At or below this many icons per line, the pager takes a line of its own
 *  rather than two icons' room: on a phone, two 44px arrows beside the icons
 *  would halve the page. */
const STACKED_PAGER_MAX = 6;
/** The range label's room, px at a 16px root. */
const RANGE_LABEL = 72;

/**
 * How many icons a page holds: every one when they all fit; otherwise as many
 * as fit beside the pager — or, on a narrow row, every icon the line holds
 * with the pager on the line below. An unmeasured track (no layout, e.g. a
 * test DOM) shows everything: the count is a fact, and nothing is hidden by
 * default.
 */
export function historyPageSize(
  total: number, width: number, k: number,
  g: { slot: number; gap: number; arrow: number },
): { pageSize: number; paged: boolean; stackedPager: boolean; rangeLabel: boolean } {
  const none = { paged: false, stackedPager: false, rangeLabel: false };
  if (width <= 0) return { pageSize: total, ...none };
  const per = (g.slot + g.gap) * k;
  const fitAll = Math.max(1, Math.floor((width + g.gap * k) / per));
  if (total <= fitAll) return { pageSize: total, ...none };
  // Arrows are fixed CSS px (a target size is a CSS-px fact; it does not
  // need to double with text), so enlarged text never pushes them apart.
  const pager = 2 * g.arrow + 2 * g.gap * k;
  if (fitAll <= STACKED_PAGER_MAX) {
    // "5–8 of 28" between the arrows, where there is room for it.
    return { pageSize: fitAll, paged: true, stackedPager: true, rangeLabel: width >= pager + RANGE_LABEL * k };
  }
  return { pageSize: Math.max(1, Math.floor((width - pager + g.gap * k) / per)), paged: true, stackedPager: false, rangeLabel: false };
}

function ResultBadge({ round, size }: { round: RoundVM; size: number }) {
  const v = round.verdict;
  if (v === null) return null;
  const base = "pointer-events-none absolute flex items-center justify-center rounded-full border font-bold tabular-nums leading-none";
  const place = { right: -3, bottom: -3, height: rem(size), minWidth: rem(size) };
  if (v === "mixed") {
    const played = round.correct + round.incorrect + round.timeout;
    return (
      <span
        aria-hidden="true"
        data-testid="timeline-badge"
        data-badge="mixed"
        className={`${base} px-[3px]`}
        style={{ ...place, fontSize: rem(size * 0.6), background: "#f3e6c4", borderColor: "rgba(96,68,28,0.55)", color: LEAGUECRAFT_INK.strong }}
      >
        {round.correct}/{played}
      </span>
    );
  }
  const Glyph = v === "correct" ? Check : v === "incorrect" ? X : Clock3;
  return (
    <span
      aria-hidden="true"
      data-testid="timeline-badge"
      data-badge={v}
      className={base}
      style={{ ...place, width: rem(size), background: RESULT_INK[v], borderColor: "#f6ecd2", color: "#fffaf0" }}
    >
      <Glyph style={{ width: rem(size * 0.68), height: rem(size * 0.68) }} strokeWidth={3} />
    </span>
  );
}

/** A module's children, in order, across its top edge. */
function SegmentStrip({ round }: { round: RoundVM }) {
  if (round.occurrences.length < 2) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-[3px] top-[2px] z-[1] flex h-[3px] gap-px" data-testid="timeline-segments">
      {round.occurrences.map((o) => (
        <span
          key={o.occurrenceId}
          className="flex-1 rounded-[1px]"
          data-segment={o.outcome ?? "unknown"}
          style={{
            background: o.outcome === "timeout"
              ? `repeating-linear-gradient(90deg, ${RESULT_INK.timeout} 0 2px, transparent 2px 3px)`
              : o.outcome ? RESULT_INK[o.outcome] : "rgba(96,68,28,0.3)",
          }}
        />
      ))}
    </span>
  );
}

/** Art for a position whose review has not loaded (or never will): the
 *  unit's drawn mark. Never entity art without proof. */
function UnitFace({ unit }: { unit: string | null }) {
  const Icon = unit === "meta_reflex" ? Zap : unit === "journey" ? Layers : unit === "review_replay" ? RotateCcw : HelpCircle;
  const faint = Icon === HelpCircle;
  return (
    <Icon
      className="h-4 w-4"
      style={{ color: faint ? "rgba(96,68,28,0.35)" : LEAGUECRAFT_INK.brass }}
      aria-hidden="true"
      data-testid="unit-sigil"
      data-unit={unit ?? "unknown"}
    />
  );
}

export default function HistoryQuestionTimeline({
  review,
  matchId,
  className = "justify-start",
  mode,
}: {
  roundCount: number;
  review: MatchReviewView | null;
  matchId: string;
  className?: string;
  mode: HistoryTimelineMode;
}) {
  const [anchor, setAnchor] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const coarse = useCoarsePointer();
  const size = mode.size ?? "row";
  const g = HISTORY_GEOMETRY[coarse ? "coarse" : "fine"][size];
  const measureRef = useRef<HTMLDivElement>(null);
  const iconRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const lastOpened = useRef<number | null>(null);
  const { width, k } = useTrackWidth(measureRef);

  const rounds = mode.rounds;
  const total = rounds.length;
  const { pageSize, paged, stackedPager, rangeLabel } = historyPageSize(total, width, k, g);

  // HUB6.3E: a LOCKED highlight whose icons are all on other pages brings
  // the first of them into view. A hover preview never moves the rail.
  const lockedTarget = useMemo(() => {
    if (!mode.locked || !mode.highlight) return null;
    const ids = mode.highlight;
    const i = rounds.findIndex((r) => r.occurrences.some((o) => ids.has(o.occurrenceId)));
    return i < 0 ? null : i;
  }, [mode.locked, mode.highlight, rounds]);
  useEffect(() => {
    if (lockedTarget === null || !paged || !mode.highlight) return;
    const ids = mode.highlight;
    const pageStart = Math.floor(anchor / pageSize) * pageSize;
    const visible = rounds.slice(pageStart, pageStart + pageSize)
      .some((r) => r.occurrences.some((o) => ids.has(o.occurrenceId)));
    if (!visible) setAnchor(lockedTarget);
    // Only when the lock itself changes: paging away afterwards is the
    // reader's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedTarget, mode.highlight, paged]);

  if (total === 0) return null;

  // The review's round for a position: by round number, else by order.
  const reviewRound = (index: number): ReviewRound | null => {
    if (!review) return null;
    const n = rounds[index].roundNumber;
    return review.rounds.find((r) => r.roundNumber === n) ?? review.rounds[index] ?? null;
  };

  const pages = Math.ceil(total / pageSize);
  const current = Math.min(Math.floor(anchor / pageSize), pages - 1);
  const start = current * pageSize;
  const slots = Array.from({ length: Math.min(pageSize, total - start) }, (_, i) => start + i);
  const step = (delta: number) => {
    setOpen(null);
    setAnchor(Math.max(0, Math.min(pages - 1, current + delta)) * pageSize);
  };
  const openRound = open !== null ? reviewRound(open) : null;
  const lit = mode.highlight ?? null;
  // Which positions hold a lit occurrence (all pages), and a key that
  // changes with the highlight so a lit icon's pulse replays exactly once.
  const litIndexes = lit
    ? rounds.flatMap((r, i) => (r.occurrences.some((o) => lit.has(o.occurrenceId)) ? [i] : []))
    : [];
  const pulseKey = lit ? litIndexes.join(",") + "|" + lit.size : "";
  const litBefore = litIndexes.some((i) => i < start);
  const litAfter = litIndexes.some((i) => i >= start + slots.length);

  const arrow = (dir: "prev" | "next") => {
    const Chevron = dir === "prev" ? ChevronLeft : ChevronRight;
    // A lit question on another page: a brass dot on the arrow toward it.
    const flagged = dir === "prev" ? litBefore : litAfter;
    return (
      <button
        type="button"
        data-testid={`timeline-${dir}`}
        aria-label={`${dir === "prev" ? "Earlier questions" : "Later questions"}${flagged ? ", highlighted questions there" : ""}`}
        data-flagged={flagged ? "true" : undefined}
        disabled={dir === "prev" ? current === 0 : current >= pages - 1}
        onClick={() => step(dir === "prev" ? -1 : 1)}
        className="flex shrink-0 items-center justify-center rounded-[4px] transition-colors hover:bg-[rgba(96,68,28,0.08)] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ width: g.arrow, height: coarse ? Math.max(44, g.arrow) : g.slot * k, color: LEAGUECRAFT_INK.brass }}
      >
        <span className="relative flex h-[22px] w-[22px] items-center justify-center rounded-[4px] border" style={{ borderColor: "rgba(96,68,28,0.4)" }}>
          <Chevron className="h-4 w-4" aria-hidden="true" />
          {flagged && (
            <span
              aria-hidden="true"
              data-testid="timeline-pager-flag"
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
              style={{ background: "#b4862a", boxShadow: "0 0 0 1.5px #f6ecd2" }}
            />
          )}
        </span>
      </button>
    );
  };

  return (
    <div
      ref={measureRef}
      role="group"
      aria-label="Stage questions"
      className={`flex w-full min-w-0 ${stackedPager ? "flex-wrap" : ""} items-center ${className}`}
      data-testid="question-timeline"
      data-timeline-mode="history"
      data-size={size}
      data-match-id={matchId}
      data-page={current}
      data-page-size={pageSize}
      data-paged={paged ? "true" : "false"}
      data-pager={paged ? (stackedPager ? "stacked" : "inline") : undefined}
      data-total={total}
      data-highlight={lit ? "on" : undefined}
      style={{ gap: rem(g.gap) }}
    >
      <ul className="flex min-w-0 items-center" style={{ gap: rem(g.gap) }} data-testid="timeline-icons">
        {slots.map((index) => {
          const round = rounds[index];
          const art = reviewRound(index);
          const verdict = round.verdict;
          const ring = RING[verdict ?? "none"];
          const label = historyIconLabel(round, total);
          const isOpen = open === index;
          const isLit = lit ? round.occurrences.some((o) => lit.has(o.occurrenceId)) : null;
          const strike = strikeOf(round);
          const icon = (
            <button
              type="button"
              ref={
                coarse
                  ? (el: HTMLButtonElement | null) => {
                      if (el) iconRefs.current.set(index, el);
                      else iconRefs.current.delete(index);
                    }
                  : undefined
              }
              data-testid="timeline-icon"
              data-round={index + 1}
              data-round-number={round.roundNumber}
              data-outcome={verdict ?? "unknown"}
              data-unit={round.unit ?? undefined}
              data-occurrences={round.occurrences.map((o) => o.occurrenceId).join(" ")}
              data-loaded={art ? "true" : "false"}
              data-lit={isLit === null ? undefined : isLit ? "true" : "false"}
              data-open={isOpen ? "true" : undefined}
              aria-label={label}
              title={label}
              disabled={!art}
              aria-haspopup={coarse && art ? "dialog" : undefined}
              onClick={
                coarse
                  ? () => {
                      lastOpened.current = index;
                      setOpen(index);
                    }
                  : undefined
              }
              className="lc-question-icon relative flex shrink-0 items-center justify-center rounded-[5px] transition-[opacity,filter,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default motion-reduce:transition-none"
              style={{
                width: rem(g.slot),
                height: rem(g.slot),
                background: LEAGUECRAFT_INK.inset,
                borderWidth: 2,
                borderStyle: isOpen ? "solid" : ring.style,
                borderColor: isOpen ? LEAGUECRAFT_INK.strong : ring.color,
                opacity: isLit === false ? 0.32 : 1,
                filter: isLit === false ? "saturate(0.35)" : undefined,
                boxShadow: isLit ? `0 0 0 2px #f6ecd2, 0 0 0 4px ${LEAGUECRAFT_INK.brass}` : undefined,
              }}
            >
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-[3px]">
                {art ? <IconFace round={art} /> : <UnitFace unit={round.unit} />}
              </span>
              <SegmentStrip round={round} />
              <ResultBadge round={round} size={g.badge} />
              {strike !== null && <StrikeTab index={strike} size={g.badge} />}
              {isLit && (
                <span key={pulseKey} aria-hidden="true" className="history-lit-pulse pointer-events-none absolute -inset-[5px] rounded-[8px]" />
              )}
            </button>
          );
          if (coarse) return <li key={index}>{icon}</li>;
          return (
            <li key={index}>
              <QuestionPopover
                open={isOpen}
                onOpenChange={(next) => setOpen(next ? index : null)}
                round={art}
                position={index + 1}
                total={total}
                footer={mode.detail ? mode.detail(round) : undefined}
              >
                {icon}
              </QuestionPopover>
            </li>
          );
        })}
      </ul>

      {paged && (
        <div
          className={`flex shrink-0 items-center ${stackedPager ? "basis-full" : ""}`}
          style={{ gap: rem(g.gap) }}
          data-testid="timeline-pager"
        >
          {arrow("prev")}
          {/* On its own line there is room to say where the reader is. */}
          {rangeLabel && (
            <span className="w-[4.5rem] shrink-0 text-center text-[11px] font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.body }} data-testid="timeline-range" aria-live="polite">
              {start + 1}–{start + slots.length} of {total}
            </span>
          )}
          {arrow("next")}
        </div>
      )}

      {coarse && (
        <QuestionReviewSheet
          round={openRound}
          position={(open ?? 0) + 1}
          total={total}
          label={open !== null ? historyIconLabel(rounds[open], total) : "Question review"}
          onClose={() => setOpen(null)}
          footer={open !== null && mode.detail ? mode.detail(rounds[open]) : undefined}
          returnFocusTo={() =>
            lastOpened.current !== null ? iconRefs.current.get(lastOpened.current) ?? null : null
          }
        />
      )}
    </div>
  );
}
