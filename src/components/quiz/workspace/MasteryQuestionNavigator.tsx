/**
 * MATCH HISTORY V2.1 — the numbered question selector for a reviewed Mastery
 * Journey segment.
 *
 * A frozen `mastery_slice` holds N challenges (five in the Journey, but this
 * never assumes it). The review used to stack all N in one scrolling popover;
 * it now shows ONE at a time and this is how the reader moves between them:
 *
 *   Question 3 of 5                         ‹ Previous   Next ›
 *   [1 ✓] [2 ✕] [3 –] [4 ✓] [5 ✓]
 *
 * WHAT IT IS, SEMANTICALLY
 * ────────────────────────
 * A WAI-ARIA tablist (automatic activation): the numbers are the tabs, the
 * challenge below is the tabpanel. Exactly one tab is in the page tab order
 * (roving tabindex); Left/Right/Home/End move and select. Previous/Next are
 * plain buttons that stay focusable and answer `aria-disabled` at either end,
 * so activating the last "Next" never throws focus to the page body inside a
 * modal sheet.
 *
 * THIS IS REVIEW, NOT REPLAY
 * ──────────────────────────
 * Nothing here answers a question. It selects which frozen record is shown.
 *
 * SEALED ROUNDS LEAK NOTHING
 * ──────────────────────────
 * The status of a tab is derived by the caller from the same revealed-gated
 * facts the card prints. A sealed round gets `sealed` for every tab: no tint,
 * no glyph, no `data-status` word and no aria text beyond "Question n of N".
 * Colour is never the only signal otherwise: every status has its own glyph
 * and a spoken word.
 */
import { useId, useRef, type KeyboardEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Minus, X } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";

export type MasteryNavStatus = "correct" | "incorrect" | "unanswered" | "sealed";

const STATUS = {
  correct: { ink: "#1f5c3c", edge: "rgba(31,92,60,0.5)", fill: "rgba(31,92,60,0.09)", word: "correct", Glyph: Check },
  incorrect: { ink: LEAGUECRAFT_INK.rubric, edge: "rgba(122,40,32,0.5)", fill: "rgba(122,40,32,0.08)", word: "incorrect", Glyph: X },
  unanswered: { ink: LEAGUECRAFT_INK.faint, edge: "rgba(96,68,28,0.3)", fill: "transparent", word: "unanswered", Glyph: Minus },
  sealed: { ink: LEAGUECRAFT_INK.body, edge: "rgba(96,68,28,0.3)", fill: "transparent", word: null, Glyph: null },
} as const;

export function MasteryQuestionNavigator({
  statuses, selected, onSelect, panelId, tabIdPrefix,
}: {
  /** One entry per frozen challenge, in order. */
  statuses: MasteryNavStatus[];
  /** Zero-based index of the challenge on show. */
  selected: number;
  onSelect: (index: number) => void;
  /** The `id` of the tabpanel this navigator controls. */
  panelId: string;
  /** Prefix of the tab ids, so the panel can name its tab. */
  tabIdPrefix: string;
}) {
  const coarse = useCoarsePointer();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();
  const count = statuses.length;
  const atStart = selected <= 0;
  const atEnd = selected >= count - 1;

  const go = (index: number, moveFocus: boolean) => {
    const next = Math.max(0, Math.min(count - 1, index));
    if (next === selected) return;
    onSelect(next);
    if (moveFocus) tabs.current[next]?.focus();
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const target =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? selected + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp" ? selected - 1
          : e.key === "Home" ? 0
            : e.key === "End" ? count - 1
              : null;
    if (target === null) return;
    e.preventDefault();
    go(target, true);
  };

  const tile = coarse ? "h-11 min-w-[2.75rem]" : "h-8 min-w-[2.25rem]";
  const stepper = coarse ? "h-11 px-3" : "h-8 px-2";

  const step = (dir: "prev" | "next") => {
    const Chevron = dir === "prev" ? ChevronLeft : ChevronRight;
    const disabled = dir === "prev" ? atStart : atEnd;
    return (
      <button
        type="button"
        data-testid={`review-mastery-${dir}`}
        aria-label={dir === "prev" ? "Previous question" : "Next question"}
        aria-disabled={disabled ? "true" : undefined}
        onClick={() => !disabled && go(selected + (dir === "prev" ? -1 : 1), false)}
        className={`inline-flex ${stepper} items-center gap-1 rounded-[4px] border text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default aria-disabled:opacity-35`}
        style={{ borderColor: "rgba(96,68,28,0.38)", color: LEAGUECRAFT_INK.brass, background: LEAGUECRAFT_INK.inset }}
      >
        {dir === "prev" && <Chevron className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span aria-hidden="true">{dir === "prev" ? "Previous" : "Next"}</span>
        {dir === "next" && <Chevron className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div className="space-y-1.5" data-testid="review-mastery-nav" data-count={count}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span
          id={labelId}
          aria-live="polite"
          className="min-w-0 text-[12px] font-extrabold uppercase tracking-[0.14em]"
          style={{ color: LEAGUECRAFT_INK.heading }}
          data-testid="review-mastery-position"
        >
          Question {selected + 1} of {count}
        </span>
        <span className="flex items-center gap-1.5">
          {step("prev")}
          {step("next")}
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Mastery questions"
        aria-orientation="horizontal"
        className="flex flex-wrap gap-1"
        data-testid="review-mastery-selector"
      >
        {statuses.map((status, i) => {
          const tone = STATUS[status];
          const isSelected = i === selected;
          const Glyph = tone.Glyph;
          return (
            <button
              key={i}
              ref={(el) => { tabs.current[i] = el; }}
              type="button"
              role="tab"
              id={`${tabIdPrefix}-tab-${i}`}
              aria-selected={isSelected}
              aria-controls={panelId}
              aria-label={`Question ${i + 1} of ${count}${tone.word ? `, ${tone.word}` : ""}`}
              tabIndex={isSelected ? 0 : -1}
              data-testid={`review-mastery-select-${i + 1}`}
              data-status={status}
              data-selected={isSelected ? "true" : undefined}
              onClick={() => go(i, false)}
              onKeyDown={onTabKey}
              className={`inline-flex ${tile} items-center justify-center gap-1 rounded-[4px] border px-2 text-[13px] font-extrabold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              style={isSelected
                ? {
                  borderColor: LEAGUECRAFT_INK.strong,
                  boxShadow: `inset 0 0 0 1px ${LEAGUECRAFT_INK.strong}`,
                  background: "rgba(112,82,36,0.2)",
                  color: LEAGUECRAFT_INK.strong,
                }
                : { borderColor: tone.edge, background: tone.fill, color: LEAGUECRAFT_INK.body }}
            >
              <span aria-hidden="true">{i + 1}</span>
              {Glyph && <Glyph className="h-3 w-3 shrink-0" style={{ color: tone.ink }} strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
