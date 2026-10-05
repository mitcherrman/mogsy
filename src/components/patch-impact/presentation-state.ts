import type { PatchImpactLoader } from "@/hooks/usePatchImpactLoader";
import type { PatchImpactAnalysis } from "@/lib/patch-impact/types";
import type { PatchImpactProjectionStatus } from "./PatchImpact";
import { isProjectionLoadable } from "./state";

export type PatchImpactPresentationState = {
  analysis: PatchImpactAnalysis;
  projectionStatus: PatchImpactProjectionStatus;
  /** The ONLY evidence trigger handed to PatchImpact (never `onExplore`). */
  onRequestProjection?: () => void;
};

/**
 * PH2-C load state → PH2-B props. Pure, so the mapping is tested on its own.
 *
 * - idle: nothing requested; PatchImpact asks once when Explore opens.
 * - loading: in flight; the same mounted instance keeps Explore open.
 * - failed: error + retry (the loader refetches; the parameter fact is untouched).
 * - ready / not_required: the analysis is final. A loaded analysis that STILL
 *   lacks history (the evidence did not cover the chain) is shown as a failed
 *   load without retry: retrying would read the same cached evidence.
 * - unavailable: the card alone decided; PatchImpact renders the parameter fact
 *   (parameter-only) or nothing (unavailable).
 */
export function toPresentationState(loader: PatchImpactLoader): PatchImpactPresentationState {
  const { analysis, state, canRequest, requestProjection } = loader;
  const request = canRequest ? requestProjection : undefined;
  switch (state.status) {
    case "idle":
      return { analysis, projectionStatus: "idle", onRequestProjection: request };
    case "loading":
      return { analysis, projectionStatus: "loading" };
    case "failed":
      return { analysis, projectionStatus: "error", onRequestProjection: request };
    case "ready":
      return { analysis, projectionStatus: isProjectionLoadable(analysis) ? "error" : "idle" };
    case "not_required":
    case "unavailable":
      return { analysis, projectionStatus: "idle" };
  }
}
