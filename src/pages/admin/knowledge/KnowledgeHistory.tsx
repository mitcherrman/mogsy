import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, Bot, User } from "lucide-react";
import { toast } from "sonner";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type { LedgerEvent } from "@/lib/knowledge-admin/types";
import { ErrorBanner, relativeTime } from "./shared";
import { cn } from "@/lib/utils";

/**
 * Patch History — the chronological Mogzy database ledger plus the
 * patch-level automation report. Generated entirely from durable backend
 * history (proposals, edits, applies, undos, automation decisions).
 */

const EVENT_TONES: Record<string, string> = {
  AUTO_APPLIED: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  MANUALLY_APPLIED: "text-emerald-200 border-emerald-500/30 bg-emerald-500/5",
  HELD: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  VALIDATION_FAILED_ROLLED_BACK: "text-red-300 border-red-500/40 bg-red-500/10",
  APPLY_FAILED: "text-red-300 border-red-500/40 bg-red-500/10",
  UNDONE: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  REJECTED: "text-red-200 border-red-500/30 bg-red-500/5",
  EDITED: "text-violet-300 border-violet-500/40 bg-violet-500/10",
  PROPOSED: "text-muted-foreground border-border bg-muted/20",
  ELIGIBLE_DRY_RUN: "text-primary border-primary/40 bg-primary/10",
};

const STATUS_FILTERS = [
  { key: "", label: "All history" },
  { key: "HELD", label: "Needs review" },
  { key: "AUTO_APPLIED", label: "Auto applied" },
  { key: "MANUALLY_APPLIED", label: "Manually applied" },
  { key: "APPLY_FAILED", label: "Failed" },
  { key: "VALIDATION_FAILED_ROLLED_BACK", label: "Rolled back" },
  { key: "REJECTED", label: "Rejected" },
  { key: "UNDONE", label: "Undone" },
];

export default function KnowledgeHistory() {
  const qc = useQueryClient();
  const [patch, setPatch] = useState("");
  const [champion, setChampion] = useState("");
  const [prop, setProp] = useState("");
  const [actorType, setActorType] = useState<"" | "automatic" | "manual">("");
  const [eventType, setEventType] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const ledgerQ = useQuery({
    queryKey: ["knowledge", "ledger", patch, champion, prop, actorType, eventType],
    queryFn: () => knowledgeApi.ledger({
      patch_version: patch || undefined,
      champion: champion || undefined,
      property: prop || undefined,
      actor_type: actorType || undefined,
      event_type: eventType || undefined,
      limit: 300,
    }),
  });

  const reportQ = useQuery({
    queryKey: ["knowledge", "automation-report", patch],
    queryFn: () => knowledgeApi.automationReport(patch),
    enabled: !!patch,
  });

  const undoMut = useMutation({
    mutationFn: (historyId: number) => knowledgeApi.undoApply(historyId),
    onSuccess: (res) => {
      toast.success(`Undone${res.after_value ? `: restored ${res.after_value}` : ""}`);
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Undo failed"),
  });

  const events = useMemo(() => {
    const all = ledgerQ.data?.events ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((e) =>
      [e.entity_name, e.ability_key, e.property, e.evidence, e.reason, e.actor]
        .some((v) => v && String(v).toLowerCase().includes(q)));
  }, [ledgerQ.data, search]);

  return (
    <div className="space-y-4">
      {/* Patch report summary (when a patch filter is active) */}
      {patch && reportQ.data && (
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Patch {reportQ.data.patch_version} — automation report
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <ReportStat label="Auto applied" value={reportQ.data.summary.automatically_applied} tone="text-emerald-300" />
            <ReportStat label="Manually applied" value={reportQ.data.summary.manually_applied} tone="text-emerald-200" />
            <ReportStat label="Held for review" value={reportQ.data.summary.held_for_review} tone="text-amber-300" />
            <ReportStat label="Rejected" value={reportQ.data.summary.rejected} tone="text-red-200" />
            <ReportStat label="Rolled back" value={reportQ.data.summary.validation_failed_rolled_back} tone="text-red-300" />
            <ReportStat label="Apply failed" value={reportQ.data.summary.apply_failed} tone="text-red-300" />
            <ReportStat label="Undone later" value={reportQ.data.summary.undone_later} tone="text-sky-300" />
            <ReportStat label="Still active (auto)" value={reportQ.data.summary.still_active_auto} tone="text-foreground" />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input value={patch} onChange={(e) => setPatch(e.target.value)} placeholder="Patch (e.g. 26.13)"
               className="rounded border border-border bg-background px-2 py-1 w-28" />
        <input value={champion} onChange={(e) => setChampion(e.target.value)} placeholder="Champion"
               className="rounded border border-border bg-background px-2 py-1 w-28" />
        <input value={prop} onChange={(e) => setProp(e.target.value)} placeholder="Property"
               className="rounded border border-border bg-background px-2 py-1 w-28" />
        <select value={actorType} onChange={(e) => setActorType(e.target.value as "" | "automatic" | "manual")}
                className="rounded border border-border bg-background px-2 py-1">
          <option value="">Auto + manual</option>
          <option value="automatic">Automatic only</option>
          <option value="manual">Manual only</option>
        </select>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1">
          {STATUS_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
               className="rounded border border-border bg-background px-2 py-1 flex-1 min-w-32" />
      </div>

      {ledgerQ.error && <ErrorBanner error={ledgerQ.error} onRetry={() => ledgerQ.refetch()} />}
      {ledgerQ.isLoading && <div className="h-24 bg-muted animate-pulse rounded-lg" />}

      {/* Chronological ledger */}
      {!ledgerQ.isLoading && events.length === 0 && (
        <p className="text-sm text-muted-foreground italic p-4 text-center">
          No history events match the current filters.
        </p>
      )}
      <ul className="space-y-1.5">
        {events.map((e, i) => (
          <LedgerRow key={`${e.event_type}-${e.timestamp}-${i}`} e={e} idx={i}
                     expanded={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)}
                     onUndo={(hid) => undoMut.mutate(hid)} undoBusy={undoMut.isPending} />
        ))}
      </ul>
    </div>
  );
}

function ReportStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-2 py-1.5">
      <div className={cn("text-base font-extrabold tabular-nums", tone)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function LedgerRow({ e, idx, expanded, onToggle, onUndo, undoBusy }: {
  e: LedgerEvent; idx: number; expanded: boolean; onToggle: () => void;
  onUndo: (historyId: number) => void; undoBusy: boolean;
}) {
  const tone = EVENT_TONES[e.event_type] ?? "text-muted-foreground border-border bg-muted/20";
  const canUndo = (e.event_type === "AUTO_APPLIED" || e.event_type === "MANUALLY_APPLIED")
    && e.active === true && typeof e.apply_history_id === "number";
  return (
    <li className="rounded-lg border border-border bg-card">
      <button onClick={onToggle}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs"
              aria-expanded={expanded} aria-controls={`ledger-detail-${idx}`}>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-extrabold uppercase whitespace-nowrap", tone)}>
          {e.event_type.replace(/_/g, " ")}
        </span>
        {e.automatic
          ? <Bot className="h-3.5 w-3.5 text-primary shrink-0" aria-label="automatic" />
          : <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="manual" />}
        <span className="font-bold truncate">
          {e.entity_name} — {e.ability_key ?? "?"} — {e.property}
        </span>
        {e.before_value !== null && e.after_value !== null && (
          <span className="tabular-nums text-muted-foreground truncate hidden sm:inline">
            {String(e.before_value)} → <span className="text-foreground">{String(e.after_value)}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0 text-muted-foreground">
          {e.patch_version && <span className="font-semibold">{e.patch_version}</span>}
          <span className="tabular-nums">{e.timestamp ? relativeTime(e.timestamp) : "—"}</span>
        </span>
      </button>
      {expanded && (
        <div id={`ledger-detail-${idx}`} className="border-t border-border px-3 py-2 space-y-1.5 text-xs">
          <div className="grid gap-1 sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Before: </span>
              <span className="font-mono">{e.before_value ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">After: </span>
              <span className="font-mono text-emerald-300">{e.after_value ?? "—"}</span>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Actor: </span>
            {e.actor ?? "—"} {e.automatic && <span className="text-primary font-bold">(automatic)</span>}
          </div>
          {e.reason && (
            <div><span className="text-muted-foreground">Reason: </span>{e.reason}</div>
          )}
          {e.evidence && (
            <div className="font-mono text-[11px] bg-muted/40 rounded px-2 py-1 break-words">
              {e.evidence}
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            {e.source_url && (
              <a href={e.source_url} target="_blank" rel="noreferrer noopener"
                 className="inline-flex items-center gap-1 text-primary hover:underline">
                Official source <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {e.active !== null && (
              <span className={cn("text-[10px] font-bold uppercase",
                                  e.active ? "text-emerald-300" : "text-muted-foreground")}>
                {e.active ? "Currently active" : "Not active"}
              </span>
            )}
            {canUndo && (
              <button onClick={() => onUndo(e.apply_history_id!)} disabled={undoBusy}
                      className="ml-auto rounded border border-border bg-background text-[11px] font-bold px-2 py-0.5 hover:bg-secondary disabled:opacity-40">
                {undoBusy ? "Undoing…" : "Undo"}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
