import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { KnowledgeApiError, knowledgeApi } from "@/lib/knowledge-admin/api";
import type { AppliedChange } from "@/lib/knowledge-admin/types";
import { ConfidenceBadge, ErrorBanner, ProviderBadge, relativeTime } from "./shared";
import { cn } from "@/lib/utils";

/**
 * Review Queue-only "Approved Changes" side panel.
 * Reads GET /apply-history (read-only, grouped per approval batch) so the
 * admin can see what they accepted and undo specific approvals. Undo goes
 * through the existing /apply-history/{id}/undo endpoint with its safety
 * rails — nothing is faked locally. On any success we invalidate the whole
 * "knowledge" query cache so the queue, this panel, and Patch Intel refresh.
 */
export function ApprovedChangesPanel({ onChanged }: { onChanged?: () => void }) {
  const qc = useQueryClient();
  const historyQ = useQuery({
    queryKey: ["knowledge", "apply-history"],
    queryFn: () => knowledgeApi.applyHistory({ limit: 50 }),
  });

  const [confirmId, setConfirmId] = useState<number | null>(null);

  const undoMut = useMutation({
    mutationFn: (historyId: number) => knowledgeApi.undoApply(historyId),
    onSuccess: (res) => {
      toast.success(`Undone${res.after_value ? `: restored ${res.after_value}` : ""}`);
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onChanged?.();
    },
    onError: (err) => {
      if (err instanceof KnowledgeApiError && err.status === 409) {
        toast.error("Undo blocked because production value no longer matches the approved write.");
      } else {
        toast.error(err instanceof Error ? err.message : "Undo failed");
      }
      // Refresh so a stale/undone entry reconciles with the backend.
      qc.invalidateQueries({ queryKey: ["knowledge", "apply-history"] });
    },
    onSettled: () => setConfirmId(null),
  });

  const entries = historyQ.data?.entries ?? [];

  return (
    <aside className="rounded-xl border border-border bg-card p-3 md:sticky md:top-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-foreground">Approved Changes</h2>
        {historyQ.data && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{historyQ.data.total}</span>
        )}
      </div>

      {historyQ.error && <ErrorBanner error={historyQ.error} onRetry={() => historyQ.refetch()} />}

      {historyQ.isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground py-2">
          No approved changes yet. Approvals you apply will show here.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-0.5">
          {entries.map((e) => (
            <ApprovedChangeRow
              key={`${e.history_id}-${e.applied_at}`}
              entry={e}
              confirming={confirmId === e.history_id}
              onRequestUndo={() => setConfirmId(e.history_id)}
              onCancelUndo={() => setConfirmId(null)}
              onConfirmUndo={() => undoMut.mutate(e.history_id)}
              undoInFlight={undoMut.isPending && undoMut.variables === e.history_id}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

function ApprovedChangeRow({
  entry,
  confirming,
  onRequestUndo,
  onCancelUndo,
  onConfirmUndo,
  undoInFlight,
}: {
  entry: AppliedChange;
  confirming: boolean;
  onRequestUndo: () => void;
  onCancelUndo: () => void;
  onConfirmUndo: () => void;
  undoInFlight: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isUndone = Boolean(entry.undone_at);
  const canUndo = entry.can_undo !== false && !isUndone;
  const before = entry.old_full_progression ?? (entry.old_value != null ? String(entry.old_value) : null);
  const after = entry.new_full_progression ?? (entry.new_value != null ? String(entry.new_value) : null);

  return (
    <li className={cn("rounded-lg border bg-background/40", isUndone ? "border-border/60 opacity-70" : "border-border")}>
      <div className="flex items-start gap-1.5 px-2 py-1.5">
        <button onClick={() => setOpen((o) => !o)} className="mt-0.5 text-muted-foreground shrink-0">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-foreground truncate">
              {entry.champion_name} {entry.ability_key ?? ""} {entry.property ?? ""}
            </span>
            {entry.patch_version && (
              <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
                {entry.patch_version}
              </span>
            )}
            <span
              className={cn(
                "rounded px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
                isUndone
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/10 text-emerald-300",
              )}
            >
              {isUndone ? "undone" : "active"}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground truncate">
            <span>{before ?? "—"}</span>
            <span className="mx-1">→</span>
            <span className={cn("font-bold", isUndone ? "text-muted-foreground line-through" : "text-emerald-300")}>
              {after ?? "—"}
            </span>
          </div>
        </div>
        {canUndo && !confirming && (
          <button
            onClick={onRequestUndo}
            className="shrink-0 inline-flex items-center gap-1 rounded border border-border bg-card text-[10px] font-bold px-1.5 py-0.5 hover:bg-secondary"
            title="Restore the previous value. Backend blocks the undo if the DB value has changed since."
          >
            <RotateCcw className="h-3 w-3" /> Undo
          </button>
        )}
      </div>

      {confirming && (
        <div className="border-t border-border px-2 py-1.5 space-y-1.5">
          <p className="text-[10px] text-amber-200">
            Undo this approval? Restores {before ?? "the previous value"}.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onConfirmUndo}
              disabled={undoInFlight}
              className="rounded bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 disabled:opacity-40"
            >
              {undoInFlight ? "Undoing…" : "Confirm undo"}
            </button>
            <button onClick={onCancelUndo} className="text-[10px] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-border px-2 py-1.5 space-y-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.provider && <ProviderBadge provider={entry.provider} />}
            {typeof entry.confidence === "number" && <ConfidenceBadge value={entry.confidence} />}
            {typeof entry.rank_count === "number" && (
              <span>{entry.rank_count} rank{entry.rank_count === 1 ? "" : "s"}</span>
            )}
          </div>
          {entry.applied_at && (
            <div>applied {relativeTime(entry.applied_at)}{entry.applied_by ? ` by ${entry.applied_by}` : ""}</div>
          )}
          {isUndone && entry.undone_at && (
            <div>undone {relativeTime(entry.undone_at)}{entry.undone_by ? ` by ${entry.undone_by}` : ""}</div>
          )}
          {!canUndo && !isUndone && entry.undo_unavailable_reason && (
            <div className="text-amber-200/80">cannot undo: {entry.undo_unavailable_reason}</div>
          )}
        </div>
      )}
    </li>
  );
}
