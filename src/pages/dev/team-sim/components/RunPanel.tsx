/**
 * Cost preview + the one deliberate submit control.
 *
 * The button is the ONLY path to a billable POST. It is disabled while a
 * request is in flight, disabled while the draft has any validation issue, and
 * wired to nothing else — no control change, catalog refresh, focus event or
 * query retry can reach it.
 *
 * The remaining-credit figure is whatever the server last reported; this panel
 * never decrements it locally, and never predicts what a run will leave.
 */
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CombatLabCreditStatus } from "@/lib/combat-lab/api";
import type { DraftIssue } from "@/lib/combat-lab/team-sim/draft";

export function RunPanel({
  teamShape,
  creditCost,
  credits,
  creditsLoading,
  issues,
  isPending,
  pendingKind,
  onRun,
  onReset,
  hasResult,
  onClearResult,
}: {
  teamShape: string;
  creditCost: number | null;
  credits: CombatLabCreditStatus | null | undefined;
  creditsLoading: boolean;
  issues: DraftIssue[];
  /** Something is on the wire; every submit control is disabled. */
  isPending: boolean;
  /**
   * WHAT is on the wire (Phase 4E). Run must be disabled for either, but only
   * a simulation may be DESCRIBED as one: a free recovery reported as
   * "Simulating…" is this page overclaiming about money, which is the one
   * thing the whole Combat Lab surface is built not to do.
   */
  pendingKind?: "simulation" | "recovery" | null;
  onRun: () => void;
  onReset: () => void;
  hasResult: boolean;
  onClearResult: () => void;
}) {
  const blocked = issues.length > 0;
  // Absent `pendingKind` (no Phase 4E wiring) falls back to the pre-4E
  // reading, where the only thing that could be in flight was a simulation.
  const simulating = isPending && pendingKind !== "recovery";

  return (
    <Card className="space-y-3 p-3" data-testid="run-panel">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Simulation cost
        </p>
        <p className="text-lg font-semibold" data-testid="cost-preview">
          {creditCost === null
            ? `${teamShape} — cost unknown`
            : `${creditCost} credit${creditCost === 1 ? "" : "s"}`}
          {renderRemaining(credits, creditsLoading)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Team shape {teamShape}. Charged only on a successful simulation; the
          server's response is the authority on both cost and balance.
        </p>
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={isPending || blocked}
        onClick={onRun}
        data-testid="run-simulation"
      >
        {simulating ? "Simulating…" : "Run simulation"}
      </Button>

      {isPending ? (
        <p className="text-[11px] text-muted-foreground" role="status">
          {simulating
            ? "Running. The editor stays open; a second request cannot be sent until this one finishes."
            : "Collecting an earlier result. Nothing is being simulated and no credit is being used; a new run cannot start until it finishes."}
        </p>
      ) : null}

      {blocked ? (
        <ul className="space-y-0.5 text-[11px] text-destructive" data-testid="draft-issues">
          {issues.slice(0, 6).map((issue, i) => (
            <li key={`${issue.runtimeId ?? "-"}-${issue.field}-${i}`}>{issue.message}</li>
          ))}
          {issues.length > 6 ? <li>…and {issues.length - 6} more.</li> : null}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={onReset}
        >
          Reset scenario
        </Button>
        {hasResult ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClearResult}>
            Clear result
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function renderRemaining(
  credits: CombatLabCreditStatus | null | undefined,
  loading: boolean
) {
  if (loading) return <span className="text-sm font-normal text-muted-foreground"> • checking balance…</span>;
  if (!credits) return null;
  if (credits.unlimited) {
    return (
      <span className="text-sm font-normal text-muted-foreground"> • unlimited</span>
    );
  }
  if (credits.credits_remaining === null) return null;
  return (
    <span className="text-sm font-normal text-muted-foreground">
      {" "}
      • {credits.credits_remaining} remaining
    </span>
  );
}
