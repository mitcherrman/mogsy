// PULSE-2B — the content list: everything the owner has authored, its
// status right now, and whether the public Home Hub would actually play it.
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL } from "@/features/academy-pulse/model/pulse-types";
import type { PulseEffectiveStatus, PulseItemInput, PulseWorkspaceSnapshot } from "@/lib/admin/pulse/contract";
import { effectiveStatus } from "@/lib/admin/pulse/lifecycle";
import { compareRecords, EXCLUSION_LABEL, projectPublicPulse } from "@/lib/admin/pulse/projection";
import { newItemInput, TEMPLATE_LABEL, type PulseTemplateId } from "@/lib/admin/pulse/templates";
import type { PulseWorkspaceState } from "@/lib/admin/pulse/usePulseWorkspace";

import { PulseItemEditor, toInput } from "./PulseItemEditor";
import { PulseStatusBadge } from "./PulseStatusBadge";

type Filter = "active" | "all" | PulseEffectiveStatus;

interface Props {
  snapshot: PulseWorkspaceSnapshot;
  now: Date;
  busy: boolean;
  write: PulseWorkspaceState["write"];
}

export function PulseContentPanel({ snapshot, now, busy, write }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState<PulseItemInput | null>(null);
  const [filter, setFilter] = useState<Filter>("active");

  const projection = useMemo(() => projectPublicPulse(snapshot, now), [snapshot, now]);
  const excluded = useMemo(() => new Map(projection.excluded.map((e) => [e.id, e.reason])), [projection]);
  const rows = useMemo(() => [...snapshot.items]
    .sort((a, b) => (a.payload.category === b.payload.category ? compareRecords(a, b) : a.payload.category.localeCompare(b.payload.category)))
    .map((r) => ({ r, status: effectiveStatus(r, now) }))
    .filter(({ status }) => filter === "all" || (filter === "active" ? status !== "archived" : status === filter)), [snapshot.items, now, filter]);

  const record = snapshot.items.find((i) => i.id === selected) ?? null;
  // Reset the editor only when the record itself changes (id or revision), not on unrelated reloads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => (record ? toInput(record) : creating), [record?.id, record?.revision, creating]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs">
          <span className="sr-only">Filter</span>
          <select className="rounded-md border bg-background px-2 py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}
            data-testid="pulse-content-filter">
            <option value="active">Not archived</option>
            <option value="all">All</option>
            {(["live", "scheduled", "draft", "expired", "unpublished", "archived"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <span className="text-[11px] text-muted-foreground">New:</span>
        {(Object.keys(TEMPLATE_LABEL) as PulseTemplateId[]).map((t) => (
          <Button key={t} size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} data-testid={`pulse-new-${t}`}
            onClick={() => { setSelected(null); setCreating(newItemInput(t)); }}>
            {TEMPLATE_LABEL[t]}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs" data-testid="pulse-content-table">
          <thead className="bg-muted/40 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Content</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">On the Home Hub</th>
              <th className="px-3 py-2 font-medium">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nothing here.</td></tr>
            )}
            {rows.map(({ r, status }) => {
              const reason = excluded.get(r.id);
              return (
                <tr key={r.id} className={r.id === selected ? "bg-primary/5" : "border-t"} data-testid={`pulse-row-${r.id}`}>
                  <td className="px-3 py-2">
                    <button type="button" className="text-left font-medium underline-offset-2 hover:underline"
                      onClick={() => { setCreating(null); setSelected(r.id); }}>
                      {r.label}
                    </button>
                  </td>
                  <td className="px-3 py-2">{CATEGORY_LABEL[r.payload.category]}</td>
                  <td className="px-3 py-2"><PulseStatusBadge status={status} /></td>
                  <td className="px-3 py-2" data-testid="pulse-row-eligibility">
                    {reason ? <span className="text-muted-foreground">{EXCLUSION_LABEL[reason]}</span>
                      : <span className="font-semibold text-emerald-700 dark:text-emerald-300">Playing</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.featured ? "Featured · " : ""}{r.priority}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {initial && (
        <PulseItemEditor
          record={record}
          initial={initial}
          campaigns={snapshot.campaigns}
          now={now}
          busy={busy}
          onClose={() => { setSelected(null); setCreating(null); }}
          onSave={async (input, rev) => {
            let createdId: string | null = null;
            const res = await write(async (repo) => { createdId = (await repo.saveItem(input, rev)).id; });
            if (res.ok && !record && createdId) { setCreating(null); setSelected(createdId); }
            return res;
          }}
          onTransition={(t, rev) => write((repo) => repo.transitionItem(record!.id, t, rev))}
        />
      )}
    </div>
  );
}
