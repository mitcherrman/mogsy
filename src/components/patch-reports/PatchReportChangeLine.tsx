import { ChevronRight } from "lucide-react";
import type { MogzyStatus, PatchReportChange } from "@/lib/patch-reports/api";
import { hasExactValues } from "@/lib/patch-reports/report-structure";
import { cn } from "@/lib/utils";
import { HistoricalContext } from "./HistoricalContext";
import type { PatchReportChangeContext, PatchReportEntrySlots } from "./PatchReportEntrySlots";
import { PatchReportStatusMark, StatusBadge } from "./PatchReportStatus";

const WRAP = "[overflow-wrap:anywhere]";

/**
 * Exact Riot notation. The values are the raw published strings, untouched:
 * units, rank arrays and wording ("Unchanged") are Riot's, not ours. The arrow
 * is neutral on purpose — a smaller number is a buff for a cooldown and a
 * nerf for damage, and this slice never claims to know which.
 */
export const PatchReportValueChange = ({
  before,
  after,
  isNew = false,
}: {
  before: string | null;
  after: string | null;
  isNew?: boolean;
}) => (
  <p
    data-testid="patch-report-values"
    className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[15px] leading-snug", WRAP)}
  >
    {before ? (
      <>
        <span className="sr-only">From </span>
        <span className="rounded bg-muted/70 px-2 py-0.5 text-muted-foreground line-through decoration-muted-foreground/60">
          {before}
        </span>
      </>
    ) : (
      isNew && <span className="sr-only">Newly added. </span>
    )}
    {/* Arrow and "after" wrap as one unit, so a narrow screen never strands
        the arrow at the end of the "before" line. */}
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      {before && (
        <span aria-hidden className="shrink-0 text-base font-bold text-[#c9a84c]">
          →
        </span>
      )}
      {before && <span className="sr-only"> to </span>}
      {after ? (
        <span className="rounded border border-[#c9a84c]/40 bg-[#c9a84c]/10 px-2 py-0.5 font-semibold text-foreground">
          {after}
        </span>
      ) : (
        <span className="italic text-muted-foreground">no after value published</span>
      )}
    </span>
  </p>
);

const MogzyEvidence = ({ change }: { change: PatchReportChange }) => {
  const numeric = change.change_kind === "numeric";
  return (
    <details className="group text-xs text-muted-foreground" data-testid="patch-report-evidence">
      <summary
        className={cn(
          "inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1 rounded py-1 pr-1",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <ChevronRight
          aria-hidden
          className="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none [details[open]_&]:rotate-90"
        />
        <PatchReportStatusMark status={change.mogzy_status} />
        <span className="sr-only">(show Mogzy data for this change)</span>
      </summary>
      <div className="mb-1 ml-4 space-y-1 border-l border-border pl-3">
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge status={change.mogzy_status} />
          {change.proposal_status && (
            <span className="text-[11px]">review: {change.proposal_status.toLowerCase()}</span>
          )}
        </p>
        {numeric ? (
          <p>
            Mogzy currently:{" "}
            {change.mogzy_current_raw ? (
              <span className={cn("font-mono", WRAP)}>{change.mogzy_current_raw}</span>
            ) : (
              <span className="italic">value not available in Mogzy</span>
            )}
          </p>
        ) : (
          <p className="italic">No exact Mogzy value is tracked for this change.</p>
        )}
        {change.mogzy_property && (
          <p>
            Compared against Mogzy property <span className="font-mono">{change.mogzy_property}</span>
          </p>
        )}
      </div>
    </details>
  );
};

/**
 * A prose-only change with no review, no tracked value and the same status the
 * entry header already shows has nothing further to disclose. Without this, a
 * 90-note mode bucket repeats an identical "Mogzy: …" row 90 times. Anything
 * that differs from the entry status, or carries real evidence, keeps its row.
 */
function restatesEntityStatus(change: PatchReportChange, entityStatus: MogzyStatus): boolean {
  return (
    change.change_kind === "mechanical" &&
    (change.mogzy_status === "not_represented" || change.mogzy_status === "needs_interpretation") &&
    change.mogzy_status === entityStatus &&
    !change.proposal_status &&
    !change.mogzy_current_raw &&
    !change.mogzy_property
  );
}

export const PatchReportChangeLine = ({
  ctx,
  slots,
}: {
  ctx: PatchReportChangeContext;
  slots?: PatchReportEntrySlots;
}) => {
  const { change, node } = ctx;
  const exact = hasExactValues(change);
  const mechanical = change.change_kind === "mechanical";
  const property = (change.property_name || "").trim();
  const prose = (change.detail_text || "").trim();
  const labelled = Boolean(property);

  const newBadge = change.is_new && (
    <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
      New
    </span>
  );

  const body = exact ? (
    <PatchReportValueChange
      before={change.before_raw?.trim() || null}
      after={change.after_raw?.trim() || null}
      isNew={change.is_new}
    />
  ) : prose ? (
    <p className={cn("text-sm leading-relaxed text-foreground/90", WRAP)}>
      {mechanical && <span className="sr-only">Mechanic change: </span>}
      {prose}
    </p>
  ) : (
    <p className="text-sm italic text-muted-foreground">
      Riot published no exact values for this change.
    </p>
  );

  return (
    <li
      id={node.anchor}
      data-testid="patch-report-change"
      data-change-kind={change.change_kind}
      className="scroll-mt-24 py-2.5"
    >
      <div
        className={cn(
          "grid gap-x-4 gap-y-1",
          labelled && "sm:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)]",
        )}
      >
        {labelled ? (
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            {newBadge}
            <span className={cn("text-sm font-semibold", WRAP)}>{property}</span>
          </div>
        ) : null}
        <div className="flex min-w-0 items-start gap-2">
          {!labelled && mechanical && (
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-[#c9a84c]/70" />
          )}
          {!labelled && newBadge}
          <div className="min-w-0 flex-1">{body}</div>
        </div>
      </div>

      {slots?.changeAnalysis?.(ctx)}

      <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
        {!restatesEntityStatus(change, ctx.entity.card.aggregate_status) && (
          <MogzyEvidence change={change} />
        )}
        {slots?.changeActions?.(ctx)}
      </div>

      {change.change_kind === "numeric" && <HistoricalContext context={change.historical_context} />}
    </li>
  );
};
