// ---------------------------------------------------------------------------
// Users › Visitors — the list, and the one record detail.
//
// THIS IS THE DRILL-DOWN TARGET FOR EVERY NUMBER IN THE AREA. "Visitors: 12"
// on Overview, "Returning: 4" on Retention, "Practice opened: 3" on Activity
// and every step of the acquisition funnel all open this list with
// `?population=<key>` applied. The list is the SAME set the tile counted
// (lib/admin/analytics/population.ts), not a second query that agrees with it
// by coincidence.
//
// THERE IS ONE DETAIL EXPERIENCE, not one for analytics and one for accounts.
// An anonymous visitor and a registered account are the same record with more
// or less of it filled in: a visitor always has a browser identity, an
// acquisition, sessions and activity; if they ever signed in, the account half
// appears underneath, and the pre-signup history above it is exactly what the
// operator came to see ("what did this person do before they signed up?").
//
// LINKAGE IS DETERMINISTIC AND NOTHING ELSE. A visitor is joined to an account
// only through a uid that the browser itself reported on its own events. No IP
// matching, no user-agent matching, no fingerprinting, no cross-device
// guessing. Two browsers belonging to the same human stay two records, which
// is the honest answer.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import { supabase } from "@/integrations/supabase/client";
import { analyticsDb, ANALYTICS_TRAFFIC_OVERRIDES_TABLE } from "@/lib/analytics/schema";
import type { AnalyticsDataset } from "@/lib/admin/analytics/metrics";
import {
  buildVisitorRows,
  eventsForVisitor,
  populationLabel,
  sessionsForVisitor,
  visitorsForPopulation,
  type VisitorRow,
} from "@/lib/admin/analytics/population";
import {
  TRAFFIC_CLASS_LABELS,
  type TrafficClass,
  type VisitorClassification,
} from "@/lib/admin/analytics/traffic";
import type { AnalyticsRange } from "@/lib/admin/analytics/range";
import { cn } from "@/lib/utils";

const ROW_CAP = 500;

const CLASS_STYLES: Record<TrafficClass, string> = {
  human: "bg-emerald-400/10 text-emerald-300",
  automation: "bg-rose-400/10 text-rose-300",
  internal: "bg-amber-400/10 text-amber-300",
  unknown: "bg-slate-400/10 text-slate-300",
};

export function ClassBadge({ cls, overridden }: { cls: TrafficClass; overridden?: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
        CLASS_STYLES[cls],
      )}
      title={overridden ? "Set by an admin, not detected" : undefined}
    >
      {TRAFFIC_CLASS_LABELS[cls]}
      {overridden ? " ·" : ""}
    </span>
  );
}

const shortId = (id: string) => id.slice(0, 8);
const fmt = (t: number | null) => (t === null ? "—" : new Date(t).toLocaleString());

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export function VisitorsSection({
  dataset,
  range,
  byVisitor,
  population,
  onPopulation,
  selected,
  onSelect,
}: {
  dataset: AnalyticsDataset;
  range: AnalyticsRange;
  byVisitor: Map<string, VisitorClassification>;
  /** A population key, when this list was reached from a metric. */
  population: string | null;
  onPopulation: (key: string | null) => void;
  selected: string | null;
  onSelect: (visitorId: string | null) => void;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => buildVisitorRows(dataset, range, byVisitor),
    [dataset, range, byVisitor],
  );

  const inPopulation = useMemo(
    () => (population ? visitorsForPopulation(population, dataset, range) : null),
    [population, dataset, range],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (inPopulation && !inPopulation.has(r.visitorId)) return false;
      if (!q) return true;
      return (
        r.visitorId.toLowerCase().includes(q) ||
        r.userIds.some((u) => u.toLowerCase().includes(q)) ||
        (r.firstUtmSource ?? "").toLowerCase().includes(q) ||
        (r.firstLandingPath ?? "").toLowerCase().includes(q) ||
        (r.trafficSource ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, inPopulation, query]);

  if (selected) {
    return (
      <UserRecordDetail
        visitorId={selected}
        dataset={dataset}
        range={range}
        byVisitor={byVisitor}
        onBack={() => onSelect(null)}
      />
    );
  }

  const capped = visible.slice(0, ROW_CAP);

  return (
    <div className="space-y-3" data-testid="users-section-visitors">
      {population && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-[11px]"
          data-testid="users-population-banner"
        >
          <span className="font-medium">{populationLabel(population)}</span>
          <span className="text-muted-foreground">
            {inPopulation?.size ?? 0} visitor{(inPopulation?.size ?? 0) === 1 ? "" : "s"} in this
            metric
            {inPopulation && inPopulation.size !== visible.length
              ? ` · ${visible.length} shown after the search`
              : ""}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 text-[11px]"
            onClick={() => onPopulation(null)}
            data-testid="users-population-clear"
          >
            <X className="h-3 w-3" aria-hidden /> Show all visitors
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Visitor id, account id, source or landing path"
            className="h-8 pl-7 text-[11px]"
            data-testid="users-visitor-search"
          />
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {visible.length} of {rows.length}
        </span>
      </div>

      {capped.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground"
          data-testid="users-visitors-empty"
        >
          No visitors match. A true zero here is a real answer — Traffic Health shows whether
          analytics is arriving at all.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]" data-testid="users-visitors-table">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                {["Visitor", "Class", "First seen", "Last seen", "Sessions", "Events", "Opened", "Account"].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {capped.map((r) => (
                <tr
                  key={r.visitorId}
                  className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/30"
                  data-testid="users-visitor-row"
                  onClick={() => onSelect(r.visitorId)}
                >
                  <td className="px-2 py-1.5 font-mono">{shortId(r.visitorId)}</td>
                  <td className="px-2 py-1.5">
                    <ClassBadge cls={r.trafficClass} overridden={r.overridden} />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{fmt(r.firstSeen)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{fmt(r.lastSeen)}</td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {r.sessions}
                    {r.isNew && <span className="ml-1 text-[9px] text-emerald-300">new</span>}
                    {r.isReturning && <span className="ml-1 text-[9px] text-sky-300">returning</span>}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{r.eventsInRange}</td>
                  <td className="px-2 py-1.5">{r.modesOpened.join(", ") || "—"}</td>
                  <td className="px-2 py-1.5">
                    {r.userIds.length === 0
                      ? "—"
                      : r.registered
                        ? "registered"
                        : "guest identity"}
                    {r.signedUp && <span className="ml-1 text-[9px] text-emerald-300">signed up</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > capped.length && (
        <p className="text-[10px] text-muted-foreground">
          Showing the {ROW_CAP} most recent of {visible.length}. Narrow the range or search to see
          the rest — this list is deliberately not paginated over a partial read.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

interface AccountSummary {
  profileId: string;
  userId: string;
  displayName: string | null;
  username: string | null;
  createdAt: string | null;
  isAnonymous: boolean;
  isBot: boolean;
  isPro: boolean;
}

/**
 * The account half, resolved from the uid the browser reported.
 *
 * Read through `admin_list_profiles`, the RPC Accounts already uses, so no new
 * read path or privilege is introduced by this view. A visitor with no uid
 * never reaches this — there is nothing to look up.
 */
function useAccounts(userIds: string[]): { accounts: AccountSummary[]; loading: boolean } {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const key = userIds.join(",");

  useEffect(() => {
    if (!key) {
      setAccounts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void supabase
      .rpc("admin_list_profiles")
      .then(({ data }: { data: unknown }) => {
        if (cancelled) return;
        const wanted = new Set(key.split(","));
        const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
        setAccounts(
          rows
            .filter((p) => wanted.has(String(p.user_id)))
            .map((p) => ({
              profileId: String(p.id),
              userId: String(p.user_id),
              displayName: (p.display_name as string) || null,
              username: (p.username as string) || null,
              createdAt: (p.created_at as string) || null,
              isAnonymous: p.is_anonymous === true,
              isBot: p.is_bot === true,
              isPro: p.is_pro === true,
            })),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { accounts, loading };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-[11px] break-all">{value ?? "—"}</dd>
    </div>
  );
}

export function UserRecordDetail({
  visitorId,
  dataset,
  range,
  byVisitor,
  onBack,
}: {
  visitorId: string;
  dataset: AnalyticsDataset;
  range: AnalyticsRange;
  byVisitor: Map<string, VisitorClassification>;
  onBack: () => void;
}) {
  const row = useMemo<VisitorRow | undefined>(
    () => buildVisitorRows(dataset, range, byVisitor).find((r) => r.visitorId === visitorId),
    [dataset, range, byVisitor, visitorId],
  );
  const sessions = useMemo(() => sessionsForVisitor(dataset, visitorId), [dataset, visitorId]);
  const events = useMemo(
    () => eventsForVisitor(dataset, visitorId, row?.userIds ?? []),
    [dataset, visitorId, row],
  );
  const { accounts, loading: accountsLoading } = useAccounts(row?.userIds ?? []);

  if (!row) {
    return (
      <div className="space-y-3" data-testid="users-record-detail">
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={onBack}>
          <ArrowLeft className="h-3 w-3" aria-hidden /> Back to visitors
        </Button>
        <p className="rounded-md border border-dashed border-border p-4 text-[11px] text-muted-foreground">
          This visitor is not in the current range or traffic filter.
        </p>
      </div>
    );
  }

  const railway = events.filter((e) => e.source_system === "railway");

  return (
    <div className="space-y-4" data-testid="users-record-detail">
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={onBack} data-testid="users-record-back">
        <ArrowLeft className="h-3 w-3" aria-hidden /> Back to visitors
      </Button>

      <AdminPanel
        title={`Visitor ${shortId(visitorId)}`}
        description="One browser. Identity here is a first-party id in localStorage and nothing else — no fingerprint, no IP, no cross-device guess."
        testId="users-record-identity"
      >
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Visitor id" value={<code>{visitorId}</code>} />
          <Field label="Classification" value={<ClassBadge cls={row.trafficClass} overridden={row.overridden} />} />
          <Field label="Traffic source" value={row.trafficSource ?? "—"} />
          <Field label="Why" value={row.classificationReason ?? "no signal"} />
          <Field label="First seen" value={fmt(row.firstSeen)} />
          <Field label="Last seen" value={fmt(row.lastSeen)} />
          <Field label="Sessions (all time)" value={row.sessions} />
          <Field label="Events in range" value={row.eventsInRange} />
        </dl>
        <TrafficOverrideControl visitorId={visitorId} current={row.trafficClass} />
      </AdminPanel>

      <AdminPanel title="Acquisition" description="First touch, written once per visitor and never revised." testId="users-record-acquisition">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label="Landing path" value={row.firstLandingPath ?? "—"} />
          <Field label="Referrer" value={row.firstReferrer ?? "(direct)"} />
          <Field label="utm_source" value={row.firstUtmSource ?? "—"} />
          <Field label="utm_medium" value={row.firstUtmMedium ?? "—"} />
          <Field label="utm_campaign" value={row.firstUtmCampaign ?? "—"} />
        </dl>
      </AdminPanel>

      <AdminPanel title={`Sessions · ${sessions.length}`} description="30-minute inactivity window. A route change never starts one." testId="users-record-sessions">
        <SimpleTable
          head={["Started", "Class", "Landing", "Source", "Referrer"]}
          rows={sessions.map((s) => [
            new Date(s.started_at).toLocaleString(),
            <ClassBadge key="c" cls={(s.traffic_class as TrafficClass) ?? "unknown"} />,
            s.landing_path ?? "—",
            s.utm_source ?? "—",
            s.referrer ?? "(direct)",
          ])}
          empty="No session rows. The visitor exists in the event ledger only."
        />
      </AdminPanel>

      <AdminPanel
        title={`Server-confirmed gameplay · ${railway.length}`}
        description="source_system = 'railway' — facts the backend owns, matched to this visitor through the uid the browser reported."
        testId="users-record-gameplay"
      >
        <SimpleTable
          head={["When", "Event", "Entity"]}
          rows={railway.map((e) => [
            new Date(e.received_at).toLocaleString(),
            <code key="n">{e.event_name}</code>,
            e.source_entity_id ? `${e.source_entity_type} ${e.source_entity_id}` : "—",
          ])}
          empty="No server-confirmed gameplay. Browser mode-opens below are intent, not play."
        />
      </AdminPanel>

      <AdminPanel title={`Activity · ${events.length}`} description="Every event, newest first." testId="users-record-activity">
        <SimpleTable
          head={["When", "Event", "Route", "Guest", "Source"]}
          rows={events.slice(0, 200).map((e) => [
            new Date(e.received_at).toLocaleString(),
            <code key="n">{e.event_name}</code>,
            e.route ?? "—",
            e.is_guest === null ? "—" : e.is_guest ? "guest" : "signed in",
            e.source_system,
          ])}
          empty="No events in range."
        />
      </AdminPanel>

      <AdminPanel
        title="Account"
        description="Shown when this browser reported an auth identity. Everything above it is what the person did BEFORE any account existed."
        testId="users-record-account"
      >
        {row.userIds.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
            No account. This visitor has never held a Supabase identity — which, since USERS1, is
            the normal state for someone who has only browsed.
          </p>
        ) : accountsLoading ? (
          <p className="text-[11px] text-muted-foreground">Reading accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
            This visitor reported {row.userIds.length} auth id
            {row.userIds.length === 1 ? "" : "s"}, but no profile row exists for
            {row.userIds.length === 1 ? " it" : " any of them"} — most likely purged. The ids are{" "}
            <code>{row.userIds.join(", ")}</code>.
          </p>
        ) : (
          <div className="space-y-3">
            {accounts.map((a) => (
              <dl key={a.userId} className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="users-record-account-row">
                <Field label="Display name" value={a.displayName || "(none)"} />
                <Field label="Username" value={a.username || "(none)"} />
                <Field label="Kind" value={a.isBot ? "Bot" : a.isAnonymous ? "Anonymous identity" : "Registered"} />
                <Field label="Premium" value={a.isPro ? "Yes" : "No"} />
                <Field label="Created" value={a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"} />
                <Field label="Auth id" value={<code>{a.userId}</code>} />
                <Field label="Signed up in range" value={row.signedUp ? "Yes" : "No"} />
              </dl>
            ))}
            <p className="text-[10px] text-muted-foreground">
              Account actions — roles, entitlement, notes, deletion — live in Users › Accounts,
              which keeps its own master-admin gates. They are not duplicated here.
            </p>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

function SimpleTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Reclassify a visitor.
 *
 * Writes `analytics_traffic_overrides` — a separate table, admin-only in both
 * directions, applied on top of the observed session classes at read time. The
 * observation is never edited, so "what did we detect" and "what did we
 * decide" stay two answerable questions.
 *
 * It changes which population a visitor is counted in and NOTHING else. No
 * gate, entitlement or rate limit reads traffic_class.
 */
function TrafficOverrideControl({
  visitorId,
  current,
}: {
  visitorId: string;
  current: TrafficClass;
}) {
  const [saving, setSaving] = useState<TrafficClass | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const set = async (cls: TrafficClass) => {
    setSaving(cls);
    setMessage(null);
    const { error } = await analyticsDb
      .from(ANALYTICS_TRAFFIC_OVERRIDES_TABLE)
      .upsert({ visitor_id: visitorId, traffic_class: cls, reason: "set from Users › Visitors" });
    setSaving(null);
    setMessage(
      error
        ? `Could not save: ${error.message}`
        : "Saved. Refresh the range to recompute every number under the new class.",
    );
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3" data-testid="users-record-override">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Reclassify
      </span>
      {(Object.keys(TRAFFIC_CLASS_LABELS) as TrafficClass[]).map((cls) => (
        <Button
          key={cls}
          size="sm"
          variant={cls === current ? "default" : "outline"}
          className="h-6 text-[11px]"
          disabled={saving !== null}
          onClick={() => void set(cls)}
          data-testid={`users-record-override-${cls}`}
        >
          {TRAFFIC_CLASS_LABELS[cls]}
        </Button>
      ))}
      <span className="text-[10px] text-muted-foreground">
        Analytics metadata. Grants and restricts nothing.
      </span>
      {message && <p className="w-full text-[10px] text-muted-foreground">{message}</p>}
    </div>
  );
}
