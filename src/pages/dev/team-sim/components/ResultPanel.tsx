/**
 * The result surface: outcome, per-team and per-combatant metrics.
 *
 * Every number here is read straight out of the response. No damage total is
 * recomputed from the event trace — `combatant_summaries` covers the whole
 * simulation while `events` may be truncated, so summing the trace would
 * silently disagree with the engine.
 */
import { Card } from "@/components/ui/card";
import type { TeamSimulationResponse } from "@/lib/combat-lab/team-sim/contract";
import {
  deathOrder,
  formatNumber,
  formatSeconds,
  orderedRuntimeIds,
  resultOverview,
} from "@/lib/combat-lab/team-sim/result";

export function ResultPanel({
  response,
  quotedCreditCost,
  stale,
  replayed,
}: {
  response: TeamSimulationResponse;
  /** Catalog-quoted price for the shape. The response reports no per-run cost. */
  quotedCreditCost: number | null;
  stale: boolean;
  /**
   * The server replayed a stored result rather than running a new simulation
   * (Phase 4C). Shown rather than swallowed: "I collected the result I already
   * paid for" and "I bought another one" look identical otherwise, which is
   * precisely the ambiguity the idempotency key exists to remove.
   */
  replayed?: boolean;
}) {
  const overview = resultOverview(response);
  const deaths = deathOrder(response);
  const ids = orderedRuntimeIds(response);
  const credits = response.credits;

  return (
    <Card className="space-y-4 p-3" data-testid="result-panel">
      {stale ? (
        <p
          className="rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs font-medium"
          data-testid="stale-result-banner"
        >
          Result from a previous configuration — the editor has changed since this
          simulation ran. Nothing re-runs automatically.
        </p>
      ) : null}

      {replayed ? (
        <p
          className="rounded border border-emerald-500/60 bg-emerald-500/10 p-2 text-xs font-medium"
          data-testid="replayed-result-banner"
        >
          Recovered — the server returned the result it had already produced for
          this request. No new simulation ran and no credits were spent.
        </p>
      ) : null}

      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold" data-testid="result-outcome">
          {overview.outcomeLabel}
        </h2>
        <span className="text-xs text-muted-foreground" data-testid="result-termination">
          ended: {overview.terminationReason}
        </span>
        <span className="text-xs text-muted-foreground">
          duration {formatSeconds(overview.duration)}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="result-event-count">
          {overview.returnedEventCount} of {overview.simulatedEventCount} events shown
        </span>
        <span className="text-xs text-muted-foreground" data-testid="result-cost">
          quoted cost{" "}
          {quotedCreditCost === null
            ? "unknown"
            : `${quotedCreditCost} credit${quotedCreditCost === 1 ? "" : "s"}`}
        </span>
      </header>

      <p className="text-[11px] text-muted-foreground">{overview.terminationDetail}</p>

      {/* The response reports the post-charge BALANCE, not a per-run amount, so
          the figure above is labelled as the catalog's quote and the server's
          own numbers are shown beside it rather than in place of them. */}
      <p className="text-[11px] text-muted-foreground" data-testid="result-credits">
        Server credit status after this run: {credits.credits_used} used
        {credits.credits_limit !== null ? ` of ${credits.credits_limit}` : ""}
        {credits.credits_remaining !== null
          ? `, ${credits.credits_remaining} remaining`
          : credits.unlimited
            ? ", unlimited"
            : ""}
        .
      </p>

      {response.warnings.length > 0 ? (
        <ul className="space-y-0.5 text-[11px] text-amber-600 dark:text-amber-400">
          {response.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <section aria-label="Team summaries" className="grid gap-2 sm:grid-cols-2">
        {Object.values(response.team_summaries).map((team) => (
          <div key={team.team_id} className="rounded border border-border p-2 text-xs">
            <h3 className="font-semibold">
              Team {team.team_id}
              {team.eliminated ? (
                <span className="ml-2 text-destructive">eliminated</span>
              ) : null}
            </h3>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <Metric label="Damage dealt" value={formatNumber(team.damage_dealt_total)} />
              <Metric label="Damage taken" value={formatNumber(team.damage_taken_total)} />
              <Metric label="Healing applied" value={formatNumber(team.healing_applied)} />
              <Metric label="Actions executed" value={String(team.actions_executed)} />
              <Metric label="Living" value={team.living.join(", ") || "—"} />
              <Metric label="Dead" value={team.dead.join(", ") || "—"} />
            </dl>
          </div>
        ))}
      </section>

      <section aria-label="Combatant summaries" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Combatants
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {ids.map((id) => {
            const summary = response.combatant_summaries[id];
            if (!summary) return null;
            return (
              <div
                key={id}
                className="rounded border border-border p-2 text-xs"
                data-testid={`combatant-summary-${id}`}
              >
                <h4 className="font-semibold">
                  <span className="rounded bg-primary/15 px-1 font-mono text-[11px]">{id}</span>{" "}
                  {summary.champion}{" "}
                  <span className={summary.alive ? "text-emerald-600" : "text-destructive"}>
                    {summary.alive ? "alive" : "dead"}
                  </span>
                </h4>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  <Metric
                    label="Final HP"
                    value={`${formatNumber(summary.final_hp)} / ${formatNumber(summary.max_hp)}`}
                  />
                  <Metric
                    label="Death time"
                    value={summary.death_time === null ? "—" : formatSeconds(summary.death_time)}
                  />
                  <Metric label="Damage dealt" value={formatNumber(summary.damage_dealt_total)} />
                  <Metric label="Damage taken" value={formatNumber(summary.damage_taken_total)} />
                  <Metric label="Healing generated" value={formatNumber(summary.healing_generated)} />
                  <Metric label="Healing applied" value={formatNumber(summary.healing_applied)} />
                  <Metric
                    label="Actions"
                    value={`${summary.actions_executed}/${summary.actions_attempted} executed`}
                  />
                  <Metric
                    label="Failed / skipped / delayed"
                    value={`${summary.failures} / ${summary.skips} / ${summary.delays}`}
                  />
                  <Metric label="Target changes" value={String(summary.target_changes)} />
                  <Metric label="Final target" value={summary.final_target_id ?? "—"} />
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      {deaths.length > 0 ? (
        <section aria-label="Death order" data-testid="death-order">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Death order
          </h3>
          <ol className="mt-1 space-y-0.5 text-[11px]">
            {deaths.map((death) => (
              <li key={death.runtimeId}>
                {formatSeconds(death.time)} — <strong>{death.runtimeId}</strong> died
                {death.selfInflicted
                  ? " (self-inflicted)"
                  : death.killerId
                    ? ` (killed by ${death.killerId})`
                    : death.attributionUnavailable
                      ? " (killer not in the returned trace)"
                      : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </>
  );
}
