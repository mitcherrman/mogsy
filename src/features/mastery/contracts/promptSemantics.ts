/**
 * Structured atomic-recall prompt semantics (Phase 4C1).
 *
 * Mirrors the backend `mastery.knowledge.contract.PromptSemantics` shape
 * (`/Users/macmoney/lcs-worktrees/mastery-slice1-championfact/mastery/knowledge/contract.py`).
 * A `MasteryPromptSemantics` value is data, never prose: the backend never sends
 * a rendered sentence for an atomic-recall question, and the frontend must build
 * the player-facing prompt text itself (see
 * `features/mastery/interactions/formatPromptSemantics.ts`). This keeps
 * provenance traceable — a sentence assembled once by the backend and echoed
 * verbatim by the frontend would hide which fact fields actually drove it.
 */

import { MasteryContractParseError, nnum, nstr, oneOf, rec, str } from "./common";

/**
 * The closed set of question shapes the atomic recall renderer knows how to
 * turn into a prompt. Mirrors backend `PromptTemplate`. An unrecognised value
 * fails closed at parse time rather than silently rendering nothing.
 */
export const PROMPT_TEMPLATES = [
  "ability_cooldown_at_rank",
  "ability_cooldown_flat",
  "ability_cost_at_rank",
  "ability_cost_flat",
  "champion_base_stat",
  "champion_stat_at_level",
] as const;
export type PromptTemplate = (typeof PROMPT_TEMPLATES)[number];

/**
 * The intrinsic axes a fact is stated at. Mirrors backend `FactContext`. An
 * axis that does not apply is `null` — a meaningful value, not a wildcard.
 */
export interface MasteryFactContext {
  readonly abilityRank: number | null;
  readonly championLevel: number | null;
  readonly form: string | null;
}

export interface MasteryPromptSemantics {
  readonly template: PromptTemplate;
  /** Display name of the champion, e.g. "Ahri". */
  readonly championDisplay: string;
  /** The metric being asked about, in the ChampionFact vocabulary. */
  readonly metric: string;
  /** "" for a champion-level question, "Q".."R" for an ability question. */
  readonly subjectRef: string;
  /** The ability's own name, when one is being asked about. */
  readonly abilityName: string;
  readonly context: MasteryFactContext;
}

function readContext(value: unknown, label: string): MasteryFactContext {
  const c = rec(value, label);
  return {
    abilityRank: nnum(c.ability_rank, `${label}.ability_rank`),
    championLevel: nnum(c.champion_level, `${label}.champion_level`),
    form: nstr(c.form, `${label}.form`),
  };
}

export function readPromptSemantics(value: unknown, label = "prompt_semantics"): MasteryPromptSemantics {
  const p = rec(value, label);
  const template = oneOf(p.template, PROMPT_TEMPLATES, `${label}.template`);
  return {
    template,
    championDisplay: str(p.champion_display, `${label}.champion_display`),
    metric: str(p.metric, `${label}.metric`),
    subjectRef: p.subject_ref === undefined ? "" : str(p.subject_ref, `${label}.subject_ref`),
    abilityName: p.ability_name === undefined ? "" : str(p.ability_name, `${label}.ability_name`),
    context: p.context === undefined ? { abilityRank: null, championLevel: null, form: null }
      : readContext(p.context, `${label}.context`),
  };
}

/** Fail-closed guard used by the atomic recall renderer for a template it does
 *  not (yet) know how to phrase. Never falls back to prose. */
export function assertKnownTemplate(template: string): asserts template is PromptTemplate {
  if (!(PROMPT_TEMPLATES as readonly string[]).includes(template)) {
    throw new MasteryContractParseError(`unknown prompt template "${template}"`, "prompt_semantics.template");
  }
}
