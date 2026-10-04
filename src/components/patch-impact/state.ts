import type { PatchImpactAnalysis } from "@/lib/patch-impact/types";

/**
 * A projection that more external data could still produce: the analysis is
 * parameter-only only because canonical stats or later reports are not loaded
 * yet. A deferred family (attack speed) or a refused chain is never loadable,
 * so no Explore, slider or request is offered for it.
 */
export function isProjectionLoadable(analysis: PatchImpactAnalysis | null | undefined): boolean {
  return analysis?.status === "parameter_only" && analysis.projectionUnavailable === "history_incomplete";
}
