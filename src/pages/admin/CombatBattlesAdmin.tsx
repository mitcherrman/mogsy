// Minimal Combat Sim Battles admin operations. Structured JSON editor (not a
// visual builder). Every authoritative value — winner, outcome, score — is
// derived by the server; this UI only submits inputs and lifecycle actions,
// gated by the battle's effective status. Backend errors are the authority.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { battlesAdminApi, BattlesApiError } from "@/lib/combat-battles/api";
import { SAMPLE_LEFT, SAMPLE_RIGHT, SNAPSHOT_HELP } from "@/lib/combat-battles/admin-template";
import { STATUS_LABELS, fmtDateTime } from "@/lib/combat-battles/lifecycle";
import type { AdminBattle, AdminValidationReport } from "@/lib/combat-battles/types";

const ADMIN_KEY = ["combat-battles", "admin"] as const;

function toIso(local: string): string {
  // datetime-local -> ISO with timezone
  return new Date(local).toISOString();
}

function ConfirmButton({
  label, title, description, onConfirm, disabled, variant = "default", pending,
}: {
  label: string; title: string; description: string; onConfirm: () => void;
  disabled?: boolean; variant?: "default" | "destructive"; pending?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={variant} disabled={disabled || pending}>
          {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function CombatBattlesAdmin() {
  const qc = useQueryClient();
  useEffect(() => { document.title = "Combat Battles · Admin"; }, []);

  const list = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: ({ signal }) => battlesAdminApi.list(signal).then((r) => r.battles),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => list.data?.find((b) => b.battle_id === selectedId) ?? null,
    [list.data, selectedId],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ADMIN_KEY });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Combat Sim Battles — Admin</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create, validate, publish, void, and settle battle events. The server derives all
        results; you cannot set a winner, outcome, or score.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1.4fr)]">
        {/* Left: list + create */}
        <div className="space-y-6">
          <CreateForm onCreated={(id) => { refresh(); setSelectedId(id); }} />
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-lg">Events</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {list.isError && (
                <p className="text-sm text-destructive">
                  Couldn't load events (admin access required).
                </p>
              )}
              {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
              {list.data?.map((b) => (
                <button
                  key={b.battle_id}
                  onClick={() => setSelectedId(b.battle_id)}
                  className={`w-full rounded-md border p-2 text-left text-sm transition-colors hover:border-primary ${
                    selectedId === b.battle_id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 font-medium">{b.title}</span>
                    <Badge variant="outline">{STATUS_LABELS[b.effective_status]}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {b.winner_side ? `Winner: ${b.winner_side}` : "No result yet"}
                    {b.prediction_summary ? ` · ${b.prediction_summary.total_count} predictions` : ""}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right: selected battle operations */}
        <div>
          {selected ? (
            <BattleOps battle={selected} onChanged={refresh} />
          ) : (
            <Card><CardContent className="py-16 text-center text-muted-foreground">
              Select an event, or create a draft.
            </CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("Annie vs Brand");
  const [description, setDescription] = useState("");
  const [left, setLeft] = useState(JSON.stringify(SAMPLE_LEFT, null, 2));
  const [right, setRight] = useState(JSON.stringify(SAMPLE_RIGHT, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      let leftObj: unknown, rightObj: unknown;
      try {
        leftObj = JSON.parse(left);
        rightObj = JSON.parse(right);
      } catch (e) {
        throw new Error(`Invalid JSON: ${(e as Error).message}`);
      }
      return battlesAdminApi.create({ title, description, left: leftObj, right: rightObj });
    },
    onSuccess: (b) => {
      toast({ title: "Draft created", description: b.slug });
      onCreated(b.battle_id);
    },
    onError: (e) => {
      setJsonError(e instanceof Error ? e.message : "Create failed");
      toast({ title: "Create failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">New draft</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </label>
        <p className="text-xs text-muted-foreground">{SNAPSHOT_HELP}</p>
        <label className="block text-sm">
          <span className="text-muted-foreground">Left snapshot (JSON)</span>
          <Textarea value={left} onChange={(e) => setLeft(e.target.value)} rows={8} className="mt-1 font-mono text-xs" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Right snapshot (JSON)</span>
          <Textarea value={right} onChange={(e) => setRight(e.target.value)} rows={8} className="mt-1 font-mono text-xs" />
        </label>
        {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
        <Button onClick={() => { setJsonError(null); create.mutate(); }} disabled={create.isPending}>
          {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
          Create draft
        </Button>
      </CardContent>
    </Card>
  );
}

function BattleOps({ battle, onChanged }: { battle: AdminBattle; onChanged: () => void }) {
  const status = battle.effective_status;
  const [report, setReport] = useState<AdminValidationReport | null>(null);
  const [openAt, setOpenAt] = useState("");
  const [lockAt, setLockAt] = useState("");
  const [revealAt, setRevealAt] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const settled = battle.stored_status === "void"
    ? false
    : Boolean(battle.result_checksum) || false;

  async function run<T>(name: string, fn: () => Promise<T>, okMsg: string) {
    setBusy(name);
    try {
      await fn();
      toast({ title: okMsg });
      onChanged();
    } catch (e) {
      const msg = e instanceof BattlesApiError ? `${e.code}: ${e.message}` : (e as Error).message;
      toast({ title: `${name} failed`, description: msg, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const canValidate = status === "draft" || status === "validated";
  const canPublish = status === "validated";
  const canVoid = status !== "void" && status !== "revealed";
  const canSettle = status === "revealed" || status === "void";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{battle.title}</CardTitle>
          <Badge variant="outline">{STATUS_LABELS[status]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{battle.slug}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Opens</dt><dd>{fmtDateTime(battle.open_at)}</dd>
          <dt className="text-muted-foreground">Locks</dt><dd>{fmtDateTime(battle.lock_at)}</dd>
          <dt className="text-muted-foreground">Reveals</dt><dd>{fmtDateTime(battle.reveal_at)}</dd>
          <dt className="text-muted-foreground">Winner</dt><dd>{battle.winner_side ?? "—"}</dd>
          {battle.prediction_summary && (
            <>
              <dt className="text-muted-foreground">Predictions</dt>
              <dd>{battle.prediction_summary.total_count}</dd>
            </>
          )}
        </dl>

        <Separator />

        {/* Validate */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!canValidate || busy !== null}
            onClick={() => run("Validate",
              async () => { const r = await battlesAdminApi.validate(battle.battle_id); setReport(r.report); },
              "Validation complete")}>
            Validate
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null}
            onClick={() => run("Reproduce", () => battlesAdminApi.reproduce(battle.battle_id), "Reproduction verified")}>
            Reproduce
          </Button>
        </div>

        {report && (
          <div className={`rounded-md border p-2 text-xs ${report.publishable ? "border-primary/40" : "border-destructive/50"}`}>
            <p className="font-medium">
              {report.publishable ? "Publishable" : "Not publishable"} · {report.blocking_error_count} blocking · {report.warning_count} warnings
            </p>
            {report.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {report.issues.slice(0, 12).map((i, k) => (
                  <li key={k} className={i.severity === "blocking_error" ? "text-destructive" : ""}>
                    [{i.side}] {i.code}: {i.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Publish */}
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Publish schedule</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label>Open<input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className="mt-1 w-full rounded border bg-background px-1 py-1" /></label>
            <label>Lock<input type="datetime-local" value={lockAt} onChange={(e) => setLockAt(e.target.value)} className="mt-1 w-full rounded border bg-background px-1 py-1" /></label>
            <label>Reveal<input type="datetime-local" value={revealAt} onChange={(e) => setRevealAt(e.target.value)} className="mt-1 w-full rounded border bg-background px-1 py-1" /></label>
          </div>
          <ConfirmButton
            label="Publish" title="Publish this battle?"
            description="Publishing freezes the inputs and the deterministic result immutably. This cannot be edited afterwards — only voided."
            disabled={!canPublish || !openAt || !lockAt || !revealAt || busy !== null}
            pending={busy === "Publish"}
            onConfirm={() => run("Publish",
              () => battlesAdminApi.publish(battle.battle_id, {
                open_at: toIso(openAt), lock_at: toIso(lockAt), reveal_at: toIso(revealAt),
              }), "Published")}
          />
        </div>

        {/* Settle */}
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Settlement</p>
          <ConfirmButton
            label="Settle" title="Settle predictions?"
            description="Settles all predictions against the frozen result and awards Arena Score. Idempotent and exactly-once."
            disabled={!canSettle || busy !== null} pending={busy === "Settle"}
            onConfirm={() => run("Settle", () => battlesAdminApi.settle(battle.battle_id), "Settled")}
          />
          <SettlementAudit battleId={battle.battle_id} enabled={settled || status === "revealed" || status === "void"} />
        </div>

        {/* Void */}
        <div className="space-y-2 rounded-md border border-destructive/30 p-3">
          <p className="text-sm font-medium">Void</p>
          <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason"
            className="w-full rounded border bg-background px-2 py-1 text-sm" />
          <ConfirmButton
            label="Void" variant="destructive" title="Void this battle?"
            description="Voiding retains predictions but scores nothing. A settled battle cannot be voided."
            disabled={!canVoid || busy !== null} pending={busy === "Void"}
            onConfirm={() => run("Void", () => battlesAdminApi.void(battle.battle_id, voidReason), "Voided")}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SettlementAudit({ battleId, enabled }: { battleId: string; enabled: boolean }) {
  const { data } = useQuery({
    queryKey: ["combat-battles", "admin", "settlement", battleId],
    queryFn: ({ signal }) => battlesAdminApi.settlement(battleId, signal),
    enabled,
    retry: false,
  });
  if (!data) return null;
  const { summary, audit } = data;
  return (
    <div className="rounded-md border p-2 text-xs">
      <p className="font-medium">
        Settlement: {summary.status} · {summary.correct_count} correct · {summary.score_awarded_total} score · audit {audit.ok ? "OK" : "FAILED"}
      </p>
      {!audit.ok && audit.issues.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-destructive">
          {audit.issues.map((i, k) => <li key={k}>{i}</li>)}
        </ul>
      )}
    </div>
  );
}
