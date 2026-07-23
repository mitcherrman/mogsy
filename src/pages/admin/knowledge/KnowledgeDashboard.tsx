import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import { ErrorBanner, HealthCategoryBadge, SkeletonRow, relativeTime } from "./shared";

/**
 * Knowledge Dashboard — landing page. Renders four summary cards, the
 * current-patch progress banner, worst-health mini-table, parser-gap
 * chips, and quick actions. Each section fetches independently so one
 * failure doesn't break the rest (wireframes §1 "sections load
 * independently").
 */
export default function KnowledgeDashboard() {
  const healthQ = useQuery({ queryKey: ["knowledge", "health"], queryFn: () => knowledgeApi.health() });
  const pendingQ = useQuery({
    queryKey: ["knowledge", "pending-total"],
    queryFn: () => knowledgeApi.listUpdates({ status: "PENDING", limit: 1 }),
  });

  const latestPatch = healthQ.data?.champions
    ?.map((c) => c.latest_patch_version_seen)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const rundownQ = useQuery({
    queryKey: ["knowledge", "rundown", latestPatch],
    queryFn: () => knowledgeApi.patchRundown(latestPatch ? { patch_version: latestPatch } : {}),
    enabled: !!healthQ.data,
  });

  const automationCfgQ = useQuery({
    queryKey: ["knowledge", "automation-config"],
    queryFn: () => knowledgeApi.automationConfig(),
  });
  const reportQ = useQuery({
    queryKey: ["knowledge", "automation-report", latestPatch],
    queryFn: () => knowledgeApi.automationReport(latestPatch!),
    enabled: !!latestPatch,
  });

  const summary = healthQ.data?.summary;
  const worst = (healthQ.data?.champions ?? []).filter((c) => !c.parser_gap).slice(0, 6);
  const gaps = (healthQ.data?.champions ?? []).filter((c) => c.parser_gap);
  const lastScan = (healthQ.data?.champions ?? [])
    .map((c) => c.last_successful_verification)
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  const lastProvider = healthQ.data?.champions.find((c) => c.last_successful_verification === lastScan)?.last_provider;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          label="Pending"
          value={pendingQ.data?.total ?? (pendingQ.isLoading ? "…" : "—")}
          tone="amber"
          to="/admin/knowledge/queue"
        />
        <StatCard
          label="Healthy"
          value={summary ? `${summary.HEALTHY}/${healthQ.data!.count}` : (healthQ.isLoading ? "…" : "—")}
          tone="emerald"
          to="/admin/knowledge/health?category=HEALTHY"
        />
        <StatCard
          label="Critical"
          value={summary?.CRITICAL ?? (healthQ.isLoading ? "…" : "—")}
          tone="red"
          to="/admin/knowledge/health?category=CRITICAL"
        />
        <StatCard
          label="No Data"
          value={summary?.NO_DATA ?? (healthQ.isLoading ? "…" : "—")}
          tone="muted"
          to="/admin/knowledge/health?category=NO_DATA"
        />
      </div>

      {healthQ.error && <ErrorBanner error={healthQ.error} onRetry={() => healthQ.refetch()} />}

      {/* Patch automation summary — the primary CTA is exceptions, not the full queue */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Patch Automation</div>
            <div className="text-sm font-extrabold text-foreground">
              {latestPatch ? `Patch ${latestPatch}` : "No patch detected"}
              <span className={automationCfgQ.data?.enabled
                ? "ml-2 text-[10px] font-bold uppercase text-emerald-300"
                : "ml-2 text-[10px] font-bold uppercase text-muted-foreground"}>
                {automationCfgQ.data
                  ? (automationCfgQ.data.enabled
                      ? (automationCfgQ.data.forced_dry_run ? "dry-run mode" : "enabled")
                      : "automation disabled")
                  : "…"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin/knowledge/queue"
                  className="rounded-lg bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5">
              Review exceptions{reportQ.data ? ` (${reportQ.data.summary.held_for_review})` : ""}
            </Link>
            <Link to="/admin/knowledge/history"
                  className="rounded-lg border border-border bg-background text-xs font-bold px-3 py-1.5 text-muted-foreground hover:text-foreground">
              Full report
            </Link>
          </div>
        </div>
        {reportQ.data && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <MiniStat label="Auto applied" value={reportQ.data.summary.automatically_applied} tone="text-emerald-300" />
            <MiniStat label="Held" value={reportQ.data.summary.held_for_review} tone="text-amber-300" />
            <MiniStat label="Failed" value={reportQ.data.summary.apply_failed} tone="text-red-300" />
            <MiniStat label="Rolled back" value={reportQ.data.summary.validation_failed_rolled_back} tone="text-red-300" />
            <MiniStat label="Undone" value={reportQ.data.summary.undone_later} tone="text-sky-300" />
            <MiniStat label="Active (auto)" value={reportQ.data.summary.still_active_auto} tone="text-foreground" />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Current Patch</div>
          <div className="text-base font-extrabold text-foreground">{latestPatch ?? "—"}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Last Scan</div>
          <div className="text-sm font-semibold text-foreground">
            {relativeTime(lastScan)}
            {lastProvider && <span className="ml-2 text-xs text-muted-foreground">({lastProvider})</span>}
          </div>
        </div>
      </div>

      {/* Patch progress banner */}
      {latestPatch && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-foreground">Patch {latestPatch} review</div>
              <div className="text-xs text-muted-foreground">
                {rundownQ.data
                  ? `${rundownQ.data.review_counts.applied} applied · ${rundownQ.data.review_counts.pending} pending · ${rundownQ.data.review_counts.rejected} rejected`
                  : "loading…"}
              </div>
            </div>
            <Link
              to={`/admin/knowledge/queue?patch_version=${latestPatch}&provider=patch_notes`}
              className="text-xs font-bold rounded-lg bg-primary text-primary-foreground px-3 py-1.5"
            >
              Review patch →
            </Link>
          </div>
          {rundownQ.data && (
            <ProgressBar
              applied={rundownQ.data.review_counts.applied}
              total={
                rundownQ.data.review_counts.applied +
                rundownQ.data.review_counts.pending +
                rundownQ.data.review_counts.rejected
              }
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Worst health */}
        <section className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-extrabold text-foreground">Worst Health</h2>
            <Link to="/admin/knowledge/health" className="text-xs text-primary hover:underline">All →</Link>
          </div>
          {healthQ.isLoading && (
            <div className="space-y-1.5">{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}</div>
          )}
          {!healthQ.isLoading && worst.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No data yet.</p>
          )}
          <ul className="space-y-1">
            {worst.map((c) => (
              <li key={c.champion}>
                <Link
                  to={`/admin/knowledge/health/${encodeURIComponent(c.champion)}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary text-sm"
                >
                  <span className="w-28 truncate font-semibold">{c.champion}</span>
                  <span className="w-12 text-right tabular-nums text-muted-foreground">{c.health_score.toFixed(1)}</span>
                  <HealthCategoryBadge category={c.health_category} />
                  <span className="ml-auto text-xs text-muted-foreground">{c.pending_review_count} pend.</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Parser gaps */}
        <section className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-extrabold text-foreground">Parser Gaps ({gaps.length})</h2>
            <span className="text-[10px] text-muted-foreground">wiki infobox parser</span>
          </div>
          {healthQ.isLoading && <SkeletonRow />}
          {!healthQ.isLoading && gaps.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No parser gaps.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {gaps.map((c) => (
              <Link
                key={c.champion}
                to={`/admin/knowledge/health/${encodeURIComponent(c.champion)}`}
                className="inline-flex items-center rounded bg-muted text-muted-foreground border border-border px-2 py-0.5 text-xs font-semibold hover:bg-secondary hover:text-foreground"
              >
                ⛔ {c.champion}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/knowledge/queue?provider=patch_notes"
          className="rounded-lg bg-primary text-primary-foreground text-sm font-bold px-3 py-2"
        >
          Review patch_notes queue
        </Link>
        {worst[0] && (
          <Link
            to={`/admin/knowledge/health/${encodeURIComponent(worst[0].champion)}`}
            className="rounded-lg border border-border bg-card text-sm font-bold px-3 py-2"
          >
            Open worst champion
          </Link>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-center">
      <div className={`text-base font-extrabold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: string | number;
  tone: "emerald" | "amber" | "red" | "muted";
  to?: string;
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    red: "bg-red-500/10 border-red-500/30 text-red-300",
    muted: "bg-muted border-border text-muted-foreground",
  };
  const body = (
    <div className={`rounded-xl border p-3 text-center ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-widest font-bold">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums mt-0.5">{value}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function ProgressBar({ applied, total }: { applied: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((applied / total) * 100);
  return (
    <div className="space-y-1">
      <div className="h-2 rounded bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums">{applied}/{total} applied ({pct}%)</div>
    </div>
  );
}
