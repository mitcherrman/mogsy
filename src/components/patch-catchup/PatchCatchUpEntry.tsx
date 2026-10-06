import { useContext } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight, Link2 } from "lucide-react";
import type { CatchUpRiotLine } from "@/lib/patch-catchup";
import type { PatchEntityType } from "@/lib/patch-reports/api";
import { hasExactValues } from "@/lib/patch-reports/report-structure";
import { cn } from "@/lib/utils";
import { DirectionChip, EntityImage } from "@/components/patch-reports/PatchReportEntityHeader";
import { PatchReportValueChange } from "@/components/patch-reports/PatchReportChangeLine";
import { PatchCatchUpContinuityChip, PatchCatchUpContinuityNote } from "./PatchCatchUpContinuityNote";
import type { CatchUpEntryModel, CatchUpStepModel } from "./presentation";
import { CatchUpRenderContextProvider, type CatchUpRenderContext } from "./render-context";
import { patchReportHref } from "./route";

function useRenderContext(): CatchUpRenderContext {
  const ctx = useContext(CatchUpRenderContextProvider);
  if (!ctx) throw new Error("Catch-Up rows must render inside CatchUpRenderContextProvider");
  return ctx;
}

const WRAP = "[overflow-wrap:anywhere]";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60";

const TYPE_LABEL: Record<PatchEntityType, string> = {
  champion: "Champion",
  item: "Item",
  rune: "Rune",
  system: "System",
};

const CatchUpLine = ({ line, entryId }: { line: CatchUpRiotLine; entryId: string }) => {
  const { chainByLine, wording, onLeaveToReport } = useRenderContext();
  const { change } = line;
  const property = (change.property_name || "").trim();
  const prose = (change.detail_text || "").trim();
  const labelled = Boolean(property);
  const mechanical = change.change_kind === "mechanical";
  const chainInfo = chainByLine.get(line.id) ?? null;

  const newBadge = change.is_new && (
    <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
      New
    </span>
  );
  // Same grammar as the Patch Report: Riot's raw strings, neutral arrow, prose as published.
  const body = hasExactValues(change) ? (
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
    <p className="text-sm italic text-muted-foreground">Riot published no exact values for this change.</p>
  );
  const trailDot = chainInfo && !chainInfo.isLast && (
    <span
      data-testid="catchup-trail-dot"
      title={chainInfo.nextPatch ? `Continues in Patch ${chainInfo.nextPatch}` : undefined}
      className="inline-flex items-center"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#c9a84c]" />
      {chainInfo.nextPatch && <span className="sr-only">(continues in Patch {chainInfo.nextPatch})</span>}
    </span>
  );

  return (
    <li data-testid="catchup-line" data-line-id={line.id} data-change-kind={change.change_kind} className="py-2">
      <div className="flex items-start gap-2">
        <div className={cn("grid min-w-0 flex-1 gap-x-4 gap-y-1", labelled && "sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)]")}>
          {labelled && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {newBadge}
              <span className={cn("text-sm font-semibold", WRAP)}>{property}</span>
              {trailDot}
            </div>
          )}
          <div className="flex min-w-0 items-start gap-2">
            {!labelled && mechanical && (
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-[#c9a84c]/70" />
            )}
            {!labelled && newBadge}
            {!labelled && trailDot}
            <div className="min-w-0 flex-1">{body}</div>
          </div>
        </div>
        <Link
          to={patchReportHref(line.patch, line.target.change)}
          onClick={(e) => onLeaveToReport(entryId, e)}
          aria-label={`View Patch ${line.patch} change: ${line.entityName}${property ? ` ${property}` : ""}`}
          data-testid="catchup-line-link"
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-[#c9a84c]",
            FOCUS,
          )}
        >
          <Link2 aria-hidden className="h-4 w-4" />
        </Link>
      </div>
      {chainInfo?.isLast && (
        <PatchCatchUpContinuityNote id={chainInfo.noteId} chain={chainInfo.chain} context={wording} />
      )}
    </li>
  );
};

const CatchUpStep = ({ step, entry }: { step: CatchUpStepModel; entry: CatchUpEntryModel }) => {
  const { onLeaveToReport } = useRenderContext();
  return (
    <li data-testid="catchup-step" data-patch={step.patch} className="border-l-2 border-[#c9a84c]/25 pl-3 sm:pl-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h5 className="text-sm font-semibold">
          <span className="sr-only">Patch </span>
          <span className="inline-block rounded-full border border-[#c9a84c]/50 bg-[#c9a84c]/10 px-2 py-0.5 font-mono text-xs text-[#d8bd70]">
            {step.patch}
          </span>
        </h5>
        {step.editorial && <DirectionChip editorial={step.editorial} />}
        <Link
          to={patchReportHref(step.patch, step.entityAnchor)}
          onClick={(e) => onLeaveToReport(entry.id, e)}
          data-testid="catchup-step-link"
          className={cn(
            "inline-flex min-h-8 items-center gap-1 rounded text-xs text-muted-foreground underline-offset-2 hover:text-[#c9a84c] hover:underline sm:ml-auto",
            FOCUS,
          )}
        >
          View in Patch {step.patch}
          <span className="sr-only"> report: {entry.name}</span>
          <ArrowUpRight aria-hidden className="h-3 w-3" />
        </Link>
      </div>
      {step.riotNote && (
        <details className="group mt-1 text-xs text-muted-foreground" data-testid="catchup-riot-note">
          <summary
            className={cn(
              "inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1 rounded py-1 pr-1 hover:text-foreground",
              FOCUS,
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <ChevronRight
              aria-hidden
              className="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none [details[open]_&]:rotate-90"
            />
            Riot&apos;s note
          </summary>
          <p className={cn("mb-1 ml-4 border-l border-border pl-3 text-sm leading-relaxed text-foreground/85", WRAP)}>
            {step.riotNote}
          </p>
        </details>
      )}
      {step.groups.map((group) => (
        <div key={group.key} className="mt-1">
          {group.title && (
            <h6 className={cn("mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", WRAP)}>
              {group.title}
            </h6>
          )}
          <ul className="divide-y divide-border/50">
            {group.lines.map((line) => (
              <CatchUpLine key={line.id} line={line} entryId={entry.id} />
            ))}
          </ul>
        </div>
      ))}
    </li>
  );
};

/**
 * One Catch-Up entry: a champion / item / mode entity within ONE official
 * section, with its patch steps oldest first. Lighter than a Patch Report card:
 * no per-line Mogzy evidence, no reconciliation marks, no Patch Impact.
 */
export const PatchCatchUpEntry = ({ entry }: { entry: CatchUpEntryModel }) => {
  const { chainByLine, wording } = useRenderContext();
  const system = entry.entityType === "system";
  const noteIdOf = (chain: CatchUpEntryModel["chains"][number]) =>
    chainByLine.get(chain.steps[chain.steps.length - 1].line.id)?.noteId ?? null;
  return (
    <article
      id={entry.id}
      aria-labelledby={`${entry.id}-title`}
      data-testid="catchup-entry"
      data-entry-key={entry.key}
      className="scroll-mt-24 rounded-xl border border-border bg-card/40 px-3 py-3 sm:px-4"
    >
      <header className="flex items-start gap-3">
        {system ? (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[#c9a84c]/80 sm:h-12 sm:w-12"
          >
            ◇
          </span>
        ) : (
          <EntityImage card={entry.card} sizeClassName="h-10 w-10 sm:h-12 sm:w-12" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h4 id={`${entry.id}-title`} className={cn("text-lg font-bold leading-tight", WRAP)}>
              {entry.name}
            </h4>
            <PatchCatchUpContinuityChip chains={entry.chains} noteIdOf={noteIdOf} context={wording} />
          </div>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {!system && <span>{TYPE_LABEL[entry.entityType]} ·</span>}
            <span>
              {entry.lineCount} {entry.lineCount === 1 ? "change" : "changes"} ·
            </span>
            <span className={WRAP}>{entry.patches.join(", ")}</span>
          </p>
        </div>
      </header>
      <ol className="mt-3 space-y-4" aria-label={`${entry.name} changes by patch`}>
        {entry.steps.map((step) => (
          <CatchUpStep key={step.key} step={step} entry={entry} />
        ))}
      </ol>
    </article>
  );
};
