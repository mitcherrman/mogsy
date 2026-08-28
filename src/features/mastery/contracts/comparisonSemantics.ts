/**
 * Structured two-champion comparison prompt semantics (Phase 4C2).
 *
 * Mirrors the backend `mastery.matchup.contract.MatchupPromptSemantics` shape
 * (`/Users/macmoney/lcs-worktrees/mastery-slice1-championfact/mastery/matchup/contract.py`).
 * Like `promptSemantics.ts` for atomic recall, this is data, never prose, and
 * never the answer: it names both champions, the metric, and the shared
 * intrinsic axes both sides are stated at, but it carries no value, no
 * winner, and no tie state — those live only in the post-submission reveal
 * (`playerReveal.ts`), never on a pre-submission payload. The
 * `hiddenInfoGuard` recursive scan runs over the whole pre-submission body
 * regardless, but this contract is designed to structurally have nothing to
 * leak in the first place.
 */

import { MasteryContractParseError, oneOf, rec, str } from "./common";
import { MasteryFactContext, readFactContext } from "./promptSemantics";

/**
 * The closed set of comparison shapes the comparison renderer knows how to
 * turn into a prompt. Mirrors backend `MatchupPromptTemplate` — one template
 * per comparison family, per that module's own "one concept, many phrasings"
 * discipline. An unrecognised value fails closed at parse time.
 */
export const COMPARISON_TEMPLATES = [
  "compare_ability_cooldown",
  "compare_ability_cost",
  "compare_champion_base_stat",
  "compare_champion_stat_at_level",
] as const;
export type ComparisonTemplate = (typeof COMPARISON_TEMPLATES)[number];

export interface MasteryComparisonSemantics {
  readonly template: ComparisonTemplate;
  /** Display name of the side-A champion, e.g. "Ahri". */
  readonly championADisplay: string;
  /** Display name of the side-B champion, e.g. "Syndra". */
  readonly championBDisplay: string;
  /** The metric being compared, in the ChampionFact/ComparisonKey vocabulary. */
  readonly metric: string;
  /** The measured quantity's dimension, from the shared ComparisonKey. */
  readonly dimension: string;
  /** "" for a champion-level comparison, "Q".."R" for an ability comparison. */
  readonly subjectRef: string;
  /** The intrinsic axes both sides are stated at — identical on both sides. */
  readonly context: MasteryFactContext;
  readonly unit: string;
}

export function readComparisonSemantics(
  value: unknown,
  label = "comparison_semantics",
): MasteryComparisonSemantics {
  const p = rec(value, label);
  const template = oneOf(p.template, COMPARISON_TEMPLATES, `${label}.template`);
  return {
    template,
    championADisplay: str(p.champion_a_display, `${label}.champion_a_display`),
    championBDisplay: str(p.champion_b_display, `${label}.champion_b_display`),
    metric: str(p.metric, `${label}.metric`),
    dimension: p.dimension === undefined ? "" : str(p.dimension, `${label}.dimension`),
    subjectRef: p.subject_ref === undefined ? "" : str(p.subject_ref, `${label}.subject_ref`),
    context: p.context === undefined ? { abilityRank: null, championLevel: null, form: null }
      : readFactContext(p.context, `${label}.context`),
    unit: p.unit === undefined ? "" : str(p.unit, `${label}.unit`),
  };
}

/** Fail-closed guard for a template the comparison renderer does not (yet)
 *  know how to phrase. Never falls back to prose. */
export function assertKnownComparisonTemplate(
  template: string,
): asserts template is ComparisonTemplate {
  if (!(COMPARISON_TEMPLATES as readonly string[]).includes(template)) {
    throw new MasteryContractParseError(
      `unknown comparison template "${template}"`,
      "comparison_semantics.template",
    );
  }
}
