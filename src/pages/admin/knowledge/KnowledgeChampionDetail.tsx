import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import { ConfidenceBadge, ErrorBanner, HealthCategoryBadge, ProviderBadge, SkeletonRow, relativeTime } from "./shared";

/**
 * Champion Detail. Renders header + pending queue + issues today from the
 * existing contract. The Consensus table and Verified Facts list require
 * endpoints noted as gaps in the wireframes (Phase 11.5) — we render an
 * explicit "backend endpoint pending" panel rather than invent calls.
 */
export default function KnowledgeChampionDetail() {
  const { champion = "" } = useParams<{ champion: string }>();
  const nav = useNavigate();

  const healthQ = useQuery({
    queryKey: ["knowledge", "health", champion],
    queryFn: () => knowledgeApi.health({ champion }),
  });
  const pendingQ = useQuery({
    queryKey: ["knowledge", "updates", "for-champion", champion],
    queryFn: () => knowledgeApi.listUpdates({ champion, status: "PENDING", limit: 200 }),
  });

  const c = healthQ.data?.champions?.[0];

  return (
    <div className="space-y-3">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      {healthQ.error && <ErrorBanner error={healthQ.error} onRetry={() => healthQ.refetch()} />}
      {healthQ.isLoading && <SkeletonRow className="h-24" />}

      {c && (
        <header className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-extrabold text-foreground">{c.champion}</h1>
            {c.parser_gap
              ? <span className="text-[10px] font-extrabold uppercase text-muted-foreground bg-muted rounded px-1.5 py-0.5">⛔ PARSER GAP</span>
              : <HealthCategoryBadge category={c.health_category} />}
            {!c.parser_gap && <span className="text-sm tabular-nums text-muted-foreground">{c.health_score.toFixed(1)}</span>}
          </div>
          {c.parser_gap ? (
            <p className="text-xs text-muted-foreground">
              Wiki parser cannot read this champion's infobox. Engineering work — file it, don't fight it.
            </p>
          ) : (
            <>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, c.health_score))}%` }} />
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span>coverage <span className="text-foreground font-semibold">{c.coverage_pct.toFixed(0)}%</span></span>
                <span>avg conf <ConfidenceBadge value={c.confidence_avg} /></span>
                <span>{c.pending_review_count} pending</span>
                <span>last scan {relativeTime(c.last_successful_verification)}{c.last_provider ? ` (${c.last_provider})` : ""}</span>
                {c.latest_patch_version_seen && <span>latest patch {c.latest_patch_version_seen}</span>}
              </div>
            </>
          )}
        </header>
      )}

      {!c && !healthQ.isLoading && !healthQ.error && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground italic">
          No health data for "{champion}".
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Pending */}
        <section className="rounded-xl border border-border bg-card p-3">
          <h2 className="text-sm font-extrabold text-foreground mb-2">
            Pending ({pendingQ.data?.groups?.length ?? 0})
          </h2>
          {pendingQ.isLoading && <SkeletonRow />}
          {pendingQ.error && <ErrorBanner error={pendingQ.error} onRetry={() => pendingQ.refetch()} />}
          {pendingQ.data && pendingQ.data.groups.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nothing pending. Nice.</p>
          )}
          <ul className="space-y-1.5">
            {pendingQ.data?.groups?.map((g) => {
              const first = pendingQ.data!.updates.find((u) => u.group_key === g.group_key);
              return (
                <li key={g.group_key} className="rounded border border-border p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    {g.providers.map((p) => <ProviderBadge key={p} provider={p} />)}
                    <span className="font-semibold">{g.ability_key} {g.property}</span>
                    <span className="text-muted-foreground">{g.rank_count} rank{g.rank_count === 1 ? "" : "s"}</span>
                    <ConfidenceBadge value={g.confidence_min} className="ml-auto" />
                  </div>
                  {first && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">
                        r{first.rank}: {String(first.current_value)} → <span className="text-emerald-300">{String(first.proposed_value)}</span>
                      </span>
                      <Link
                        to={`/admin/knowledge/review/${first.id}`}
                        className="ml-auto text-primary hover:underline text-xs font-bold"
                      >
                        Review →
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Issues */}
        <section className="rounded-xl border border-border bg-card p-3">
          <h2 className="text-sm font-extrabold text-foreground mb-2">Issues</h2>
          {c && c.issues.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No property-level issues.</p>
          )}
          <ul className="space-y-1 text-xs">
            {c?.issues?.map((i, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <ProviderBadge provider={i.provider} />
                <span className="font-semibold">{i.ability_key} {i.property}</span>
                <span className="text-muted-foreground">{i.change_type}</span>
                {i.patch_version && <span className="text-muted-foreground">· {i.patch_version}</span>}
                <Link
                  to={`/admin/knowledge/queue?champion=${encodeURIComponent(champion)}&property=${encodeURIComponent(i.property)}`}
                  className="ml-auto text-primary hover:underline"
                >open →</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Consensus + Verified Facts — backend gap */}
      <section className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="font-bold text-foreground">Consensus table &amp; Verified facts</span>
        </div>
        <p>
          Requires <code>GET /consensus?champion=</code> and <code>GET /verified?champion=</code> —
          documented as Phase 11.5 backend gaps in the wireframes. These sections will render
          automatically once the endpoints ship. Nothing is inferred client-side.
        </p>
      </section>
    </div>
  );
}