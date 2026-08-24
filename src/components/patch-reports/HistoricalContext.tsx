import type {
  HistoricalClassification,
  PatchHistoricalContext,
} from "@/lib/patch-reports/api";
import { formatHistoricalValue } from "@/lib/patch-reports/history";

type DisplayDefinition = {
  label: string;
  proposedLabel: string;
  description: (patch: string | null, proposed: boolean) => string;
};

const DISPLAY: Partial<Record<HistoricalClassification, DisplayDefinition>> = {
  exact_revert: {
    label: "Exact Revert",
    proposedLabel: "Would be an Exact Revert",
    description: (patch, proposed) =>
      `${proposed ? "Would restore" : "Restores"} the value removed${patch ? ` in Patch ${patch}` : " by an earlier change"}.`,
  },
  partial_revert: {
    label: "Partial Revert",
    proposedLabel: "Would be a Partial Revert",
    description: (patch, proposed) =>
      `${proposed ? "Would restore" : "Restores"} part of the earlier change${patch ? ` from Patch ${patch}` : ""}.`,
  },
  over_revert: {
    label: "Over-Revert",
    proposedLabel: "Would be an Over-Revert",
    description: (patch, proposed) =>
      `${proposed ? "Would restore" : "Restores"} the earlier change${patch ? ` from Patch ${patch}` : ""} and moves beyond the previous value.`,
  },
  return_to_historical_state: {
    label: "Returns to Previous Value",
    proposedLabel: "Would Return to a Previous Value",
    description: (patch, proposed) =>
      `This parameter ${proposed ? "would return" : "has returned"} to a value previously seen${patch ? ` in Patch ${patch}` : ""}.`,
  },
};

function isProposed(context: PatchHistoricalContext): boolean {
  return Boolean(context.hypothetical && context.lifecycle !== "shipped");
}

function ValueLineage({ context }: { context: PatchHistoricalContext }) {
  const historicalBefore = formatHistoricalValue(context.reference?.before);
  const historicalAfter = formatHistoricalValue(context.reference?.after);
  const proposedAfter = formatHistoricalValue(context.normalized_after);
  const values = [historicalBefore, historicalAfter, proposedAfter].filter(Boolean);
  if (values.length < 2) return null;
  return (
    <p className="mt-1 break-words font-mono text-xs font-semibold text-foreground">
      {values.map((value, index) => (
        <span key={`${value}-${index}`}>
          {index > 0 && <span aria-hidden className="px-1 text-[#c9a84c]">→</span>}
          {value}
        </span>
      ))}
    </p>
  );
}

export function HistoricalContext({ context }: { context?: PatchHistoricalContext | null }) {
  if (!context) return null;

  if (context.status === "mismatch" && context.reason === "before_value_mismatch") {
    return (
      <p className="mt-2 text-xs text-amber-300/90" data-testid="history-mismatch">
        History check unavailable — the verified historical value does not match this patch
        note&apos;s starting value.
      </p>
    );
  }

  if (context.status !== "analyzed" || !context.classification) return null;
  const display = DISPLAY[context.classification];
  if (!display) return null;

  const proposed = isProposed(context);
  const patch = context.reference?.patch_version ?? null;
  const restoresMultiple = context.flags?.includes("restores_multiple_changes");

  return (
    <aside
      className="mt-2 max-w-2xl rounded-md border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-3 py-2"
      aria-label="Historical context"
      data-testid="historical-context"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Historical Context
      </p>
      <p className="mt-0.5 text-sm font-semibold text-[#d8bd70]">
        {proposed ? display.proposedLabel : display.label}
      </p>
      <ValueLineage context={context} />
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {display.description(patch, proposed)}
        {restoresMultiple && " Reverses multiple intervening changes."}
      </p>

      {(context.reference || context.current_source?.url) && (
        <details className="mt-1.5 text-xs text-muted-foreground">
          <summary className="min-h-8 cursor-pointer select-none py-1 font-medium text-[#c9a84c] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60">
            Why?
          </summary>
          <div className="space-y-1 border-l border-border pl-2">
            {patch && <p>Reference patch: {patch}</p>}
            {context.calendar_days_elapsed != null && (
              <p>{context.calendar_days_elapsed.toLocaleString()} days between verified states</p>
            )}
            {context.calendar_days_elapsed == null && context.patches_elapsed != null && (
              <p>{context.patches_elapsed.toLocaleString()} patches between verified states</p>
            )}
            {context.reference?.source?.url && (
              <a
                href={context.reference.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-fit underline hover:text-[#c9a84c]"
              >
                View historical source
              </a>
            )}
            {context.current_source?.url && (
              <a
                href={context.current_source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-fit underline hover:text-[#c9a84c]"
              >
                View current Riot source
              </a>
            )}
          </div>
        </details>
      )}
    </aside>
  );
}
