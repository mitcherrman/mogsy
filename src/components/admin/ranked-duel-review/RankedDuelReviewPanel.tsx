// ---------------------------------------------------------------------------
// Ranked Duel candidate-review workspace (admin tab of /admin/quiz-content).
//
// Connects to the live, audited admin API (src/lib/ranked-duel-review/api.ts).
// It renders readiness/status, a filterable candidate list (never showing a
// correct answer), an admin-only candidate detail (the only place the correct
// answer/index is shown), and explicit accept / reject / revise / validate /
// export actions. Every decision is a single human action carrying the
// candidate's source_hash (optimistic concurrency) and the reviewer identity;
// the UI never bulk-acts, never recomputes answers, and reads never mutate.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Swords,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  FileDown,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  rankedReviewApi,
  ReviewApiError,
  describeReviewError,
} from "@/lib/ranked-duel-review/api";
import type {
  CandidateDetail,
  CandidateListParams,
  CandidateSummary,
  DerivedStatus,
  ExportResult,
  ReviewStatus,
  RevisionPatch,
  ValidateReport,
} from "@/lib/ranked-duel-review/types";
import { getReviewer, setReviewer } from "./reviewerIdentity";

const STATUS_STYLE: Record<DerivedStatus, string> = {
  unreviewed: "bg-muted text-muted-foreground",
  accepted: "bg-emerald-500/15 text-emerald-400",
  revised: "bg-sky-500/15 text-sky-400",
  rejected: "bg-red-500/15 text-red-400",
  stale_source_changed: "bg-amber-500/15 text-amber-400",
  orphaned: "bg-orange-500/15 text-orange-400",
};

function StatusBadge({ status }: { status: DerivedStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}
      data-testid={`cand-status-${status}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

type ActionMode = null | "accept" | "reject" | "revise";

export function RankedDuelReviewPanel() {
  const [reviewer, setReviewerState] = useState(getReviewer);
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [filters, setFilters] = useState<CandidateListParams>({});
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStale, setActionStale] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  const [validateReport, setValidateReport] = useState<ValidateReport | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const gen = useRef(0);

  const reload = useCallback(async (activeFilters: CandidateListParams) => {
    const myGen = ++gen.current;
    setLoadingList(true);
    setListError(null);
    try {
      const [s, list] = await Promise.all([
        rankedReviewApi.status(),
        rankedReviewApi.listCandidates(activeFilters),
      ]);
      if (myGen !== gen.current) return;
      setStatus(s);
      setCandidates(list);
      setAuthRequired(false);
    } catch (err) {
      if (myGen !== gen.current) return;
      if (err instanceof ReviewApiError && err.kind === "auth") setAuthRequired(true);
      setListError(describeReviewError(err));
    } finally {
      if (myGen === gen.current) setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    // Reload on mount and whenever filters change; search applies explicitly.
    void reload(filters);
  }, [reload, filters]);

  const loadDetail = useCallback(async (candidateId: string) => {
    setSelectedId(candidateId);
    setActionMode(null);
    setActionError(null);
    setActionStale(false);
    setOverwrite(false);
    setLoadingDetail(true);
    try {
      const d = await rankedReviewApi.getCandidate(candidateId);
      setDetail(d);
    } catch (err) {
      setDetail(null);
      setActionError(describeReviewError(err));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const refreshAfterDecision = useCallback(async () => {
    await reload(filters);
    if (selectedId) {
      try {
        setDetail(await rankedReviewApi.getCandidate(selectedId));
      } catch {
        /* detail refresh best-effort */
      }
    }
  }, [reload, filters, selectedId]);

  const persistReviewer = (name: string) => {
    setReviewerState(name);
    setReviewer(name);
  };

  const applySearch = () => setFilters((f) => ({ ...f, search: search.trim() || undefined }));

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setActionBusy(true);
      setActionError(null);
      setActionStale(false);
      try {
        await fn();
        setActionMode(null);
        setOverwrite(false);
        await refreshAfterDecision();
      } catch (err) {
        setActionError(describeReviewError(err));
        if (err instanceof ReviewApiError) {
          if (err.kind === "stale") setActionStale(true);
          if (err.kind === "conflict") setOverwrite(true); // surface the toggle, pre-checked
        }
      } finally {
        setActionBusy(false);
      }
    },
    [refreshAfterDecision],
  );

  const reviewerReady = reviewer.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="ranked-duel-review-panel">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Ranked Duel candidate review</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="rd-reviewer" className="text-[11px] text-muted-foreground">
              Reviewer
            </Label>
            <Input
              id="rd-reviewer"
              data-testid="rd-reviewer"
              value={reviewer}
              onChange={(e) => persistReviewer(e.target.value)}
              placeholder="your name"
              className="h-7 w-32 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            data-testid="rd-validate"
            onClick={() =>
              rankedReviewApi
                .validate()
                .then(setValidateReport)
                .catch((e) => setListError(describeReviewError(e)))
            }
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Validate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            data-testid="rd-export-open"
            onClick={() => setExportOpen(true)}
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden /> Export
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            data-testid="rd-reload"
            onClick={() => void reload(filters)}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reload
          </Button>
        </div>
      </div>

      {authRequired ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Admin key missing or invalid — set it above the workspace to load candidates.
        </div>
      ) : (
        <>
          {status && <StatusBar status={status} />}

          {/* Filters */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
            <select
              data-testid="rd-filter-decision"
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={filters.decision ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  decision: (e.target.value || undefined) as CandidateListParams["decision"],
                }))
              }
            >
              <option value="">All decisions</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="accepted">Accepted</option>
              <option value="revised">Revised</option>
              <option value="rejected">Rejected</option>
            </select>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                data-testid="rd-filter-stale"
                checked={filters.stale === true}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, stale: e.target.checked ? true : undefined }))
                }
              />
              Stale only
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                data-testid="rd-filter-exportable"
                checked={filters.exportable === true}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, exportable: e.target.checked ? true : undefined }))
                }
              />
              Exportable only
            </label>
            <div className="flex flex-1 items-center gap-1">
              <Input
                data-testid="rd-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                placeholder="Search prompt text…"
                className="h-7 text-xs"
              />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={applySearch}>
                Search
              </Button>
            </div>
          </div>

          {/* List + detail */}
          <div className="flex min-h-0 flex-1">
            <div
              className="w-72 shrink-0 space-y-1 overflow-y-auto border-r p-2"
              data-testid="rd-candidate-list"
            >
              {loadingList && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading candidates" />
                </div>
              )}
              {!loadingList && listError && (
                <p className="px-2 py-4 text-xs text-destructive" data-testid="rd-list-error">
                  {listError}
                </p>
              )}
              {!loadingList && !listError && candidates.length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  No candidates match these filters.
                </p>
              )}
              {candidates.map((c) => (
                <button
                  key={c.candidate_id}
                  data-testid={`rd-cand-${c.candidate_id}`}
                  onClick={() => loadDetail(c.candidate_id)}
                  className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                    selectedId === c.candidate_id
                      ? "border-primary/50 bg-primary/10"
                      : "border-transparent hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-medium">{c.candidate_id}</span>
                    <StatusBadge status={c.derived_status} />
                  </div>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{c.prompt_summary}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    {c.family && <span>{c.family}</span>}
                    {c.difficulty && <span>· {c.difficulty}</span>}
                    {c.exportable && <span className="text-emerald-400">· exportable</span>}
                  </div>
                </button>
              ))}
            </div>

            <div className="min-w-0 flex-1 overflow-y-auto p-3" data-testid="rd-detail">
              {!selectedId && (
                <p className="py-12 text-center text-xs text-muted-foreground">
                  Select a candidate to review.
                </p>
              )}
              {selectedId && loadingDetail && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading detail" />
                </div>
              )}
              {selectedId && !loadingDetail && detail && (
                <CandidateDetailView
                  detail={detail}
                  reviewer={reviewer}
                  reviewerReady={reviewerReady}
                  actionMode={actionMode}
                  setActionMode={(m) => {
                    setActionMode(m);
                    setActionError(null);
                    setActionStale(false);
                    setOverwrite(detail.derived_status !== "unreviewed");
                  }}
                  actionBusy={actionBusy}
                  actionError={actionError}
                  actionStale={actionStale}
                  overwrite={overwrite}
                  setOverwrite={setOverwrite}
                  onReloadDetail={() => void loadDetail(detail.candidate_id)}
                  onAccept={(notes) =>
                    runAction(() =>
                      rankedReviewApi.accept(detail.candidate_id, {
                        source_hash: detail.source_hash,
                        reviewer,
                        notes,
                        overwrite,
                      }),
                    )
                  }
                  onReject={(reason, notes) =>
                    runAction(() =>
                      rankedReviewApi.reject(detail.candidate_id, {
                        source_hash: detail.source_hash,
                        reviewer,
                        reason,
                        notes,
                        overwrite,
                      }),
                    )
                  }
                  onRevise={(patch, notes) =>
                    runAction(() =>
                      rankedReviewApi.revise(detail.candidate_id, {
                        source_hash: detail.source_hash,
                        reviewer,
                        patch,
                        notes,
                        overwrite,
                      }),
                    )
                  }
                />
              )}
            </div>
          </div>
        </>
      )}

      {validateReport && (
        <ValidateReportView report={validateReport} onClose={() => setValidateReport(null)} />
      )}

      {/* Export confirmation — an explicit, backend-owned atomic file write. */}
      <Dialog open={exportOpen} onOpenChange={(o) => !o && setExportOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export accepted candidate bank?</DialogTitle>
            <DialogDescription className="text-xs">
              Writes <code>ranked_candidates_accepted.json</code> from the current accepted +
              still-valid revised, non-stale candidates. This is an explicit, atomic backend write
              and does not activate anything for ranked play.
            </DialogDescription>
          </DialogHeader>
          {exportResult && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[11px]" data-testid="rd-export-result">
              Exported {exportResult.counts.exported} (accepted {exportResult.counts.accepted},
              revised {exportResult.counts.revised}) of {exportResult.counts.source_total}.
            </div>
          )}
          <DialogFooter>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setExportOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              className="gap-1 text-xs"
              data-testid="rd-export-confirm"
              disabled={exportBusy}
              onClick={() => {
                setExportBusy(true);
                rankedReviewApi
                  .export()
                  .then((r) => {
                    setExportResult(r);
                    void reload(filters);
                  })
                  .catch((e) => setActionError(describeReviewError(e)))
                  .finally(() => setExportBusy(false));
              }}
            >
              {exportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Run export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status / readiness bar
// ---------------------------------------------------------------------------

function StatusBar({ status }: { status: ReviewStatus }) {
  return (
    <div className="shrink-0 space-y-1.5 border-b bg-muted/10 px-4 py-2" data-testid="rd-status">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className={`flex items-center gap-1 rounded px-2 py-0.5 font-semibold ${
            status.external_alpha_ready
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-amber-500/15 text-amber-400"
          }`}
          data-testid="rd-readiness"
        >
          {status.external_alpha_ready ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          )}
          {status.external_alpha_ready ? "Alpha-ready" : "Not alpha-ready"}
        </span>
        <span data-testid="rd-exportable-count">
          <strong>{status.exportable}</strong> / {status.minimum_required_count} exportable
        </span>
        <span className="text-muted-foreground">
          accepted {status.accepted} · revised {status.revised} · rejected {status.rejected} ·
          unreviewed {status.unreviewed} · stale {status.stale_source_changed}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span data-testid="rd-index-dist">
          index dist:{" "}
          {[0, 1, 2, 3]
            .map((i) => `${i}:${status.accepted_correct_index_distribution[String(i)] ?? 0}`)
            .join("  ")}
        </span>
        <span
          className={
            status.all_indices_represented ? "text-emerald-400" : "text-amber-400"
          }
        >
          {status.all_indices_represented ? "all indices present" : "missing indices"}
        </span>
        {status.distribution_warning && (
          <span className="text-amber-400" data-testid="rd-dist-warning">
            ⚠ {status.distribution_warning_detail}
          </span>
        )}
      </div>
      {status.external_alpha_blockers.length > 0 && (
        <ul className="list-disc pl-5 text-[11px] text-amber-400" data-testid="rd-blockers">
          {status.external_alpha_blockers.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candidate detail + decision actions
// ---------------------------------------------------------------------------

function CandidateDetailView({
  detail,
  reviewer,
  reviewerReady,
  actionMode,
  setActionMode,
  actionBusy,
  actionError,
  actionStale,
  overwrite,
  setOverwrite,
  onReloadDetail,
  onAccept,
  onReject,
  onRevise,
}: {
  detail: CandidateDetail;
  reviewer: string;
  reviewerReady: boolean;
  actionMode: ActionMode;
  setActionMode: (m: ActionMode) => void;
  actionBusy: boolean;
  actionError: string | null;
  actionStale: boolean;
  overwrite: boolean;
  setOverwrite: (v: boolean) => void;
  onReloadDetail: () => void;
  onAccept: (notes: string) => void;
  onReject: (reason: string, notes: string) => void;
  onRevise: (patch: RevisionPatch, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const alreadyDecided = detail.derived_status !== "unreviewed";

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px]">{detail.candidate_id}</span>
        <StatusBadge status={detail.derived_status} />
        {detail.family && <Badge variant="outline">{detail.family}</Badge>}
        {detail.difficulty_target && <Badge variant="outline">{detail.difficulty_target}</Badge>}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground">Prompt</p>
        <p className="text-sm">{detail.question_text}</p>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground">Options</p>
        <ol className="list-decimal space-y-0.5 pl-5">
          {detail.options.map((opt, i) => (
            <li
              key={i}
              className={i === detail.correct_answer_index ? "font-semibold text-emerald-400" : ""}
            >
              {opt}
              {i === detail.correct_answer_index && (
                <span className="ml-1 text-[10px]">(correct · admin-only)</span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-1 text-[11px] text-muted-foreground" data-testid="rd-correct-answer">
          Correct answer: <span className="text-emerald-400">{String(detail.correct_answer)}</span>{" "}
          (index {detail.correct_answer_index ?? "—"})
        </p>
      </div>

      {detail.validation_warnings.length > 0 && (
        <ul className="list-disc rounded border border-amber-400/30 bg-amber-400/5 p-2 pl-5 text-amber-400" data-testid="rd-validation-warnings">
          {detail.validation_warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {detail.review.history.length > 0 && (
        <details className="rounded border border-border/50 p-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            Decision history ({detail.review.history.length})
          </summary>
          <pre className="mt-1 overflow-x-auto text-[10px]">
            {JSON.stringify(detail.review.history, null, 2)}
          </pre>
        </details>
      )}

      {/* Decision actions */}
      <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
        {!reviewerReady && (
          <p className="text-[11px] text-amber-400" data-testid="rd-reviewer-required">
            Enter a reviewer name (top right) to record decisions.
          </p>
        )}
        {alreadyDecided && (
          <label className="flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              data-testid="rd-overwrite"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Overwrite the existing <strong>{detail.review.decision}</strong> decision
          </label>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={actionMode === "accept" ? "default" : "outline"}
            className="h-7 gap-1 text-xs"
            data-testid="rd-mode-accept"
            disabled={!reviewerReady}
            onClick={() => setActionMode(actionMode === "accept" ? null : "accept")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Accept
          </Button>
          <Button
            size="sm"
            variant={actionMode === "reject" ? "default" : "outline"}
            className="h-7 text-xs"
            data-testid="rd-mode-reject"
            disabled={!reviewerReady}
            onClick={() => setActionMode(actionMode === "reject" ? null : "reject")}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant={actionMode === "revise" ? "default" : "outline"}
            className="h-7 text-xs"
            data-testid="rd-mode-revise"
            disabled={!reviewerReady}
            onClick={() => setActionMode(actionMode === "revise" ? null : "revise")}
          >
            Revise
          </Button>
        </div>

        {actionMode === "accept" && (
          <div className="space-y-1.5">
            <Textarea
              data-testid="rd-accept-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="min-h-[48px] text-xs"
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              data-testid="rd-accept-submit"
              disabled={actionBusy}
              onClick={() => onAccept(notes)}
            >
              {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm accept"}
            </Button>
          </div>
        )}

        {actionMode === "reject" && (
          <div className="space-y-1.5">
            <Input
              data-testid="rd-reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required)"
              className="h-7 text-xs"
            />
            <Textarea
              data-testid="rd-reject-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="min-h-[40px] text-xs"
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              data-testid="rd-reject-submit"
              disabled={actionBusy || !reason.trim()}
              onClick={() => onReject(reason, notes)}
            >
              {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm reject"}
            </Button>
          </div>
        )}

        {actionMode === "revise" && (
          <ReviseEditor
            detail={detail}
            busy={actionBusy}
            onSubmit={onRevise}
          />
        )}

        {actionError && (
          <div className="space-y-1 rounded border border-destructive/40 bg-destructive/5 p-1.5 text-[11px] text-destructive" data-testid="rd-action-error">
            <p>{actionError}</p>
            {actionStale && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px]"
                data-testid="rd-reload-detail"
                onClick={onReloadDetail}
              >
                Reload candidate
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Reviewing as <strong>{reviewer || "—"}</strong> · source_hash{" "}
        <span className="font-mono">{detail.source_hash.slice(0, 16)}…</span>
      </p>
    </div>
  );
}

function ReviseEditor({
  detail,
  busy,
  onSubmit,
}: {
  detail: CandidateDetail;
  busy: boolean;
  onSubmit: (patch: RevisionPatch, notes: string) => void;
}) {
  const [questionText, setQuestionText] = useState(detail.question_text ?? "");
  const [options, setOptions] = useState<string[]>(detail.options);
  const [correctAnswer, setCorrectAnswer] = useState(String(detail.correct_answer ?? ""));
  const [difficulty, setDifficulty] = useState(detail.difficulty_target ?? "");
  const [reviewNote, setReviewNote] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    // Only editable fields (backend rejects any other key). Correct-answer
    // WORDING may change; the backend fail-closes a numeric-value change.
    const patch: RevisionPatch = {
      question_text: questionText,
      options,
      correct_answer: correctAnswer,
      difficulty_target: difficulty,
    };
    if (reviewNote.trim()) patch.review_note = reviewNote.trim();
    onSubmit(patch, notes);
  };

  return (
    <div className="space-y-1.5 rounded border border-border/50 p-2">
      <p className="text-[10px] text-muted-foreground">
        Editable fields only. A correct-answer wording change is allowed; the numeric value cannot
        change (validated server-side).
      </p>
      <Label className="text-[10px]">Question text</Label>
      <Textarea
        data-testid="rd-revise-question"
        value={questionText}
        onChange={(e) => setQuestionText(e.target.value)}
        className="min-h-[48px] text-xs"
      />
      <Label className="text-[10px]">Options</Label>
      {options.map((opt, i) => (
        <Input
          key={i}
          data-testid={`rd-revise-option-${i}`}
          value={opt}
          onChange={(e) =>
            setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
          }
          className="h-7 text-xs"
        />
      ))}
      <div className="flex gap-1.5">
        <div className="flex-1">
          <Label className="text-[10px]">Correct answer (wording)</Label>
          <Input
            data-testid="rd-revise-correct"
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="w-24">
          <Label className="text-[10px]">Difficulty</Label>
          <Input
            data-testid="rd-revise-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>
      <Label className="text-[10px]">Review note</Label>
      <Input
        data-testid="rd-revise-note"
        value={reviewNote}
        onChange={(e) => setReviewNote(e.target.value)}
        className="h-7 text-xs"
      />
      <Label className="text-[10px]">Decision notes</Label>
      <Input
        data-testid="rd-revise-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="h-7 text-xs"
      />
      <Button
        size="sm"
        className="h-7 text-xs"
        data-testid="rd-revise-submit"
        disabled={busy}
        onClick={submit}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm revision"}
      </Button>
    </div>
  );
}

function ValidateReportView({
  report,
  onClose,
}: {
  report: ValidateReport;
  onClose: () => void;
}) {
  return (
    <div
      className="shrink-0 space-y-1 border-t bg-muted/10 px-4 py-2 text-[11px]"
      data-testid="rd-validate-report"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">Validation</span>
        <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
          dismiss
        </button>
      </div>
      <p>
        {report.source_candidates} source · {report.review_records} records · {report.stale} stale ·{" "}
        structural {report.structural_valid ? "ok" : "problems"} · alpha-ready{" "}
        {report.external_alpha_ready ? "yes" : "no"}
      </p>
      {report.problems.length > 0 && (
        <ul className="list-disc pl-5 text-amber-400">
          {report.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
