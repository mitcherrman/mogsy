/**
 * NUM-REC2 — the fixture-free half of CE1's lab authority.
 *
 * CE1's `labAuthority.ts` imports the frozen capture, so nothing a production
 * route loads may import it. These are the pieces of it that never touch the
 * capture — the prompt, the public content and the reveal formatting — moved
 * here verbatim so the DEV lab (which reads the bundled capture) and the
 * owner lab (which reads the authenticated backend) build identical rounds.
 */
import {
  gradeEstimate, metricLabel,
  type CombatEstimateScenario, type CombatEstimateSecret,
} from "./contract";
import type { EstimatePublic, EstimateReveal } from "@/lib/interaction-grammar/types";
import type { JourneyWorking } from "@/lib/journey/combatWorking";

export const CE_IMPLEMENTATION = "combat_calculations.physical_ability_damage.v1";

export interface RoundGrade {
  reveal: EstimateReveal;
  /** The authority's working, or null for the synthetic round. */
  working: JourneyWorking | null;
  /** The provenance line under the working. */
  sourceLine: string;
}

export function promptFor(s: CombatEstimateScenario): string {
  const where = s.metric === "raw" ? "before armor" : `to ${s.target.champion} after armor`;
  return `How much physical damage does ${s.ability.name} deal ${where}?`;
}

export function contentFor(scenario: CombatEstimateScenario, implementation: string = CE_IMPLEMENTATION): EstimatePublic {
  return {
    prompt: promptFor(scenario),
    measureLabel: `Combat Estimate · ${metricLabel(scenario.metric)}`,
    unitLabel: "damage",
    definition: scenario.definition,
    scale: scenario.scale,
    certification: { kind: "certified", label: scenario.certification.label },
    footnote: `${metricLabel(scenario.metric)} by the combat authority · ${implementation}`,
  };
}

/** The host's comparison and the authority's working, as CE1's lab formats them. */
export function revealFor(scenario: CombatEstimateScenario, secret: CombatEstimateSecret, estimate: number, backendCommit: string): RoundGrade {
  const reveal = gradeEstimate(secret, estimate, `Combat authority · ${backendCommit.slice(0, 8)}`);
  const component = scenario.ability.component;
  return {
    reveal: { ...reveal, note: component ? `Modelled component: ${component}.` : null },
    working: secret.working,
    sourceLine: `${secret.provenance.get("implementation") as string} · formula ${secret.formulaTier.toLowerCase()} · backend ${backendCommit.slice(0, 8)} · items ${(secret.provenance.get("item_revisions") as string) || "none"}`,
  };
}
