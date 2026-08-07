/**
 * How a failed simulation is reported.
 *
 * The one rule this component exists to keep: never claim more certainty than
 * the response carries. A status the server actually returned for a rejected
 * request says the simulation did not run; a 5xx or a lost connection says the
 * outcome is unknown, and the operator is told not to retry automatically.
 *
 * Nothing here retries, and nothing here offers a "retry" button — running
 * again is the ordinary Run control, which is an explicit new action.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CombatLabCreditStatus } from "@/lib/combat-lab/api";
import {
  UNCERTAIN_STATUS_WARNING,
  type TeamSimError,
} from "@/lib/combat-lab/team-sim/errors";

const TITLES: Record<string, string> = {
  auth_required: "Sign-in required",
  account_required: "Account required",
  insufficient_credits: "Out of Combat Lab credits",
  request_too_large: "Scenario too large",
  invalid_request: "Scenario rejected",
  rate_limited: "Rate limited",
  server_error: "Server failure",
  network: "No response",
  malformed_response: "Unreadable response",
};

export function FailureNotice({
  error,
  teamShape,
  chargedOnlyOnSuccess,
  onDismiss,
}: {
  error: TeamSimError;
  teamShape: string;
  /** `pricing.charged_only_on_success` from the catalog — read, not assumed. */
  chargedOnlyOnSuccess: boolean;
  onDismiss: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const credits = (error.credits ?? null) as CombatLabCreditStatus | null;

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
          {UNCERTAIN_STATUS_WARNING}
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
