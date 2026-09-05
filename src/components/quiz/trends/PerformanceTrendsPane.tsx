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
  windowLabel,
  type TrendCategory,
  type TrendDirection,
  type TrendPoint,
  type TrendReport,
} from "@/lib/quiz/analyticsApi";
import { usePerformanceTrends } from "@/components/quiz/trends/usePerformanceTrends";
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
function VolumeSparkline({ series }: { series: TrendPoint[] }) {
  const peak = Math.max(1, ...series.map((p) => p.attempts));
  const width = 100;
  const height = 22;
  const step = series.length > 1 ? width / series.length : width;
  const barWidth = Math.max(0.6, step * 0.7);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Answers per day over the last ${series.length} days`}
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

function CategoryLine({
  entry,
  onPractise,
}: {
  entry: TrendCategory;
  onPractise?: (preset: TrendsPracticePreset) => void;
}) {
  const Icon = DIRECTION_ICON[entry.direction];
  return (
    <LedgerRow testId="trends-category-row">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="min-w-0 truncate text-[12px] font-semibold"
          style={{ color: LEAGUECRAFT_INK.body }}
        >
          {entry.category}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
          <span style={{ color: LEAGUECRAFT_INK.strong }}>{pct(entry.accuracy)}</span>
          <Icon className="h-3 w-3" aria-hidden style={{ color: directionColour(entry.direction) }} />
          <span style={{ color: directionColour(entry.direction) }}>
            {entry.delta_points == null
              ? "—"
              : `${entry.delta_points > 0 ? "+" : ""}${entry.delta_points.toFixed(
                  entry.delta_points % 1 === 0 ? 0 : 1,
                )}`}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px]" style={{ color: LEAGUECRAFT_INK.faint }}>
          {entry.attempts} answer{entry.attempts === 1 ? "" : "s"}
          {entry.previous_accuracy != null && ` · was ${pct(entry.previous_accuracy)}`}
          {entry.direction === "insufficient" && entry.previous_accuracy == null &&
            " · nothing to compare yet"}
        </span>
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
            Practise this
          </button>
        )}
      </div>
    </LedgerRow>
  );
}

export default function PerformanceTrendsPane({
  open = true,
  onPractiseWeakness,
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
  onPractiseWeakness?: (preset: TrendsPracticePreset) => void;
}) {
  const state = usePerformanceTrends(open);
  const [switching, setSwitching] = useState(false);

  const report = state.report;
  const recurring = useMemo(
    () => (report?.categories ?? []).filter((c) => c.is_recurring_weak),
    [report],
  );

  if (!open) return null;

  if (state.loading && !report && !state.capability) {
    return (
      <div
        data-testid="trends-loading"
        className="flex items-center gap-2 py-4 text-[11px]"
        style={{ color: LEAGUECRAFT_INK.faint }}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Reading your record…
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

  if (!state.capability?.can_view_trends) {
    return (
      <div data-testid="trends-locked" className="space-y-2 py-3">
        <LedgerTitle>Performance Trends</LedgerTitle>
        <WorkspaceNote>
          See how your accuracy and your study volume have moved over the last 7,
          30 or 90 days, which categories are improving or slipping, and which
          weak spots keep coming back. Mogzy Premium.
        </WorkspaceNote>
        {/* The record itself is never what is gated, and a reader deciding
            whether to pay is owed that plainly rather than being left to
            wonder what happens to their history. */}
        <WorkspaceNote testId="trends-free-note">
          Your results, your session record and your category breakdown stay
          free, and stay yours.
        </WorkspaceNote>
        <Button asChild size="sm" className="mt-1">
          <a href="/lol/premium">See Mogzy Premium</a>
        </Button>
      </div>
    );
  }

  if (!report) {
    return (
      <div
        data-testid="trends-loading"
        className="flex items-center gap-2 py-4 text-[11px]"
        style={{ color: LEAGUECRAFT_INK.faint }}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Reading your record…
      </div>
    );
  }

  const windows = report.windows.length ? report.windows : state.capability.trend_windows;

  return (
    <div className="space-y-3 py-2" data-testid="trends-pane">
      {/* The window selector. The list is the SERVER's — a window this client
          invented would be refused rather than answered, which is the correct
          outcome but a pointless round trip. */}
      <div className="flex items-center justify-between gap-2">
        <LedgerTitle>Performance Trends</LedgerTitle>
        <div
          role="group"
          aria-label="Window"
          data-testid="trends-window-picker"
          className="flex shrink-0 items-center gap-1"
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

      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <Figure label="Answers" value={String(report.current.attempts)} />
        <Figure label="Accuracy" value={pct(report.current.accuracy)} />
        <Figure
          label="Days studied"
          value={String(report.current.active_days)}
          hint={`of ${report.window_days}`}
        />
      </div>

      <p
        className="text-[11px] font-semibold"
        data-testid="trends-movement"
        style={{ color: directionColour(report.delta.direction) }}
      >
        {movementSentence(report)}
      </p>

      {report.sufficiency.has_data && <VolumeSparkline series={report.series} />}

      {recurring.length > 0 && (
        <div className="space-y-1.5" data-testid="trends-recurring">
          <LedgerTitle>Keeps coming back</LedgerTitle>
          <WorkspaceNote>
            Below your own average in this window and in the one before it.
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
          <LedgerTitle>By category</LedgerTitle>
          <ul>
            {report.categories.slice(0, 8).map((entry) => (
              <CategoryLine key={entry.category} entry={entry} onPractise={onPractiseWeakness} />
            ))}
          </ul>
        </div>
      )}

      {report.modes.length > 0 && (
        <div className="space-y-1.5" data-testid="trends-modes">
          <LedgerTitle>By mode</LedgerTitle>
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
          Build a session from these
        </Button>
      )}

      {state.error && (
        <WorkspaceNote testId="trends-inline-error">
          That window could not be loaded. Your record is fine — try again.
        </WorkspaceNote>
      )}
    </div>
  );
}
