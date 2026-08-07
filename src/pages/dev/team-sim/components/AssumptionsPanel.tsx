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
      <p className="text-[11px] text-muted-foreground">
        This endpoint has no client-retry idempotency. A repeated request after a lost
        response is a new billable simulation.
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
