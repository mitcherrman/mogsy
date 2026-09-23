// ---------------------------------------------------------------------------
// Admin Overview — the control room and the canonical Admin home.
//
// Deliberately small: current platform counts, the cross-domain attention
// queue, and a handful of shortcuts. It is not a second All Tools page (that
// is the All Tools tab) and not a second analytics page (that is Analytics).
//
// FUNNEL1C removed two things from here: the Arena-era AdminStats strip
// (leagues, matches, image clicks — now under Arena) and the "Escape hatches"
// panel that advertised the legacy 17-tab dashboard, which is retired.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyticsDb } from "@/lib/analytics/schema";
import { AdminAreaHeader, AdminPanel, useAreaSection } from "@/components/admin/shell/AdminAreaPage";
import { useAdminAttention } from "@/lib/admin/useAdminAttention";
import { ADMIN_AREAS_BY_ID, ADMIN_ALL_TOOLS_PATH } from "@/lib/admin/admin-registry";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Count = number | null | "error";

interface Snapshot {
  registered: Count;
  guests: Count;
  sessions7d: Count;
  newVisitors7d: Count;
  lastEvent: string | null | "error";
}

const fromCount = (r: { count: number | null; error: unknown }): Count =>
  r.error ? "error" : (r.count ?? 0);

function usePlatformSnapshot(): Snapshot {
  const [snap, setSnap] = useState<Snapshot>({
    registered: null,
    guests: null,
    sessions7d: null,
    newVisitors7d: null,
    lastEvent: null,
  });

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    void Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_bot", false)
        .eq("is_anonymous", false),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_anonymous", true),
      analyticsDb.from("analytics_sessions").select("session_id", { count: "exact", head: true }).gte("started_at", since),
      analyticsDb.from("analytics_visitors").select("visitor_id", { count: "exact", head: true }).gte("first_seen_at", since),
      analyticsDb.from("analytics_events").select("received_at").order("received_at", { ascending: false }).limit(1),
    ]).then(([registered, guests, sessions, visitors, last]) => {
      if (cancelled) return;
      setSnap({
        registered: fromCount(registered),
        guests: fromCount(guests),
        sessions7d: fromCount(sessions),
        newVisitors7d: fromCount(visitors),
        lastEvent: last.error ? "error" : (last.data?.[0]?.received_at ?? null),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return snap;
}

function renderCount(value: Count) {
  if (value === null) return "…";
  if (value === "error") return "unavailable";
  return value.toLocaleString();
}

function PlatformCounts() {
  const snap = usePlatformSnapshot();
  const tiles: Array<{ id: string; label: string; value: string; hint: string }> = [
    {
      id: "registered",
      label: "Registered accounts",
      value: renderCount(snap.registered),
      hint: "profiles, non-anonymous, non-bot",
    },
    {
      // USERS1 — this tile used to say "Guest identities", which read as an
      // audience number and was not one: it counted anonymous rows in
      // `profiles`, i.e. one per browser that had ever loaded a page. It is
      // now named for what it actually is, and it should stay near zero,
      // because since USERS1 an anonymous identity is created only when
      // someone performs a write. A number climbing here again means
      // something is minting identities on a page load — see
      // lib/auth/anonymous-identity.ts.
      id: "guests",
      label: "Anonymous auth identities",
      value: renderCount(snap.guests),
      hint: "profiles.is_anonymous — created at a write, not at a page view",
    },
    { id: "new-visitors", label: "Visitors · 7d", value: renderCount(snap.newVisitors7d), hint: "analytics_visitors — the audience number" },
    { id: "sessions", label: "Sessions · 7d", value: renderCount(snap.sessions7d), hint: "analytics_sessions, all traffic classes" },
    {
      id: "last-event",
      label: "Last analytics event",
      value:
        snap.lastEvent === null
          ? "…"
          : snap.lastEvent === "error"
            ? "unavailable"
            : new Date(snap.lastEvent).toLocaleString(),
      hint: "received_at, any source",
    },
  ];

  return (
    <AdminPanel
      title="Platform"
      description="Current counts, all traffic classes. A visitor is a browser; an account is an auth identity; the two are never the same number. Filtered detail lives in Users."
      testId="admin-overview-platform"
      action={
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
        >
          Open Users <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.id} className="rounded-md border border-border bg-muted/20 px-3 py-2" data-testid={`admin-overview-count-${t.id}`}>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</dt>
            <dd className="text-base font-semibold tabular-nums">{t.value}</dd>
            <dd className="text-[10px] text-muted-foreground/80">{t.hint}</dd>
          </div>
        ))}
      </dl>
    </AdminPanel>
  );
}

function AttentionQueue() {
  const entries = useAdminAttention();
  return (
    <AdminPanel
      title="Needs attention"
      description="A view over the review queues that already exist. Each row opens its canonical domain page — no new approval semantics are created here."
      testId="admin-attention-queue"
    >
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <Link
                to={entry.to}
                className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                {entry.label}
              </Link>
              <p className="text-[11px] text-muted-foreground">{entry.hint}</p>
            </div>
            <span
              className="shrink-0 rounded border border-border px-2 py-0.5 text-xs font-semibold tabular-nums"
              data-testid={`admin-attention-${entry.id}`}
            >
              {entry.count === null ? "…" : entry.count === "error" ? "unavailable" : entry.count}
            </span>
          </li>
        ))}
      </ul>
    </AdminPanel>
  );
}

/** A few high-value jobs — not an index of everything (that is All Tools). */
const OVERVIEW_SHORTCUTS: Array<{ id: string; label: string; to: string }> = [
  { id: "analytics", label: "Audience", to: "/admin/users" },
  { id: "quiz-review", label: "Quiz Review", to: "/admin/quiz-content?tab=review" },
  { id: "users", label: "Accounts", to: "/admin/users?section=accounts" },
  { id: "ranked", label: "Ranked Overview", to: "/admin/ranked?section=overview" },
  { id: "health", label: "Health & Jobs", to: "/admin/operations?section=health" },
  { id: "all-tools", label: "All Tools", to: ADMIN_ALL_TOOLS_PATH },
];

function Shortcuts() {
  return (
    <AdminPanel title="Shortcuts" testId="admin-overview-shortcuts">
      <div className="flex flex-wrap gap-2">
        {OVERVIEW_SHORTCUTS.map((s) => (
          <Link
            key={s.id}
            to={s.to}
            data-testid={`admin-overview-shortcut-${s.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium hover:bg-muted/50"
          >
            {s.label}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        ))}
      </div>
    </AdminPanel>
  );
}

export default function AdminOverviewPage() {
  const area = ADMIN_AREAS_BY_ID.overview;
  const [section, setSection] = useAreaSection(area);

  return (
    <div data-testid="admin-area-overview">
      <AdminAreaHeader area={area} active={section} onSelect={setSection} />
      <div className="space-y-4">
        <PlatformCounts />
        <AttentionQueue />
        <Shortcuts />
      </div>
    </div>
  );
}
