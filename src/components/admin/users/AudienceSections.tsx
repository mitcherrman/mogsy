// ---------------------------------------------------------------------------
// The audience sections of Admin › Users.
//
// FUNNEL1C wrote these as the whole of a standalone /admin/analytics page.
// USERS1 kept every one of them and moved them here, because Analytics and
// People were the same operator domain split by which table they happened to
// read. The page that composes them — with the shared date range, the traffic
// filter, the visitor list and the record detail — is
// pages/admin/areas/AdminUsersPage.tsx.
//
// Every number still comes from lib/admin/analytics/metrics.ts, which reads
// only analytics_events, analytics_sessions and analytics_visitors. Browser
// signals and Railway-confirmed gameplay are labelled as different kinds of
// fact everywhere they appear.
//
// WHAT USERS1 ADDED: the sections receive a dataset that has ALREADY been
// narrowed to the chosen traffic population (see analytics/traffic.ts), so
// every metric here honours the filter without knowing it exists — and the
// headline tiles are now links into the visitor list behind them.
//
// Operator console, not a marketing dashboard: numbers and tables, no
// decorative charts. The one time series (daily activity) is a table.
// ---------------------------------------------------------------------------

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminAreaHeader, AdminPanel, useAreaSection } from "@/components/admin/shell/AdminAreaPage";
import { ADMIN_AREAS_BY_ID } from "@/lib/admin/admin-registry";
import { AdminOpsError, fetchAnalyticsHealth, type AnalyticsHealth } from "@/lib/admin/adminOpsApi";
import { loadAnalytics, ROW_CAP, type LoadedAnalytics } from "@/lib/admin/analytics/loadAnalytics";
import {
  computeAccounts,
  computeDaily,
  computeFunnel,
  computeGameplay,
  computeHealth,
  computeOverview,
  computeRetention,
  computeSources,
  formatRate,
  METRIC_DEFINITIONS,
  MIN_RATE_SAMPLE,
  retentionRate,
  type RetentionRate,
  type SourceBreakdown,
  type SourceRow,
} from "@/lib/admin/analytics/metrics";
import {
  parseRangePreset,
  RANGE_LABELS,
  RANGE_PRESETS,
  resolveRange,
  type AnalyticsRange,
  type RangePreset,
} from "@/lib/admin/analytics/range";
import { cn } from "@/lib/utils";

// --- Drill-down ------------------------------------------------------------

/**
 * USERS1 — how a number becomes a list.
 *
 * The page supplies one function: "open the visitor list for this population".
 * A tile that names a population renders its value as a button; a tile that
 * does not (a rate, a freshness reading) renders exactly as before. Passing it
 * through context rather than as a prop on every section keeps the section
 * signatures unchanged, and means a tile deep inside a table can drill without
 * six components forwarding a callback they do not otherwise care about.
 *
 * The population keys are the ones lib/admin/analytics/population.ts resolves,
 * so a tile cannot offer a drill-down that has no implementation.
 */
export const DrillContext = createContext<((population: string) => void) | null>(null);

export function useDrill(): ((population: string) => void) | null {
  return useContext(DrillContext);
}

/**
 * The acquisition funnel's steps, mapped to the event each one counts.
 *
 * `returned` is the one step that is not an event — it is derived from session
 * history — so it drills to the returning-visitor population instead.
 */
const FUNNEL_POPULATIONS: Record<string, string | undefined> = {
  landing: "event:landing_viewed",
  hub: "event:hub_entered",
  leaguecraft: "event:leaguecraft_opened",
  engaged: "engaged_visitors",
  account: "event:signup_completed",
  verification: "event:verification_completed",
  returned: "returning_visitors",
};

/** A number that opens its own population, for use inside a table cell. */
export function DrillValue({
  id,
  population,
  value,
}: {
  id: string;
  population?: string;
  value: ReactNode;
}) {
  const onDrill = useDrill();
  if (!population || !onDrill) return <>{value}</>;
  return (
    <button
      type="button"
      data-testid={`analytics-drill-${id}`}
      onClick={() => onDrill(population)}
      className="tabular-nums underline decoration-dotted underline-offset-4 hover:text-primary"
      title="Show the visitors behind this number"
    >
      {value}
    </button>
  );
}

// --- Primitives ------------------------------------------------------------

export function Metric({
  id,
  label,
  value,
  definition,
  muted,
  drill,
}: {
  id: string;
  label: string;
  value: ReactNode;
  definition?: string;
  muted?: boolean;
  /** A population key from analytics/population.ts. Makes the value clickable. */
  drill?: string;
}) {
  const onDrill = useDrill();
  const clickable = Boolean(drill && onDrill);
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2" data-testid={`analytics-metric-${id}`}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("text-base font-semibold tabular-nums", muted && "text-sm font-medium text-muted-foreground")}>
        {clickable ? (
          <button
            type="button"
            data-testid={`analytics-drill-${id}`}
            onClick={() => onDrill!(drill!)}
            className="underline decoration-dotted underline-offset-4 hover:text-primary"
            title="Show the visitors behind this number"
          >
            {value}
          </button>
        ) : (
          value
        )}
      </dd>
      {definition && <dd className="mt-0.5 text-[10px] leading-snug text-muted-foreground/80">{definition}</dd>}
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{children}</dl>;
}

export function Table({
  head,
  rows,
  testId,
  empty = "No rows in this range.",
}: {
  head: string[];
  rows: ReactNode[][];
  testId?: string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground" data-testid={testId ? `${testId}-empty` : undefined}>
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px]" data-testid={testId}>
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("px-2 py-1.5 align-top", j > 0 && "tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where a number comes from. The distinction the whole page is organised around. */
export function Kind({ kind }: { kind: "browser" | "railway" }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
        kind === "railway" ? "bg-emerald-400/10 text-emerald-300" : "bg-sky-400/10 text-sky-300",
      )}
    >
      {kind === "railway" ? "Server-confirmed" : "Browser signal"}
    </span>
  );
}

export function Unavailable({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-normal text-muted-foreground">{children}</span>;
}

export const pctOf = (n: number, total: number) =>
  total >= MIN_RATE_SAMPLE && total > 0 ? `${Math.round((n / total) * 100)}%` : "—";

export function retentionValue(r: RetentionRate) {
  if (r.eligible === 0) {
    return <Unavailable>Insufficient history{r.tooRecent > 0 ? ` (${r.tooRecent} too recent)` : ""}</Unavailable>;
  }
  return (
    <>
      {formatRate(retentionRate(r))}
      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
        of {r.eligible}
        {r.tooRecent > 0 ? ` · ${r.tooRecent} too recent` : ""}
      </span>
    </>
  );
}

export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

export function ageLabel(iso: string | null, now: number) {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// --- Sections --------------------------------------------------------------

export interface SectionProps {
  loaded: LoadedAnalytics;
  range: AnalyticsRange;
  now: number;
}

export function OverviewSection({ loaded, range, now }: SectionProps) {
  const m = useMemo(() => computeOverview(loaded.dataset, range, now), [loaded, range, now]);
  const daily = useMemo(() => computeDaily(loaded.dataset, range), [loaded, range]);
  return (
    <div className="space-y-4" data-testid="analytics-section-overview">
      <AdminPanel title="Summary" description="Every tile states its definition. Nothing here is estimated.">
        <MetricGrid>
          <Metric id="visitors" label="Visitors" value={m.visitors} definition={METRIC_DEFINITIONS.visitors} drill="visitors" />
          <Metric id="sessions" label="Sessions" value={m.sessions} definition={METRIC_DEFINITIONS.sessions} drill="sessions" />
          <Metric id="new-visitors" label="New visitors" value={m.newVisitors} definition={METRIC_DEFINITIONS.newVisitors} drill="new_visitors" />
          <Metric id="returning-visitors" label="Returning visitors" value={m.returningVisitors} definition={METRIC_DEFINITIONS.returningVisitors} drill="returning_visitors" />
          <Metric id="signed-in-users" label="Signed-in users" value={m.signedInUsers} definition={METRIC_DEFINITIONS.signedInUsers} />
          <Metric id="guest-sessions" label="Guest sessions" value={m.guestSessions} definition={METRIC_DEFINITIONS.guestSessions} />
          <Metric id="engaged-sessions" label="Engaged sessions" value={m.engagedSessions} definition={METRIC_DEFINITIONS.engagedSessions} drill="engaged_sessions" />
          <Metric id="engaged-visitors" label="Engaged visitors" value={m.engagedVisitors} definition={METRIC_DEFINITIONS.engagedVisitors} drill="engaged_visitors" />
          <Metric id="signups" label="Signups" value={m.signups} definition={METRIC_DEFINITIONS.signups} drill="signups" />
          <Metric id="d1" label="D1 retention" value={retentionValue(m.d1)} definition={METRIC_DEFINITIONS.d1} />
          <Metric id="d7" label="D7 retention" value={retentionValue(m.d7)} definition={METRIC_DEFINITIONS.d7} />
        </MetricGrid>
      </AdminPanel>
      <AdminPanel title="Daily activity" description="UTC days with any activity in range, newest first.">
        <Table
          testId="analytics-daily"
          head={["Day (UTC)", "Visitors", "Sessions started", "New visitors", "Server-confirmed starts"]}
          rows={daily.map((d) => [d.day, d.visitors, d.sessions, d.newVisitors, d.authoritativeStarts])}
        />
      </AdminPanel>
    </div>
  );
}

export function AcquisitionSection({ loaded, range, now }: SectionProps) {
  const steps = useMemo(() => computeFunnel(loaded.dataset, range, now), [loaded, range, now]);
  const total = useMemo(() => computeOverview(loaded.dataset, range, now).visitors, [loaded, range, now]);
  return (
    <div className="space-y-4" data-testid="analytics-section-acquisition">
      <AdminPanel
        title="Acquisition funnel"
        description={`Distinct visitors reaching each step in range, read against all ${total} visitors in range. Steps are not forced into order — a direct link to /quiz skips Landing and Hub — so a later step can exceed an earlier one. Percentages appear only once the range has ${MIN_RATE_SAMPLE}+ visitors.`}
      >
        <Table
          testId="analytics-funnel"
          head={["Step", "Visitors", "% of visitors", "Definition"]}
          rows={steps.map((s) => [
            <span key="l" className="font-medium">{s.label}</span>,
            s.visitors === null ? (
              <Unavailable key="u">Unavailable</Unavailable>
            ) : (
              <DrillValue key="v" id={`funnel-${s.id}`} population={FUNNEL_POPULATIONS[s.id]} value={s.visitors} />
            ),
            s.visitors === null ? "—" : pctOf(s.visitors, total),
            <span key="d" className="text-muted-foreground">{s.unavailableReason ?? s.definition}</span>,
          ])}
        />
      </AdminPanel>
      <p className="text-[11px] text-muted-foreground">
        Gameplay is branched, not linear — Ranked is not downstream of Practice. Per-mode opens,
        starts and completions are under Engagement.
      </p>
    </div>
  );
}

export function EngagementSection({ loaded, range }: SectionProps) {
  const modes = useMemo(() => computeGameplay(loaded.dataset, range), [loaded, range]);
  const na = (text = "Not instrumented") => <Unavailable>{text}</Unavailable>;
  return (
    <div className="space-y-4" data-testid="analytics-section-engagement">
      <AdminPanel
        title="Gameplay branches"
        description="Five independent modes. Opened is a browser signal (intent). Started and Completed are counted only from Railway-authoritative rows (source_system = 'railway'); a browser row with those names is never counted."
      >
        <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Kind kind="browser" /> opened</span>
          <span className="flex items-center gap-1"><Kind kind="railway" /> started / completed</span>
        </div>
        <Table
          testId="analytics-gameplay"
          head={["Mode", "Opened (visitors)", "Opened (events)", "Started", "Started users", "Guest starts", "Completed", "Completion", "Grain"]}
          rows={modes.map((m) => [
            <span key="m" className="font-medium" data-testid={`analytics-mode-${m.mode.id}`}>{m.mode.label}</span>,
            <DrillValue key="ov" id={`mode-${m.mode.id}`} population={`mode:${m.mode.id}`} value={m.openedVisitors} />,
            m.openedEvents,
            m.started === null ? na() : m.started,
            m.startedUsers === null ? "—" : m.startedUsers,
            m.startedByGuests === null ? "—" : m.startedByGuests,
            m.completed === null ? na() : m.completed,
            m.completion === null ? "—" : formatRate(m.completion),
            <span key="g" className="text-muted-foreground">{m.mode.gap ?? m.mode.grain}</span>,
          ])}
        />
      </AdminPanel>
    </div>
  );
}

export function AccountsSection({ loaded, range, now }: SectionProps) {
  const a = useMemo(() => computeAccounts(loaded.dataset, range), [loaded, range]);
  const o = useMemo(() => computeOverview(loaded.dataset, range, now), [loaded, range, now]);
  return (
    <div className="space-y-4" data-testid="analytics-section-accounts">
      <AdminPanel
        title="Signup funnel"
        description="Distinct visitors per step. A signup is an auth identity becoming registered — never a profiles row (which exists for every guest)."
      >
        <MetricGrid>
          <Metric id="signup-viewed" label="Viewed signup" value={a.signupViewed} />
          <Metric id="signup-started" label="Submitted signup" value={a.signupStarted} />
          <Metric id="signup-completed" label="Accounts created" value={a.signupCompleted} definition="signup_completed events." />
          <Metric id="signup-conversion" label="Viewed → created" value={formatRate(a.viewToComplete)} definition={`Visitors; shown as a fraction below ${MIN_RATE_SAMPLE}.`} />
          <Metric id="signup-from-guest" label="Guest upgrades" value={a.completedFromGuest} definition="upgraded_from_guest = true — same uid before and after." />
          <Metric id="signup-direct" label="New registered accounts" value={a.completedDirect} definition="upgraded_from_guest = false." />
        </MetricGrid>
      </AdminPanel>
      <AdminPanel title="Guest vs signed-in usage">
        <MetricGrid>
          <Metric id="guest-sessions-acct" label="Guest sessions" value={o.guestSessions} definition={METRIC_DEFINITIONS.guestSessions} />
          <Metric id="signed-in-sessions" label="Signed-in sessions" value={o.signedInSessions} />
          <Metric id="guest-users" label="Guest user ids" value={a.guestUsers} definition="Distinct user ids seen with is_guest = true." />
          <Metric id="registered-users" label="Registered user ids" value={a.registeredUsers} definition="Distinct user ids seen with is_guest = false." />
          <Metric id="starts-guest" label="Guest gameplay starts" value={a.authoritativeStartsGuest} definition="Server-confirmed starts, is_guest = true." />
          <Metric id="starts-signed-in" label="Signed-in gameplay starts" value={a.authoritativeStartsSignedIn} definition="Server-confirmed starts, is_guest = false." />
        </MetricGrid>
      </AdminPanel>
      <AdminPanel title="Verification" description="verification_started / _completed / _failed, by verification_type. Verification is per method, never one global flag." testId="analytics-verification">
        {a.verification.available ? (
          <Table
            testId="analytics-verification-table"
            head={["Type", "Started", "Completed", "Failed"]}
            rows={a.verification.rows.map((r) => [r.verificationType, r.started, r.completed, r.failed])}
          />
        ) : (
          <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground" data-testid="analytics-verification-unavailable">
            {a.verification.unavailableReason}
          </p>
        )}
      </AdminPanel>
    </div>
  );
}

export function RetentionSection({ loaded, range, now }: SectionProps) {
  const r = useMemo(() => computeRetention(loaded.dataset, range, now), [loaded, range, now]);
  return (
    <div className="space-y-4" data-testid="analytics-section-retention">
      <AdminPanel
        title="Return behaviour"
        description="Derived from session history (analytics_sessions grouped by visitor), never from a click. Sessions use a 30-minute inactivity window; a route change never starts one."
      >
        <MetricGrid>
          <Metric id="cohort" label="New visitors (cohort)" value={r.cohortSize} drill="new_visitors" definition={METRIC_DEFINITIONS.newVisitors} />
          <Metric id="returning" label="Returning visitors" value={r.returningVisitors} drill="returning_visitors" definition={METRIC_DEFINITIONS.returningVisitors} />
          <Metric id="repeat-sessions" label="Repeat sessions" value={r.repeatSessions} drill="repeat_sessions" definition={METRIC_DEFINITIONS.repeatSessions} />
          <Metric
            id="sessions-per-visitor"
            label="Sessions per visitor"
            value={r.sessionsPerVisitor === null ? <Unavailable>No sessions</Unavailable> : r.sessionsPerVisitor.toFixed(2)}
          />
          <Metric id="retention-d1" label="D1" value={retentionValue(r.d1)} definition={METRIC_DEFINITIONS.d1} />
          <Metric id="retention-d7" label="D7" value={retentionValue(r.d7)} definition={METRIC_DEFINITIONS.d7} />
        </MetricGrid>
      </AdminPanel>
      <p className="text-[11px] text-muted-foreground">
        Visitor identity is a first-party id in localStorage: clearing site data or switching device
        makes a new visitor, so returning counts are a floor, not an exact figure.
      </p>
    </div>
  );
}

function SourceTable({ title, rows, total }: { title: string; rows: SourceRow[]; total: number }) {
  return (
    <div className="space-y-1">
      <h3 className="text-[11px] font-semibold">{title}</h3>
      <Table head={["Value", "Count", "Share"]} rows={rows.map((r) => [r.key, r.count, pctOf(r.count, total)])} />
    </div>
  );
}

function Breakdown({ b, testId }: { b: SourceBreakdown; testId: string }) {
  if (b.total === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground" data-testid={`${testId}-empty`}>
        No rows in this range.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid={testId}>
      <SourceTable title="Source" rows={b.bySource} total={b.total} />
      <SourceTable title="Medium" rows={b.byMedium} total={b.total} />
      <SourceTable title="Campaign" rows={b.byCampaign} total={b.total} />
      <SourceTable title="Referrer host" rows={b.byReferrer} total={b.total} />
    </div>
  );
}

export function SourcesSection({ loaded, range }: SectionProps) {
  const s = useMemo(() => computeSources(loaded.dataset, range), [loaded, range]);
  return (
    <div className="space-y-4" data-testid="analytics-section-sources">
      <p className="text-[11px] text-muted-foreground">
        Source is utm_source when present, otherwise the referring host, otherwise{" "}
        <code>(direct)</code>. Same-site referrers are <code>(internal)</code>. Shares appear only
        from {MIN_RATE_SAMPLE} rows up — below that, a percentage is noise.
      </p>
      <AdminPanel title={`First touch · ${s.firstTouch.total} new visitors`} description="analytics_visitors — written once per visitor, immutable.">
        <Breakdown b={s.firstTouch} testId="analytics-sources-first" />
      </AdminPanel>
      <AdminPanel title={`Session touch · ${s.sessionTouch.total} sessions`} description="analytics_sessions — each session's own landing context.">
        <Breakdown b={s.sessionTouch} testId="analytics-sources-session" />
      </AdminPanel>
    </div>
  );
}

function OutboxPanel() {
  const [state, setState] = useState<
    { s: "loading" } | { s: "ok"; data: AnalyticsHealth } | { s: "error"; message: string }
  >({ s: "loading" });
  useEffect(() => {
    let cancelled = false;
    void fetchAnalyticsHealth()
      .then((data) => !cancelled && setState({ s: "ok", data }))
      .catch((err: unknown) =>
        !cancelled && setState({ s: "error", message: err instanceof AdminOpsError ? err.message : "Unexpected error." }),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminPanel
      title="Railway outbox"
      description="GET /api/admin/analytics/health — delivery state of Railway's authoritative events. Read-only; no credential is returned or shown."
      testId="analytics-outbox"
    >
      {state.s === "loading" && <p className="text-[11px] text-muted-foreground">Reading outbox state…</p>}
      {state.s === "error" && (
        <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">{state.message}</p>
      )}
      {state.s === "ok" && (
        <div className="space-y-2 text-[11px]">
          <MetricGrid>
            <Metric id="outbox-ok" label="Delivery" value={state.data.ok ? "OK" : "Problem"} />
            <Metric id="outbox-unsent" label="Unsent" value={state.data.outbox?.unsent ?? "—"} />
            <Metric
              id="outbox-age"
              label="Oldest unsent"
              value={state.data.outbox?.oldest_unsent_age_seconds == null ? "—" : `${Math.round(state.data.outbox.oldest_unsent_age_seconds)}s`}
            />
            <Metric id="outbox-dead" label="Rejected / abandoned" value={`${state.data.outbox?.dead_lettered ?? 0} / ${state.data.outbox?.abandoned ?? 0}`} />
            <Metric id="outbox-total" label="Recorded (outbox total)" value={state.data.outbox?.total ?? "—"} />
            <Metric id="outbox-drainer" label="Drainer" value={state.data.drainer_alive ? "running" : "not running"} />
          </MetricGrid>
          {state.data.problems.length > 0 && (
            <ul className="space-y-1" data-testid="analytics-outbox-problems">
              {state.data.problems.map((p) => (
                <li key={p} className="flex items-start gap-1.5 text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AdminPanel>
  );
}

export function HealthSection({ loaded, range, now }: SectionProps) {
  const h = useMemo(() => computeHealth(loaded.dataset, range, loaded.latest), [loaded, range]);
  const anomaly = (n: number) => (n === 0 ? "0" : <span className="font-semibold text-amber-300">{n}</span>);
  return (
    <div className="space-y-4" data-testid="analytics-section-health">
      {h.gapWarning && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/5 p-3 text-[11px] text-amber-300" data-testid="analytics-gap-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {h.gapWarning}
        </p>
      )}
      <AdminPanel title="Freshness" description="Latest received_at (database clock), all time — independent of the range.">
        <MetricGrid>
          <Metric id="latest-web" label="Latest browser event" value={ageLabel(loaded.latest.web, now)} definition={fmtTime(loaded.latest.web)} />
          <Metric id="latest-railway" label="Latest Railway event" value={ageLabel(loaded.latest.railway, now)} definition={fmtTime(loaded.latest.railway)} />
        </MetricGrid>
        <div className="mt-3">
          <Table
            testId="analytics-freshness"
            head={["Server-confirmed event", "Last received", "Age"]}
            rows={Object.entries(loaded.latest.byRailwayEvent).map(([name, at]) => [
              <code key="n">{name}</code>,
              fmtTime(at),
              ageLabel(at, now),
            ])}
          />
        </div>
      </AdminPanel>
      <AdminPanel title="Events in range by source">
        <Table
          testId="analytics-by-source"
          head={["source_system", "Events"]}
          rows={h.eventsBySource.map((r) => [<Kind key="k" kind={r.key === "railway" ? "railway" : "browser"} />, r.count])}
        />
      </AdminPanel>
      <AdminPanel title="Integrity checks" description="Each should read 0. A non-zero value is a defect to investigate, not a metric.">
        <Table
          testId="analytics-integrity"
          head={["Check", "Rows"]}
          rows={[
            ["Browser rows carrying a Railway-only gameplay name (never counted)", anomaly(h.webAuthoritativeRows)],
            ["Duplicate Railway (event, entity) rows", anomaly(h.duplicateRailwayEntities)],
            ["Railway rows without an entity key", anomaly(h.railwayMissingEntity)],
            ["Browser rows without a visitor id", anomaly(h.webMissingVisitor)],
            ["Sessions in range without a visitor row", anomaly(h.sessionsWithoutVisitorRow)],
          ]}
        />
        <p className="mt-2 text-[10px] text-muted-foreground">
          Browser mode-opens (Railway-backed modes) received after the latest Railway event:{" "}
          <span className="tabular-nums">{h.opensSinceLastAuthoritative}</span>.
        </p>
      </AdminPanel>
      <OutboxPanel />
    </div>
  );
}

