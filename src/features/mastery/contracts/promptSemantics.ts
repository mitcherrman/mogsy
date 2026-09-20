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
  // GR1 reusable state, Phase 3. The same cooldown question asked INSIDE a
  // resolved setup state: the prompt must state the scenario inputs the
  // answer depends on, which is what `scenario` below carries. Only the
  // Admin Generator Lab's experimental state-aware preview produces it today
  // — no player-facing surface does — but the reader is shared, so it is
  // declared here rather than in a second parallel contract.
  "ability_cooldown_under_state",
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
  /**
   * The resource an ability COST is denominated in — `"mana"`, `"energy"` or
   * `"health"` — and `""` for every other template.
   *
   * Mirrors backend `PromptSemantics.resource`, which is the fact's own unit
   * and therefore the same certified value the grader and the explanation
   * use. `""` on a cost question means the backend refused to name it, which
   * it does by refusing the candidate — so a cost prompt reaching a renderer
   * without a resource is a contract violation, not a wording choice.
   */
  readonly resource: string;
  readonly context: MasteryFactContext;
  /**
   * The SCENARIO inputs the prompt must state, as `[name, value]` pairs — for
   * example `[["ability_haste", 20]]`.
   *
   * Empty for every intrinsic question, which is every question a player is
   * served today: the backend omits the key entirely when there is no
   * scenario, so an existing payload reads exactly as it always did.
   *
   * This is what the question STATES, not what identifies it. The backend's
   * `ScenarioBinding` — the canonical identity material — never crosses this
   * wire; it travels in the Lab's diagnostics instead, because a player-facing
   * card should carry the premise and not the provenance.
   */
  readonly scenario: readonly (readonly [string, string | number])[];
}

/**
 * Exported for reuse by `comparisonSemantics.ts` (Phase 4C2) — the comparison
 * contract shares this exact axis shape (backend `FactContext`) rather than
 * redeclaring a parallel reader.
 */
export function readFactContext(value: unknown, label: string): MasteryFactContext {
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
    resource: p.resource === undefined ? "" : str(p.resource, `${label}.resource`),
    context: p.context === undefined ? { abilityRank: null, championLevel: null, form: null }
      : readFactContext(p.context, `${label}.context`),
    scenario: readScenario(p.scenario, `${label}.scenario`),
  };
}

/**
 * Reads the scenario pairs, fail-closed on anything that is not one.
 *
 * Absent is the ordinary case and reads as empty. A malformed entry throws
 * rather than being skipped: a prompt that silently dropped one of the inputs
 * its answer depends on would be an unanswerable question rendered as a
 * confident one.
 */
export function readScenario(
  value: unknown, label = "scenario",
): readonly (readonly [string, string | number])[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new MasteryContractParseError("expected an array of pairs", label);
  }
  return value.map((entry, index) => {
    const where = `${label}[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new MasteryContractParseError("expected a [name, value] pair", where);
    }
    const [name, raw] = entry;
    if (typeof name !== "string" || name.length === 0) {
      throw new MasteryContractParseError("expected a non-empty name", where);
    }
    if (typeof raw !== "string" && typeof raw !== "number") {
      throw new MasteryContractParseError("expected a string or number", where);
    }
    return [name, raw] as const;
  });
}

/** Fail-closed guard used by the atomic recall renderer for a template it does
 *  not (yet) know how to phrase. Never falls back to prose. */
export function assertKnownTemplate(template: string): asserts template is PromptTemplate {
  if (!(PROMPT_TEMPLATES as readonly string[]).includes(template)) {
    throw new MasteryContractParseError(`unknown prompt template "${template}"`, "prompt_semantics.template");
  }
}
