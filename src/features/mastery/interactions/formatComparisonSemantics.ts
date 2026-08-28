/**
 * Turns `MasteryComparisonSemantics` (structured data, never prose) into a
 * player-facing English prompt (Phase 4C2). Sibling of
 * `formatPromptSemantics.ts` for the atomic-recall interaction.
 *
 * The direction phrased ("shorter", "less", "more") is a property of the
 * METRIC FAMILY, not of these two specific champions' values — cooldowns and
 * resource costs are always lower-is-better in the shipped question families
 * this mirrors (`ability_cooldown_compare`, `ability_cost_compare`), and base/
 * level champion stats surfaced by the Champion Knowledge Bank (health,
 * armor, attack damage, movement speed) are always higher-is-better. Neither
 * fact depends on which side wins THIS comparison, so phrasing it costs
 * nothing about the actual answer — the winner itself is never known until
 * the reveal.
 */
import type { MasteryComparisonSemantics } from "../contracts/comparisonSemantics";

export class MasteryUnknownComparisonTemplateError extends Error {
  constructor(template: string) {
    super(`Mastery comparison: no phrasing for comparison template "${template}"`);
    this.name = "MasteryUnknownComparisonTemplateError";
  }
}

/** Title-cases a snake_case/dot.case metric slug for display. */
function humanizeMetric(metric: string): string {
  return metric
    .split(/[_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function abilitySubjectLabel(cs: MasteryComparisonSemantics, championDisplay: string): string {
  return cs.subjectRef ? `${championDisplay} ${cs.subjectRef}` : championDisplay;
}

/**
 * Renders a prompt sentence for one of the four comparison shapes the
 * Matchup Composer produces: ability cooldown, ability cost, champion base
 * stat, champion level stat. Fails explicitly on a template it does not
 * recognise, so a future comparison family cannot render as an empty or
 * misleading prompt.
 */
export function formatComparisonPrompt(cs: MasteryComparisonSemantics): string {
  switch (cs.template) {
    case "compare_ability_cooldown":
      return `Which has the shorter cooldown: ${abilitySubjectLabel(cs, cs.championADisplay)} or ${abilitySubjectLabel(cs, cs.championBDisplay)}?`;
    case "compare_ability_cost":
      return `Which costs less: ${abilitySubjectLabel(cs, cs.championADisplay)} or ${abilitySubjectLabel(cs, cs.championBDisplay)}?`;
    case "compare_champion_base_stat":
      return `Which has more base ${humanizeMetric(cs.metric)}: ${cs.championADisplay} or ${cs.championBDisplay}?`;
    case "compare_champion_stat_at_level":
      return `At level ${cs.context.championLevel ?? "?"}, which has more ${humanizeMetric(cs.metric)}: ${cs.championADisplay} or ${cs.championBDisplay}?`;
    default: {
      // Exhaustiveness guard: COMPARISON_TEMPLATES is a closed union, so an
      // unrecognised value can only reach here via a widened/future backend
      // value the contract reader's `oneOf` should have already rejected.
      const exhaustive: never = cs.template;
      throw new MasteryUnknownComparisonTemplateError(exhaustive as unknown as string);
    }
  }
}
