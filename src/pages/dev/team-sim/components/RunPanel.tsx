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
  isPending: boolean;
  onRun: () => void;
  onReset: () => void;
  hasResult: boolean;
  onClearResult: () => void;
}) {
  const blocked = issues.length > 0;

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
        {isPending ? "Simulating…" : "Run simulation"}
      </Button>

      {isPending ? (
        <p className="text-[11px] text-muted-foreground" role="status">
          Running. The editor stays open; a second request cannot be sent until this
          one finishes.
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
