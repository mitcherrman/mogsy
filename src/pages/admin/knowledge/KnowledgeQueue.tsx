import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type { GroupRow, UpdateRow } from "@/lib/knowledge-admin/types";
import { ConfidenceBadge, ErrorBanner, FlagChip, ProviderBadge, SkeletonRow } from "./shared";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ReviewPanel } from "./ReviewPanel";
import { cn } from "@/lib/utils";

/**
 * Patch Review Queue.
 * Filters persist in URL query. Groups from GET /updates render in server
 * order (patch_notes first, then confidence desc — "Priority" sort).
 * Approve/Investigate/Reject open the ReviewPanel drawer — this page
 * never writes directly.
 */
export default function KnowledgeQueue() {
  const [params, setParams] = useSearchParams();

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

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("offset");
    setParams(next, { replace: true });
  };

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
        <div>
          {listQ.data ? (
            <>
              {listQ.data.total} matching · {listQ.data.groups.length} groups on this page
            </>
          ) : "Loading…"}
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

      {!listQ.isLoading && (listQ.data?.groups?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center text-emerald-300 text-sm font-semibold">
          Queue clear 🎉 — head to <a href="/admin/knowledge/rundown" className="underline">Patch Rundown</a>.
        </div>
      )}

      <ul className="space-y-1.5">
        {(listQ.data?.groups ?? []).map((g) => (
          <GroupItem
            key={g.group_key}
            group={g}
            updates={updatesByGroup.get(g.group_key) ?? []}
            onReview={(id) => setOpenId(id)}
          />
        ))}
      </ul>

      <Sheet open={openId !== null} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
          {openId !== null && (
            <ReviewPanel
              updateId={openId}
              onClose={() => setOpenId(null)}
              onApplied={() => listQ.refetch()}
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
}: {
  group: GroupRow;
  updates: UpdateRow[];
  onReview: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const first = updates[0];
  const patch = first?.patch_version;
  const hasLowConf = updates.some((u) => u.flags?.includes("LOW_CONFIDENCE"));

  return (
    <li className={cn("rounded-xl border bg-card overflow-hidden", hasLowConf ? "border-amber-500/40" : "border-border")}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/40"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {group.providers.map((p) => <ProviderBadge key={p} provider={p} />)}
        <span className="font-semibold text-sm text-foreground">
          {group.champion} {group.ability_key ?? ""} {group.property}
        </span>
        <span className="text-xs text-muted-foreground">{group.rank_count} rank{group.rank_count === 1 ? "" : "s"}</span>
        {hasLowConf && <FlagChip flag="LOW_CONFIDENCE" />}
        <div className="ml-auto flex items-center gap-2">
          <ConfidenceBadge value={group.confidence_min} />
          {patch && <span className="text-xs font-mono text-muted-foreground">{patch}</span>}
        </div>
      </button>
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