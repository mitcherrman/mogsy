// ---------------------------------------------------------------------------
// PULSE-2B — creator and sponsor campaigns: who the partner is, how the
// relationship is disclosed, the flight window, and the owner's decision.
//
// Approval is the gate for any sponsor or paid-creator content going live,
// so approve / reject / end ask for a fresh MFA on the server repository
// (runOwnerAction "fresh"). A material edit to an approved campaign
// (partner, disclosure) sends it back to pending.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DISCLOSURE_LABEL,
  type PulseCampaign,
  type PulseCampaignDecision,
  type PulseCampaignInput,
  type PulseDisclosureKind,
  type PulseWorkspaceSnapshot,
} from "@/lib/admin/pulse/contract";
import { isoToLocalInput, localInputToIso, type PulseWorkspaceState } from "@/lib/admin/pulse/usePulseWorkspace";
import { validateCampaign, type PulseIssue } from "@/lib/admin/pulse/validation";
import { cn } from "@/lib/utils";

import { DateTimeField, IssueList, Notice, SelectField, TextField } from "./fields";

const APPROVAL_TONE: Record<PulseCampaign["approval"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-destructive/15 text-destructive",
  ended: "bg-muted text-muted-foreground",
};

const DECISIONS: Record<PulseCampaign["approval"], PulseCampaignDecision[]> = {
  pending: ["approve", "reject"],
  rejected: ["approve"],
  approved: ["end"],
  ended: [],
};

function blank(type: PulseCampaign["type"]): PulseCampaignInput {
  return {
    id: null, type, partnerName: "", title: "", disclosure: type === "sponsor" ? "sponsored" : "paid-partnership",
    disclosureText: "", flightStart: null, flightEnd: null, contractRef: "",
  };
}

function toInput(c: PulseCampaign): PulseCampaignInput {
  const { id, type, partnerName, title, disclosure, disclosureText, flightStart, flightEnd, contractRef } = c;
  return { id, type, partnerName, title, disclosure, disclosureText, flightStart, flightEnd, contractRef };
}

function CampaignEditor({ campaign, initial, busy, write, onDone, linkedCount }: {
  campaign: PulseCampaign | null; initial: PulseCampaignInput; busy: boolean; write: PulseWorkspaceState["write"];
  onDone(): void; linkedCount: number;
}) {
  const [draft, setDraft] = useState(initial);
  const [serverIssues, setServerIssues] = useState<PulseIssue[]>([]);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => setDraft(initial), [initial]);
  const issues = serverIssues.length ? serverIssues : validateCampaign(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const disclosures: PulseDisclosureKind[] = draft.type === "sponsor" ? ["sponsored"] : ["paid-partnership", "affiliate", "unpaid-spotlight"];

  const decide = async (d: PulseCampaignDecision) => {
    if (!campaign) return;
    const r = await write((repo) => repo.decideCampaign(campaign.id, d, note, campaign.revision));
    setServerIssues(r.ok === false ? r.issues : []);
    setResult(r.ok ? { ok: true, message: `Campaign ${d === "approve" ? "approved" : d === "reject" ? "rejected" : "ended"}.` } : { ok: false, message: r.message });
    if (r.ok) setNote("");
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="pulse-campaign-editor" aria-label="Edit campaign">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{campaign ? `${campaign.partnerName} · ${campaign.title}` : `New ${draft.type} campaign`}</h3>
        <Button size="sm" variant="ghost" onClick={onDone}>Close</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Partner" field="partnerName" issues={issues} value={draft.partnerName} disabled={busy}
          onChange={(v) => setDraft({ ...draft, partnerName: v })} testId="pulse-campaign-partner" />
        <TextField label="Campaign title" field="title" issues={issues} value={draft.title} disabled={busy}
          onChange={(v) => setDraft({ ...draft, title: v })} testId="pulse-campaign-title" />
        <SelectField label="Disclosure" field="disclosure" issues={issues} value={draft.disclosure} disabled={busy}
          options={disclosures.map((d) => ({ value: d, label: DISCLOSURE_LABEL[d] }))}
          onChange={(disclosure) => setDraft({ ...draft, disclosure })} testId="pulse-campaign-disclosure" />
        <TextField label="Disclosure wording" field="disclosureText" issues={issues} value={draft.disclosureText} disabled={busy}
          onChange={(v) => setDraft({ ...draft, disclosureText: v })} hint="Who paid, in plain words. Shown in the expanded view." testId="pulse-campaign-disclosure-text" />
        <DateTimeField label="Flight starts" field="flight" issues={issues} value={isoToLocalInput(draft.flightStart)} disabled={busy}
          onChange={(v) => setDraft({ ...draft, flightStart: localInputToIso(v) })} />
        <DateTimeField label="Flight ends" value={isoToLocalInput(draft.flightEnd)} disabled={busy}
          onChange={(v) => setDraft({ ...draft, flightEnd: localInputToIso(v) })} />
        <TextField className="sm:col-span-2" label="Contract / brief reference" value={draft.contractRef} disabled={busy}
          onChange={(v) => setDraft({ ...draft, contractRef: v })} hint="Internal only." />
      </div>
      <IssueList issues={issues} title="Fix before saving" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !dirty || issues.length > 0} data-testid="pulse-campaign-save"
          onClick={async () => {
            const r = await write((repo) => repo.saveCampaign(draft, campaign ? campaign.revision : null));
            setServerIssues(r.ok === false ? r.issues : []);
            setResult(r.ok ? { ok: true, message: campaign ? "Saved." : "Campaign created (pending approval)." } : { ok: false, message: r.message });
            if (r.ok && !campaign) onDone();
          }}>
          {campaign ? "Save" : "Create"}
        </Button>
        {campaign?.approval === "approved" && dirty && (draft.partnerName !== initial.partnerName || draft.disclosure !== initial.disclosure || draft.disclosureText !== initial.disclosureText) && (
          <span className="text-[11px] text-amber-600 dark:text-amber-300">Changing the partner or disclosure sends it back for approval.</span>
        )}
      </div>

      {campaign && (
        <div className="space-y-2 border-t pt-3" data-testid="pulse-campaign-decision">
          <h4 className="text-xs font-semibold">Decision</h4>
          <p className="text-[11px] text-muted-foreground">
            {campaign.approval === "approved"
              ? `Approved${campaign.decidedAt ? ` ${new Date(campaign.decidedAt).toLocaleString()}` : ""}. ${linkedCount} content item(s) linked.`
              : "Approving lets linked sponsor/creator content go live (still subject to its own publish checks). Needs a fresh verification."}
          </p>
          <TextField label="Decision note" value={note} onChange={setNote} disabled={busy} hint="Required to reject or end." testId="pulse-campaign-note" />
          <div className="flex flex-wrap gap-2">
            {DECISIONS[campaign.approval].map((d) => (
              <Button key={d} size="sm" variant={d === "approve" ? "default" : "outline"} disabled={busy || dirty} data-testid={`pulse-campaign-${d}`}
                onClick={() => void decide(d)}>
                {d === "approve" ? "Approve" : d === "reject" ? "Reject" : "End campaign"}
              </Button>
            ))}
          </div>
        </div>
      )}
      <Notice result={result} />
    </section>
  );
}

export function PulseCampaignsPanel({ snapshot, busy, write }: { snapshot: PulseWorkspaceSnapshot; busy: boolean; write: PulseWorkspaceState["write"] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState<PulseCampaignInput | null>(null);
  const campaign = snapshot.campaigns.find((c) => c.id === selected) ?? null;
  const [initial, setInitial] = useState<PulseCampaignInput | null>(null);
  useEffect(() => { setInitial(campaign ? toInput(campaign) : creating); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign?.id, campaign?.revision, creating]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Every sponsor and creator item belongs to a campaign. Disclosure is fixed per campaign so the wording is reviewed once, and nothing linked can
        go live until the campaign is approved and inside its flight. PULSE-2C partner feeds attach here.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} data-testid="pulse-new-campaign-sponsor" onClick={() => { setSelected(null); setCreating(blank("sponsor")); }}>New sponsor campaign</Button>
        <Button size="sm" variant="outline" disabled={busy} data-testid="pulse-new-campaign-creator" onClick={() => { setSelected(null); setCreating(blank("creator")); }}>New creator campaign</Button>
      </div>
      <ul className="divide-y rounded-lg border" data-testid="pulse-campaign-list">
        {snapshot.campaigns.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted-foreground">No campaigns.</li>}
        {snapshot.campaigns.map((c) => (
          <li key={c.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-xs", c.id === selected && "bg-primary/5")}>
            <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => { setCreating(null); setSelected(c.id); }}>
              {c.partnerName} · {c.title}
            </button>
            <span className="text-muted-foreground">{c.type}</span>
            <span className="rounded bg-muted px-1.5 py-px text-[10px]">{DISCLOSURE_LABEL[c.disclosure]}</span>
            <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold uppercase", APPROVAL_TONE[c.approval])} data-testid={`pulse-campaign-approval-${c.id}`}>{c.approval}</span>
          </li>
        ))}
      </ul>
      {initial && (
        <CampaignEditor
          campaign={campaign}
          initial={initial}
          busy={busy}
          write={write}
          linkedCount={campaign ? snapshot.items.filter((i) => i.campaignId === campaign.id).length : 0}
          onDone={() => { setSelected(null); setCreating(null); }}
        />
      )}
    </div>
  );
}
