import type { PatchImpactAnalysis } from "@/lib/patch-impact/types";
import { projectedStatLabel } from "./format";
import { isProjectionLoadable } from "./state";

/**
 * What the closed Explore disclosure offers, so the reader can predict what
 * opens. Presentation only: it reads the PH2 analysis as given (status, the
 * projection's own `crossoverLevel`, the loadable flag) and never computes,
 * projects or infers a crossover itself.
 *
 * - `crossover`: a projection whose domain reports a sign change.
 * - `levels`: a projection without one, or a projection that opening will load.
 *   It never promises a crossover the domain has not reported.
 * - `details`: a parameter-only change opened after its projection settled to
 *   "not available" (never offered closed: such a change has no Explore).
 */
export type ImpactExploreCta = {
  kind: "crossover" | "levels" | "details";
  /** Visible label. */
  text: string;
  /** Screen-reader continuation: what the disclosure reveals. */
  opens: string;
};

/**
 * `null` when there is no analysis to explore. PatchImpact decides whether the
 * disclosure is offered at all; this only names it. A loading or failed load
 * keeps the `levels` label: the disclosure still opens onto that projection.
 */
export function impactExploreCta(analysis: PatchImpactAnalysis | null | undefined): ImpactExploreCta | null {
  if (!analysis || analysis.status === "unavailable") return null;

  if (analysis.status === "projected") {
    const stat = projectedStatLabel(analysis.projection.family);
    const crossover = analysis.projection.crossoverLevel;
    if (crossover !== null) {
      return {
        kind: "crossover",
        text: `View crossover at level ${crossover}`,
        opens: `: ${stat} before and after the patch at every level from 1 to 18, and where the difference changes sign`,
      };
    }
    return {
      kind: "levels",
      text: "View level 1–18 impact",
      opens: `: ${stat} before and after the patch at every level from 1 to 18`,
    };
  }

  if (isProjectionLoadable(analysis)) {
    // Loadable never covers the deferred attack-speed family (see state.ts).
    const stat = analysis.family === "attack_speed" ? "the base stat" : projectedStatLabel(analysis.family);
    return {
      kind: "levels",
      text: "View level 1–18 impact",
      opens: `: loads ${stat} before and after the patch at every level from 1 to 18`,
    };
  }

  return {
    kind: "details",
    text: "View impact details",
    opens: ": what Mogzy can and cannot project for this change",
  };
}
