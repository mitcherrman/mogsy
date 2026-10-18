// ---------------------------------------------------------------------------
// Admin › Users › Newsletter — EMAIL1. Owner-only.
//
// Audience → draft → preview → test → approve → send, with every step gated
// twice (here for UX, on the server for real): campaign CRUD by SQL RPCs that
// call public.assert_owner, preview / test / send by the newsletter-admin Edge
// Function (requireOwner; FRESH MFA to approve and to start a send).
//
// Sending ships OFF. The "Send" panel is a no-op until the deployment sets
// NEWSLETTER_SENDING_ENABLED=true, a provider, a sender domain and a postal
// address; until then it says exactly which of those is missing.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMAIL_TOPICS, EMAIL_TOPIC_LABELS, type EmailTopic } from "@/lib/email/topics";
import {
  BLOCKER_COPY, EMPTY_DRAFT, audienceCount, configStatus, continueSend, loadCampaigns, loadStats, loadSubscribers,
  renderPreview, saveCampaign, sendConfirmPhrase, sendDone, sendTest, setCampaignStatus, startSend,
  type Campaign, type CampaignDraft, type ConfigStatus, type SendProgress,
} from "@/lib/admin/newsletter-admin";

const fail = (message: string): void => { toast.error(message); };
const draftOf = (c: Campaign): CampaignDraft => ({
  id: c.id, name: c.name, subject: c.subject, preheader: c.preheader ?? "", body_markdown: c.body_markdown, topic: c.topic,
});

interface Stats {
  by_status?: Record<string, number>;
  eligible_by_topic?: Record<string, number>;
  suppressed?: number;
  opt_ins_30d?: number;
  unsubscribes_30d?: number;
}

function Overview({ stats, config }: { stats: Stats | null; config: ConfigStatus | null }) {
  const by = stats?.by_status ?? {};
  return (
    <section className="space-y-3" aria-label="Newsletter overview" data-testid="newsletter-overview">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Subscribed", by.subscribed ?? 0],
          ["Pending confirmation", by.pending ?? 0],
          ["Unsubscribed", by.unsubscribed ?? 0],
          ["Suppressed", stats?.suppressed ?? 0],
        ].map(([label, n]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
            <div className="text-lg font-bold tabular-nums text-foreground">{n}</div>
            <div className="text-[11px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">Mailable audience by topic</div>
        <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {EMAIL_TOPICS.map((t) => (
            <li key={t}>{EMAIL_TOPIC_LABELS[t]}: <span className="tabular-nums text-foreground">{stats?.eligible_by_topic?.[t] ?? 0}</span></li>
          ))}
        </ul>
        <div className="mt-1">Last 30 days: {stats?.opt_ins_30d ?? 0} confirmed · {stats?.unsubscribes_30d ?? 0} unsubscribed</div>
      </div>
      <div
        className={`rounded-lg border p-3 text-xs ${config?.send_blocker ? "border-amber-500/40 bg-amber-500/5" : "border-green-500/40 bg-green-500/5"}`}
        data-testid="newsletter-config"
      >
        <div className="mb-0.5 flex items-center gap-1 font-semibold text-foreground">
          <ShieldAlert className="h-3.5 w-3.5" /> Sending status
        </div>
        {!config ? "Unknown (could not load)." : config.send_blocker ? (
          <>Blocked — {BLOCKER_COPY[config.send_blocker] ?? config.send_blocker}</>
        ) : "Ready: sending is enabled and fully configured."}
        {config && (
          <div className="mt-1 text-muted-foreground">
            Provider: {config.provider} · sender {config.from_set ? "set" : "missing"} · postal address {config.postal_address_set ? "set" : "missing"}
          </div>
        )}
      </div>
    </section>
  );
}

function Subscribers() {
  const [status, setStatus] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const r = await loadSubscribers(status === "all" ? null : status, offset);
    setBusy(false);
    if (r.ok === false) return fail(r.message);
    setRows((r.value as Array<Record<string, unknown>>) ?? []);
  }, [status, offset]);

  return (
    <section className="space-y-2" aria-label="Subscribers">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-foreground">Subscribers</h3>
        <Select value={status} onValueChange={(v) => { setStatus(v); setOffset(0); setRows(null); }}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "subscribed", "pending", "unsubscribed", "suppressed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load} disabled={busy} data-testid="newsletter-load-subscribers">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Load list"}
        </Button>
        <span className="text-[11px] text-muted-foreground">Viewing the list is recorded in the audit log.</span>
      </div>
      {rows && (
        <div className="space-y-1">
          {rows.length === 0 && <p className="text-xs text-muted-foreground">No subscribers match.</p>}
          {rows.map((r) => (
            <div key={String(r.subscription_id)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
              <span className="truncate text-foreground">{String(r.email)}</span>
              <span className="text-muted-foreground">{String(r.status)}{Array.isArray(r.topics) && r.topics.length ? ` · ${(r.topics as string[]).join(", ")}` : ""}</span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="ghost" disabled={offset === 0 || busy} onClick={() => { setOffset(Math.max(0, offset - 25)); setRows(null); }}>Previous</Button>
            <Button size="sm" variant="ghost" disabled={rows.length < 25 || busy} onClick={() => { setOffset(offset + 25); setRows(null); }}>Next</Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AdminNewsletter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [status, setStatus] = useState<Campaign["status"]>("draft");
  const [preview, setPreview] = useState<{ html: string; text: string } | null>(null);
  const [audience, setAudience] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [progress, setProgress] = useState<SendProgress | undefined>();

  const refresh = useCallback(async () => {
    const [s, c, cfg] = await Promise.all([loadStats(), loadCampaigns(), configStatus()]);
    if (s.ok) setStats(s.value as Stats);
    if (c.ok === false) setLoadError(c.message);
    else { setCampaigns(c.value); setLoadError(null); }
    if (cfg.ok) setConfig(cfg.value);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const editable = status === "draft";
  const valid = draft.name.trim() && draft.subject.trim() && draft.body_markdown.trim();
  const current = useMemo(() => campaigns.find((c) => c.id === draft.id) ?? null, [campaigns, draft.id]);

  const select = (c: Campaign | null) => {
    setDraft(c ? draftOf(c) : EMPTY_DRAFT);
    setStatus(c?.status ?? "draft");
    setPreview(null); setAudience(null); setTyped(""); setProgress(undefined);
  };

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  };

  const save = () => guard("save", async () => {
    const r = await saveCampaign(draft);
    if (r.ok === false) return fail(r.message);
    setDraft((d) => ({ ...d, id: r.value }));
    toast.success("Draft saved.");
    await refresh();
  });

  const doPreview = () => guard("preview", async () => {
    const r = await renderPreview(draft);
    if (r.ok === false) return fail(r.message);
    setPreview(r.value);
  });

  const doAudience = () => guard("audience", async () => {
    const r = await audienceCount(draft.topic);
    if (r.ok === false) return fail(r.message);
    setAudience(r.value);
  });

  const doTest = () => guard("test", async () => {
    if (!draft.id) return fail("Save the draft first.");
    const r = await sendTest(draft.id);
    if (r.ok === false) return fail(r.message);
    toast.success("Test email sent to your own address.");
  });

  const transition = (to: "draft" | "ready" | "cancelled") => guard(`status-${to}`, async () => {
    if (!draft.id) return;
    const r = await setCampaignStatus(draft.id, to);
    if (r.ok === false) return fail(r.message);
    setStatus(to);
    toast.success(to === "ready" ? "Approved. The audience size was recorded." : "Updated.");
    await refresh();
  });

  const approvedCount = current?.approved_recipient_count ?? null;
  const phrase = approvedCount === null ? "" : sendConfirmPhrase(approvedCount);
  const sendBlocked = config?.send_blocker ?? (config ? null : "unknown");

  const send = () => guard("send", async () => {
    if (!draft.id || approvedCount === null) return;
    const r = await startSend(draft.id, approvedCount);
    if (r.ok === false) return fail(r.message);
    setStatus("sending");
    setProgress((r.value as { progress?: SendProgress }).progress);
    await refresh();
  });

  const drain = () => guard("drain", async () => {
    if (!draft.id) return;
    const r = await continueSend(draft.id);
    if (r.ok === false) return fail(r.message);
    const p = (r.value as { progress?: SendProgress }).progress;
    setProgress(p);
    if (sendDone(p)) { setStatus("sent"); toast.success("Campaign finished."); await refresh(); }
  });

  return (
    <div className="space-y-6" data-testid="admin-newsletter">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><Mail className="h-4 w-4" /> Newsletter</h2>
        <p className="text-xs text-muted-foreground">
          Opt-in only. Existing accounts are never subscribed automatically; each subscriber confirmed by email.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300" data-testid="newsletter-load-error">
          {loadError}
        </div>
      )}

      <Overview stats={stats} config={config} />
      <Subscribers />

      <section className="space-y-3" aria-label="Campaigns">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">Campaigns</h3>
          <Button size="sm" variant="outline" onClick={() => select(null)} data-testid="newsletter-new">New draft</Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c)}
              aria-pressed={draft.id === c.id}
              className={`rounded-md border px-2 py-0.5 text-[11px] ${draft.id === c.id ? "border-primary bg-primary/10" : "border-border bg-card text-muted-foreground"}`}
            >
              {c.name} · {c.status}
            </button>
          ))}
          {campaigns.length === 0 && <span className="text-xs text-muted-foreground">No campaigns yet.</span>}
        </div>

        <div className="grid gap-3 rounded-xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nl-name" className="text-xs">Internal name</Label>
              <Input id="nl-name" value={draft.name} disabled={!editable} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Topic (who receives it)</Label>
              <Select value={draft.topic} disabled={!editable} onValueChange={(v) => { setDraft({ ...draft, topic: v as EmailTopic }); setAudience(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMAIL_TOPICS.map((t) => <SelectItem key={t} value={t}>{EMAIL_TOPIC_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nl-subject" className="text-xs">Subject</Label>
            <Input id="nl-subject" value={draft.subject} disabled={!editable} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} maxLength={150} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nl-pre" className="text-xs">Preheader (optional)</Label>
            <Input id="nl-pre" value={draft.preheader} disabled={!editable} onChange={(e) => setDraft({ ...draft, preheader: e.target.value })} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nl-body" className="text-xs">Body — headings (#), lists (-), **bold**, *italic*, [text](https://…)</Label>
            <Textarea id="nl-body" rows={10} value={draft.body_markdown} disabled={!editable} onChange={(e) => setDraft({ ...draft, body_markdown: e.target.value })} maxLength={20000} />
            <p className="text-[11px] text-muted-foreground">
              The unsubscribe link, preferences link and postal address are added to every email automatically.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {editable && <Button size="sm" onClick={save} disabled={!valid || !!busy} data-testid="newsletter-save">{busy === "save" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save draft"}</Button>}
            <Button size="sm" variant="outline" onClick={doPreview} disabled={!valid || !!busy} data-testid="newsletter-preview">Preview</Button>
            <Button size="sm" variant="outline" onClick={doAudience} disabled={!!busy} data-testid="newsletter-audience">Count audience</Button>
            {draft.id && status !== "sent" && status !== "sending" && (
              <Button size="sm" variant="outline" onClick={doTest} disabled={!!busy} data-testid="newsletter-test">Send test to me</Button>
            )}
            {audience !== null && <span className="self-center text-xs text-foreground" data-testid="newsletter-audience-count">{audience} mailable recipient{audience === 1 ? "" : "s"} now</span>}
          </div>

          {preview && (
            <div className="space-y-2" data-testid="newsletter-preview-pane">
              {/* sandbox="" : no scripts, no forms, no same-origin — the preview is inert. */}
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[420px] w-full rounded-md border border-border bg-white" />
              <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Plain-text version</summary><pre className="whitespace-pre-wrap p-2 text-[11px]">{preview.text}</pre></details>
            </div>
          )}

          {draft.id && (
            <div className="space-y-2 border-t border-border pt-3">
              {status === "draft" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => transition("ready")} disabled={!valid || !!busy} data-testid="newsletter-approve">
                    Approve for sending (fresh MFA)
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Approving freezes the copy and records today&apos;s audience size.</span>
                </div>
              )}
              {(status === "ready" || status === "cancelled") && (
                <Button size="sm" variant="outline" onClick={() => transition("draft")} disabled={!!busy}>Back to draft</Button>
              )}
              {status === "ready" && approvedCount !== null && (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3" data-testid="newsletter-send-panel">
                  <div className="flex items-center gap-1 text-sm font-semibold text-foreground"><Send className="h-3.5 w-3.5" /> Send to {approvedCount} subscriber{approvedCount === 1 ? "" : "s"}</div>
                  {sendBlocked ? (
                    <p className="text-xs text-foreground" data-testid="newsletter-send-blocked">
                      Sending is not available: {sendBlocked === "unknown" ? "configuration could not be read." : (BLOCKER_COPY[sendBlocked] ?? sendBlocked)}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">This emails real people and cannot be recalled. Type <code>{phrase}</code> to confirm.</p>
                      <div className="flex gap-2">
                        <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="h-8 max-w-[200px] text-xs" aria-label="Type the confirmation phrase" data-testid="newsletter-confirm-input" />
                        <Button size="sm" variant="destructive" onClick={send} disabled={typed !== phrase || !!busy} data-testid="newsletter-send">Send campaign</Button>
                      </div>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => transition("cancelled")} disabled={!!busy}>Cancel campaign</Button>
                </div>
              )}
              {status === "sending" && (
                <div className="space-y-2 rounded-lg border border-border p-3" data-testid="newsletter-progress">
                  <p className="text-xs text-foreground">
                    {progress ? `Sent ${progress.sent} · queued ${progress.queued} · failed ${progress.failed} · skipped ${progress.skipped}` : "Sending in progress."}
                  </p>
                  <Button size="sm" onClick={drain} disabled={!!busy}>{busy === "drain" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send next batch"}</Button>
                </div>
              )}
              {status === "sent" && <p className="text-xs text-muted-foreground">This campaign has been sent.</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
