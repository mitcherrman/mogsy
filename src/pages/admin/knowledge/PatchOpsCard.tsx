import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, PackageOpen } from "lucide-react";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type { PatchOpsCounts, PatchOpsOperation } from "@/lib/knowledge-admin/types";
import { cn } from "@/lib/utils";
import { ErrorBanner, relativeTime } from "./shared";

/**
 * Patch Ops — the outcome of the last automated patch, at a glance.
 *
 * Mogzy publishes a patch by itself now: authority, reconciliation, the safe
 * canonical auto-apply, verify, archive, closeout. The purpose of this card is
 * that finding out whether that went well should not require Railway logs.
 *
 * THE VERDICT IS THE BACKEND'S, ALWAYS.
 * `admin_status` and `attention_required` are computed on the server from the
 * Phase 3E operator-attention policy and the Patch Ops lifecycle outcome. This
 * component reads them and does not reconstruct them. That is the whole design
 * rule here, and the reason is concrete: a patch routinely leaves dozens of
 * UNSUPPORTED changes behind — properties Mogzy has no canonical writer for —
 * and a UI that decided for itself that a non-zero number is bad would flag
 * every successful patch as a problem. The owner would learn to ignore the
 * card, which is worse than not having one.
 *
 * So: UNSUPPORTED, REPORT_ONLY, ALREADY_RECONCILED and mode-scoped IGNORED are
 * shown as neutral counts, and nothing in this file turns a number into an
 * alarm. Only `attention_required` does that.
 */

const TONES = {
  UPDATED: {
    icon: CheckCircle2,
    ring: "border-emerald-500/30",
    text: "text-emerald-300",
    label: "Updated successfully",
  },
  NEEDS_ATTENTION: {
    icon: AlertTriangle,
    ring: "border-amber-500/40",
    text: "text-amber-300",
    label: "Needs attention",
  },
  PROCESSING: {
    icon: Loader2,
    ring: "border-sky-500/30",
    text: "text-sky-300",
    label: "Processing",
  },
} as const;

/** The counts worth reading at a glance, in the order they answer questions:
 *  what did Mogzy change, what was already right, what did it not touch. */
const SUMMARY_COUNTS: Array<{ key: keyof PatchOpsCounts; label: string }> = [
  { key: "auto_applied", label: "auto-applied" },
  { key: "already_reconciled", label: "already current" },
  { key: "unsupported", label: "unsupported" },
];

/** Shown only when non-zero, because each one is a thing to act on. Their
 *  presence never *decides* the verdict — the backend already did that. */
const ATTENTION_COUNTS: Array<{ key: keyof PatchOpsCounts; label: string }> = [
  { key: "review_required", label: "require review" },
  { key: "pending_apply", label: "not yet applied" },
  { key: "failed", label: "failed" },
  { key: "apply_failed", label: "apply failed" },
  { key: "blocked", label: "blocked" },
];

export function PatchOpsSummary({ operation }: { operation: PatchOpsOperation }) {
  const tone = TONES[operation.admin_status] ?? TONES.PROCESSING;
  const Icon = tone.icon;
  const attention = operation.attention_required;
  // "Completed" is a claim, so it is made only when the operation actually
  // recorded a completion. A failed or in-flight operation has no completed_at
  // and reports when it last MOVED instead — saying "completed" over a
  // publication that never closed is exactly the reassurance this card must
  // never give.
  const completed = operation.completed_at != null;
  const stamp = operation.completed_at ?? operation.updated_at;

  const attentionCounts = ATTENTION_COUNTS
    .filter((c) => (operation.counts[c.key] ?? 0) > 0)
    .map((c) => `${operation.counts[c.key]} ${c.label}`);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Patch Ops
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                tone.text,
                operation.admin_status === "PROCESSING" && "animate-spin",
              )}
              aria-hidden
            />
            <span className="text-sm font-extrabold text-foreground tabular-nums">
              {operation.patch_version}
            </span>
            <span className="text-sm text-muted-foreground">—</span>
            <span className={cn("text-sm font-bold", tone.text)}>{tone.label}</span>
            {/* Generation is identity, not decoration: 26.17#2 is a RETRY of
                26.17 and reads very differently from a first attempt. */}
            {operation.generation > 1 && (
              <span
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                title={`Attempt ${operation.generation} at this patch (${operation.operation_id})`}
              >
                attempt {operation.generation}
              </span>
            )}
          </div>
        </div>
        <Link
          to={`/admin/knowledge/patch-ops/${encodeURIComponent(operation.operation_id)}`}
          className={cn(
            "rounded-lg text-xs font-bold px-3 py-1.5 shrink-0",
            attention
              ? "bg-amber-500 text-black"
              : "border border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {attention ? "Review operation" : "Inspect"}
        </Link>
      </div>

      {/* The compact numeric line. Neutral by construction. */}
      <div className="text-xs text-muted-foreground tabular-nums">
        {operation.reconciliation.available ? (
          SUMMARY_COUNTS.map((c, i) => (
            <span key={c.key}>
              {i > 0 && <span className="mx-1.5 opacity-50">·</span>}
              <span className="font-bold text-foreground">{operation.counts[c.key]}</span>{" "}
              {c.label}
            </span>
          ))
        ) : (
          /* Not "0 applied". This operation predates the reconciliation lane,
             or its record is unreadable on this build — an absence of record,
             which is a different fact from an absence of changes. */
          <span>{operation.reconciliation.unavailable_reason ?? "No reconciliation recorded"}</span>
        )}
      </div>

      {attentionCounts.length > 0 && (
        <div className="text-xs font-semibold text-amber-300 tabular-nums">
          {attentionCounts.join(" · ")}
        </div>
      )}

      {attention ? (
        <ul className="space-y-1 text-xs text-amber-200/90">
          {/* Backend prose, verbatim. The reasons are written where the rules
              live; paraphrasing them here would be a second, drifting copy. */}
          {operation.attention_reasons.map((reason) => (
            <li key={reason} className="flex gap-1.5">
              <span aria-hidden>•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs font-semibold text-emerald-300">
          {operation.admin_status === "PROCESSING"
            ? "In progress — nothing to do yet"
            : "No action required"}
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span title={stamp ?? undefined}>
          {completed ? "Completed " : "Updated "}
          {relativeTime(stamp)}
        </span>
        <span className="opacity-60">{operation.lifecycle_state}</span>
        {operation.undo_available && (
          /* A statement of fact, not a button. The applied writes are still in
             knowledge_apply_history and the existing per-change undo endpoint
             can take them back; this phase adds no admin-triggered undo. */
          <span className="rounded border border-border px-1.5 py-0.5 font-semibold">
            Undo available
          </span>
        )}
      </div>
    </div>
  );
}

export default function PatchOpsCard() {
  const query = useQuery({
    queryKey: ["knowledge", "patch-ops", "latest"],
    queryFn: () => knowledgeApi.patchOpsLatest(),
  });

  const operation = query.data?.operation ?? null;
  const tone = operation ? TONES[operation.admin_status] : undefined;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 sm:p-4",
        tone?.ring ?? "border-border",
      )}
    >
      {query.isLoading && (
        <div className="text-xs text-muted-foreground">Loading Patch Ops status…</div>
      )}

      {/* A backend that cannot be reached must never read as "nothing wrong".
          The banner states the failure and offers a retry; no status is shown
          beside it, because we do not have one. */}
      {query.error != null && (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      )}

      {!query.isLoading && query.error == null && operation == null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PackageOpen className="h-4 w-4 shrink-0" aria-hidden />
          <span>No patch operation recorded yet.</span>
        </div>
      )}

      {query.error == null && operation != null && (
        <PatchOpsSummary operation={operation} />
      )}
    </div>
  );
}
