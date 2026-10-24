// ---------------------------------------------------------------------------
// PULSE-2B — edit one piece of Pulse content: envelope (name, schedule,
// ordering), scene payload, lifecycle actions, and a live preview
// of the real scene as it is being typed.
//
// Lifecycle buttons are offered from the same table the server enforces
// (lifecycle.ts); the server still decides. Publish is blocked here only to
// show the reasons early.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, type PulseItem } from "@/features/academy-pulse/model/pulse-types";
import {
  KIND_CATEGORIES,
  type PulseContentRecord,
  type PulseItemInput,
  type PulseItemTransition,
} from "@/lib/admin/pulse/contract";
import { allowedTransitions, effectiveStatus, STATUS_LABEL } from "@/lib/admin/pulse/lifecycle";
import { isoToLocalInput, localInputToIso, type PulseWriteResult } from "@/lib/admin/pulse/usePulseWorkspace";
import { validateItemForPublish, validateItemForSave, type PulseIssue } from "@/lib/admin/pulse/validation";

import { CheckField, DateTimeField, IssueList, Notice, NumberField, SelectField, TextField } from "./fields";
import { PulseItemPresentation, PULSE_PREVIEW_SIZES, type PulsePreviewSize } from "./PulsePresentation";
import { PulsePayloadFields } from "./PulsePayloadFields";
import { PulseStatusBadge } from "./PulseStatusBadge";

const ACTION_LABEL: Record<PulseItemTransition["action"], string> = {
  publish: "Publish now",
  schedule: "Schedule",
  unpublish: "Unpublish",
  archive: "Archive",
  "revert-to-draft": "Back to draft",
};

export function toInput(r: PulseContentRecord): PulseItemInput {
  const { id, label, payload, publishAt, expiresAt, priority, featured, note } = r;
  return { id, label, payload, publishAt, expiresAt, priority, featured, note };
}

interface Props {
  record: PulseContentRecord | null;
  initial: PulseItemInput;
  now: Date;
  busy: boolean;
  onSave(input: PulseItemInput, expectedRevision: number | null): Promise<PulseWriteResult>;
  onTransition(t: PulseItemTransition, expectedRevision: number): Promise<PulseWriteResult>;
  onClose(): void;
}

export function PulseItemEditor({ record, initial, now, busy, onSave, onTransition, onClose }: Props) {
  const [draft, setDraft] = useState<PulseItemInput>(initial);
  const [serverIssues, setServerIssues] = useState<PulseIssue[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scheduleAt, setScheduleAt] = useState(isoToLocalInput(initial.publishAt));
  const [size, setSize] = useState<PulsePreviewSize>("desktop");

  // A different record (or a reload after save) resets the form.
  useEffect(() => { setDraft(initial); setServerIssues([]); setScheduleAt(isoToLocalInput(initial.publishAt)); }, [initial]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const saveIssues = useMemo(() => validateItemForSave(draft), [draft]);
  const publishIssues = useMemo(() => validateItemForPublish(draft, now), [draft, now]);
  const issues = serverIssues.length ? serverIssues : saveIssues;
  const status = record ? effectiveStatus(record, now) : "draft";
  const actions = record ? allowedTransitions(record.state) : [];
  const kind = draft.payload.kind;
  const previewItem = useMemo<PulseItem>(() => ({ ...draft.payload, id: record?.id ?? "unsaved", provenance: "fixture" } as PulseItem), [draft.payload, record?.id]);

  async function save() {
    setResult(null);
    const r = await onSave(draft, record ? record.revision : null);
    setServerIssues(r.ok === false ? r.issues : []);
    setResult(r.ok ? { ok: true, message: record ? "Saved." : "Draft created." } : { ok: false, message: r.message });
  }

  async function transition(t: PulseItemTransition) {
    if (!record) return;
    setResult(null);
    const r = await onTransition(t, record.revision);
    setServerIssues(r.ok === false ? r.issues : []);
    setResult(r.ok ? { ok: true, message: `${ACTION_LABEL[t.action]}: done.` } : { ok: false, message: r.message });
  }

  const blockedForPublish = publishIssues.length > 0 || dirty;
  const scheduleIso = localInputToIso(scheduleAt);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="pulse-item-editor" aria-label="Edit Pulse content">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{record ? draft.label || "Untitled" : "New content"}</h3>
          <PulseStatusBadge status={status} />
          <span className="text-[11px] text-muted-foreground">{CATEGORY_LABEL[draft.payload.category]}</span>
          {dirty && <span className="text-[11px] text-amber-600 dark:text-amber-300" data-testid="pulse-editor-dirty">Unsaved changes</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Workspace name" field="label" issues={issues} value={draft.label} disabled={busy}
              onChange={(v) => setDraft({ ...draft, label: v })} hint="Only you see this." testId="pulse-field-label" />
            {KIND_CATEGORIES[kind].length > 1 && (
              <SelectField label="Category" field="category" issues={issues} value={draft.payload.category} disabled={busy}
                options={KIND_CATEGORIES[kind].map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
                onChange={(c) => setDraft({ ...draft, payload: { ...draft.payload, category: c, ...(kind === "news" ? { variant: c === "event" ? "event" : "announcement" } : {}) } as PulseItemInput["payload"] })} />
            )}
            <NumberField label="Priority" field="priority" issues={issues} value={draft.priority} min={0} max={999} disabled={busy}
              onChange={(v) => setDraft({ ...draft, priority: v ?? 0 })} hint="Lower plays first in its category." testId="pulse-field-priority" />
            <div className="flex items-end pb-1">
              <CheckField label="Featured" checked={draft.featured} disabled={busy} testId="pulse-field-featured"
                onChange={(v) => setDraft({ ...draft, featured: v })} hint="Leads its category regardless of priority." />
            </div>
            <DateTimeField label="Expires (optional)" field="expiresAt" issues={issues} value={isoToLocalInput(draft.expiresAt)} disabled={busy}
              onChange={(v) => setDraft({ ...draft, expiresAt: localInputToIso(v) })} testId="pulse-field-expires" />
            <NumberField label="Time on screen (s, optional)" field="dwellMs" issues={issues}
              value={draft.payload.dwellMs ? draft.payload.dwellMs / 1000 : null} min={6} max={30} disabled={busy}
              onChange={(v) => setDraft({ ...draft, payload: { ...draft.payload, dwellMs: v == null ? undefined : Math.round(v * 1000) } })}
              hint="Empty = the scene's default." />
            <TextField className="sm:col-span-2" label="Internal note" value={draft.note} disabled={busy} multiline
              onChange={(v) => setDraft({ ...draft, note: v })} hint="Source, reason, follow-ups. Never shown publicly." />
          </div>

          <div className="border-t pt-3">
            <h4 className="mb-2 text-xs font-semibold">Scene</h4>
            <PulsePayloadFields payload={draft.payload} issues={issues} disabled={busy}
              onChange={(payload) => setDraft({ ...draft, payload })} />
          </div>
        </div>

        <aside className="min-w-0 space-y-2" aria-label="Preview">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(PULSE_PREVIEW_SIZES) as PulsePreviewSize[]).map((s) => (
              <Button key={s} size="sm" variant={s === size ? "default" : "outline"} className="h-6 px-2 text-[10px]"
                aria-pressed={s === size} onClick={() => setSize(s)}>{s}</Button>
            ))}
          </div>
          <PulseItemPresentation item={previewItem} size={size} />
          <p className="max-w-[369px] text-[11px] text-muted-foreground">
            The real Pulse device. “Sample” marks a preview: nothing here is public until it is published and eligible.
          </p>
        </aside>
      </div>

      <IssueList issues={issues} title="Fix before saving" />
      {saveIssues.length === 0 && publishIssues.length > 0 && (
        <IssueList issues={publishIssues} title="Before this can go live" />
      )}

      <footer className="flex flex-wrap items-end gap-2 border-t pt-3">
        <Button size="sm" disabled={busy || !dirty || saveIssues.length > 0} onClick={() => void save()} data-testid="pulse-editor-save">
          {record ? "Save" : "Create draft"}
        </Button>
        {record && actions.includes("publish") && (
          <Button size="sm" variant="secondary" disabled={busy || blockedForPublish} onClick={() => void transition({ action: "publish" })}
            data-testid="pulse-action-publish" title={dirty ? "Save first" : undefined}>
            {ACTION_LABEL.publish}
          </Button>
        )}
        {record && actions.includes("schedule") && (
          <div className="flex items-end gap-1">
            <DateTimeField label="Publish at" value={scheduleAt} onChange={setScheduleAt} disabled={busy} testId="pulse-schedule-at" />
            <Button size="sm" variant="secondary" data-testid="pulse-action-schedule"
              disabled={busy || blockedForPublish || !scheduleIso || Date.parse(scheduleIso) <= now.getTime()}
              onClick={() => scheduleIso && void transition({ action: "schedule", publishAt: scheduleIso })}>
              {ACTION_LABEL.schedule}
            </Button>
          </div>
        )}
        {record && (["unpublish", "revert-to-draft", "archive"] as const).filter((a) => actions.includes(a)).map((a) => (
          <Button key={a} size="sm" variant="outline" disabled={busy} onClick={() => void transition({ action: a })} data-testid={`pulse-action-${a}`}>
            {ACTION_LABEL[a]}
          </Button>
        ))}
        <Notice result={result} />
      </footer>
      {record && (
        <p className="text-[11px] text-muted-foreground">
          Revision {record.revision} · updated {new Date(record.updatedAt).toLocaleString()}
          {record.publishedAt && ` · first published ${new Date(record.publishedAt).toLocaleString()}`}
          {" · "}{STATUS_LABEL[status]}
        </p>
      )}
    </section>
  );
}
