/**
 * The Phase 4D recovery surface.
 *
 * Two cards, both of which exist to make a paid request's fate explicit:
 *
 *  - `RecoveryNotice` — a request that survived a reload or a closed tab and
 *    is waiting to be collected. It is an OFFER. Rendering it sends nothing;
 *    only the button does.
 *  - `RunBlockNotice` — a Run click that was refused before anything reached
 *    the network, and why. Every message here opens by stating that nothing
 *    was sent, because that is the fact the operator's next move depends on.
 *
 * Neither card shows the raw idempotency key or the serialized payload. The
 * key is an opaque handle with no operator meaning, and putting it on screen
 * invites it into screenshots and support threads; the summary below (shape,
 * champions, time, quoted cost) is what actually identifies the request to the
 * person who configured it.
 */
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  RECOVERY_COLLISION_BODY,
  RECOVERY_COLLISION_TITLE,
  RECOVERY_IDENTITY_PENDING_BODY,
  RECOVERY_IDENTITY_PENDING_TITLE,
  RECOVERY_STORAGE_BLOCKED_BODY,
  RECOVERY_STORAGE_BLOCKED_TITLE,
  STORED_RECOVERY_ACTION_LABEL,
  STORED_RECOVERY_BODY,
  STORED_RECOVERY_FORGET_HINT,
  STORED_RECOVERY_FORGET_LABEL,
  STORED_RECOVERY_TITLE,
} from "@/lib/combat-lab/team-sim/errors";
import type { RunBlock } from "@/lib/combat-lab/team-sim/hooks";
import {
  championsOf,
  teamShapeOf,
  type RecoveryDiscardReason,
  type TeamSimRecoveryRecord,
} from "@/lib/combat-lab/team-sim/recovery";

/**
 * What the stored request WAS, without showing what was stored.
 *
 * `min-w-0` plus `break-words` throughout: a champion list and a long
 * timestamp are the two things on this card that can exceed a 375px viewport,
 * and a recovery control the operator has to scroll sideways to reach is a
 * recovery control they will not use.
 */
function RequestSummary({ record }: { record: TeamSimRecoveryRecord }) {
  const champions = championsOf(record);
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground"
      data-testid="recovery-summary"
    >
      <dt className="font-medium">Scenario</dt>
      <dd className="min-w-0 break-words">
        {teamShapeOf(record)} — {champions.a.join(", ")} vs {champions.b.join(", ")}
      </dd>
      <dt className="font-medium">Submitted</dt>
      <dd className="min-w-0 break-words">
        {new Date(record.submitted_at).toLocaleString()}
      </dd>
      <dt className="font-medium">Quoted cost</dt>
      <dd className="min-w-0 break-words">
        {record.credit_cost === null
          ? "not quoted"
          : `${record.credit_cost} credit${record.credit_cost === 1 ? "" : "s"}`}
      </dd>
    </dl>
  );
}

export function RecoveryNotice({
  record,
  onRecover,
  onForget,
  busy,
}: {
  record: TeamSimRecoveryRecord;
  onRecover: () => void;
  onForget: () => void;
  /** A request is already in flight; a second click must not queue one. */
  busy: boolean;
}) {
  return (
    <Card
      className="space-y-2 border-amber-500/60 p-3"
      role="status"
      data-testid="recovery-notice"
    >
      <h2 className="text-sm font-semibold">{STORED_RECOVERY_TITLE}</h2>
      <p className="text-xs">{STORED_RECOVERY_BODY}</p>
      <RequestSummary record={record} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={onRecover}
          disabled={busy}
          data-testid="recover-stored"
        >
          {busy ? "Checking…" : STORED_RECOVERY_ACTION_LABEL}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={onForget}
          disabled={busy}
          data-testid="forget-recovery"
        >
          {STORED_RECOVERY_FORGET_LABEL}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{STORED_RECOVERY_FORGET_HINT}</p>
    </Card>
  );
}

/**
 * A record that existed and can no longer be used.
 *
 * Quiet by design — there is nothing to do about it, and an alarming banner
 * for a request that may well have succeeded would be worse than the silence
 * it replaces. But it is not nothing: the operator may have been charged, and
 * the local handle on that request is now gone.
 */
export function RecoveryLapsedNotice({
  reason,
  onDismiss,
}: {
  reason: RecoveryDiscardReason;
  onDismiss: () => void;
}) {
  return (
    <Card
      className="flex flex-wrap items-start justify-between gap-2 p-3"
      role="status"
      data-testid="recovery-lapsed"
    >
      <p className="min-w-0 flex-1 break-words text-[11px] text-muted-foreground">
        {reason === "expired"
          ? "An unfinished simulation was saved in this tab, but its recovery window has closed — the server no longer keeps a result for it. If you never saw that result, check your credit balance."
          : "An unfinished simulation was saved in this tab, but the saved details could not be read back, so it can no longer be recovered here. Nothing was sent."}
      </p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px]"
        onClick={onDismiss}
        data-testid="dismiss-lapsed"
      >
        Dismiss
      </Button>
    </Card>
  );
}

export function RunBlockNotice({
  block,
  onRecover,
  onForget,
  onCancel,
}: {
  block: RunBlock;
  onRecover: () => void;
  onForget: () => void;
  onCancel: () => void;
}) {
  if (block.kind === "identity") {
    return (
      <Card
        className="space-y-1 border-amber-500/60 p-3"
        role="alert"
        data-testid="run-blocked-identity"
      >
        <h2 className="text-sm font-semibold">{RECOVERY_IDENTITY_PENDING_TITLE}</h2>
        <p className="text-xs">{RECOVERY_IDENTITY_PENDING_BODY}</p>
      </Card>
    );
  }

  if (block.kind === "storage") {
    return (
      <Card
        className="space-y-1 border-destructive/50 p-3"
        role="alert"
        data-testid="run-blocked-storage"
      >
        <h2 className="text-sm font-semibold text-destructive">
          {RECOVERY_STORAGE_BLOCKED_TITLE}
        </h2>
        <p className="text-xs">{RECOVERY_STORAGE_BLOCKED_BODY}</p>
        <p className="text-[11px] text-muted-foreground">
          Storage reported: <span className="font-mono">{block.reason}</span>.
        </p>
      </Card>
    );
  }

  return (
    <Card
      className="space-y-2 border-amber-500/60 p-3"
      role="alert"
      data-testid="run-blocked-unresolved"
    >
      <h2 className="text-sm font-semibold">{RECOVERY_COLLISION_TITLE}</h2>
      <p className="text-xs">{RECOVERY_COLLISION_BODY}</p>
      <RequestSummary record={block.record} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={onRecover}
          data-testid="collision-recover"
        >
          Recover previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={onForget}
          data-testid="collision-forget"
        >
          Forget previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={onCancel}
          data-testid="collision-cancel"
        >
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {/* Forgetting deliberately does NOT start the new run: the run would
            otherwise happen as a side effect of dismissing something else. */}
        Forgetting clears only this browser's copy — the server may still have
        run and charged the earlier request. Nothing is sent by either choice;
        press Run again afterwards to start the new simulation.
      </p>
    </Card>
  );
}
