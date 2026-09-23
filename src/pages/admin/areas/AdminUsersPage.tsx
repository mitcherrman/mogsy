// ---------------------------------------------------------------------------
// Admin › Users — USERS1. One audience domain.
//
// WHAT THIS REPLACED, AND WHY
//
// Admin had two top-level areas answering one question. `Analytics`
// (FUNNEL1C) counted visitors, sessions, funnel steps and retention out of
// analytics_*. `People` (ADMIN2) listed accounts, roles, moderation and
// feedback out of profiles. An operator asking the only question that matters
// — "who is actually out there, and is any of this a real person?" — had to
// hold both pages in their head and join them by eye, and could not get from
// any number to any record at all.
//
// They are one area now, with one path through it:
//
//     aggregate  ->  population  ->  individual  ->  action
//     Overview       Visitors        the record     Accounts
//
// and two controls that apply to all of it: the date range, and the traffic
// filter. The traffic filter is the reason this workstream exists — see
// lib/admin/analytics/traffic.ts. It narrows the DATASET before any metric
// sees it, so every number on every section honours it without each metric
// having to remember to.
//
// THE DEFAULT POPULATION IS human + unknown. Automation and our own marked
// internal traffic stay in the warehouse and out of the KPIs. Nothing is
// deleted to achieve that; it is one filter, and "All traffic" is always one
// click away.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminUserDirectory from "@/pages/admin/AdminUserDirectory";
import AdminProfileDirectory from "@/components/admin/AdminProfileDirectory";
import AdminInviteLinks from "@/components/admin/AdminInviteLinks";
import AdminComments from "@/components/admin/AdminComments";
import AdminUserReports from "@/components/admin/AdminUserReports";
import AdminModeratorConfig from "@/components/admin/AdminModeratorConfig";
import AdminFeedback from "@/components/admin/AdminFeedback";
import {
  AdminAreaHeader,
  AdminPanel,
  useAreaSection,
} from "@/components/admin/shell/AdminAreaPage";
import {
  AccountsSection,
  AcquisitionSection,
  DrillContext,
  EngagementSection,
  HealthSection,
  Metric,
  MetricGrid,
  OverviewSection,
  RetentionSection,
  SourcesSection,
} from "@/components/admin/users/AudienceSections";
import { VisitorsSection } from "@/components/admin/users/VisitorsSection";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { ADMIN_AREAS_BY_ID } from "@/lib/admin/admin-registry";
import { loadAnalytics, ROW_CAP, type LoadedAnalytics } from "@/lib/admin/analytics/loadAnalytics";
import {
  DEFAULT_TRAFFIC_FILTER,
  TRAFFIC_CLASS_LABELS,
  TRAFFIC_FILTERS,
  TRAFFIC_FILTER_DEFINITIONS,
  TRAFFIC_FILTER_LABELS,
  filterDatasetByTraffic,
  parseTrafficFilter,
  type TrafficClass,
  type TrafficFilter,
} from "@/lib/admin/analytics/traffic";
import {
  parseRangePreset,
  RANGE_LABELS,
  RANGE_PRESETS,
  resolveRange,
  type AnalyticsRange,
  type RangePreset,
} from "@/lib/admin/analytics/range";
import { cn } from "@/lib/utils";

/** A minimal in-section switch for two or more views of one concept. */
function SubTabs({
  options,
  value,
  onChange,
  testId,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  testId: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1" role="tablist" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          data-testid={`${testId}-${o.id}`}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-medium",
            value === o.id
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type LoadState =
  | { s: "loading" }
  | { s: "ok"; loaded: LoadedAnalytics; range: AnalyticsRange; now: number }
  | { s: "error"; message: string };

function ControlBar({
  preset,
  onPreset,
  filter,
  onFilter,
  onRefresh,
  busy,
  counts,
}: {
  preset: RangePreset;
  onPreset: (p: RangePreset) => void;
  filter: TrafficFilter;
  onFilter: (f: TrafficFilter) => void;
  onRefresh: () => void;
  busy: boolean;
  counts: Record<TrafficClass, number> | null;
}) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2" data-testid="analytics-range">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Range</span>
        {RANGE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === preset}
            data-testid={`analytics-range-${p}`}
            onClick={() => onPreset(p)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-medium",
              p === preset
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_LABELS[p]}
          </button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 gap-1 text-[11px]"
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} aria-hidden /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="users-traffic-filter">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Traffic</span>
        {TRAFFIC_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={f === filter}
            title={TRAFFIC_FILTER_DEFINITIONS[f]}
            data-testid={`users-traffic-${f}`}
            onClick={() => onFilter(f)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-medium",
              f === filter
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {TRAFFIC_FILTER_LABELS[f]}
          </button>
        ))}
        {counts && (
          <span className="text-[10px] text-muted-foreground tabular-nums" data-testid="users-traffic-mix">
            all visitors ·{" "}
            {(Object.keys(TRAFFIC_CLASS_LABELS) as TrafficClass[])
              .map((c) => `${TRAFFIC_CLASS_LABELS[c].toLowerCase()} ${counts[c]}`)
              .join(" · ")}
          </span>
        )}
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground/80" data-testid="users-traffic-definition">
        {TRAFFIC_FILTER_DEFINITIONS[filter]}
      </p>
    </div>
  );
}

export default function AdminUsersPage() {
  const area = ADMIN_AREAS_BY_ID.users;
  const [section, setSection] = useAreaSection(area);
  const { isMasterAdmin } = useAdminRoles();
  const [params, setParams] = useSearchParams();

  const preset = parseRangePreset(params.get("range"));
  const filter = parseTrafficFilter(params.get("traffic"));
  const population = params.get("population");
  const visitor = params.get("visitor");
  const accountsView = params.get("view") ?? "accounts";
  const moderationView = params.get("view") ?? "comments";

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<LoadState>({ s: "loading" });

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const range = resolveRange(preset, now);
    setState({ s: "loading" });
    loadAnalytics(range)
      .then((loaded) => !cancelled && setState({ s: "ok", loaded, range, now }))
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          s: "error",
          message:
            err instanceof Error && err.message
              ? `Could not read analytics: ${err.message}`
              : "Could not read analytics.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [preset, nonce]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: false });
  };

  /**
   * A metric was clicked. Land on Visitors with the population applied, and
   * drop any record that was open — the reader asked for a list, not a person.
   */
  const drill = (populationKey: string) => {
    const next = new URLSearchParams(params);
    next.set("section", "visitors");
    next.set("population", populationKey);
    next.delete("visitor");
    setParams(next, { replace: false });
  };

  const filtered = useMemo(() => {
    if (state.s !== "ok") return null;
    return filterDatasetByTraffic(state.loaded.dataset, filter, state.loaded.overrides);
  }, [state, filter]);

  /**
   * The sections were written against a LoadedAnalytics. They receive one
   * whose dataset has been narrowed to the chosen population, which is how a
   * filter written once reaches two dozen metrics.
   */
  const viewLoaded = useMemo<LoadedAnalytics | null>(() => {
    if (state.s !== "ok" || !filtered) return null;
    return { ...state.loaded, dataset: filtered.dataset };
  }, [state, filtered]);

  const truncated =
    state.s === "ok" && Object.entries(state.loaded.truncated).filter(([, t]) => t).map(([k]) => k);

  const audienceSection =
    section.id === "overview" ||
    section.id === "visitors" ||
    section.id === "activity" ||
    section.id === "acquisition" ||
    section.id === "retention" ||
    section.id === "traffic-health";

  return (
    <div data-testid="admin-area-users">
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />

      {audienceSection && (
        <ControlBar
          preset={preset}
          onPreset={(p) => setParam("range", p)}
          filter={filter}
          onFilter={(f) => setParam("traffic", f === DEFAULT_TRAFFIC_FILTER ? null : f)}
          onRefresh={() => setNonce((n) => n + 1)}
          busy={state.s === "loading"}
          counts={filtered?.counts ?? null}
        />
      )}

      {audienceSection && state.s === "loading" && (
        <p
          className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground"
          data-testid="analytics-loading"
        >
          Reading analytics…
        </p>
      )}

      {audienceSection && state.s === "error" && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-xs text-destructive"
          data-testid="analytics-error"
        >
          {state.message}
        </p>
      )}

      {audienceSection && state.s === "ok" && viewLoaded && filtered && (
        <DrillContext.Provider value={drill}>
          <p className="mb-3 text-[10px] text-muted-foreground" data-testid="analytics-loaded-at">
            {RANGE_LABELS[preset]} · {TRAFFIC_FILTER_LABELS[filter]} · read{" "}
            {new Date(state.loaded.loadedAt).toLocaleTimeString()} ·{" "}
            {viewLoaded.dataset.events.length} of {state.loaded.dataset.events.length} events,{" "}
            {viewLoaded.dataset.sessions.length} of {state.loaded.dataset.sessions.length} sessions,{" "}
            {viewLoaded.dataset.visitors.length} of {state.loaded.dataset.visitors.length} visitors
            in this population
          </p>

          {truncated && truncated.length > 0 && (
            <p
              className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/5 p-3 text-[11px] text-amber-300"
              data-testid="analytics-truncated"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {truncated.join(", ")} exceeded {ROW_CAP.toLocaleString()} rows and were truncated.
              Numbers below are computed on a partial read — move these aggregates into SQL views.
            </p>
          )}

          {state.loaded.dataset.events.length === 0 && state.loaded.dataset.sessions.length === 0 && (
            <p
              className="mb-3 rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground"
              data-testid="analytics-empty"
            >
              No analytics rows exist yet. Every count below is a true zero, not a failed read —
              Traffic Health shows whether events are arriving at all.
            </p>
          )}

          {section.id === "overview" && (
            <OverviewSection loaded={viewLoaded} range={state.range} now={state.now} />
          )}
          {section.id === "visitors" && (
            <VisitorsSection
              dataset={viewLoaded.dataset}
              range={state.range}
              byVisitor={filtered.byVisitor}
              population={population}
              onPopulation={(key) => setParam("population", key)}
              selected={visitor}
              onSelect={(id) => setParam("visitor", id)}
            />
          )}
          {section.id === "activity" && (
            <EngagementSection loaded={viewLoaded} range={state.range} now={state.now} />
          )}
          {section.id === "acquisition" && (
            <div className="space-y-4">
              <AcquisitionSection loaded={viewLoaded} range={state.range} now={state.now} />
              {/* The signup funnel belongs to acquisition, not to a separate
                  "Accounts" analytics tab: it is the last step of the same
                  journey, and splitting it was how "Accounts" came to mean two
                  different things in one Admin. */}
              <AccountsSection loaded={viewLoaded} range={state.range} now={state.now} />
              <SourcesSection loaded={viewLoaded} range={state.range} now={state.now} />
            </div>
          )}
          {section.id === "retention" && (
            <RetentionSection loaded={viewLoaded} range={state.range} now={state.now} />
          )}
          {section.id === "traffic-health" && (
            <div className="space-y-4">
              <AdminPanel
                title="Traffic mix"
                description="Every visitor in the store, by class, ignoring the filter above — this is the denominator the filter is a view of. Detection is not perfect: `unknown` is what honesty looks like, not a bug."
                testId="users-traffic-mix-panel"
              >
                <MetricGrid>
                  {(Object.keys(TRAFFIC_CLASS_LABELS) as TrafficClass[]).map((c) => (
                    <Metric
                      key={c}
                      id={`traffic-${c}`}
                      label={TRAFFIC_CLASS_LABELS[c]}
                      value={filtered.counts[c]}
                      definition={TRAFFIC_FILTER_DEFINITIONS[c]}
                    />
                  ))}
                </MetricGrid>
              </AdminPanel>
              <HealthSection loaded={viewLoaded} range={state.range} now={state.now} />
            </div>
          )}
        </DrillContext.Provider>
      )}

      {section.id === "accounts" && (
        <div className="space-y-4">
          <SubTabs
            testId="users-accounts-subtabs"
            value={accountsView}
            onChange={(id) => setParam("view", id)}
            options={[
              { id: "accounts", label: "Accounts" },
              { id: "browser", label: "Profile browser" },
              { id: "access", label: "Roles & access" },
              // Master-only, exactly as /admin/users was before USERS1 moved
              // the whole area onto that path. The RPCs re-check server-side.
              ...(isMasterAdmin ? [{ id: "identities", label: "Identities" }] : []),
            ]}
          />
          {accountsView === "browser" && (
            <div data-testid="users-accounts-browser">
              <AdminProfileDirectory />
            </div>
          )}
          {accountsView === "identities" && isMasterAdmin && (
            <div data-testid="users-accounts-identities">
              <AdminUserDirectory embedded />
            </div>
          )}
          {accountsView === "access" && (
            <div className="space-y-4" data-testid="users-accounts-access">
              <AdminPanel
                title="Invite links"
                description="Role-granting invites promote whoever redeems them. redeem_invite_link writes to user_roles — this is a real role-assignment path, alongside the master-only editor inside Accounts."
              >
                <AdminInviteLinks />
              </AdminPanel>
            </div>
          )}
          {accountsView !== "browser" &&
            accountsView !== "access" &&
            !(accountsView === "identities" && isMasterAdmin) && (
              <div data-testid="users-accounts-list">
                <AdminUsers isMasterAdmin={isMasterAdmin} />
              </div>
            )}
        </div>
      )}

      {section.id === "moderation" && (
        <div className="space-y-4">
          <SubTabs
            testId="users-moderation-subtabs"
            value={moderationView}
            onChange={(id) => setParam("view", id)}
            options={[
              { id: "comments", label: "Comments" },
              { id: "reports", label: "User reports" },
              { id: "mod-config", label: "Moderator roster" },
              { id: "feedback", label: "Feedback" },
            ]}
          />
          {moderationView === "reports" && (
            <div data-testid="users-moderation-reports">
              <AdminUserReports />
            </div>
          )}
          {moderationView === "mod-config" && (
            <div data-testid="users-moderation-mod-config">
              <AdminModeratorConfig />
            </div>
          )}
          {moderationView === "feedback" && (
            <div data-testid="users-moderation-feedback">
              <AdminFeedback />
            </div>
          )}
          {moderationView !== "reports" &&
            moderationView !== "mod-config" &&
            moderationView !== "feedback" && (
              <div data-testid="users-moderation-comments">
                <AdminComments />
              </div>
            )}
        </div>
      )}
    </div>
  );
}
