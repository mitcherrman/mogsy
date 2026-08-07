/**
 * How a failed simulation is reported.
 *
 * The one rule this component exists to keep: never claim more certainty than
 * the response carries. A status the server actually returned for a rejected
 * request says the simulation did not run; a 5xx or a lost connection says the
 * outcome is unknown.
 *
 * Phase 4C adds ONE control, and only for outcomes that are genuinely
 * uncertain: "Check this request" re-sends the identical request with its
 * original idempotency key. That is not a retry in the dangerous sense — the
 * backend replays the result it already produced, or reports it still running,
 * and it cannot charge twice. Everything else is unchanged: nothing retries on
 * its own, and starting a NEW simulation is still the ordinary Run control.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CombatLabCreditStatus } from "@/lib/combat-lab/api";
import {
  isRecoverable,
  RECOVERY_ACTION_HINT,
  RECOVERY_ACTION_LABEL,
  UNCERTAIN_STATUS_WARNING,
  UNCERTAIN_STATUS_WARNING_NO_RECOVERY,
  UNRESOLVED_REQUEST_LEAVE_WARNING,
  UNRESOLVED_REQUEST_LEAVE_WARNING_RECOVERABLE,
  type TeamSimError,
} from "@/lib/combat-lab/team-sim/errors";

const TITLES: Record<string, string> = {
  auth_required: "Sign-in required",
  account_required: "Account required",
  insufficient_credits: "Out of Combat Lab credits",
  request_too_large: "Scenario too large",
  invalid_request: "Scenario rejected",
  rate_limited: "Rate limited",
  idempotency_conflict: "Request identifier already used",
  idempotency_in_progress: "Still running",
  idempotency_key_rejected: "Request identifier rejected",
  service_unavailable: "Request refused",
  result_unreadable: "Result unavailable",
  server_error: "Server failure",
  network: "No response",
  malformed_response: "Unreadable response",
};

export function FailureNotice({
  error,
  teamShape,
  chargedOnlyOnSuccess,
  onRecover,
  onDismiss,
  recoveryPersisted = false,
}: {
  error: TeamSimError;
  teamShape: string;
  /**
   * `billing.charged_only_on_success` from the catalog — read, not assumed.
   * False also covers "no catalog is loaded", which is honestly not-knowable.
   */
  chargedOnlyOnSuccess: boolean;
  /** Re-send this exact request with its original key (Phase 4C). */
  onRecover?: () => void;
  onDismiss: () => void;
  /**
   * The key and body are also in browser session storage (Phase 4D), so a
   * reload no longer destroys the recovery. Defaults to false, which keeps
   * the stricter pre-4D sentence — a warning that overpromises durability is
   * the one failure mode this flag must never have.
   */
  recoveryPersisted?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const credits = (error.credits ?? null) as CombatLabCreditStatus | null;
  const canRecover = !!onRecover && isRecoverable(error);

  return (
    <Card
      className="space-y-2 border-destructive/50 p-3"
      role="alert"
      data-testid="failure-notice"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-destructive">
            {TITLES[error.kind] ?? "Simulation failed"}
            {error.status ? (
              <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
                HTTP {error.status}
                {error.code ? ` · ${error.code}` : ""}
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs">{error.message}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>

      {/* Default to UNCERTAIN. Only a value that is explicitly classified as a
          server rejection may claim the simulation did not run; anything
          unclassified must fail toward the warning, never away from it. */}
      {error.certainty !== "rejected" ? (
        <p
          className="rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs font-medium"
          data-testid="uncertain-warning"
        >
          {/* The sentence follows the CONTROL, not the phase. Promising
              "Check this request" while no such button is on screen would be
              the worst of both worlds. */}
          {canRecover
            ? `${UNCERTAIN_STATUS_WARNING} ${
                recoveryPersisted
                  ? UNRESOLVED_REQUEST_LEAVE_WARNING_RECOVERABLE
                  : UNRESOLVED_REQUEST_LEAVE_WARNING
              }`
            : UNCERTAIN_STATUS_WARNING_NO_RECOVERY}
        </p>
      ) : error.kind === "idempotency_in_progress" ? (
        // A rejection of THIS attempt that says nothing about the original
        // request, which is still running. Claiming "nothing was charged"
        // here would be wrong about the request the operator cares about.
        <p
          className="rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs font-medium"
          data-testid="in-progress-note"
        >
          The original {teamShape} request is still running on the server. This
          attempt started nothing new. Check again in a moment to collect its
          result.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground" data-testid="rejected-note">
          The server rejected this {teamShape} request before the simulation ran.
          {chargedOnlyOnSuccess
            ? " The catalog states this endpoint charges only on a successful simulation."
            : " The catalog does not state that this endpoint charges only on success, so the credit outcome is not knowable from this response."}{" "}
          The balance shown above was re-read from the server.
        </p>
      )}

      {canRecover ? (
        <div className="space-y-1">
          {/* No pending state here: `run` clears the failure synchronously, so
              this whole notice unmounts the moment recovery starts and the
              RunPanel takes over showing progress. A disabled/"Checking…"
              branch would be unreachable code pretending to be feedback. */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={onRecover}
            data-testid="recover-request"
          >
            {RECOVERY_ACTION_LABEL}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {RECOVERY_ACTION_HINT}
          </p>
        </div>
      ) : null}

      {error.retryAfterSeconds !== null ? (
        <p className="text-[11px] text-muted-foreground">
          The server suggests waiting {error.retryAfterSeconds}s. Running again is a new
          request — nothing retries on its own.
        </p>
      ) : null}

      {credits ? (
        <p className="text-[11px] text-muted-foreground" data-testid="failure-credits">
          Server credit status: {credits.credits_used} used
          {credits.credits_limit !== null ? ` of ${credits.credits_limit}` : ""}
          {credits.credits_remaining !== null
            ? `, ${credits.credits_remaining} remaining`
            : ""}
          .
        </p>
      ) : null}

      {error.detail ? (
        <div>
          <button
            type="button"
            className="text-[11px] underline text-muted-foreground hover:text-foreground"
            onClick={() => setShowDetail((v) => !v)}
          >
            {showDetail ? "Hide" : "Show"} operator detail
          </button>
          {showDetail ? (
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-tight">
              {safeJson(error.detail)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}
