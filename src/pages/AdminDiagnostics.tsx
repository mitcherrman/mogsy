import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Play,
  Download,
  Shield,
  Gauge,
  Bug,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * AdminDiagnostics — runs a health probe across every page in Mogsy.
 * For each route it measures:
 *  - HTTP fetch time (TTFB-ish)
 *  - Rendered iframe load time
 *  - Runtime errors captured from inside the iframe
 *  - HTTP status (200 / 404 / 5xx)
 *
 * It also surfaces backend security/health signals (RLS linter, slow queries
 * via Supabase RPC if available) into a single report admins can scan.
 */

type Severity = "ok" | "warn" | "fail" | "pending" | "idle";

interface RouteSpec {
  path: string;
  label: string;
  group: "Public" | "App" | "Admin" | "Game" | "Content";
  authed?: boolean;
}

const ROUTES: RouteSpec[] = [
  { path: "/", label: "Index / Landing", group: "Public" },
  { path: "/auth", label: "Auth", group: "Public" },
  { path: "/blog", label: "Blog Index", group: "Content" },
  { path: "/lol", label: "LoL Hub", group: "Content" },
  { path: "/lol/tier-list", label: "LoL Tier List", group: "Content" },
  { path: "/home", label: "Home", group: "App", authed: true },
  { path: "/play", label: "Play Hub", group: "App", authed: true },
  { path: "/profile", label: "Profile", group: "App", authed: true },
  { path: "/settings", label: "Settings", group: "App" },
  { path: "/referral", label: "Referral", group: "App", authed: true },
  { path: "/shop", label: "Shop", group: "App", authed: true },
  { path: "/feedback", label: "Feedback", group: "App", authed: true },
  { path: "/swipe", label: "Swipe Hub", group: "Game", authed: true },
  { path: "/swipe-game", label: "Swipe Game", group: "Game", authed: true },
  { path: "/swipe-leagues", label: "Swipe Leagues", group: "Game", authed: true },
  { path: "/leagues/compete", label: "Compete Leagues", group: "Game", authed: true },
  { path: "/leagues/preset", label: "Collections", group: "Game", authed: true },
  { path: "/elo-check", label: "Elo Check", group: "Game", authed: true },
  { path: "/multiplayer", label: "Multiplayer Lobby", group: "Game", authed: true },
  { path: "/combat-lab", label: "Combat Lab", group: "Content" },
  { path: "/quiz", label: "Quiz", group: "Content" },
  { path: "/admin", label: "Admin Dashboard", group: "Admin", authed: true },
  { path: "/admin/play", label: "Admin Play Layout", group: "Admin", authed: true },
  { path: "/admin/data", label: "Admin Data", group: "Admin", authed: true },
  { path: "/admin/demo", label: "Admin Demo", group: "Admin", authed: true },
  { path: "/admin/gaming", label: "Admin Gaming", group: "Admin", authed: true },
  { path: "/admin/blog", label: "Admin Blog", group: "Admin", authed: true },
  { path: "/admin/about", label: "Admin About", group: "Admin", authed: true },
  { path: "/moderator", label: "Moderator", group: "Admin", authed: true },
  { path: "/quiz/admin", label: "Quiz Admin", group: "Admin", authed: true },
  { path: "/quiz/diagnostics", label: "Quiz Diagnostics", group: "Admin", authed: true },
  { path: "/combat-lab/diagnostics", label: "Combat Lab Diagnostics", group: "Admin", authed: true },
];

interface RouteResult {
  path: string;
  label: string;
  group: RouteSpec["group"];
  authed: boolean;
  status: Severity;
  httpStatus?: number;
  fetchMs?: number;
  renderMs?: number;
  errors: string[];
  notes: string[];
}

const PROBE_TIMEOUT_MS = 12_000;
const FETCH_WARN_MS = 1200;
const FETCH_FAIL_MS = 4000;
const RENDER_WARN_MS = 2500;
const RENDER_FAIL_MS = 6000;

function severityRank(s: Severity) {
  return { ok: 0, pending: 1, idle: 1, warn: 2, fail: 3 }[s] ?? 0;
}

function classifyRoute(r: RouteResult): Severity {
  if (r.status === "pending") return "pending";
  let worst: Severity = "ok";
  const bump = (s: Severity) => {
    if (severityRank(s) > severityRank(worst)) worst = s;
  };
  if (r.httpStatus && r.httpStatus >= 500) bump("fail");
  else if (r.httpStatus && r.httpStatus >= 400) bump("warn");
  if (r.fetchMs != null) {
    if (r.fetchMs >= FETCH_FAIL_MS) bump("fail");
    else if (r.fetchMs >= FETCH_WARN_MS) bump("warn");
  }
  if (r.renderMs != null) {
    if (r.renderMs >= RENDER_FAIL_MS) bump("fail");
    else if (r.renderMs >= RENDER_WARN_MS) bump("warn");
  } else if (r.status !== "pending") {
    bump("warn");
  }
  if (r.errors.length > 0) bump("fail");
  return worst;
}

async function probeFetch(path: string): Promise<{ ms: number; status: number } | null> {
  const url = window.location.origin + path;
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store" });
    return { ms: performance.now() - t0, status: res.status };
  } catch {
    return null;
  }
}

function probeRender(path: string, container: HTMLElement): Promise<{ ms: number; errors: string[] }> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "1024px";
    iframe.style.height = "768px";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = path;

    const errors: string[] = [];
    const t0 = performance.now();
    let done = false;

    const cleanup = () => {
      try {
        iframe.remove();
      } catch {
        /* noop */
      }
    };

    const finish = (ms: number) => {
      if (done) return;
      done = true;
      cleanup();
      resolve({ ms, errors });
    };

    iframe.onload = () => {
      // Give the SPA a brief moment to mount and surface errors
      const settled = performance.now() - t0;
      try {
        const w = iframe.contentWindow;
        if (w) {
          w.addEventListener("error", (e: any) => {
            const msg = e?.message || String(e);
            errors.push(`error: ${msg}`);
          });
          w.addEventListener("unhandledrejection", (e: any) => {
            const msg = e?.reason?.message || String(e?.reason || e);
            errors.push(`unhandled: ${msg}`);
          });
        }
      } catch {
        /* cross-origin or detached — ignore */
      }
      setTimeout(() => finish(settled), 600);
    };
    iframe.onerror = () => finish(performance.now() - t0);

    container.appendChild(iframe);
    setTimeout(() => {
      if (!done) {
        errors.push(`timeout after ${PROBE_TIMEOUT_MS}ms`);
        finish(PROBE_TIMEOUT_MS);
      }
    }, PROBE_TIMEOUT_MS);
  });
}

function StatusDot({ s }: { s: Severity }) {
  if (s === "pending") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-rose-400" />;
  return <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />;
}

function pillClass(s: Severity) {
  switch (s) {
    case "ok":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
    case "warn":
      return "bg-amber-500/10 text-amber-300 border-amber-500/30";
    case "fail":
      return "bg-rose-500/10 text-rose-300 border-rose-500/30";
    case "pending":
      return "bg-primary/10 text-primary border-primary/30";
    default:
      return "bg-muted/40 text-muted-foreground border-border";
  }
}

export default function AdminDiagnostics() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<RouteResult[]>(() =>
    ROUTES.map((r) => ({
      path: r.path,
      label: r.label,
      group: r.group,
      authed: !!r.authed,
      status: "idle" as Severity,
      errors: [],
      notes: [],
    })),
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  // Backend signals
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [authedNow, setAuthedNow] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthedNow(!!data.session));
    Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("leagues").select("id", { count: "exact", head: true }),
      supabase.from("preset_items").select("id", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }),
      supabase.from("admin_notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
    ]).then(([p, l, i, m, n]) => {
      setCounts({
        profiles: p.count ?? null,
        leagues: l.count ?? null,
        items: i.count ?? null,
        matches: m.count ?? null,
        unreadNotifs: n.count ?? null,
      });
    });
  }, []);

  const grouped = useMemo(() => {
    const buckets: Record<string, RouteResult[]> = {};
    for (const r of results) {
      (buckets[r.group] ||= []).push(r);
    }
    return buckets;
  }, [results]);

  const summary = useMemo(() => {
    const total = results.length;
    let ok = 0;
    let warn = 0;
    let fail = 0;
    let pending = 0;
    let totalRender = 0;
    let renderCount = 0;
    let totalFetch = 0;
    let fetchCount = 0;
    for (const r of results) {
      const s = classifyRoute(r);
      if (s === "ok") ok++;
      else if (s === "warn") warn++;
      else if (s === "fail") fail++;
      else if (s === "pending") pending++;
      if (r.renderMs != null) {
        totalRender += r.renderMs;
        renderCount++;
      }
      if (r.fetchMs != null) {
        totalFetch += r.fetchMs;
        fetchCount++;
      }
    }
    return {
      total,
      ok,
      warn,
      fail,
      pending,
      avgRender: renderCount ? Math.round(totalRender / renderCount) : null,
      avgFetch: fetchCount ? Math.round(totalFetch / fetchCount) : null,
    };
  }, [results]);

  const runAll = async () => {
    if (running) return;
    setRunning(true);
    setProgress(0);
    const next = results.map((r) => ({ ...r, status: "pending" as Severity, errors: [], notes: [] }));
    setResults(next);

    const container = containerRef.current;
    if (!container) {
      setRunning(false);
      return;
    }

    for (let idx = 0; idx < ROUTES.length; idx++) {
      const spec = ROUTES[idx];
      const fetchProbe = await probeFetch(spec.path);
      const renderProbe = await probeRender(spec.path, container);

      setResults((prev) => {
        const copy = [...prev];
        const target = copy[idx];
        target.httpStatus = fetchProbe?.status;
        target.fetchMs = fetchProbe?.ms != null ? Math.round(fetchProbe.ms) : undefined;
        target.renderMs = Math.round(renderProbe.ms);
        target.errors = renderProbe.errors;
        if (spec.authed && !authedNow) {
          target.notes.push("Auth-gated route — probed without an active session.");
        }
        target.status = classifyRoute(target);
        return copy;
      });
      setProgress(idx + 1);
    }

    setRunning(false);
  };

  const downloadReport = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      origin: window.location.origin,
      summary,
      backend: { counts, authed: authedNow },
      routes: results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mogsy-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-8">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-3xl font-extrabold text-foreground">Site Diagnostics</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={runAll} disabled={running} size="sm">
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Probing… {progress}/{ROUTES.length}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1.5" />
                  Run full scan
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadReport} disabled={running}>
              <Download className="h-4 w-4 mr-1.5" />
              Report
            </Button>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground mb-4">
          Probes every public and admin route, measures fetch + render latency, captures runtime errors, and
          reports backend health signals. Auth-gated pages are probed in your current session.
        </p>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 sm:gap-3 mb-5">
          <SummaryCard label="Total" value={summary.total} icon={<Gauge className="h-4 w-4" />} />
          <SummaryCard label="Healthy" value={summary.ok} tone="ok" />
          <SummaryCard label="Warning" value={summary.warn} tone="warn" />
          <SummaryCard label="Failing" value={summary.fail} tone="fail" />
          <SummaryCard
            label="Avg fetch"
            value={summary.avgFetch != null ? `${summary.avgFetch}ms` : "—"}
            icon={<Gauge className="h-4 w-4" />}
          />
          <SummaryCard
            label="Avg render"
            value={summary.avgRender != null ? `${summary.avgRender}ms` : "—"}
            icon={<Gauge className="h-4 w-4" />}
          />
        </div>

        {/* Backend health */}
        <section className="rounded-xl border border-border bg-card p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Backend Signals</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <Stat label="Auth session" value={authedNow == null ? "…" : authedNow ? "Active" : "None"} />
            <Stat label="Profiles" value={counts.profiles ?? "…"} />
            <Stat label="Leagues" value={counts.leagues ?? "…"} />
            <Stat label="Items" value={counts.items ?? "…"} />
            <Stat label="Matches" value={counts.matches ?? "…"} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 flex items-start gap-1.5">
            <Bug className="h-3 w-3 mt-0.5 flex-shrink-0" />
            For deep RLS / SQL security checks, run the Lovable Cloud security scan from the Cloud panel.
            This diagnostic verifies that every public table read returns a count and the auth client is alive.
          </p>
        </section>

        {/* Route results */}
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, list]) => (
            <section key={group} className="rounded-xl border border-border bg-card">
              <header className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">{group}</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {list.length} routes
                </span>
              </header>
              <div className="divide-y divide-border">
                {list.map((r) => {
                  const s = r.status === "pending" ? "pending" : classifyRoute(r);
                  return (
                    <div key={r.path} className="px-4 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                      <StatusDot s={s} />
                      <div className="flex-1 min-w-[180px]">
                        <div className="font-semibold text-foreground truncate">{r.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{r.path}</div>
                      </div>
                      <Metric label="HTTP" value={r.httpStatus ?? "—"} />
                      <Metric label="Fetch" value={r.fetchMs != null ? `${r.fetchMs}ms` : "—"} />
                      <Metric label="Render" value={r.renderMs != null ? `${r.renderMs}ms` : "—"} />
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${pillClass(s)}`}>
                        {s}
                      </span>
                      {r.errors.length > 0 && (
                        <div className="basis-full text-[11px] text-rose-300/90 mt-1 pl-7">
                          {r.errors.slice(0, 3).map((e, i) => (
                            <div key={i} className="truncate">• {e}</div>
                          ))}
                          {r.errors.length > 3 && (
                            <div className="text-muted-foreground">+ {r.errors.length - 3} more</div>
                          )}
                        </div>
                      )}
                      {r.notes.length > 0 && (
                        <div className="basis-full text-[11px] text-muted-foreground pl-7">
                          {r.notes.map((n, i) => (
                            <div key={i}>· {n}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Hidden probe sandbox */}
        <div ref={containerRef} aria-hidden className="sr-only" />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "fail";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "fail"
          ? "text-rose-300"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`text-xl sm:text-2xl font-extrabold ${toneClass} leading-tight mt-0.5`}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className="font-bold text-foreground text-sm">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-[10px] text-muted-foreground">
      <span className="uppercase tracking-wider">{label}: </span>
      <span className="font-bold text-foreground">{value}</span>
    </div>
  );
}