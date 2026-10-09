import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { IMPACT_MAX_LEVEL, clampImpactLevel } from "@/lib/patch-impact/math";
import type { ParameterFact, PatchImpactAnalysis, StatProjection } from "@/lib/patch-impact/types";
import { cn } from "@/lib/utils";
import { PatchImpactExplore } from "./PatchImpactExplore";
import { impactExploreCta } from "./cta";
import {
  formatDelta,
  formatParameterValue,
  formatRelative,
  formatStatValue,
  parameterLabel,
  projectedStatLabel,
} from "./format";
import { impactProvenanceKind } from "./provenance";
import { isProjectionLoadable } from "./state";

const WRAP = "[overflow-wrap:anywhere]";

/** Loading state of the richer (projected) analysis, owned by the integration wrapper. */
export type PatchImpactProjectionStatus = "idle" | "loading" | "error";

export type PatchImpactProps = {
  /**
   * The domain's analysis for one change, already computed. `null` / `undefined`
   * and `status: "unavailable"` render nothing at all.
   */
  analysis: PatchImpactAnalysis | null | undefined;
  /**
   * Loading state of the projection a wrapper may be fetching. Only read for a
   * `parameter_only` analysis whose projection could still arrive
   * (`projectionUnavailable === "history_incomplete"`). Default `"idle"`.
   */
  projectionStatus?: PatchImpactProjectionStatus;
  /** The reader opened Explore. Fires on every open, whatever the analysis. */
  onExplore?: () => void;
  /**
   * The reader opened Explore (or pressed Retry) while the projection is not
   * loaded but could be. Fires once per open while `projectionStatus` is
   * `"idle"`, and on Retry. The component never fetches: the wrapper does, then
   * re-renders this same instance with `"loading"` and the richer analysis.
   */
  onRequestProjection?: () => void;
  /** Start with Explore open (deterministic capture / tests). Does not fire callbacks. */
  defaultOpen?: boolean;
  /** Initial level for the Explore scrubber. Default 18. */
  defaultLevel?: number;
  /** The reader moved the scrubber. The level itself survives re-renders and analysis upgrades. */
  onLevelChange?: (level: number) => void;
  /**
   * A stable, canonical link to this change (PH4-A), offered inside Explore.
   * Absent when the line has no stable anchor.
   */
  shareChange?: { url: string; title: string; label: string };
  className?: string;
};

const FactRow = ({ fact }: { fact: ParameterFact }) => {
  const rel = formatRelative(fact.relDelta);
  return (
    <li
      data-testid="patch-impact-fact"
      data-property={fact.property}
      className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", WRAP)}
    >
      <span className="font-medium text-foreground/90">{parameterLabel(fact.family, fact.half)}</span>{" "}
      <span className="font-mono tabular-nums text-foreground">
        <span className="sr-only">from </span>
        {formatParameterValue(fact.before, fact.unit)}
        <span aria-hidden> {"→"} </span>
        <span className="sr-only"> to </span>
        {formatParameterValue(fact.after, fact.unit)}
      </span>{" "}
      <span className="font-mono tabular-nums">
        {formatDelta(fact.absDelta, fact.unit, "parameter")}
        {rel ? ` · ${rel}` : null}
        {!rel && <span className="sr-only">, relative change not defined</span>}
      </span>
    </li>
  );
};

/** Level 18, the stable headline for the compact view (a growth-only change is 0 at level 1). */
const ProjectedSummary = ({ projection }: { projection: StatProjection }) => {
  const point = projection.levels[IMPACT_MAX_LEVEL - 1];
  const rel = formatRelative(point.relDelta);
  return (
    <p
      data-testid="patch-impact-projected-summary"
      className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", WRAP)}
    >
      <span className="font-medium text-foreground/90">
        {projectedStatLabel(projection.family).replace(/^./, (c) => c.toUpperCase())} at level {point.level}
      </span>{" "}
      <span className="font-mono tabular-nums text-foreground">
        <span className="sr-only">from </span>
        {formatStatValue(point.before)}
        <span aria-hidden> {"→"} </span>
        <span className="sr-only"> to </span>
        {formatStatValue(point.after)}
      </span>{" "}
      <span className="font-mono tabular-nums">
        {formatDelta(point.absDelta, "flat", "projected")}
        {rel ? ` · ${rel}` : null}
      </span>
    </p>
  );
};

const Section = ({ label, children, testId }: { label: string; children: ReactNode; testId: string }) => (
  <div data-testid={testId} className="grid min-w-0 gap-x-3 gap-y-0.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
    <p className="text-[11px] text-muted-foreground/90">{label}</p>
    <div className="min-w-0">{children}</div>
  </div>
);

/**
 * Mogzy Impact: a quiet, secondary reading of one champion base-stat change,
 * rendered under Riot's own line (the Patch Report `changeAnalysis` slot).
 *
 * - The parameter change and the projected stat impact are always separate.
 * - It takes an already-computed `PatchImpactAnalysis` and never fetches. A
 *   wrapper can move one mounted instance from parameter-only through "loading"
 *   to projected; the opened state and the selected level are kept.
 * - Nothing is rendered when the domain says there is no Impact analysis.
 */
export const PatchImpact = ({
  analysis,
  projectionStatus = "idle",
  onExplore,
  onRequestProjection,
  defaultOpen = false,
  defaultLevel = IMPACT_MAX_LEVEL,
  onLevelChange,
  shareChange,
  className,
}: PatchImpactProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const [level, setLevel] = useState(() => clampImpactLevel(defaultLevel));
  const requestedForThisOpen = useRef(false);

  const loadable = isProjectionLoadable(analysis);

  // Ask for the projection once per open, only while nothing has been requested.
  useEffect(() => {
    if (!open) {
      requestedForThisOpen.current = false;
      return;
    }
    if (loadable && projectionStatus === "idle" && !requestedForThisOpen.current) {
      requestedForThisOpen.current = true;
      onRequestProjection?.();
    }
  }, [open, loadable, projectionStatus, onRequestProjection]);

  if (!analysis || analysis.status === "unavailable") return null;

  const provenance = impactProvenanceKind(analysis);
  const projected = analysis.status === "projected";
  const exploreOffered = projected || (loadable && (Boolean(onRequestProjection) || projectionStatus !== "idle"));
  // Once opened, Explore stays for the loaded outcome even if it resolves to "no projection".
  const showExplore = exploreOffered || (open && analysis.status === "parameter_only");
  // Names what opens from PH2's own state (projection, crossoverLevel, loadable); never computes it.
  const cta = impactExploreCta(analysis);

  const toggle = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const next = !open;
    setOpen(next);
    if (next) onExplore?.();
  };

  const changeLevel = (next: number) => {
    const clamped = clampImpactLevel(next);
    setLevel(clamped);
    onLevelChange?.(clamped);
  };

  return (
    <div
      role="group"
      aria-label="Mogzy Impact"
      data-testid="patch-impact"
      data-impact-status={analysis.status}
      data-impact-provenance={provenance ?? undefined}
      data-impact-reason={analysis.status === "parameter_only" ? analysis.projectionUnavailable : undefined}
      className={cn(
        "mt-1.5 min-w-0 max-w-full space-y-1.5 border-l-2 border-[#c9a84c]/45 pl-3 text-xs leading-relaxed text-muted-foreground",
        WRAP,
        className,
      )}
    >
      <p data-testid="patch-impact-title" className="text-[10px] font-semibold uppercase tracking-wider text-[#c9a84c]">
        Mogzy Impact
      </p>

      <Section label="Parameter change" testId="patch-impact-parameter">
        <ul className="space-y-0.5">
          {analysis.facts.map((fact) => (
            <FactRow key={fact.property} fact={fact} />
          ))}
        </ul>
      </Section>

      {projected && (
        <Section label="Resulting stat" testId="patch-impact-projection">
          <ProjectedSummary projection={analysis.projection} />
        </Section>
      )}

      {showExplore && cta && (
        <details open={open} data-testid="patch-impact-explore" className="group text-xs text-muted-foreground">
          <summary
            data-testid="patch-impact-explore-toggle"
            data-cta={cta.kind}
            onClick={toggle}
            className={cn(
              "inline-flex min-h-10 cursor-pointer select-none list-none items-center gap-1 rounded py-1 pr-2",
              "font-medium text-[#c9a84c]/90 underline-offset-2 hover:text-[#c9a84c] hover:underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <ChevronRight
              aria-hidden
              className="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none [details[open]_&]:rotate-90"
            />
            <span>{cta.text}</span>
            <span className="sr-only">{cta.opens}</span>
          </summary>
          {open &&
            (analysis.status === "projected" ? (
              <div aria-busy={projectionStatus === "loading" ? true : undefined}>
                <PatchImpactExplore
                  projection={analysis.projection}
                  level={level}
                  onLevelChange={changeLevel}
                  shareChange={shareChange}
                />
              </div>
            ) : (
              <ProjectionState
                status={projectionStatus}
                loadable={loadable}
                onRetry={onRequestProjection}
              />
            ))}
        </details>
      )}
    </div>
  );
};

/** Parameter-only analysis inside Explore: waiting, loading, failed, or settled with no projection. */
const ProjectionState = ({
  status,
  loadable,
  onRetry,
}: {
  status: PatchImpactProjectionStatus;
  loadable: boolean;
  onRetry?: () => void;
}) => {
  // A quiet status line. It never reads as an error in Riot's patch note above it.
  if (!loadable) {
    return (
      <p role="status" data-testid="patch-impact-state" data-state="none" className="py-2 text-[11px]">
        A level projection is not available for this change.
      </p>
    );
  }
  if (status === "loading") {
    return (
      <p
        role="status"
        aria-live="polite"
        data-testid="patch-impact-state"
        data-state="loading"
        className="py-2 text-[11px]"
      >
        Loading the level projection{"…"}
      </p>
    );
  }
  if (status === "error") {
    return (
      <div role="status" data-testid="patch-impact-state" data-state="error" className="space-y-1 py-2 text-[11px]">
        <p>The level projection could not be loaded. The parameter change above is unaffected.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-10 rounded-md border border-border px-3 text-xs font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
          >
            Try again
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="status" data-testid="patch-impact-state" data-state="idle" className="space-y-1 py-2 text-[11px]">
      <p>The level projection is not loaded yet.</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-10 rounded-md border border-border px-3 text-xs font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
        >
          Load it now
        </button>
      )}
    </div>
  );
};
