/**
 * PT1.8 / PT1.12 — RECURRING WEAKNESSES, and the Practice action on them.
 *
 * HUB4 lifted this block out of `PerformanceTrendsPane` unchanged. It is the
 * one part of the old Trends pane with a job History still needs and no other
 * owner: a Practice / Time Trial category the server marked recurring-weak,
 * with the action that hands it to the existing Practice Builder. History's
 * contextual Questions section mounts it; the pane itself keeps mounting it
 * for the admin demo preview until the pane is retired.
 *
 * Premium only by construction: `is_recurring_weak` is a field a Free payload
 * does not carry, so a Free reader simply has nothing to list.
 */
import { TrendingDown, TrendingUp, Minus, type LucideIcon } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { LedgerRow, LedgerTitle, WorkspaceNote } from "@/components/quiz/workspace/primitives";
import { trendLabel, type TrendCategory, type TrendDirection } from "@/lib/quiz/analyticsApi";
import { trackFunnelEvent } from "@/lib/funnel-analytics";


const DIRECTION_ICON: Record<TrendDirection, LucideIcon> = {
  improving: TrendingUp,
  declining: TrendingDown,
  steady: Minus,
  insufficient: Minus,
};

export function directionColour(direction: TrendDirection): string {
  if (direction === "improving") return LEAGUECRAFT_INK.accent;
  if (direction === "declining") return LEAGUECRAFT_INK.rubric;
  return LEAGUECRAFT_INK.faint;
}

export function pct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}


/** What the Trends pane asks the Practice Builder for. Two shapes only, and
 *  each says exactly what the button that produced it said.
 *
 *  A SINGLE category goes as `pool: "bank"` + that category, NOT as the weak
 *  pool narrowed to it. The Builder's weak pool is its own 90-day computation;
 *  a category that is recurring-weak in a 7-day comparison may not be in that
 *  90-day set, and the intersection would then come back empty for a reader
 *  who had just been told this is their problem area. "Practise this" means
 *  this category. */
export type TrendsPracticePreset = {
  pool: "bank" | "weak";
  category: string | null;
};

/**
 * One category row.
 *
 * PT1.10 rewrote the right-hand side. It used to print an icon and a delta
 * unconditionally, so a category with no comparison behind it rendered as
 * `33.3% — 0` or `100% — —`: two glyphs that look like measurements and are
 * not. A dash is not a number and an em-dash next to a percentage reads as one.
 *
 * The rule now, three visually distinct states and no placeholders:
 *
 *   improving / declining   the icon and a signed number — `84.6%  ↑ +42.3`
 *   steady                  the icon and the WORD "no change" — because the
 *                           bare `0` in `33.3%  — 0` was the other display
 *                           called out as unclear: a zero next to a dash reads
 *                           as a missing value, not as a measured flat one
 *   no comparison at all    nothing in the trend slot, and "Not enough prior
 *                           data" in the sub-line
 *
 * **The accuracy figure is printed in all three** — it is the reader's own
 * result and it does not depend on there being a period before it to compare
 * against. That is the PT1.10 rule in miniature: the figure is what happened,
 * everything to the right of it is what it means.
 */
/**
 * One category row.
 *
 * PT1.11 replaced the notation with language. `↗ +16.7` is a chart legend, not
 * a sentence: the reader is now told *Improving · +16.7 pts*, *Steady*,
 * *Declining · −13.9 pts*, or *Not enough data for a trend*. The icon stays as
 * a colour cue beside the words rather than as the message itself. **No
 * threshold moved** — every one of those strings renders a `direction` the
 * server had already decided.
 *
 * LOW SAMPLE. `Objective Timers — 100% — 1 answer` used to sit in the same
 * type, weight and colour as a category with twenty-six answers behind it, and
 * read as the same claim. The score and the count are both still printed — they
 * are true, and hiding them would be worse — but a thin row is set in the muted
 * ink and says so. No statistic is invented: `low_sample` is the server's own
 * evidence floor, restated.
 */
export function CategoryLine({
  entry,
  onPractise,
}: {
  entry: TrendCategory;
  onPractise?: (preset: TrendsPracticePreset) => void;
}) {
  const label = trendLabel(entry);
  const hasTrend =
    entry.direction != null &&
    entry.direction !== "insufficient" &&
    entry.delta_points != null;
  const Icon = hasTrend ? DIRECTION_ICON[entry.direction!] : null;
  const thin = entry.low_sample === true && entry.attempts > 0;
  // A thin row is quieter, not hidden: muted ink for the whole line.
  const figureInk = thin ? LEAGUECRAFT_INK.faint : LEAGUECRAFT_INK.strong;

  return (
    <LedgerRow testId="trends-category-row">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="min-w-0 truncate text-[12px] font-semibold"
          style={{ color: thin ? LEAGUECRAFT_INK.faint : LEAGUECRAFT_INK.body }}
        >
          {entry.category}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
          <span
            data-testid="trends-category-accuracy"
            style={{ color: figureInk }}
          >
            {entry.attempts === 0 ? "—" : pct(entry.accuracy)}
          </span>
          {hasTrend && Icon && (
            <Icon
              className="h-3 w-3"
              aria-hidden
              style={{ color: directionColour(entry.direction!) }}
            />
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span className="text-[10px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {entry.attempts === 0
            ? "Nothing this window"
            : `${entry.attempts} answer${entry.attempts === 1 ? "" : "s"}`}
          {thin && (
            <span data-testid="trends-low-sample"> · too few to read much into</span>
          )}
          {entry.previous_accuracy != null && ` · was ${pct(entry.previous_accuracy)}`}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {label && (
            <span
              data-testid="trends-category-delta"
              className="text-[10px] font-semibold"
              style={{
                color: hasTrend
                  ? directionColour(entry.direction!)
                  : LEAGUECRAFT_INK.faint,
              }}
            >
              {label}
            </span>
          )}
          {/* PT1.12 — the action, on the row that diagnosed the problem, and
              labelled just "Practice".
              The category name is already the first thing on the row, so
              "Practice Item Costs" said it twice and made every button a
              different width — the column stopped reading as a column. The
              PRESET is unchanged and still carries the category.
              Premium only by construction: `is_recurring_weak` is a field a
              Free payload does not carry, and the handler is the EXISTING
              PT1.7B Builder preset. No second practice system. */}
          {entry.is_recurring_weak && onPractise && (
            <button
              type="button"
              data-testid="trends-practise-category"
              onClick={() => {
                trackFunnelEvent("trends_practice_weakness_clicked", {
                  category: entry.category,
                });
                onPractise({ pool: "bank", category: entry.category });
              }}
              className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] underline underline-offset-2"
              style={{ color: LEAGUECRAFT_INK.accent }}
            >
              Practice
            </button>
          )}
        </span>
      </div>
    </LedgerRow>
  );
}

export default function RecurringWeaknesses({
  categories,
  onPractise,
}: {
  /** Already narrowed to the server's `is_recurring_weak` rows. */
  categories: readonly TrendCategory[];
  onPractise?: (preset: TrendsPracticePreset) => void;
}) {
  const recurring = categories;
  const onPractiseWeakness = onPractise;
  if (recurring.length === 0) return null;
  return (
    <div className="space-y-1.5" data-testid="trends-recurring">
      {/* PT1.12 — one place for the collective action, and it is the
          section header. It used to sit at the very bottom of the pane,
          several blocks below the weaknesses it acts on and beneath the
          scope note, so the two Practice actions were nowhere near each
          other and neither read as part of a pattern. Header = all of
          them, row = that one. Same two presets as before. */}
      <div className="flex items-baseline justify-between gap-2">
        <LedgerTitle>Recurring Weaknesses</LedgerTitle>
        {onPractiseWeakness && (
          <button
            type="button"
            data-testid="trends-practise-all"
            onClick={() => {
              /* The COLLECTIVE button means "my weak spots", so it hands
                 over the Builder's OWN weak pool rather than a category
                 chosen here. Unchanged from PT1.8. */
              trackFunnelEvent("trends_practice_weakness_clicked", {
                category: null,
              });
              onPractiseWeakness({ pool: "weak", category: null });
            }}
            className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] underline underline-offset-2"
            style={{ color: LEAGUECRAFT_INK.accent }}
          >
            Practice all
          </button>
        )}
      </div>
      <WorkspaceNote>
        Categories you scored below your own average in — in this period
        AND the one before it. Not just a low score once.
      </WorkspaceNote>
      <ul>
        {recurring.slice(0, 5).map((entry) => (
          <CategoryLine key={entry.category} entry={entry} onPractise={onPractiseWeakness} />
        ))}
      </ul>
    </div>
  );
}
