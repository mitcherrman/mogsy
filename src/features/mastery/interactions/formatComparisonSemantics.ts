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

/**
 * Title-cases a metric slug for a prompt that supplies its own "base".
 *
 * Most stat metrics are already spelled `base_armor`, so the template's own
 * "base " plus `humanizeMetric` read "more base Base Armor". Dropping the
 * leading qualifier here — and nowhere else — is what makes the sentence
 * "more base Armor" while every identity the question travels under keeps the
 * slug it has always had. The two metrics with no base/scaled distinction
 * (`movement_speed`, `attack_range`) carry no prefix to drop, which is why the
 * template states "base" for them too and this pass fixes that in the template
 * rather than here.
 */
function humanizeBaseMetric(metric: string): string {
  return humanizeMetric(metric.replace(/^base_/, ""));
}

/** Does this metric describe a base-vs-scaled quantity at all? */
function hasBaseQualifier(metric: string): boolean {
  return metric.startsWith("base_");
}

function abilitySubjectLabel(
  cs: MasteryComparisonSemantics,
  championDisplay: string,
  abilityName: string,
): string {
  if (!cs.subjectRef) return championDisplay;
  // Slot AND name. The slot is what makes this the same question on both
  // sides; the name is what makes it a question about an ability a player has
  // heard of. An unnamed slot — or a "name" that is only the slot letter,
  // which is the backend's own fallback — renders exactly as it did before.
  if (abilityName && abilityName !== cs.subjectRef) {
    return `${championDisplay} ${cs.subjectRef} (${abilityName})`;
  }
  return `${championDisplay} ${cs.subjectRef}`;
}

/**
 * The rank clause an ability comparison opens with, or "".
 *
 * A cooldown or a cost is a different number at every rank, so a comparison of
 * two of them can have a different ANSWER at every rank — measured across the
 * roster at 27.6% of cooldown comparisons. The rank has always travelled on
 * `context.abilityRank`; this renderer simply dropped it, which is what made
 * "Which has the shorter cooldown: Aatrox Q or Ahri Q?" a question with more
 * than one correct answer.
 *
 * `rankIndependent` is the backend composer's flat pair — neither side's value
 * moves with rank — so the comparison holds at all of them and naming one
 * would imply a dependence that provably is not there. Stating no rank there
 * is the difference between stating a rank and fabricating one.
 */
function rankPrefix(cs: MasteryComparisonSemantics): string {
  if (cs.rankIndependent) return "";
  const rank = cs.context.abilityRank;
  return rank === null || rank === undefined ? "" : `At rank ${rank}, `;
}

/** Lower-cases a sentence opener that now follows a leading clause. */
function afterPrefix(prefix: string, word: string): string {
  return prefix ? word.charAt(0).toLowerCase() + word.slice(1) : word;
}

/**
 * Renders a prompt sentence for one of the four comparison shapes the
 * Matchup Composer produces: ability cooldown, ability cost, champion base
 * stat, champion level stat. Fails explicitly on a template it does not
 * recognise, so a future comparison family cannot render as an empty or
 * misleading prompt.
 */
export function formatComparisonPrompt(cs: MasteryComparisonSemantics): string {
  const a = abilitySubjectLabel(cs, cs.championADisplay, cs.abilityNameA);
  const b = abilitySubjectLabel(cs, cs.championBDisplay, cs.abilityNameB);
  const prefix = rankPrefix(cs);
  switch (cs.template) {
    case "compare_ability_cooldown":
      return `${prefix}${afterPrefix(prefix, "Which")} has the shorter cooldown: ${a} or ${b}?`;
    case "compare_ability_cost":
      return `${prefix}${afterPrefix(prefix, "Which")} costs less: ${a} or ${b}?`;
    case "compare_champion_base_stat":
      // "base" only where the metric HAS a base-vs-scaled distinction, and the
      // slug's own `base_` dropped so the sentence says it once.
      return hasBaseQualifier(cs.metric)
        ? `Which has more base ${humanizeBaseMetric(cs.metric)}: ${cs.championADisplay} or ${cs.championBDisplay}?`
        : `Which has more ${humanizeMetric(cs.metric)}: ${cs.championADisplay} or ${cs.championBDisplay}?`;
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
