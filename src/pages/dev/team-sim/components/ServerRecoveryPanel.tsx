/**
 * The Phase 4E server-side recovery surface.
 *
 * The Phase 4D card ({@link RecoveryPanel}) speaks for a request THIS tab made
 * and wrote down. This one speaks for records only the server still remembers
 * — which is what is left after the browser's copy is gone entirely, so none
 * of the copy here may imply the request originated on this page.
 *
 * Secondary by construction. It renders below the editor and never as an alert:
 * a list of recent runs is a convenience, not an emergency, and giving it
 * urgency it does not have would teach operators to scroll past the Phase 4D
 * card that does.
 *
 * Nothing here sends anything. Rendering the list is a read that already
 * happened; only a button issues the recovery POST, and that POST cannot
 * charge and cannot run a simulation.
 *
 * The raw recovery id is never displayed. It is a handle with no operator
 * meaning, and putting it on screen invites it into screenshots and support
 * threads. What identifies a run to the person who configured it is the
 * summary — shape, champions, time, cost, outcome.
 */
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SERVER_RECOVERY_ACTION_LABEL,
  SERVER_RECOVERY_BODY,
  SERVER_RECOVERY_CHECK_LABEL,
  SERVER_RECOVERY_EMPTY,
  SERVER_RECOVERY_LOADING,
  SERVER_RECOVERY_PENDING_HINT,
  SERVER_RECOVERY_RETRY_LABEL,
  SERVER_RECOVERY_STALE_HINT,
  SERVER_RECOVERY_TITLE,
  SERVER_RECOVERY_UNAVAILABLE,
  type TeamSimError,
} from "@/lib/combat-lab/team-sim/errors";
import type { RecoverableRequest } from "@/lib/combat-lab/team-sim/contract";

/**
 * A record whose summary predates Phase 4E carries no shape and no champions.
 * That is reported as unknown rather than filled in from anything — the run it
 * describes is still recoverable, and hiding it because it cannot be labelled
 * would be the one failure this whole surface exists to prevent.
 */
function describe(entry: RecoverableRequest): string {
  const shape = entry.team_shape;
  const champions = entry.champions;
  if (!shape && !champions) return "Scenario details unavailable";
  const teams = champions
    ? `${champions.a.join(", ")} vs ${champions.b.join(", ")}`
    : null;
  return [shape, teams].filter(Boolean).join(" — ");
}

function outcome(entry: RecoverableRequest): string | null {
  if (entry.status !== "completed") return null;
  const parts: string[] = [];
  if (entry.winner) parts.push(`${entry.winner} won`);
  else if (entry.termination_reason) parts.push(entry.termination_reason);
  if (typeof entry.event_count === "number") {
    parts.push(`${entry.event_count} events`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function cost(entry: RecoverableRequest): string {
  // `credits_charged` is what actually left the meter; on a record that never
  // completed it is structurally 0, and saying "1 credit" from the QUOTE there
  // would tell someone they paid for something they did not.
  const amount =
    entry.status === "completed" ? entry.credits_charged : entry.credit_cost;
  const unit = `credit${amount === 1 ? "" : "s"}`;
  return entry.status === "completed"
    ? `${amount} ${unit} charged`
    : `${amount} ${unit} quoted`;
}

function RecoverableRow({
  entry,
  onRecover,
  busy,
}: {
  entry: RecoverableRequest;
  onRecover: (entry: RecoverableRequest) => void;
  busy: boolean;
}) {
  const summary = outcome(entry);
  return (
    <li
      className="flex flex-wrap items-start justify-between gap-2 border-t border-border/60 py-2 first:border-t-0"
      data-testid="server-recoverable-entry"
      data-status={entry.status}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="min-w-0 break-words text-xs font-medium">
          {describe(entry)}
        </p>
        <p className="min-w-0 break-words text-[11px] text-muted-foreground">
          {/* Formatted in the browser, from the server's UTC stamp: the
              backend must not guess a locale or a timezone for anyone. */}
          {new Date(entry.created_at).toLocaleString()} · {cost(entry)}
          {summary ? ` · ${summary}` : ""}
        </p>
        {entry.status === "stale" ? (
          <p className="text-[11px] text-muted-foreground">
            {SERVER_RECOVERY_STALE_HINT}
          </p>
        ) : null}
        {entry.status === "pending" ? (
          <p className="text-[11px] text-muted-foreground">
            {SERVER_RECOVERY_PENDING_HINT}
          </p>
        ) : null}
      </div>
      {/* A stale record has nothing to collect and nothing to check — the
          server cannot resume it — so it carries no control at all rather
          than a button that can only report the same thing the row says. */}
      {entry.status === "stale" ? null : (
        <Button
          type="button"
          size="sm"
          variant={entry.replay_available ? "default" : "outline"}
          className="h-7 px-2 text-[11px]"
          onClick={() => onRecover(entry)}
          disabled={busy}
          data-testid={
            entry.replay_available ? "server-recover" : "server-check-status"
          }
        >
          {busy
            ? "Working…"
            : entry.replay_available
              ? SERVER_RECOVERY_ACTION_LABEL
              : SERVER_RECOVERY_CHECK_LABEL}
        </Button>
      )}
    </li>
  );
}

export function ServerRecoveryPanel({
  entries,
  loading,
  error,
  onRecover,
  onRetry,
  busy,
  recoveryError,
  onDismissRecoveryError,
}: {
  entries: RecoverableRequest[];
  loading: boolean;
  /** Discovery itself failed. Distinct from a failed recovery attempt. */
  error: TeamSimError | null;
  onRecover: (entry: RecoverableRequest) => void;
  onRetry: () => void;
  busy: boolean;
  /** The last collect attempt that failed (expired, still running, offline). */
  recoveryError: TeamSimError | null;
  onDismissRecoveryError: () => void;
}) {
  // A signed-out or guest visitor has nothing to recover, and the backend says
  // so with the same 401/403 every other authenticated surface uses. That is
  // an ordinary state, not a fault, so it renders as nothing at all.
  if (error && (error.status === 401 || error.status === 403)) return null;
  // Nothing to show and nothing to say: no empty card on a first visit, and
  // nothing while the first load is still in flight either. A secondary
  // surface with no action on it should not announce itself twice — once to
  // say it is loading and once to say it found nothing — on a page that is
  // already telling the operator the catalog is loading.
  if (loading && !recoveryError) return null;
  if (!error && !recoveryError && entries.length === 0) return null;

  return (
    <Card className="space-y-2 p-3" data-testid="server-recovery">
      <h2 className="text-sm font-semibold">{SERVER_RECOVERY_TITLE}</h2>
      <p className="text-xs text-muted-foreground">{SERVER_RECOVERY_BODY}</p>

      {recoveryError ? (
        <div
          className="flex flex-wrap items-start justify-between gap-2 rounded border border-amber-500/60 p-2"
          role="alert"
          data-testid="server-recovery-error"
        >
          <p className="min-w-0 flex-1 break-words text-[11px]">
            {recoveryError.message}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={onDismissRecoveryError}
            data-testid="dismiss-server-recovery-error"
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {loading ? (
        // Only reachable while a recovery error is on screen — a refetch
        // running underneath a message the operator still needs to read.
        <p className="text-[11px] text-muted-foreground">
          {SERVER_RECOVERY_LOADING}
        </p>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 break-words text-[11px] text-muted-foreground">
            {SERVER_RECOVERY_UNAVAILABLE}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={onRetry}
            data-testid="server-recovery-retry"
          >
            {SERVER_RECOVERY_RETRY_LABEL}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {SERVER_RECOVERY_EMPTY}
        </p>
      ) : (
        <ul className="m-0 list-none p-0" data-testid="server-recovery-list">
          {entries.map((entry) => (
            <RecoverableRow
              key={entry.recovery_id}
              entry={entry}
              onRecover={onRecover}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
