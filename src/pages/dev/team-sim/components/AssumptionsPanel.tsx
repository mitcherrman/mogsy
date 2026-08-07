/**
 * What this engine does and does not model.
 *
 * Populated from the backend/catalog, never from a hand-written list that
 * could drift. The sequential same-timestamp rule is surfaced OUTSIDE the
 * collapsible section on purpose: it is the assumption most likely to be
 * mistaken for real simultaneous combat.
 */
import { useState } from "react";

import { Card } from "@/components/ui/card";

export function AssumptionsPanel({
  unsupportedMechanics,
  schedulerAssumptions,
  executionAssumptions,
  rateLimit,
}: {
  unsupportedMechanics: string[];
  schedulerAssumptions?: Record<string, string>;
  executionAssumptions?: Record<string, unknown>;
  rateLimit?: { limit: number; window_seconds: number } | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="space-y-2 p-3" data-testid="assumptions">
      <h2 className="text-sm font-semibold">Model assumptions</h2>
      <p className="text-xs" data-testid="sequential-assumption">
        Actions scheduled at the same timestamp resolve <strong>sequentially</strong> in
        scenario slot order — deterministic, but never simultaneous. There is no combat
        AI: every action and target below is exactly what was configured.
      </p>
      {/* Read from the catalog, not asserted.
          This line was hand-written in Phase 4B, when it was true. The backend
          has published `client_retry_idempotency: true` since Phase 4C, and by
          Phase 4D this panel sits directly beneath a "recover without another
          charge" control — so the stale sentence was not merely out of date,
          it contradicted a live money claim on the same screen and pointed the
          operator away from the one safe action. It now says what the catalog
          says, and falls back to the strict warning when the catalog is absent
          or silent: over-warning costs a click, under-warning costs credits. */}
      <p className="text-[11px] text-muted-foreground" data-testid="idempotency-assumption">
        {executionAssumptions?.client_retry_idempotency === true
          ? typeof executionAssumptions?.retry_warning === "string"
            ? `This endpoint supports client-retry idempotency: ${executionAssumptions.retry_warning}.`
            : "This endpoint supports client-retry idempotency. Re-sending the identical request with the same Idempotency-Key returns the stored result instead of charging again; any other resend is a new billable simulation."
          : "This endpoint does not declare client-retry idempotency. A repeated request after a lost response is a new billable simulation."}
      </p>

      <button
        type="button"
        className="text-[11px] underline text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} full assumptions and unsupported mechanics
      </button>

      {open ? (
        <div className="space-y-3">
          {unsupportedMechanics.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Not modelled
              </h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                {unsupportedMechanics.map((mechanic) => (
                  <li key={mechanic}>{mechanic}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {schedulerAssumptions && Object.keys(schedulerAssumptions).length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Scheduler assumptions
              </h3>
              <dl className="mt-1 space-y-1 text-[11px]">
                {Object.entries(schedulerAssumptions).map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono text-muted-foreground">{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {executionAssumptions && Object.keys(executionAssumptions).length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Execution assumptions
              </h3>
              <dl className="mt-1 space-y-1 text-[11px]">
                {Object.entries(executionAssumptions).map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono text-muted-foreground">{key}</dt>
                    <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {rateLimit ? (
            <p className="text-[11px] text-muted-foreground">
              Rate limit: {rateLimit.limit} simulations per {rateLimit.window_seconds}s per
              account.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
