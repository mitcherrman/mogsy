// ---------------------------------------------------------------------------
// PULSE-2B — partner records: sponsor campaigns and creator spotlights, edited
// directly in PULSE-2C's record shape (partnerContract.ts mirrors #153).
//
// Lifecycle on 2C's statuses: draft → pending-review → approved ⇄ paused →
// ended / rejected → draft. Actions that make paid promotion public (sponsor
// or paid/affiliate creator approve / resume, editing it while approved or
// paused, adding a sponsor host) are marked "fresh code": the server asks for
// a fresh MFA (policy.ts). Release gates are read-only here; only a reviewed
// migration opens them.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PARTNER_TRANSITIONS,
  type EditableCreatorRecord,
  type EditableSponsorRecord,
  type PartnerAction,
  type PartnerCompensation,
  type PulsePartnerInput,
  type PulsePartnerRecord,
  type PulseWorkspaceSnapshot,
} from "@/lib/admin/pulse/contract";
import type { PartnerStatus } from "@/lib/admin/pulse/partnerContract";
import { gateIssue, partnerPreviewItem, toPartnerInput, validatePartnerForApproval, validatePartnerSave } from "@/lib/admin/pulse/partnerRules";
import { FRESH_HINT, hostAllowlistLevel, partnerSaveLevel, partnerTransitionLevel } from "@/lib/admin/pulse/policy";
import { EXCLUSION_LABEL, partnerExclusion } from "@/lib/admin/pulse/projection";
import { isoToLocalInput, localInputToIso, type PulseWorkspaceState } from "@/lib/admin/pulse/usePulseWorkspace";
import type { PulseIssue } from "@/lib/admin/pulse/validation";
import { cn } from "@/lib/utils";

import { DateTimeField, IssueList, Notice, NumberField, SelectField, TextField } from "./fields";
import { PulseItemPresentation } from "./PulsePresentation";

const STATUS_TONE: Record<PartnerStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  "pending-review": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  paused: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  rejected: "bg-destructive/15 text-destructive",
  ended: "bg-zinc-500/15 text-zinc-500",
};

const ACTION_LABEL: Record<PartnerAction, string> = {
  submit: "Submit for review", approve: "Approve", reject: "Reject", pause: "Pause", resume: "Resume", end: "End", revise: "Back to draft",
};
const NEEDS_NOTE: ReadonlySet<PartnerAction> = new Set(["reject", "pause", "end"]);

function FreshBadge() {
  return <span className="ml-1 text-[10px] font-normal opacity-80" title={FRESH_HINT} data-testid="pulse-fresh-badge">· fresh code</span>;
}

function blankSponsor(): PulsePartnerInput {
  const record: EditableSponsorRecord = {
    id: "", sponsorName: "", campaignTitle: "", tagline: "", ctaLabel: "Learn more", artwork: { url: "", alt: "" },
    destinationUrl: "", approvedHosts: [], disclosure: { label: "Sponsored", advertiser: "" }, window: { startsAt: "", endsAt: "" },
    placement: { surfaces: ["academy-pulse"] },
  };
  return { type: "sponsor", record, compensation: null, note: "" };
}

function blankCreator(): PulsePartnerInput {
  const record: EditableCreatorRecord = { id: "", creatorName: "", creatorTag: "Creator", media: { platform: "youtube", url: "", title: "" } };
  return { type: "creator", record, compensation: "unpaid", note: "" };
}

function SponsorFields({ value, onChange, issues, disabled, isNew }: {
  value: Extract<PulsePartnerInput, { type: "sponsor" }>; onChange(v: PulsePartnerInput): void; issues: PulseIssue[]; disabled: boolean; isNew: boolean;
}) {
  const r = value.record;
  // Raw text, so a typed comma isn't swallowed by the round-trip through the array.
  const [hostsText, setHostsText] = useState(r.approvedHosts.join(", "));
  const set = (patch: Partial<EditableSponsorRecord>) => {
    const record = { ...r, ...patch };
    // The disclosure always names the sponsor shown (2C rule); keep it in step.
    onChange({ ...value, record: { ...record, disclosure: { label: "Sponsored", advertiser: record.sponsorName } } });
  };
  const c = { issues, disabled };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField {...c} label="Record id" field="id" value={r.id} disabled={disabled || !isNew} onChange={(v) => set({ id: v })}
        hint="Letters, digits, - and _. Fixed once created." testId="pulse-partner-id" />
      <TextField {...c} label="Sponsor name" field="sponsorName" value={r.sponsorName} onChange={(v) => set({ sponsorName: v })} testId="pulse-partner-sponsor-name" />
      <TextField {...c} label="Campaign title" field="campaignTitle" value={r.campaignTitle} onChange={(v) => set({ campaignTitle: v })} />
      <TextField {...c} label="Button label" field="ctaLabel" value={r.ctaLabel} onChange={(v) => set({ ctaLabel: v })} />
      <TextField {...c} className="sm:col-span-2" label="Tagline" field="tagline" value={r.tagline} onChange={(v) => set({ tagline: v })} />
      <TextField {...c} label="Artwork (same-origin path or i.ytimg.com)" field="artworkUrl" value={r.artwork.url}
        onChange={(v) => set({ artwork: { ...r.artwork, url: v } })} placeholder="/assets/…" />
      <TextField {...c} label="Artwork alt text" field="artworkAlt" value={r.artwork.alt} onChange={(v) => set({ artwork: { ...r.artwork, alt: v } })} />
      <TextField {...c} label="Destination (https)" field="destinationUrl" value={r.destinationUrl} onChange={(v) => set({ destinationUrl: v })}
        placeholder="https://" testId="pulse-partner-destination" />
      <TextField {...c} label="Approved hosts (comma-separated)" field="approvedHosts" value={hostsText}
        onChange={(v) => { setHostsText(v); set({ approvedHosts: v.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean) }); }}
        hint="Exact hostnames. Each must also be on the global allowlist below." testId="pulse-partner-hosts" />
      <DateTimeField {...c} label="Flight starts" field="window" value={isoToLocalInput(r.window.startsAt || null)}
        onChange={(v) => set({ window: { ...r.window, startsAt: localInputToIso(v) ?? "" } })} testId="pulse-partner-start" />
      <DateTimeField {...c} label="Flight ends (≤ 92 days)" value={isoToLocalInput(r.window.endsAt || null)}
        onChange={(v) => set({ window: { ...r.window, endsAt: localInputToIso(v) ?? "" } })} testId="pulse-partner-end" />
      <p className="sm:col-span-2 text-[11px] text-muted-foreground">
        Disclosure: <strong>Sponsored · {r.sponsorName || "—"}</strong> (fixed by PULSE-2C; the scene prints the SPONSORED band). Placement: Academy Pulse.
      </p>
    </div>
  );
}

function CreatorFields({ value, onChange, issues, disabled, isNew }: {
  value: Extract<PulsePartnerInput, { type: "creator" }>; onChange(v: PulsePartnerInput): void; issues: PulseIssue[]; disabled: boolean; isNew: boolean;
}) {
  const r = value.record;
  const m = r.media;
  const set = (patch: Partial<EditableCreatorRecord>) => onChange({ ...value, record: { ...r, ...patch } });
  const c = { issues, disabled };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField {...c} label="Record id" field="id" value={r.id} disabled={disabled || !isNew} onChange={(v) => set({ id: v })}
        hint="Letters, digits, - and _. Fixed once created." testId="pulse-partner-id" />
      <SelectField {...c} label="Relationship (never public)" value={value.compensation}
        options={[{ value: "unpaid", label: "Unpaid spotlight" }, { value: "paid", label: "Paid partnership" }, { value: "affiliate", label: "Affiliate" }]}
        onChange={(compensation: PartnerCompensation) => onChange({ ...value, compensation })}
        hint="Paid and affiliate are paid promotion: fresh code to approve, and held until disclosure renders." testId="pulse-partner-compensation" />
      <TextField {...c} label="Creator name" field="creatorName" value={r.creatorName} onChange={(v) => set({ creatorName: v })} testId="pulse-partner-creator-name" />
      <TextField {...c} label="Tag" field="creatorTag" value={r.creatorTag} onChange={(v) => set({ creatorTag: v })} />
      <SelectField {...c} label="Platform" value={m.platform}
        options={[{ value: "youtube", label: "YouTube video / Short" }, { value: "twitch", label: "Twitch channel" }]}
        onChange={(platform) => set({ media: platform === "youtube" ? { platform, url: "", title: m.title } : { platform, channelUrl: "", title: m.title } })} />
      {m.platform === "youtube"
        ? <TextField {...c} label="YouTube URL" field="mediaUrl" value={m.url} onChange={(v) => set({ media: { ...m, url: v } })} testId="pulse-partner-media-url" />
        : <TextField {...c} label="Twitch channel URL" field="mediaUrl" value={m.channelUrl} onChange={(v) => set({ media: { ...m, channelUrl: v } })}
            hint="LIVE and viewers come only from a trusted server reader, never from this form." testId="pulse-partner-media-url" />}
      <TextField {...c} className="sm:col-span-2" label="What the spotlight says" field="mediaTitle" value={m.title} onChange={(v) => set({ media: { ...m, title: v } })} />
      {m.platform === "youtube" && (
        <NumberField {...c} label="Duration (s, optional)" value={m.durationSeconds ?? null} min={1}
          onChange={(v) => set({ media: { ...m, durationSeconds: v == null ? undefined : v } })} />
      )}
      <TextField {...c} label="Custom still (optional)" field="thumbnailUrl" value={m.thumbnailUrl ?? ""}
        onChange={(v) => set({ media: { ...m, thumbnailUrl: v.trim() === "" ? undefined : v } })} />
      <DateTimeField {...c} label="Feature from (optional)" field="window" value={isoToLocalInput(r.activeFrom ?? null)}
        onChange={(v) => set({ activeFrom: localInputToIso(v) ?? undefined })} />
      <DateTimeField {...c} label="Feature until (optional)" value={isoToLocalInput(r.activeUntil ?? null)}
        onChange={(v) => set({ activeUntil: localInputToIso(v) ?? undefined })} />
      <p className="sm:col-span-2 text-[11px] text-muted-foreground">Creator challenges are omitted: no Mogzy challenge is reproducible and score-authoritative yet (PULSE-2C).</p>
    </div>
  );
}

function PartnerEditor({ partner, initial, snapshot, now, busy, write, onDone }: {
  partner: PulsePartnerRecord | null; initial: PulsePartnerInput; snapshot: PulseWorkspaceSnapshot; now: Date; busy: boolean;
  write: PulseWorkspaceState["write"]; onDone(created?: string): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [serverIssues, setServerIssues] = useState<PulseIssue[]>([]);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { setDraft(initial); setServerIssues([]); }, [initial]);

  const saveIssues = useMemo(() => validatePartnerSave(draft), [draft]);
  const approvalIssues = useMemo(() => validatePartnerForApproval(draft, snapshot.sponsorHostAllowlist, now), [draft, snapshot.sponsorHostAllowlist, now]);
  const issues = serverIssues.length ? serverIssues : saveIssues;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const status = partner?.record.status ?? "draft";
  const actions = (Object.keys(PARTNER_TRANSITIONS) as PartnerAction[]).filter((a) => PARTNER_TRANSITIONS[a].from.includes(status));
  const gate = partner ? gateIssue(partner, snapshot.gates) : gateIssue({ type: draft.type, compensation: draft.compensation }, snapshot.gates);
  const exclusion = partner ? partnerExclusion(partner, snapshot, now) : null;
  const saveFresh = partnerSaveLevel(partner, draft) === "fresh";
  const preview = useMemo(() => partnerPreviewItem(draft), [draft]);

  async function save() {
    const r = await write((repo) => repo.savePartner(draft, partner));
    setServerIssues(r.issues);
    setResult(r.ok ? { ok: true, message: partner ? (saveFresh ? "Saved; it went back to review." : "Saved.") : "Draft created." } : { ok: false, message: r.message });
    if (r.ok && !partner) onDone(draft.record.id);
  }
  async function act(a: PartnerAction) {
    if (!partner) return;
    const r = await write((repo) => repo.transitionPartner(partner, a, note));
    setServerIssues(r.issues);
    setResult(r.ok ? { ok: true, message: `${ACTION_LABEL[a]}: done.` } : { ok: false, message: r.message });
    if (r.ok) setNote("");
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="pulse-partner-editor" aria-label="Edit partner record">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {partner ? partner.record.id : `New ${draft.type} record`}
          <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold uppercase", STATUS_TONE[status])} data-testid="pulse-partner-status">{status}</span>
        </h3>
        <Button size="sm" variant="ghost" onClick={() => onDone()}>Close</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3">
          {draft.type === "sponsor"
            ? <SponsorFields value={draft} onChange={setDraft} issues={issues} disabled={busy} isNew={!partner} />
            : <CreatorFields value={draft} onChange={setDraft} issues={issues} disabled={busy} isNew={!partner} />}
          <TextField label="Internal note (contract, contact — never public)" value={draft.note} disabled={busy} multiline
            onChange={(v) => setDraft({ ...draft, note: v })} />
        </div>
        <aside className="min-w-0 space-y-2" aria-label="Preview">
          <PulseItemPresentation item={preview} size="desktop" />
          <p className="max-w-[369px] text-[11px] text-muted-foreground">
            Preview approximates PULSE-2C's adapter until #153 is integrated; always labelled “Sample”, links nowhere.
          </p>
        </aside>
      </div>

      <IssueList issues={issues} title="Fix before saving" />
      {saveIssues.length === 0 && approvalIssues.length > 0 && <IssueList issues={approvalIssues} title="Before this can be approved" />}
      {gate && (
        <p className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-[11px]" data-testid="pulse-partner-gate">
          <Lock className="h-3.5 w-3.5" aria-hidden /> {gate} Approved records stay in the database until a reviewed migration opens the gate.
        </p>
      )}
      {partner && (
        <p className="text-[11px]" data-testid="pulse-partner-eligibility">
          On the Home Hub: {exclusion ? <span className="text-muted-foreground">{EXCLUSION_LABEL[exclusion]}</span>
            : <strong className="text-emerald-700 dark:text-emerald-300">Emitted to the public read</strong>}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <Button size="sm" disabled={busy || !dirty || saveIssues.length > 0} onClick={() => void save()} data-testid="pulse-partner-save"
          title={saveFresh ? FRESH_HINT : undefined}>
          {partner ? "Save" : "Create draft"}{saveFresh && <FreshBadge />}
        </Button>
        {partner && actions.some((a) => NEEDS_NOTE.has(a)) && (
          <div className="w-56">
            <TextField label="Decision note" value={note} onChange={setNote} disabled={busy} hint="Required to reject, pause or end." testId="pulse-partner-note" />
          </div>
        )}
        {partner && actions.map((a) => {
          const fresh = partnerTransitionLevel(partner, a) === "fresh";
          const blocked = (a === "submit" || a === "approve" || a === "resume") && approvalIssues.length > 0;
          return (
            <Button key={a} size="sm" variant={a === "approve" || a === "resume" ? "default" : "outline"} data-testid={`pulse-partner-${a}`}
              disabled={busy || dirty || blocked || (NEEDS_NOTE.has(a) && !note.trim())} title={fresh ? FRESH_HINT : undefined}
              onClick={() => void act(a)}>
              {ACTION_LABEL[a]}{fresh && <FreshBadge />}
            </Button>
          );
        })}
        <Notice result={result} />
      </div>
      {partner?.decisionNote && <p className="text-[11px] text-muted-foreground">Last decision note: {partner.decisionNote}</p>}
    </section>
  );
}

function HostAllowlist({ hosts, busy, write }: { hosts: string[]; busy: boolean; write: PulseWorkspaceState["write"] }) {
  const [host, setHost] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const run = async (h: string, op: "add" | "remove") => {
    const r = await write((repo) => repo.setSponsorHost(h, op));
    setResult(r.ok ? null : { ok: false, message: r.message });
    if (r.ok && op === "add") setHost("");
  };
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-labelledby="pulse-hosts-h" data-testid="pulse-host-allowlist">
      <h3 id="pulse-hosts-h" className="text-sm font-semibold">Sponsor destination allowlist</h3>
      <p className="text-[11px] text-muted-foreground">
        A sponsor's destination host must be on this list <em>and</em> in its own approved hosts. Removing a host takes its sponsors off the Home Hub at once.
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {hosts.length === 0 && <li className="text-[11px] text-muted-foreground" data-testid="pulse-host-empty">Empty: no sponsor can be approved.</li>}
        {hosts.map((h) => (
          <li key={h} className="flex items-center gap-1 rounded border px-2 py-0.5 text-[11px]" data-testid={`pulse-host-${h}`}>
            {h}
            <button type="button" aria-label={`Remove ${h}`} disabled={busy} onClick={() => void run(h, "remove")}><X className="h-3 w-3" /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <input className="w-56 max-w-full rounded-md border bg-background px-2 py-1 text-xs" value={host} placeholder="example.com" aria-label="Host to allow"
          disabled={busy} onChange={(e) => setHost(e.target.value)} data-testid="pulse-host-input" />
        <Button size="sm" variant="outline" disabled={busy || !host.trim()} onClick={() => void run(host, "add")} data-testid="pulse-host-add"
          title={hostAllowlistLevel("add") === "fresh" ? FRESH_HINT : undefined}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Allow host<FreshBadge />
        </Button>
        <Notice result={result} />
      </div>
    </section>
  );
}

export function PulsePartnersPanel({ snapshot, now, busy, write }: {
  snapshot: PulseWorkspaceSnapshot; now: Date; busy: boolean; write: PulseWorkspaceState["write"];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState<PulsePartnerInput | null>(null);
  const partner = snapshot.partners.find((p) => p.record.id === selected) ?? null;
  // Reset the editor only when the record itself changes (id or revision).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => (partner ? toPartnerInput(partner) : creating), [partner?.record.id, partner?.revision, creating]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Sponsor campaigns and creator spotlights, stored in PULSE-2C's record contract and emitted to the Home Hub only when approved, inside
        their window, on an allowed host, and past their release gate.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} data-testid="pulse-new-sponsor" onClick={() => { setSelected(null); setCreating(blankSponsor()); }}>New sponsor campaign</Button>
        <Button size="sm" variant="outline" disabled={busy} data-testid="pulse-new-creator" onClick={() => { setSelected(null); setCreating(blankCreator()); }}>New creator spotlight</Button>
      </div>
      <ul className="divide-y rounded-lg border" data-testid="pulse-partner-list">
        {snapshot.partners.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted-foreground">No partner records.</li>}
        {snapshot.partners.map((p) => {
          const why = partnerExclusion(p, snapshot, now);
          return (
            <li key={p.record.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-xs", p.record.id === selected && "bg-primary/5")}
              data-testid={`pulse-partner-row-${p.record.id}`}>
              <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => { setCreating(null); setSelected(p.record.id); }}>
                {p.type === "sponsor" ? `${p.record.sponsorName || "—"} · ${p.record.campaignTitle || p.record.id}` : `${p.record.creatorName || "—"} · ${p.record.media.title || p.record.id}`}
              </button>
              <span className="text-muted-foreground">{p.type}{p.type === "creator" && p.compensation !== "unpaid" ? ` · ${p.compensation}` : ""}</span>
              <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold uppercase", STATUS_TONE[p.record.status])}
                data-testid={`pulse-partner-row-status-${p.record.id}`}>{p.record.status}</span>
              <span className="text-[11px] text-muted-foreground">{why ? EXCLUSION_LABEL[why] : "Emitted"}</span>
            </li>
          );
        })}
      </ul>
      {initial && (
        <PartnerEditor
          partner={partner}
          initial={initial}
          snapshot={snapshot}
          now={now}
          busy={busy}
          write={write}
          onDone={(created) => { setCreating(null); setSelected(created ?? null); }}
        />
      )}
      <HostAllowlist hosts={snapshot.sponsorHostAllowlist} busy={busy} write={write} />
      <section className="rounded-lg border p-3 text-[11px]" data-testid="pulse-release-gates" aria-label="Release gates">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Lock className="h-3.5 w-3.5" aria-hidden /> Release gates</h3>
        <p>Sponsor disclosure rendered: <strong data-testid="pulse-gate-sponsor">{snapshot.gates.sponsorDisclosureRendered ? "open" : "closed"}</strong>
          {" · "}Paid creator disclosure rendered: <strong data-testid="pulse-gate-creator">{snapshot.gates.paidCreatorDisclosureRendered ? "open" : "closed"}</strong></p>
        <p className="mt-1 text-muted-foreground">Opened only by a reviewed migration shipped with the shared-type PR that renders the disclosure. No button here can open them.</p>
      </section>
    </div>
  );
}
