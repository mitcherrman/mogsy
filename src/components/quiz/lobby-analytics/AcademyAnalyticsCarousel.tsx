/**
 * RL2 — the Academy sheet's analytics carousel, in the space RL1 reserved.
 *
 * WHERE IT LIVES AND WHY IT FITS THERE
 * ────────────────────────────────────
 * RL1 removed the Mogzy portrait from the right parchment and kept its box —
 * 210 / 248 / 280px — explicitly blank, "reserved, blank space awaiting a
 * decision". This is that decision. It takes the box at exactly those heights
 * so the Academy name, crown and personal records below it do not move by a
 * pixel, and it adds no height of its own.
 *
 * IT IS THE ACADEMY'S, NOT THE QUEUE'S
 * ────────────────────────────────────
 * The centre column's role selection does NOT reach this component. The
 * Academy record is a study record and is read on its own terms; the only way
 * a role narrows it is the Role control below, which the reader operates
 * deliberately — and which is inert in production because no role dimension
 * exists on the analytics contract.
 *
 * IT REUSES THE SHIPPED READER
 * ────────────────────────────
 * `usePerformanceTrends` already owns the two-request order, the "a failed
 * request is never a paywall" rule and the window guard, and already takes its
 * source as a parameter. This mounts it rather than re-implementing it, so the
 * lobby and the workspace Trends pane can never disagree about the record.
 * Tier is never inferred here: a Free payload simply has fewer keys, and both
 * slides read only keys that every tier receives.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { LEAGUECRAFT_INK as INK } from "@/components/quiz/leaguecraft-ink";
import {
  usePerformanceTrends,
  type TrendsSource,
} from "@/components/quiz/trends/usePerformanceTrends";
import type { TrendReport } from "@/lib/quiz/analyticsApi";
import type { RankedRole } from "@/lib/ranked-public/roles";
import AccuracyBarChart from "./AccuracyBarChart";
import DistributionDonut from "./DistributionDonut";
import LobbyAnalyticsFilters from "./LobbyAnalyticsFilters";
import {
  ALL_MODES,
  barSeries,
  dimensionFor,
  donutSlices,
  modeOptions,
  type ModeFilter,
} from "./analyticsSlices";

const SLIDES = ["bars", "donut"] as const;
type Slide = (typeof SLIDES)[number];

/**
 * The reserved box, to the pixel — 210 / 248 / 280, the steps the removed
 * Academy portrait set. It is applied by the HERO to the wrapper rather than
 * here, so the guard that the Academy column never re-flows keeps reading the
 * same element it always read; this component simply fills whatever it is
 * given. Exported so the two can never be given different numbers.
 */
export const RESERVED_BOX = "h-[210px] sm:h-[248px] lg:h-[280px]";

export default function AcademyAnalyticsCarousel({
  source,
  /**
   * DEMO ONLY. A function that narrows a report to a role. Its PRESENCE is
   * what enables the Role control, so production — which passes nothing —
   * renders that control disabled and can never narrow by a dimension the
   * payload does not have.
   */
  demoRoleDimension,
  className = "",
}: {
  source?: TrendsSource;
  demoRoleDimension?: (report: TrendReport, role: RankedRole | null) => TrendReport;
  className?: string;
}) {
  const [slide, setSlide] = useState<Slide>("bars");
  const [mode, setMode] = useState<ModeFilter>(ALL_MODES);
  const [role, setRole] = useState<RankedRole | null>(null);

  const trends = usePerformanceTrends(true, source);

  // The role narrowing is applied to the REPORT, not to the derived series, so
  // a demo role reading goes through the identical slice derivation the real
  // reading does.
  const report = useMemo(() => {
    if (!trends.report) return null;
    return demoRoleDimension ? demoRoleDimension(trends.report, role) : trends.report;
  }, [trends.report, demoRoleDimension, role]);

  const modes = useMemo(() => modeOptions(report), [report]);
  const bars = useMemo(() => barSeries(report, mode), [report, mode]);
  const slices = useMemo(() => donutSlices(report, mode), [report, mode]);
  const dimension = dimensionFor(mode);

  const hasData = slide === "bars" ? bars.length > 0 : slices.length > 0;
  const index = SLIDES.indexOf(slide);
  const go = (delta: number) =>
    setSlide(SLIDES[(index + delta + SLIDES.length) % SLIDES.length]);

  return (
    <div
      className={`relative flex h-full flex-col ${className}`}
      data-testid="academy-analytics-carousel"
      data-slide={slide}
      data-dimension={dimension}
    >
      <LobbyAnalyticsFilters
        windows={trends.capability?.allowed_windows ?? []}
        windowDays={trends.windowDays}
        onWindow={trends.setWindow}
        modes={modes}
        mode={mode}
        onMode={setMode}
        role={role}
        onRole={setRole}
        roleEnabled={!!demoRoleDimension}
      />

      <div className="relative mt-1 min-h-0 flex-1">
        {trends.loading ? (
          <Centre>
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: INK.brass }} />
          </Centre>
        ) : trends.error ? (
          /* An outage. NEVER drawn as a paywall or as an empty record — the
             same rule the Trends pane holds at this boundary. */
          <Centre>
            <span data-testid="academy-analytics-error">Analytics are unavailable.</span>
          </Centre>
        ) : !hasData ? (
          /* HUB6: an empty window keeps the chart's own frame — the 0–100
             axis for the bars, the unfilled ring for the donut — with the
             existing sentence inside it, rather than a bare text box. Nothing
             is drawn on the frame: there is nothing measured to draw. */
          <DormantChart slide={slide}>
            <span data-testid="academy-analytics-empty">No answers in this window yet.</span>
          </DormantChart>
        ) : slide === "bars" ? (
          <AccuracyBarChart bars={bars} />
        ) : (
          <div className="flex h-full items-center gap-1">
            <div className="h-full min-w-0 flex-1">
              <DistributionDonut slices={slices} />
            </div>
            {/* The ring's key. Without it the arcs are anonymous, and a legend
                is not helper copy — it is the axis this chart type has. */}
            <ul className="w-[86px] shrink-0 space-y-[1px]" data-testid="lobby-distribution-legend">
              {slices.slice(0, 5).map((s) => (
                <li
                  key={s.key}
                  className="truncate text-[9px] font-semibold leading-tight"
                  style={{ color: INK.body }}
                  title={`${s.label}: ${s.attempts}`}
                >
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Slide chrome. The NAME of the slide is the caption — there is no
          second line describing what a bar chart is. */}
      <div className="mt-0.5 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous chart"
          onClick={() => go(-1)}
          data-testid="academy-analytics-prev"
          className="rounded-full p-0.5 transition-opacity hover:opacity-70"
          style={{ color: INK.brass }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span
          className="truncate text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{ color: INK.brass }}
          data-testid="academy-analytics-caption"
        >
          {slide === "bars"
            ? dimension === "category" ? "Accuracy by category" : "Accuracy by mode"
            : dimension === "category" ? "Answers by category" : "Answers by mode"}
        </span>
        <button
          type="button"
          aria-label="Next chart"
          onClick={() => go(1)}
          data-testid="academy-analytics-next"
          className="rounded-full p-0.5 transition-opacity hover:opacity-70"
          style={{ color: INK.brass }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The empty frame of the current slide. Geometry follows the live charts:
 *  the bars' plot starts after their 78px label column and leaves 30px for
 *  value labels; the ring sits where the donut does, beside its legend. */
function DormantChart({ slide, children }: { slide: Slide; children: React.ReactNode }) {
  const frame = "rgba(96, 68, 28, 0.28)";
  return (
    <div className="relative h-full w-full" data-testid="academy-analytics-dormant" data-slide={slide}>
      {slide === "bars" ? (
        <div aria-hidden="true" className="absolute bottom-1 left-[80px] right-[30px] top-1">
          {[0, 0.5, 1].map((t) => (
            <span
              key={t}
              className="absolute inset-y-0 block"
              style={{ left: `${t * 100}%`, borderLeft: `1px ${t === 0 ? "solid" : "dotted"} ${frame}` }}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="absolute inset-y-0 left-0 right-[90px] flex items-center justify-center">
          <span
            className="block aspect-square h-[76%] rounded-full"
            style={{ border: `10px solid rgba(96, 68, 28, 0.12)`, outline: `1px dotted ${frame}`, outlineOffset: 2 }}
          />
        </div>
      )}
      <div className="absolute inset-0">
        <Centre>
          <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(236, 220, 186, 0.92)" }}>
            {children}
          </span>
        </Centre>
      </div>
    </div>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-full items-center justify-center px-2 text-center text-[10px] font-semibold"
      style={{ color: INK.faint }}
    >
      {children}
    </div>
  );
}
