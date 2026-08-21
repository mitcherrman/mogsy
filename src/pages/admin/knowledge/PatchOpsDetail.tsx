import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type { PatchOpsChangeRow, PatchOpsCounts } from "@/lib/knowledge-admin/types";
import { ErrorBanner, relativeTime } from "./shared";
import { PatchOpsSummary } from "./PatchOpsCard";

/**
 * One Patch Ops operation, in enough detail to decide what to do about it.
 *
 * Not an operations console, deliberately. There is no control here at all:
 * nothing on this page advances an operation, applies a change, resolves a
 * review or performs an undo. Those live where they already lived — behind the
 * Patch Ops CLI's typed approvals and the existing per-change undo endpoint —
 * and duplicating any of them into an admin page would be a second authority
 * over production writes.
 *
 * The lists are the two OPEN dispositions plus what was applied. UNSUPPORTED
 * is counted and never listed: it runs to hundreds of rows and it is coverage
 * debt, not a queue of problems.
 */

const COUNT_LABELS: Array<{ key: keyof PatchOpsCounts; label: string }> = [
  { key: "auto_applied", label: "Auto-applied" },
  { key: "already_reconciled", label: "Already current" },
  { key: "pending_apply", label: "Not yet applied" },
  { key: "review_required", label: "Require review" },
  { key: "failed", label: "Failed" },
  { key: "apply_failed", label: "Apply failed" },
  { key: "blocked", label: "Blocked" },
  { key: "unsupported", label: "Unsupported" },
  { key: "report_only", label: "Report only" },
  { key: "ignored_non_sr", label: "Not Summoner's Rift" },
  { key: "total_changes", label: "Changes recorded" },
];

export default function PatchOpsDetail() {
  const { operationId = "" } = useParams();
  const query = useQuery({
    queryKey: ["knowledge", "patch-ops", "operation", operationId],
    queryFn: () => knowledgeApi.patchOpsOperation(operationId),
    enabled: operationId.length > 0,
  });

  const detail = query.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin/knowledge" className="text-xs text-muted-foreground hover:text-foreground">
          ← Knowledge Dashboard
        </Link>
      </div>

      {query.isLoading && (
        <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          Loading operation {operationId}…
        </div>
      )}

      {query.error != null && (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      )}

      {detail && (
        <>
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <PatchOpsSummary operation={detail} />
          </div>

          <Panel title="Operation">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <Field label="Operation" value={detail.operation_id} />
              <Field label="Patch" value={detail.patch_version} />
              <Field label="Attempt" value={String(detail.generation)} />
              <Field label="Lifecycle" value={detail.lifecycle_state} />
              <Field label="Outcome" value={detail.outcome} />
              <Field label="Actor" value={detail.actor} />
              <Field label="Opened" value={relativeTime(detail.opened_at)} />
              <Field label="Updated" value={relativeTime(detail.updated_at)} />
              <Field label="Completed" value={relativeTime(detail.completed_at)} />
            </dl>
          </Panel>

          <Panel title="Reconciliation">
            {detail.reconciliation.available ? (
              <>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs mb-3">
                  <Field label="Status" value={detail.reconciliation.status} />
                  {/* Reported beside the derived status, never instead of it:
                      the stored column has a deliberately narrower vocabulary
                      and can legitimately read PERSISTED over rows that derive
                      to READY_TO_APPLY. */}
                  <Field label="Recorded as" value={detail.reconciliation.stored_status} />
                  <Field label="Undo" value={detail.undo_available ? "Available" : "None"} />
                </dl>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COUNT_LABELS.map((c) => (
                    <div key={c.key} className="rounded-lg border border-border bg-background px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {c.label}
                      </div>
                      <div className="text-sm font-extrabold text-foreground tabular-nums">
                        {detail.counts[c.key]}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {detail.reconciliation.unavailable_reason ??
                  "No reconciliation was recorded for this operation."}
              </p>
            )}
          </Panel>

          {detail.receipt && (
            <Panel title="Reconciliation receipt">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                <Field label="Lane" value={detail.receipt.lane_version} />
                <Field label="Mode" value={detail.receipt.mode} />
                <Field label="Recorded status" value={detail.receipt.reconciliation_status} />
                <Field label="Normalized changes" value={numeric(detail.receipt.normalized_change_count)} />
                <Field label="Applied at receipt time" value={numeric(detail.receipt.applied_count)} />
                <Field label="Actor" value={detail.receipt.actor} />
                <Field label="Parser" value={detail.receipt.parser_revision} />
                <Field label="Generated" value={relativeTime(detail.receipt.generated_at)} />
              </dl>
            </Panel>
          )}

          <RowTable
            title="Require review"
            rows={detail.rows.review_required}
            limit={detail.row_limit}
            total={detail.counts.review_required}
            empty="Nothing is waiting on a decision."
          />
          <RowTable
            title="Failed"
            rows={detail.rows.failed}
            limit={detail.row_limit}
            total={detail.counts.failed}
            empty="No change failed."
          />
          <RowTable
            title="Applied automatically"
            rows={detail.rows.applied}
            limit={detail.row_limit}
            total={detail.counts.auto_applied}
            empty="Mogzy applied nothing for this patch."
          />

          {detail.applied_history_ids.length > 0 && (
            <Panel title="Undo">
              <p className="text-xs text-muted-foreground">
                {/* Visibility, not a control. Undo remains the existing
                    per-change admin endpoint, which re-checks that the live
                    value still matches what the apply wrote before restoring. */}
                {detail.applied_history_ids.length} applied write
                {detail.applied_history_ids.length === 1 ? " is" : "s are"} still
                undoable through the existing apply-history undo, from{" "}
                <Link to="/admin/knowledge/history" className="underline">Patch History</Link>.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80 tabular-nums break-all">
                apply-history #{detail.applied_history_ids.join(", #")}
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function numeric(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      {/* A missing optional field on a historical operation is rendered as an
          em dash, never as an empty gap that reads like a zero. */}
      <dd className="font-semibold text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}

function RowTable({ title, rows, limit, total, empty }: {
  title: string;
  rows: PatchOpsChangeRow[];
  limit: number;
  total: number;
  empty: string;
}) {
  return (
    <Panel title={`${title} (${total})`}>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-semibold">Entity</th>
                  <th className="py-1 pr-3 font-semibold">Property</th>
                  <th className="py-1 pr-3 font-semibold">Riot</th>
                  <th className="py-1 pr-3 font-semibold">Mogzy</th>
                  <th className="py-1 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.entity_name}-${row.mogzy_property}-${index}`}
                      className="border-t border-border/60 align-top">
                    <td className="py-1 pr-3 font-semibold text-foreground">
                      {row.entity_name}
                      {row.ability_slot ? ` ${row.ability_slot}` : ""}
                    </td>
                    <td className="py-1 pr-3">{row.mogzy_property ?? row.riot_property ?? "—"}</td>
                    <td className="py-1 pr-3 tabular-nums">
                      {row.before_raw ?? "—"} → {row.after_raw ?? "—"}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{row.mogzy_current_raw ?? "—"}</td>
                    <td className="py-1 text-muted-foreground">{row.disposition_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Never silently truncate: a list that stops short must say so, or it
              reads as "that was all of them". The count is `rows.length` and not
              the cap — they are the same at the cap, and only `rows.length` is
              honest when the backend returned fewer for any other reason. */}
          {total > rows.length && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Showing {rows.length} of {total}
              {rows.length >= limit ? ` (first ${limit})` : ""}.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
