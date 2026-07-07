import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { KnowledgeApiError, knowledgeApi } from "@/lib/knowledge-admin/api";
import type { ApprovalResponse, UpdateDetail } from "@/lib/knowledge-admin/types";
import { useAuth } from "@/hooks/useAuth";
import { ConfidenceBadge, ErrorBanner, ProviderBadge, SeverityBadge, actionPrimaryStyle, relativeTime } from "./shared";
import { cn } from "@/lib/utils";

/**
 * Review Panel — the decision surface for a single update.
 * Renders from GET /updates/{id} exclusively; approval is strict:
 *   click → dry_run:true → render plan → type "APPLY" → dry_run:false.
 * Never auto-approves. This is an admin-only tool: warnings are shown
 * prominently but never hard-block approval on their own. Approval is only
 * disabled when the backend indicates it is not actionable
 * (no pending_update_id, status !== PENDING, or the dry-run itself failed).
 * `recommended_action` informs the primary button label/tone only.
 */
export function ReviewPanel({
  updateId,
  onClose,
  onApplied,
}: {
  updateId: number;
  onClose?: () => void;
  onApplied?: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const approvedBy = user?.email ?? "unknown@mogsy";

  const detailQ = useQuery({
    queryKey: ["knowledge", "update", updateId],
    queryFn: () => knowledgeApi.getUpdate(updateId),
  });

  type Mode = "idle" | "progression" | "single";
  const [mode, setMode] = useState<Mode>("idle");
  const [confirmText, setConfirmText] = useState("");
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setMode("idle");
    setConfirmText("");
    setAcknowledgeWarnings(false);
    setRejectOpen(false);
    setRejectReason("");
  }, [updateId]);

  const dryRunQ = useQuery<ApprovalResponse>({
    queryKey: ["knowledge", "dry-run", updateId, mode],
    queryFn: () =>
      mode === "progression"
        ? knowledgeApi.approveProgression(updateId, { dry_run: true, approved_by: approvedBy })
        : knowledgeApi.approve(updateId, { dry_run: true, approved_by: approvedBy }),
    enabled: mode !== "idle",
    retry: false,
  });

  const applyMut = useMutation({
    mutationFn: () =>
      mode === "progression"
        ? knowledgeApi.approveProgression(updateId, { dry_run: false, approved_by: approvedBy })
        : knowledgeApi.approve(updateId, { dry_run: false, approved_by: approvedBy }),
    onSuccess: (res) => {
      toast.success(
        `Applied${res.new_full_progression ? `: ${res.new_full_progression}` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onApplied?.();
      onClose?.();
    },
    onError: (err) => {
      if (err instanceof KnowledgeApiError && err.status === 409) {
        toast.warning("Already actioned by someone else — refreshing");
        qc.invalidateQueries({ queryKey: ["knowledge"] });
        onClose?.();
      } else {
        toast.error(err instanceof Error ? err.message : "Approve failed");
      }
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => knowledgeApi.reject(updateId, rejectReason.trim()),
    onSuccess: () => {
      toast.success("Rejected");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onApplied?.();
      onClose?.();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Reject failed"),
  });

  if (detailQ.isLoading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-6 w-1/2 bg-muted animate-pulse rounded" />
        <div className="h-24 bg-muted animate-pulse rounded" />
        <div className="h-16 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (detailQ.error) {
    return (
      <div className="p-4">
        <ErrorBanner error={detailQ.error} onRetry={() => detailQ.refetch()} />
        {onClose && <button onClick={onClose} className="mt-3 text-xs text-muted-foreground">← Back</button>}
      </div>
    );
  }
  const d = detailQ.data as UpdateDetail;
  return (
    <PanelBody
      d={d}
      onClose={onClose}
      mode={mode}
      setMode={setMode}
      dryRunQ={dryRunQ}
      confirmText={confirmText}
      setConfirmText={setConfirmText}
      applyMut={applyMut}
      rejectOpen={rejectOpen}
      setRejectOpen={setRejectOpen}
      rejectReason={rejectReason}
      setRejectReason={setRejectReason}
      rejectMut={rejectMut}
    />
  );
}

function PanelBody({
  d,
  onClose,
  mode,
  setMode,
  dryRunQ,
  confirmText,
  setConfirmText,
  applyMut,
  rejectOpen,
  setRejectOpen,
  rejectReason,
  setRejectReason,
  rejectMut,
}: {
  d: UpdateDetail;
  onClose?: () => void;
  mode: "idle" | "progression" | "single";
  setMode: (m: "idle" | "progression" | "single") => void;
  dryRunQ: ReturnType<typeof useQuery<ApprovalResponse>>;
  confirmText: string;
  setConfirmText: (v: string) => void;
  applyMut: ReturnType<typeof useMutation<ApprovalResponse, unknown, void, unknown>>;
  rejectOpen: boolean;
  setRejectOpen: (v: boolean) => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  rejectMut: ReturnType<typeof useMutation<{ status: string }, unknown, void, unknown>>;
}) {
  const primary = actionPrimaryStyle(d.recommended_action);
  const hardBlockers = d.warnings.filter((w) =>
    /^(NO_LIVE_VALUE|RANK_OUT_OF_BOUNDS)/i.test(w),
  );
  const approvalBlocked = hardBlockers.length > 0 || primary.disabled;

  const affectedRankCount = useMemo(
    () => d.diff.filter((x) => x.changed).length,
    [d.diff],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-extrabold text-foreground truncate">
              {d.champion} — {d.ability.key ?? "—"}
              {d.ability.name ? ` ${d.ability.name}` : ""} — {d.property}
            </h2>
            <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
              {(d.status ?? d.update?.status ?? "PENDING") as string}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {d.patch_version && <span className="font-semibold">PATCH {d.patch_version}</span>}
            {d.providers.map((p) => <ProviderBadge key={p} provider={p} />)}
            <ConfidenceBadge value={d.confidence} />
            <span>· {d.update?.change_type ?? "—"}</span>
          </div>
          <div className="mt-2 text-xs">
            <span className="text-muted-foreground">Recommended:</span>{" "}
            <span className={cn("font-bold", primary.disabled ? "text-destructive" : "text-emerald-300")}>
              {primary.label}
            </span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Warnings */}
        {d.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-extrabold">
              <AlertTriangle className="h-4 w-4" /> WARNINGS
            </div>
            <ul className="text-xs text-amber-200 list-disc pl-5 space-y-0.5">
              {d.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Progression diff */}
        <section>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Progression Diff</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-2 py-1 font-semibold">rank</th>
                  {d.diff.map((row) => (
                    <th key={row.rank} className="px-2 py-1 text-center font-semibold">{row.rank}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-1 text-muted-foreground">now</td>
                  {d.diff.map((row) => (
                    <td key={row.rank} className={cn("px-2 py-1 text-center", !row.changed && "text-muted-foreground/60")}>
                      {row.current ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1 text-muted-foreground">new</td>
                  {d.diff.map((row) => (
                    <td key={row.rank} className={cn("px-2 py-1 text-center font-bold", row.changed ? "text-emerald-300" : "text-muted-foreground/60")}>
                      {row.proposed ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1 text-muted-foreground">Δ</td>
                  {d.diff.map((row) => (
                    <td key={row.rank} className="px-2 py-1 text-center">
                      {row.changed && row.delta !== null ? (
                        <span className={row.delta < 0 ? "text-red-300" : "text-emerald-300"}>
                          {row.delta > 0 ? "+" : ""}{row.delta}
                          {row.delta_pct !== null && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({row.delta_pct > 0 ? "+" : ""}{row.delta_pct.toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Evidence */}
        <section className="rounded-lg border border-border p-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Evidence</h3>
            {d.source_url && (
              <a href={d.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="font-mono text-[11px] bg-muted/40 rounded px-2 py-1 break-words">
            {d.raw_evidence.raw_value ?? "—"}
          </div>
          <div className="text-muted-foreground">
            grammar: <span className="text-foreground">{d.grammar_type ?? "—"}</span>
            {" · "}parser: <span className="text-foreground">{d.confidence_breakdown.parser_name}</span>
          </div>
          <div className="text-muted-foreground">
            confidence: parser {d.confidence_breakdown.parser_confidence.toFixed(2)} × provider weight {d.confidence_breakdown.provider_weight.toFixed(2)}
          </div>
          {d.consensus && (
            <div className="text-muted-foreground">
              consensus: <span className="text-foreground font-bold">{d.consensus.classification}</span> ({d.consensus.confidence.toFixed(2)})
            </div>
          )}
        </section>

        {/* Apply history */}
        <section className="rounded-lg border border-border p-3 space-y-1.5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Apply History ({d.apply_history.length})
          </h3>
          {d.apply_history.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Never applied before.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {d.apply_history.map((h) => (
                <li key={h.id} className="flex items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{relativeTime(h.applied_at)}</span>
                  <span>rank {h.rank}: {String(h.old_value)} → <span className="text-emerald-300">{String(h.new_value)}</span></span>
                  <span className="text-muted-foreground">by {h.approved_by}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Dry-run plan */}
        {mode !== "idle" && (
          <section className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-primary">Dry Run Plan</h3>
            {dryRunQ.isLoading && <div className="text-xs text-muted-foreground">Computing plan…</div>}
            {dryRunQ.error && <ErrorBanner error={dryRunQ.error} onRetry={() => dryRunQ.refetch()} />}
            {dryRunQ.data && (
              <div className="space-y-2 text-xs">
                <div className="font-mono bg-background/60 rounded p-2">
                  {dryRunQ.data.plan.old_full_progression && (
                    <div><span className="text-muted-foreground">before:</span> {dryRunQ.data.plan.old_full_progression}</div>
                  )}
                  {dryRunQ.data.plan.new_full_progression && (
                    <div><span className="text-muted-foreground">after: </span> <span className="text-emerald-300">{dryRunQ.data.plan.new_full_progression}</span></div>
                  )}
                  {dryRunQ.data.plan.rank_writes && (
                    <div className="mt-1 text-muted-foreground">
                      {dryRunQ.data.plan.rank_writes.length} rank write{dryRunQ.data.plan.rank_writes.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Type <span className="font-mono font-bold text-foreground">APPLY</span> to confirm:</label>
                  <input
                    autoFocus
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs font-mono w-24"
                  />
                  <button
                    onClick={() => applyMut.mutate()}
                    disabled={confirmText !== "APPLY" || applyMut.isPending}
                    className="rounded bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-40"
                  >
                    {applyMut.isPending ? "Applying…" : "Confirm write"}
                  </button>
                  <button
                    onClick={() => { setMode("idle"); setConfirmText(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Reject dialog */}
        {rejectOpen && (
          <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-destructive">Reject Update</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (min 5 chars, stored in audit trail)…"
              rows={3}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => rejectMut.mutate()}
                disabled={rejectReason.trim().length < 5 || rejectMut.isPending}
                className="rounded bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1.5 disabled:opacity-40"
              >
                {rejectMut.isPending ? "Rejecting…" : "Confirm reject"}
              </button>
              <button
                onClick={() => { setRejectOpen(false); setRejectReason(""); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border p-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setRejectOpen(true)}
          className="rounded border border-destructive/40 text-destructive bg-transparent text-xs font-bold px-3 py-2 hover:bg-destructive/10"
          disabled={rejectOpen}
        >
          Reject…
        </button>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Always offer single-rank approve as fallback */}
          <button
            onClick={() => setMode("single")}
            disabled={approvalBlocked || mode !== "idle"}
            className="rounded border border-border bg-card text-xs font-bold px-3 py-2 disabled:opacity-40"
            title={hardBlockers.length ? "Blocked by validation warnings" : undefined}
          >
            Approve rank {d.update?.rank ?? ""} only
          </button>

          <button
            onClick={() => setMode("progression")}
            disabled={approvalBlocked || mode !== "idle" || d.recommended_action === "approve"}
            className={cn(
              "rounded text-xs font-bold px-3 py-2 disabled:opacity-40",
              d.recommended_action === "verify_source"
                ? "border border-primary text-primary bg-transparent"
                : "bg-primary text-primary-foreground",
            )}
            title={hardBlockers.length ? "Blocked by validation warnings" : primary.label}
          >
            ✓ Approve all {affectedRankCount || d.affected_ranks.length}
          </button>
        </div>
      </div>
    </div>
  );
}