import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CheckSquare, ChevronDown, ChevronRight, Square, X } from "lucide-react";
import { toast } from "sonner";
import { KnowledgeApiError, knowledgeApi } from "@/lib/knowledge-admin/api";
import type { GroupRow, UpdateRow } from "@/lib/knowledge-admin/types";
import { useAuth } from "@/hooks/useAuth";
import { ConfidenceBadge, ErrorBanner, FlagChip, ProviderBadge, SkeletonRow } from "./shared";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ReviewPanel } from "./ReviewPanel";
import { cn } from "@/lib/utils";

/**
 * Patch Review Queue.
 * Filters persist in URL query. Groups from GET /updates render in server
 * order (patch_notes first, then confidence desc — "Priority" sort).
 * Individual Review/Approve opens the ReviewPanel drawer (strict mode etc.
 * unchanged). Bulk selection acts only on VISIBLE pending groups on this
 * page and calls the existing per-group endpoints sequentially — there is
 * no "approve all matching filters across pages".
 */
export default function KnowledgeQueue() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const approvedBy = user?.email ?? "unknown@mogsy";

  const q = {
    status: params.get("status") ?? "PENDING",
    provider: params.get("provider") ?? "",
    champion: params.get("champion") ?? "",
    property: params.get("property") ?? "",
    patch_version: params.get("patch_version") ?? "",
    confidence_min: params.get("confidence_min") ? Number(params.get("confidence_min")) : undefined,
  };
  const [limit] = useState(50);
  const offset = Number(params.get("offset") ?? 0);

  const listQ = useQuery({
    queryKey: ["knowledge", "updates", q, offset, limit],
    queryFn: () =>
      knowledgeApi.listUpdates({
        status: q.status,
        provider: q.provider || undefined,
        champion: q.champion || undefined,
        property: q.property || undefined,
        patch_version: q.patch_version || undefined,
        confidence_min: q.confidence_min,
        limit,
        offset,
      }),
  });

  const [openId, setOpenId] = useState<number | null>(null);

  const updatesByGroup = useMemo(() => {
    const map = new Map<string, UpdateRow[]>();
    (listQ.data?.updates ?? []).forEach((u) => {
      const arr = map.get(u.group_key) ?? [];
      arr.push(u);
      map.set(u.group_key, arr);
    });
    return map;
  }, [listQ.data]);

  const groups = useMemo(() => listQ.data?.groups ?? [], [listQ.data]);
  // Bulk selection only makes sense on PENDING items (others can't be approved).
  const bulkEnabled = q.status === "PENDING";

  // ── Selection state (visible groups only) ──────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visibleKeys = useMemo(() => new Set(groups.map((g) => g.group_key)), [groups]);

  // Reconcile after any refresh/filter change: drop selected keys that are no
  // longer visible so we never act on a stale group_key.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const k of prev) if (visibleKeys.has(k)) next.add(k);
      return next.size === prev.size ? prev : next;
    });
  }, [visibleKeys]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const selectAllVisible = () => setSelected(new Set(visibleKeys));
  const clearSelection = () => setSelected(new Set());

  const selectedGroups = useMemo(
    () => groups.filter((g) => selected.has(g.group_key)),
    [groups, selected],
  );
  const selectedRankCount = useMemo(
    () => selectedGroups.reduce((n, g) => n + (g.update_ids?.length ?? 0), 0),
    [selectedGroups],
  );

  // ── Bulk action runner (sequential, partial-failure aware) ─────────────────
  type BulkResult = { key: string; label: string; ok: boolean; error?: string };
  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const runBulk = async (action: "approve" | "reject") => {
    setConfirm(null);
    setRunning(true);
    setResults(null);
    const targets = [...selectedGroups];
    setProgress({ done: 0, total: targets.length });
    const out: BulkResult[] = [];

    for (const g of targets) {
      const label = `${g.champion} ${g.ability_key ?? ""} ${g.property}`.trim();
      const ids = g.update_ids ?? [];
      try {
        if (action === "approve") {
          const anchor = ids[0];
          if (anchor == null) throw new Error("No pending updates in group");
          // Whole progression batch, real write (never dry-run for bulk).
          await knowledgeApi.approveProgression(anchor, { dry_run: false, approved_by: approvedBy });
        } else {
          // Reject is per proposed-update id; reject every rank in the group.
          for (const id of ids) {
            await knowledgeApi.reject(id, "Bulk rejected via Review Queue");
          }
        }
        out.push({ key: g.group_key, label, ok: true });
      } catch (e) {
        const msg =
          e instanceof KnowledgeApiError ? e.detail : e instanceof Error ? e.message : "Unknown error";
        out.push({ key: g.group_key, label, ok: false, error: msg });
      }
      setProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
    }

    setResults(out);
    setRunning(false);
    setProgress(null);

    const okCount = out.filter((r) => r.ok).length;
    const failCount = out.length - okCount;
    if (failCount === 0) {
      toast.success(`${action === "approve" ? "Approved" : "Rejected"} ${okCount} group${okCount === 1 ? "" : "s"}`);
    } else if (okCount === 0) {
      toast.error(`All ${failCount} ${action}s failed`);
    } else {
      toast.warning(`${okCount} ${action}d, ${failCount} failed`);
    }

    // Refresh queue + Approved Changes side panel; drop successful selections.
    await listQ.refetch();
    qc.invalidateQueries({ queryKey: ["knowledge", "apply-history"] });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of out) if (r.ok) next.delete(r.key);
      return next;
    });
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("offset");
    setParams(next, { replace: true });
  };

  const allVisibleSelected = groups.length > 0 && selected.size === groups.length;

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-2 text-xs">
        <FilterSelect label="Provider" value={q.provider} onChange={(v) => setFilter("provider", v)} options={["", "patch_notes", "wiki"]} />
        <FilterText label="Champion" value={q.champion} onChange={(v) => setFilter("champion", v)} placeholder="e.g. Draven" />
        <FilterSelect label="Property" value={q.property} onChange={(v) => setFilter("property", v)} options={["", "cooldown", "mana_cost", "range"]} />
        <FilterText label="Patch" value={q.patch_version} onChange={(v) => setFilter("patch_version", v)} placeholder="26.13" />
        <FilterText label="Conf ≥" value={q.confidence_min ? String(q.confidence_min) : ""} onChange={(v) => setFilter("confidence_min", v)} placeholder="0.70" />
        <FilterSelect label="Status" value={q.status} onChange={(v) => setFilter("status", v)} options={["PENDING", "APPROVED", "REJECTED", "ALL"]} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {listQ.data ? (
            <span>{listQ.data.total} matching · {groups.length} groups on this page</span>
          ) : "Loading…"}
          {bulkEnabled && groups.length > 0 && (
            <button
              onClick={allVisibleSelected ? clearSelection : selectAllVisible}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-secondary"
            >
              {allVisibleSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allVisibleSelected ? "Clear selection" : "Select all visible"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setFilter("offset", String(Math.max(0, offset - limit)))}
            className="rounded border border-border px-2 py-1 disabled:opacity-30"
          >‹ prev</button>
          <button
            disabled={!listQ.data || offset + limit >= listQ.data.total}
            onClick={() => setFilter("offset", String(offset + limit))}
            className="rounded border border-border px-2 py-1 disabled:opacity-30"
          >next ›</button>
        </div>
      </div>

      {listQ.error && <ErrorBanner error={listQ.error} onRetry={() => listQ.refetch()} />}

      {listQ.isLoading && (
        <div className="space-y-1.5">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} className="h-14" />)}</div>
      )}

      {!listQ.isLoading && groups.length === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center text-emerald-300 text-sm font-semibold">
          Queue clear 🎉 — head to <a href="/admin/knowledge/rundown" className="underline">Patch Rundown</a>.
        </div>
      )}

      <ul className="space-y-1.5">
        {groups.map((g) => (
          <GroupItem
            key={g.group_key}
            group={g}
            updates={updatesByGroup.get(g.group_key) ?? []}
            onReview={(id) => setOpenId(id)}
            selectable={bulkEnabled}
            selected={selected.has(g.group_key)}
            onToggleSelect={() => toggle(g.group_key)}
          />
        ))}
      </ul>

      {/* Bulk results (partial failures shown explicitly) */}
      {results && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-extrabold uppercase tracking-wider text-muted-foreground">Bulk result</span>
            <button onClick={() => setResults(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="space-y-0.5">
            {results.map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                <span className={r.ok ? "text-emerald-300" : "text-destructive"}>{r.ok ? "✓" : "✗"}</span>
                <span className="font-semibold">{r.label}</span>
                {!r.ok && r.error && <span className="text-destructive/90">— {r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bulk action bar */}
      {bulkEnabled && selected.size > 0 && (
        <div className="sticky bottom-3 z-10">
          <div className="rounded-xl border border-primary/40 bg-card/95 backdrop-blur p-3 flex items-center gap-3 shadow-lg">
            <span className="text-sm font-bold text-foreground">
              {selected.size} group{selected.size === 1 ? "" : "s"} selected
              <span className="text-muted-foreground font-normal"> · {selectedRankCount} rank update{selectedRankCount === 1 ? "" : "s"}</span>
            </span>
            {running && progress && (
              <span className="text-xs text-muted-foreground tabular-nums">{progress.done}/{progress.total}…</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={clearSelection}
                disabled={running}
                className="rounded border border-border bg-card text-xs font-bold px-3 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Clear
              </button>
              <button
                onClick={() => setConfirm("reject")}
                disabled={running}
                className="rounded border border-destructive/40 text-destructive bg-transparent text-xs font-bold px-3 py-1.5 hover:bg-destructive/10 disabled:opacity-40"
              >
                Reject selected
              </button>
              <button
                onClick={() => setConfirm("approve")}
                disabled={running}
                className="rounded bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 disabled:opacity-40"
              >
                Approve selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog (exact count) */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-extrabold text-foreground">
              {confirm === "approve" ? "Approve" : "Reject"} {selected.size} group{selected.size === 1 ? "" : "s"}?
            </h2>
            <p className="text-sm text-muted-foreground">
              This will {confirm === "approve"
                ? `apply ${selectedRankCount} rank update${selectedRankCount === 1 ? "" : "s"} to production`
                : `reject ${selectedRankCount} pending update${selectedRankCount === 1 ? "" : "s"}`}{" "}
              across {selected.size} group{selected.size === 1 ? "" : "s"}. Each group is processed individually;
              any failures are shown afterward.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                onClick={() => runBulk(confirm)}
                className={cn(
                  "rounded px-3 py-1.5 text-sm font-bold text-primary-foreground",
                  confirm === "approve" ? "bg-primary" : "bg-destructive text-destructive-foreground",
                )}
              >
                Confirm {confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      <Sheet open={openId !== null} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
          {openId !== null && (
            <ReviewPanel
              updateId={openId}
              onClose={() => setOpenId(null)}
              onApplied={() => {
                listQ.refetch();
                qc.invalidateQueries({ queryKey: ["knowledge", "apply-history"] });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs"
      >
        {options.map((o) => <option key={o} value={o}>{o === "" ? "all" : o}</option>)}
      </select>
    </label>
  );
}
function FilterText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded border border-border bg-background px-2 py-1 text-xs w-24"
      />
    </label>
  );
}

function GroupItem({
  group,
  updates,
  onReview,
  selectable,
  selected,
  onToggleSelect,
}: {
  group: GroupRow;
  updates: UpdateRow[];
  onReview: (id: number) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const first = updates[0];
  const patch = first?.patch_version;
  const hasLowConf = updates.some((u) => u.flags?.includes("LOW_CONFIDENCE"));

  return (
    <li
      className={cn(
        "rounded-xl border bg-card overflow-hidden",
        selected ? "border-primary ring-1 ring-primary/40" : hasLowConf ? "border-amber-500/40" : "border-border",
      )}
    >
      <div className="w-full flex items-center gap-2 px-3 py-2">
        {selectable && (
          <button
            onClick={onToggleSelect}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={selected ? "Deselect group" : "Select group"}
          >
            {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
          </button>
        )}
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left flex-1 min-w-0 hover:opacity-90">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          {group.providers.map((p) => <ProviderBadge key={p} provider={p} />)}
          <span className="font-semibold text-sm text-foreground truncate">
            {group.champion} {group.ability_key ?? ""} {group.property}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">{group.rank_count} rank{group.rank_count === 1 ? "" : "s"}</span>
          {hasLowConf && <FlagChip flag="LOW_CONFIDENCE" />}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <ConfidenceBadge value={group.confidence_min} />
            {patch && <span className="text-xs font-mono text-muted-foreground">{patch}</span>}
          </div>
        </button>
      </div>
      {open && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {updates.map((u) => (
              <span key={u.id} className="rounded bg-muted px-2 py-0.5 tabular-nums">
                r{u.rank}: <span className="text-muted-foreground">{String(u.current_value)}</span> → <span className="text-emerald-300 font-bold">{String(u.proposed_value)}</span>
                {u.delta_pct !== null && u.delta_pct !== 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">({u.delta_pct > 0 ? "+" : ""}{u.delta_pct.toFixed(1)}%)</span>
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => first && onReview(first.id)}
              className="rounded bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1.5"
            >
              Review / Approve →
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
