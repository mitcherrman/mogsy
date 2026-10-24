/**
 * ADMIN RETENTION V2 — cohort retention for Users › Audience, and a compact
 * glance card for Overview.
 *
 * Two lenses with their own units and denominators (see cohorts.ts): browser
 * retention and registered-account retention are switched between, never
 * shown as one number. The table is the source of truth; the curve is a
 * picture of the same pooled numbers and is hidden from assistive tech.
 *
 * The panel reads its own 8-week lookback (independent of the page's range
 * preset) so D7 and weekly columns can be observed at all, and applies the
 * page's traffic filter to it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { buildReport, lensUnavailableReason, useCohortAnalytics } from "@/lib/admin/analytics/useCohortAnalytics";
import { MIN_RATE_SAMPLE, formatRate, retentionRate, type RetentionRate } from "@/lib/admin/analytics/metrics";
import {
  COHORT_LOOKBACK_WEEKS,
  DAY_COHORTS_SHOWN,
  LENS_DEFINITIONS,
  LENS_LABELS,
  WEEKLY_WINDOWS,
  windowsForLens,
  type CohortGrain,
  type CohortReport,
  type RetentionLens,
  type RetentionWindowId,
} from "@/lib/admin/analytics/cohorts";
import {
  DEFAULT_TRAFFIC_FILTER,
  TRAFFIC_FILTER_LABELS,
  type TrafficFilter,
} from "@/lib/admin/analytics/traffic";
import { cn } from "@/lib/utils";

// --- Cells -----------------------------------------------------------------

const rateOf = (r: RetentionRate) => (r.eligible === 0 ? null : r.retained / r.eligible);

function describeCell(label: string, r: RetentionRate): string {
  if (r.eligible === 0) return `${label}: not observable yet — ${r.tooRecent} not old enough.`;
  const pending = r.tooRecent > 0 ? `; ${r.tooRecent} not old enough yet` : "";
  return `${label}: ${r.retained} of ${r.eligible} eligible returned${pending}.`;
}

/** Tone only once the sample is large enough to show a percentage; never for a fraction. */
function cellStyle(r: RetentionRate) {
  const rate = rateOf(r);
  if (rate === null || r.eligible < MIN_RATE_SAMPLE) return undefined;
  return { backgroundColor: `hsl(var(--primary) / ${(0.08 + 0.47 * rate).toFixed(2)})` };
}

function RateCell({ label, r }: { label: string; r: RetentionRate }) {
  if (r.eligible === 0) {
    return (
      <td className="p-1" data-state="pending">
        <span
          className="block rounded border border-dashed border-border px-1.5 py-1 text-center text-[10px] text-muted-foreground"
          title={describeCell(label, r)}
        >
          <span aria-hidden>pending</span>
          <span className="sr-only">{describeCell(label, r)}</span>
        </span>
      </td>
    );
  }
  return (
    <td className="p-1" data-state={r.eligible < MIN_RATE_SAMPLE ? "small" : "rate"}>
      <span
        className={cn(
          "block rounded px-1.5 py-1 text-center tabular-nums transition-colors motion-reduce:transition-none",
          r.eligible < MIN_RATE_SAMPLE && "border border-border/60 text-muted-foreground",
        )}
        style={cellStyle(r)}
        title={describeCell(label, r)}
      >
        <span aria-hidden>
          {formatRate(retentionRate(r))}
          {r.tooRecent > 0 && <span className="ml-0.5 text-[9px] text-muted-foreground">+{r.tooRecent}</span>}
        </span>
        <span className="sr-only">{describeCell(label, r)}</span>
      </span>
    </td>
  );
}

// --- Curve -----------------------------------------------------------------

const CURVE_W = 320;
const CURVE_H = 150;
const PAD = { l: 34, r: 12, t: 12, b: 26 };

/**
 * Weekly curve from W0 = 100% of each cohort. Each later point is pooled over
 * the cohorts old enough for it, so the bases differ; every point is labelled
 * with its own k / n so a short tail is never read as a trend.
 */
export function RetentionCurve({ report }: { report: CohortReport }) {
  const reduced = useReducedMotionPreference();
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) { setDrawn(true); return; }
    setDrawn(false);
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reduced, report]);

  const points = [
    { id: "w0", label: "W0", rate: report.units > 0 ? 1 : null, r: null as RetentionRate | null },
    ...WEEKLY_WINDOWS.map((id) => {
      const r = report.pooled[id]!;
      return { id, label: id.toUpperCase(), rate: rateOf(r), r };
    }),
  ];
  const x = (i: number) => PAD.l + (i * (CURVE_W - PAD.l - PAD.r)) / (points.length - 1);
  const y = (rate: number) => PAD.t + (1 - rate) * (CURVE_H - PAD.t - PAD.b);
  const plotted = points.map((p, i) => ({ ...p, i })).filter((p) => p.rate !== null);
  const d = plotted.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.rate!).toFixed(1)}`).join(" ");
  const caption = plotted.length > 1
    ? plotted.map((p) => (p.r ? `${p.label} ${formatRate(retentionRate(p.r))}` : `${p.label} 100%`)).join(", ")
    : "Not enough elapsed time for a weekly curve yet.";

  return (
    <figure className="min-w-0 space-y-1" data-testid="retention-curve">
      <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} className="h-auto w-full max-w-md text-primary" aria-hidden focusable="false">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={CURVE_W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-border" strokeWidth={g === 0 ? 1 : 0.5} />
            <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">{Math.round(g * 100)}%</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.id} x={x(i)} y={CURVE_H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="9">{p.label}</text>
        ))}
        {plotted.length > 1 && (
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={drawn ? 0 : 1}
            style={{ transition: reduced ? "none" : "stroke-dashoffset 700ms ease-out" }}
          />
        )}
        {plotted.map((p) => {
          const small = p.r !== null && p.r.eligible < MIN_RATE_SAMPLE;
          return (
            <g key={p.id}>
              <circle cx={x(p.i)} cy={y(p.rate!)} r={3.5} stroke="currentColor" strokeWidth={1.5}
                className={small ? "fill-card" : "fill-current"} />
              {p.r && (
                <text x={x(p.i)} y={y(p.rate!) - 7} textAnchor="middle" className="fill-foreground" fontSize="9">
                  {formatRate(retentionRate(p.r))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">
        <span className="sr-only">Weekly retention: </span>{caption}. Hollow points are below {MIN_RATE_SAMPLE} eligible; later weeks pool fewer, older cohorts.
      </figcaption>
    </figure>
  );
}

// --- View ------------------------------------------------------------------

function Toggle<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded px-2 py-1 text-[11px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.id ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const LENS_OPTIONS: Array<{ id: RetentionLens; label: string }> = [
  { id: "browser", label: LENS_LABELS.browser },
  { id: "account", label: LENS_LABELS.account },
];
const GRAIN_OPTIONS: Array<{ id: CohortGrain; label: string }> = [
  { id: "week", label: "Weekly cohorts" },
  { id: "day", label: "Daily cohorts" },
];

export function CohortRetentionView({ report, filter, unavailable, lens, grain, onLens, onGrain }: {
  report: CohortReport | null;
  filter: TrafficFilter;
  unavailable: string | null;
  lens: RetentionLens;
  grain: CohortGrain;
  onLens: (l: RetentionLens) => void;
  onGrain: (g: CohortGrain) => void;
}) {
  const windows = windowsForLens(lens);
  const span = grain === "week" ? `last ${COHORT_LOOKBACK_WEEKS} UTC weeks` : `last ${DAY_COHORTS_SHOWN} UTC days`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle label="Retention unit" value={lens} options={LENS_OPTIONS} onChange={onLens} />
        <Toggle label="Cohort size" value={grain} options={GRAIN_OPTIONS} onChange={onGrain} />
        <span className="text-[11px] text-muted-foreground">
          {span} · {TRAFFIC_FILTER_LABELS[filter]}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="cohort-lens-definition">
        {LENS_DEFINITIONS[lens]}
      </p>

      {unavailable ? (
        <p role="alert" className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/5 p-3 text-[11px] text-amber-600 dark:text-amber-300" data-testid="cohort-unavailable">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {unavailable}
        </p>
      ) : !report || report.units === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground" data-testid="cohort-empty">
          {lens === "browser"
            ? "No browser was first seen in this window for this traffic population."
            : "No signup_completed event in this window for this traffic population, so there is no account cohort yet."}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="cohort-pooled">
            {windows.map((w) => {
              const r = report.pooled[w.id]!;
              return (
                <div key={w.id} className="rounded-md border border-border bg-card p-2">
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground" title={w.definition}>{w.label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                    {r.eligible === 0 ? <span className="text-xs font-normal text-muted-foreground">Not yet</span> : formatRate(retentionRate(r))}
                  </dd>
                  <dd className="text-[10px] text-muted-foreground">
                    {r.eligible === 0 ? `${r.tooRecent} too recent` : `of ${r.eligible}${r.tooRecent ? ` · ${r.tooRecent} pending` : ""}`}
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-left text-[11px]" data-testid="cohort-table">
                <caption className="sr-only">
                  {LENS_LABELS[lens]} retention by {grain === "week" ? "week" : "day"} of first {lens === "browser" ? "visit" : "signup"}, newest first.
                </caption>
                <thead>
                  <tr className="text-[10px] uppercase text-muted-foreground">
                    <th scope="col" className="p-1 font-semibold">Cohort (UTC)</th>
                    <th scope="col" className="p-1 text-right font-semibold">Size</th>
                    {windows.map((w) => (
                      <th key={w.id} scope="col" className="p-1 text-center font-semibold" title={w.definition}>{w.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="whitespace-nowrap p-1 font-medium">{grain === "week" ? `Week of ${row.key}` : row.key}</th>
                      <td className="p-1 text-right tabular-nums">{row.size}</td>
                      {windows.map((w) => (
                        <RateCell key={w.id} label={`${row.key} ${w.label}`} r={row.cells[w.id as RetentionWindowId]!} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <RetentionCurve report={report} />
          </div>
        </>
      )}

      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
        <li>Each cell is <em>returned ÷ eligible</em>. A unit is eligible only once its whole window has passed; younger units are “pending” (the small +n), never counted as lost.</li>
        <li>Below {MIN_RATE_SAMPLE} eligible a cell shows k / n and is not shaded.</li>
        <li>D1 and D7 use the same definitions as the existing tiles. W1–W4 are days 7–13, 14–20, 21–27, 28–34.</li>
        <li>Browsers and accounts are separate units and are never added together or matched to each other.</li>
      </ul>
    </div>
  );
}

export function CohortRetentionPanel({ filter = DEFAULT_TRAFFIC_FILTER, refreshKey = 0 }: { filter?: TrafficFilter; refreshKey?: number }) {
  const [lens, setLens] = useState<RetentionLens>("browser");
  const [grain, setGrain] = useState<CohortGrain>("week");
  const query = useCohortAnalytics(refreshKey);
  const unavailable = query.data ? lensUnavailableReason(query.data, lens) : null;
  const report = useMemo(
    () => (query.data && !unavailable ? buildReport(query.data, filter, lens, grain) : null),
    [query.data, filter, lens, grain, unavailable],
  );
  return (
    <div id="users-retention">
      <AdminPanel
        title="Cohort retention"
        description="Who came back, by when they first arrived. Read separately for browsers and for registered accounts."
        testId="cohort-retention"
      >
        {query.isPending ? (
          <p role="status" className="text-[11px] text-muted-foreground">Reading {COHORT_LOOKBACK_WEEKS} weeks of history…</p>
        ) : query.isError ? (
          <p role="alert" className="text-[11px] text-destructive">Retention history unavailable. No rate can be confirmed.</p>
        ) : (
          <CohortRetentionView
            report={report}
            filter={filter}
            unavailable={unavailable}
            lens={lens}
            grain={grain}
            onLens={setLens}
            onGrain={setGrain}
          />
        )}
      </AdminPanel>
    </div>
  );
}

// --- Overview card ----------------------------------------------------------

function Glance({ title, report, unavailable, ids }: {
  title: string; report: CohortReport | null; unavailable: string | null; ids: RetentionWindowId[];
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h3 className="text-[11px] font-semibold">{title}</h3>
      {unavailable ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Partial read — not shown.</p>
      ) : !report || report.units === 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">No cohort yet.</p>
      ) : (
        <dl className="mt-1 grid grid-cols-2 gap-2">
          {ids.map((id) => {
            const r = report.pooled[id]!;
            return (
              <div key={id}>
                <dt className="text-[10px] uppercase text-muted-foreground">{id.toUpperCase()}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {r.eligible === 0 ? <span className="text-xs font-normal text-muted-foreground">Not yet</span> : formatRate(retentionRate(r))}
                </dd>
                <dd className="text-[10px] text-muted-foreground">{r.eligible === 0 ? `${r.tooRecent} too recent` : `of ${r.eligible} eligible`}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {report && report.units > 0 && <p className="mt-1 text-[10px] text-muted-foreground">{report.units} in cohorts</p>}
    </div>
  );
}

export function RetentionGlance() {
  const query = useCohortAnalytics();
  const { browser, account } = useMemo(() => {
    const lensData = (lens: RetentionLens) => {
      if (!query.data) return { report: null, unavailable: null };
      const unavailable = lensUnavailableReason(query.data, lens);
      return { unavailable, report: unavailable ? null : buildReport(query.data, DEFAULT_TRAFFIC_FILTER, lens, "week") };
    };
    return { browser: lensData("browser"), account: lensData("account") };
  }, [query.data]);
  return (
    <AdminPanel
      title={`Retention · last ${COHORT_LOOKBACK_WEEKS} weeks`}
      description="Pooled over weekly cohorts. Browsers and registered accounts are different units and are not combined."
      testId="overview-retention-glance"
      action={
        <Link to="/admin/users?section=audience#users-retention" className="inline-flex items-center gap-1 text-[11px] text-primary underline underline-offset-2">
          Cohort table <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      }
    >
      {query.isPending ? (
        <p role="status" className="text-[11px] text-muted-foreground">Reading retention…</p>
      ) : query.isError ? (
        <p role="alert" className="text-[11px] text-destructive">Retention unavailable.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Glance title="Browsers (human + unknown)" ids={["d1", "w1"]} {...browser} />
          <Glance title="Registered accounts" ids={["d1", "w1"]} {...account} />
        </div>
      )}
    </AdminPanel>
  );
}
