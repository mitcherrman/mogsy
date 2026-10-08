import type { PatchImpactAnalysis } from "@/lib/patch-impact/types";
import { projectedStatLabel } from "./format";
import { isProjectionLoadable } from "./state";

/**
 * What the closed Explore disclosure offers, so the reader can predict what
 * opens. Presentation only: it reads the PH2 analysis as given (status, the
 * projection's own `crossoverLevel`, the loadable flag) and never computes,
 * projects or infers a crossover itself.
 *
 * Certainty is part of the label ("View" only promises what PH2 already knows):
 * - `crossover`: CONFIRMED projection whose domain reports a sign change.
 * - `levels`: CONFIRMED projection without one.
 * - `check`: a CANDIDATE. The evidence is not loaded, so whether a projection
 *   exists is only settled by opening. Never promises a result or a crossover.
 * - `details`: CONFIRMED unavailable / parameter-only (a change whose projection
 *   settled to "not available" after loading; never offered closed otherwise).
 */
export type ImpactExploreCta = {
  kind: "crossover" | "levels" | "check" | "details";
  /** Visible label. */
  text: string;
  /** Screen-reader continuation: what the disclosure reveals. */
  opens: string;
};

/**
 * `null` when there is no analysis to explore. PatchImpact decides whether the
 * disclosure is offered at all; this only names it. A loading or failed load
 * keeps the `check` label: nothing is confirmed until the evidence arrives.
 * The label follows the analysis, so a resolved load moves it to `levels` /
 * `crossover` (projected) or `details` (settled unavailable).
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
      kind: "check",
      text: "Check level 1–18 impact",
      opens: `: loads the evidence first, then shows ${stat} before and after the patch at every level from 1 to 18 if a projection is available`,
    };
  }

  return {
    kind: "details",
    text: "View impact details",
    opens: ": what Mogzy can and cannot project for this change",
  };
}
