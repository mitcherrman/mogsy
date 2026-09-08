/**
 * PT1.8 — PERFORMANCE TRENDS, the workspace's third pane.
 *
 * HISTORY asks "what have I studied?", REVIEW asks "what did I get wrong?".
 * This one asks the question neither of them can: **am I getting better, and
 * at what?** It is the same record, read longitudinally — no new data, no new
 * event stream, and nothing here that Free needs in order to know how it is
 * doing. The results screen, the session record and the Knowledge Breakdown
 * all keep answering that for everyone.
 *
 * WHY IT LIVES IN THE WORKSPACE
 * ─────────────────────────────
 * `WORKSPACE_MODES` is data, and the shell was written to grow: a pane is a
 * mode entry plus a body. Putting Trends anywhere else would have meant a
 * second record surface on the same page, reading the same rows, in a second
 * visual language.
 *
 * IT DRAWS ITS OWN PAYWALL, AND ITS OWN NON-PAYWALL
 * ─────────────────────────────────────────────────
 * The failure branch comes FIRST and is unconditional, exactly as the Practice
 * Builder's does. Without it, any request that did not return leaves
 * `capability` null, falls through `!can_view_trends`, and tells a paying
 * subscriber to subscribe. The backend's "503 is never Free" policy stops at
 * the network boundary unless this file holds the same line.
 *
 * THE CHART IS INLINE SVG, DELIBERATELY
 * ─────────────────────────────────────
 * `recharts` is in the project and is what the ADMIN dashboards draw with, but
 * nothing on the `/quiz` route imports it today, and a sparkline of at most 91
 * points does not need a charting runtime on a page that would then ship one.
 * It is also the only way this line prints in the ledger's own ink rather than
 * in a chart library's default palette on a parchment sheet.
 */
import { useMemo, useState } from "react";
import { Loader2, TrendingDown, TrendingUp, Minus, Target, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { LedgerRow, LedgerTitle, WorkspaceNote } from "@/components/quiz/workspace/primitives";
import {
  movementSentence,
  recentSpanLabel,
  trendLabel,
  windowLabel,
  type TrendCategory,
  type TrendDirection,
  type TrendPoint,
  type TrendReport,
} from "@/lib/quiz/analyticsApi";
import {
  usePerformanceTrends,
  type TrendsSource,
} from "@/components/quiz/trends/usePerformanceTrends";
import { trackFunnelEvent } from "@/lib/funnel-analytics";

const DIRECTION_ICON: Record<TrendDirection, LucideIcon> = {
  improving: TrendingUp,
  declining: TrendingDown,
  steady: Minus,
  insufficient: Minus,
};

function directionColour(direction: TrendDirection): string {
  if (direction === "improving") return LEAGUECRAFT_INK.accent;
  if (direction === "declining") return LEAGUECRAFT_INK.rubric;
  return LEAGUECRAFT_INK.faint;
}

function pct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

/** One headline figure. Deliberately plain: this is a record, not a KPI tile. */
function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div
        className="text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ color: LEAGUECRAFT_INK.faint }}
      >
        {label}
      </div>
      <div
        className="text-lg font-bold tabular-nums leading-tight"
        style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Attempts per day across the window.
 *
 * ATTEMPTS, not accuracy: a day with no answers has no accuracy at all (the
 * server sends null rather than 0), and a line that dips to the floor on every
 * rest day draws a collapse that did not happen. Volume is the series that is
 * honest when zero-filled, and the accuracy figures are stated as numbers
 * above rather than plotted into a shape they cannot support.
 */
/**
 * Answers per day across the window.
 *
 * ATTEMPTS, not accuracy: a day with no answers has no accuracy at all (the
 * server sends null rather than 0), and a line that dips to the floor on every
 * rest day draws a collapse that did not happen. Volume is the series that is
 * honest when zero-filled, and the accuracy figures are stated as numbers
 * above rather than plotted into a shape they cannot support.
 *
 * PT1.11 LABELLED IT RATHER THAN REMOVING IT. It shipped as bare bars with no
 * caption, no scale and no dates — an `aria-label` the sighted reader never
 * sees — and it was not decipherable without being told what it was. It does
 * carry something the numbers above do not (study CADENCE: the clumps and the
 * gaps), so it earned a caption, a peak, and its two end dates instead of
 * deletion.
 */
function VolumeSparkline({ series, windowDays }: { series: TrendPoint[]; windowDays: number | null }) {
  const peak = Math.max(1, ...series.map((p) => p.attempts));
  const total = series.reduce((sum, p) => sum + p.attempts, 0);
  const width = 100;
  const height = 22;
  const step = series.length > 1 ? width / series.length : width;
  const barWidth = Math.max(0.6, step * 0.7);
  const first = series[0]?.date;
  const last = series[series.length - 1]?.date;
  const day = (iso?: string) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric", month: "short",
    }) : "";

  return (
    <div className="space-y-0.5" data-testid="trends-volume-chart">
      <div
        className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: LEAGUECRAFT_INK.faint }}
      >
        <span>Answers per day</span>
        <span className="tabular-nums" data-testid="trends-volume-peak">
          peak {peak} · {total} total
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Answers per day over the last ${series.length} days. Busiest day ${peak} answers, ${total} in total.`}
        data-testid="trends-sparkline"
        className="h-6 w-full"
      >
        {series.map((point, i) => {
          const barHeight = point.attempts === 0 ? 0 : Math.max(1, (point.attempts / peak) * height);
          return (
            <rect
              key={point.date}
              x={i * step}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              fill={LEAGUECRAFT_INK.brass}
              opacity={point.attempts === 0 ? 0 : 0.75}
            />
          );
        })}
        <line
          x1={0}
          y1={height - 0.5}
          x2={width}
          y2={height - 0.5}
          stroke={LEAGUECRAFT_INK.rule}
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className="flex items-baseline justify-between text-[9px] tabular-nums"
        style={{ color: LEAGUECRAFT_INK.faint }}
      >
        <span data-testid="trends-volume-from">{day(first)}</span>
        <span>{windowDays ? `${windowDays} days` : ""}</span>
        <span data-testid="trends-volume-to">{day(last)}</span>
      </div>
    </div>
  );
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
function CategoryLine({
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
          {/* PT1.11 — the action, on the row that diagnosed the problem.
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
              Practice {entry.category}
            </button>
          )}
        </span>
      </div>
    </LedgerRow>
  );
}

export default function PerformanceTrendsPane({
  open = true,
  hasAccount = true,
  signInHref = "/auth",
  onPractiseWeakness,
  source,
  demoNotice = null,
}: {
  /**
   * Whether this pane is being looked at. It defaults to TRUE because the
   * workspace shell renders only the selected pane's node, so for the real
   * host mounting IS opening — and an account-bound read that fired on every
   * lobby load would be a request spent on a reader who never asked. The prop
   * stays so a test can mount it closed and prove it fetches nothing.
   */
  open?: boolean;
  /**
   * Hand a configuration to the EXISTING Practice Builder. PT1.8 builds no
   * second session runner and no second filter UI — the handoff is a preset
   * on the panel that already knows how to run one.
   */
  /**
   * Whether the reader has a real account. A GUEST is not a Free subscriber —
   * they have no record to read at all — and the backend says so with
   * `403 ACCOUNT_REQUIRED`, which reaches the client as a failed request and
   * would otherwise render as "unavailable right now, try again". Found live
   * on mogzy.lol: every signed-out visitor who opened the tab was told a
   * permanent, actionable state was a transient fault. Answering it locally
   * also spends no request being refused.
   */
  hasAccount?: boolean;
  signInHref?: string;
  onPractiseWeakness?: (preset: TrendsPracticePreset) => void;
  /**
   * PT1.9 — where the two answers come from. Defaults to the real,
   * self-scoped analytics API; the master-admin demo preview passes a source
   * that reads a synthetic account so the owner can compare the Free and
   * Premium presentations of the SAME pane. Nothing else in the product
   * passes it, and no consumer route can.
   */
  source?: TrendsSource;
  /**
   * A line printed above everything, in every branch, when this pane is not
   * showing the reader their own record. The demo preview sets it; a real
   * reader never sees it, because for them it is null.
   */
  demoNotice?: string | null;
}) {
  const state = usePerformanceTrends(open && hasAccount, source);
  const [switching, setSwitching] = useState(false);

  /** The demo banner, or nothing. Rendered ahead of EVERY branch below —
   *  including the paywall and the error — because a screenshot of any of them
   *  must carry the warning, not just the happy one. */
  const notice = demoNotice ? (
    <div
      data-testid="trends-demo-notice"
      role="note"
      className="mb-2 rounded-sm border-2 border-dashed px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
      style={{
        borderColor: LEAGUECRAFT_INK.rubric,
        color: LEAGUECRAFT_INK.rubric,
      }}
    >
      {demoNotice}
    </div>
  ) : null;

  const report = state.report;
  // Premium only by construction: a Free payload carries no `is_recurring_weak`
  // on any row, so this is empty and every block keyed off it disappears.
  const recurring = useMemo(
    () => (report?.categories ?? []).filter((c) => c.is_recurring_weak === true),
    [report],
  );

  if (!open) return null;

  if (!hasAccount) {
    return (
      <div data-testid="trends-signed-out" className="space-y-2 py-3">
        {notice}
        <LedgerTitle>Performance Trends</LedgerTitle>
        <WorkspaceNote>
          Your trends are read from your own record, so they need an account.
          Sign in to see how your Practice &amp; Time Trial results are moving.
        </WorkspaceNote>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <a href={signInHref} data-testid="trends-sign-in">Sign in</a>
        </Button>
      </div>
    );
  }

  if (state.loading && !report && !state.capability) {
    return (
      <div className="py-1">
        {notice}
        <div
          data-testid="trends-loading"
          className="flex items-center gap-2 py-3 text-[11px]"
          style={{ color: LEAGUECRAFT_INK.faint }}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Reading your record…
        </div>
      </div>
    );
  }

  /**
   * A FAILURE IS NOT A PAYWALL. This branch is first and it is unconditional:
   * a 503 from an entitlement lookup that could not run, a 404 from a backend
   * that has not deployed these routes yet, or a dropped connection all leave
   * `capability` null, and the next branch would read that as Free.
   */
  if (state.error && !state.capability) {
    return (
      <div data-testid="trends-error" className="space-y-2 py-3">
        {notice}
        <WorkspaceNote>
          Trends are unavailable right now. This is not a subscription problem —
          nothing about your account changed.
        </WorkspaceNote>
        <Button size="sm" variant="outline" data-testid="trends-retry" onClick={state.reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="py-1">
        {notice}
        <div
          data-testid="trends-loading"
          className="flex items-center gap-2 py-3 text-[11px]"
          style={{ color: LEAGUECRAFT_INK.faint }}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Reading your record…
        </div>
      </div>
    );
  }

  /**
   * PT1.10 — which half of the pane this payload can fill.
   *
   * Taken from the SERVER's `tier` and the presence of the data itself, never
   * from a tier this client worked out. A Free payload does not carry `delta`,
   * `series` or `recurring_weak` at all — they are projected away, not nulled —
   * so every Premium block below is guarded on the field it actually needs.
   */
  const isPremium = report.tier === "premium";
  // The windows to OFFER. Empty for a Free snapshot, which is bounded by
  // answers and has no window to pick, so the picker is never rendered.
  const windows = report.windows ?? [];

  return (
    <div className="space-y-3 py-2" data-testid="trends-pane">
      {notice}
      {/* The window selector. The list is the SERVER's — a window this client
          invented would be refused rather than answered, which is the correct
          outcome but a pointless round trip. */}
      <div className="flex items-center justify-between gap-2">
        <LedgerTitle>
          {isPremium ? "Performance Trends" : "Recent Performance"}
        </LedgerTitle>
        {/* One window is not a choice. Free is offered exactly one, so the
            picker is absent rather than present-and-inert — a control that
            cannot do anything is worse than no control. */}
        <div
          role="group"
          aria-label="Window"
          data-testid="trends-window-picker"
          className="flex shrink-0 items-center gap-1"
          hidden={windows.length <= 1}
        >
          {windows.map((days) => {
            const active = days === state.windowDays;
            return (
              <button
                key={days}
                type="button"
                data-testid={`trends-window-${days}`}
                aria-pressed={active}
                disabled={switching && !active}
                onClick={() => {
                  if (active) return;
                  setSwitching(true);
                  trackFunnelEvent("trends_window_changed", { window_days: days });
                  state.setWindow(days);
                  setSwitching(false);
                }}
                className="rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{
                  borderColor: LEAGUECRAFT_INK.rule,
                  background: active ? LEAGUECRAFT_INK.inset : "transparent",
                  color: active ? LEAGUECRAFT_INK.strong : LEAGUECRAFT_INK.faint,
                }}
              >
                {windowLabel(days)}
              </button>
            );
          })}
        </div>
      </div>

      {/* PT1.11 — what period this actually covered, said before the figures.
          Free's snapshot is bounded by ANSWERS, so "recent" has to be
          qualified by the span it really spanned; a reader returning after a
          month is shown their record and told when it is from, rather than an
          empty pane. */}
      {!isPremium && (
        <WorkspaceNote testId="trends-recent-span">
          {recentSpanLabel(report)}
        </WorkspaceNote>
      )}

      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <Figure label="Answers" value={String(report.current.attempts)} />
        <Figure label="Accuracy" value={pct(report.current.accuracy)} />
        <Figure
          label="Days studied"
          value={String(report.current.active_days)}
          hint={
            report.window_days != null
              ? `of ${report.window_days}`
              : report.span_days != null
                ? `of ${report.span_days}`
                : undefined
          }
        />
      </div>

      {report.delta && (
        <p
          className="text-[11px] font-semibold"
          data-testid="trends-movement"
          style={{ color: directionColour(report.delta.direction) }}
        >
          {movementSentence(report)}
        </p>
      )}

      {!isPremium && !report.sufficiency.has_data && (
        <WorkspaceNote testId="trends-snapshot-empty">
          You have not answered anything yet. Play a set and this fills in.
        </WorkspaceNote>
      )}

      {report.series && report.sufficiency.has_data && (
        <VolumeSparkline series={report.series} windowDays={report.window_days} />
      )}

      {recurring.length > 0 && (
        <div className="space-y-1.5" data-testid="trends-recurring">
          <LedgerTitle>Recurring Weaknesses</LedgerTitle>
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
      )}

      {report.categories.length > 0 && (
        <div className="space-y-1.5" data-testid="trends-categories">
          <LedgerTitle>
            {isPremium ? "Category performance" : "By category"}
          </LedgerTitle>
          <ul>
            {/* PT1.11 — no action here, deliberately. A recurring weakness is
                already listed above WITH its action; repeating the button on
                the full category list put "Practice Item Costs" on screen
                twice for the same category. The list stays complete — the
                information is useful and is not removed to make Premium look
                different — it simply is not the place the action lives. */}
            {report.categories.slice(0, 8).map((entry) => (
              <CategoryLine key={entry.category} entry={entry} />
            ))}
          </ul>
        </div>
      )}

      {report.modes.length > 0 && (
        <div className="space-y-1.5" data-testid="trends-modes">
          <LedgerTitle>
            {isPremium ? "Mode performance" : "By mode"}
          </LedgerTitle>
          <ul>
            {report.modes.map((mode) => (
              <LedgerRow key={mode.mode} testId="trends-mode-row">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px]" style={{ color: LEAGUECRAFT_INK.body }}>
                    {mode.known ? mode.label : "Unplaced answers"}
                  </span>
                  <span
                    className="shrink-0 text-[11px] tabular-nums"
                    style={{ color: LEAGUECRAFT_INK.strong }}
                  >
                    {mode.attempts} · {pct(mode.accuracy)}
                  </span>
                </div>
              </LedgerRow>
            ))}
          </ul>
        </div>
      )}

      {/* WHAT THIS COUNTS, said plainly — the same honesty the Knowledge
          Breakdown and the Builder's weakness report already print, in the
          same words, because it is the same record and the same limitation. */}
      <WorkspaceNote testId="trends-scope-note">
        Counts your Practice and Time Trial answers. Ranked, the Daily Challenge
        and Mastery keep their own records.
      </WorkspaceNote>

      {onPractiseWeakness && recurring.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          data-testid="trends-build-weak-session"
          onClick={() => {
            /* The PLURAL button means "my weak spots", so it hands over the
               Builder's OWN weak pool rather than a category chosen here. */
            trackFunnelEvent("trends_practice_weakness_clicked", { category: null });
            onPractiseWeakness({ pool: "weak", category: null });
          }}
        >
          <Target className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Practice all of these
        </Button>
      )}

      {/* PT1.10 — the upsell is a FOOTER now, not a gate.
          It sits below the reader's own figures and describes what Premium
          adds to them, because the figures themselves are no longer the
          product being sold. A Free reader who never clicks it has still been
          answered. */}
      {!isPremium && (
        <div
          data-testid="trends-premium-upsell"
          className="space-y-1.5 border-t pt-2"
          style={{ borderColor: LEAGUECRAFT_INK.rule }}
        >
          <WorkspaceNote>
            Mogzy Premium reads the same record over time: how these figures
            have moved against the 7, 30 or 90 days before them, which
            categories are improving or slipping, and which weak spots keep
            coming back.
          </WorkspaceNote>
          <Button asChild size="sm" variant="outline" className="mt-1">
            <a href="/lol/premium" data-testid="trends-premium-link">
              See Mogzy Premium
            </a>
          </Button>
        </div>
      )}

      {state.error && (
        <WorkspaceNote testId="trends-inline-error">
          That window could not be loaded. Your record is fine — try again.
        </WorkspaceNote>
      )}
    </div>
  );
}
