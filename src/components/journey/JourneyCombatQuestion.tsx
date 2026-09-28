/**
 * JOURNEY-UI2 — THE JOURNEY COMBAT QUESTION: the server's premise, read.
 *
 * A Journey Combat child asks for an ability's damage under the Journey's
 * state. Everything the player needs is SERVED:
 *
 *   * the attacker, ability, slot and rank     — `prompt_semantics`
 *   * the state the numbers are read at        — `prompt_semantics.scenario`,
 *     as structured pairs — never parsed from prose;
 *   * the formula and any earlier result it applies — the Journey's learner
 *     ledger, drawn on the BOARD (K2 marks), never restated here.
 *
 * JP2 — QUESTION TEXT ASKS THE SEMANTIC QUESTION; THE BOARD SUPPLIES THE STATE.
 * The sentence names only what is being asked ("How much physical damage does
 * Zed's Rank 1 Shadow Slash deal before armor?"). Levels, items and the stats
 * a formula reads are on the state board; the facts an earlier step taught are
 * on the board's objects as `!` marks. The premise panel that used to restate
 * all of it beneath the board is gone. The only premise facts that still need
 * words are the ones the board has no object for (`premiseNotes`: e.g. item
 * effects declared inactive), and they ride in the question's one cue line.
 *
 * Two templates are Combat here, both phrased from the same premise:
 *   `ability_damage_under_state`      — after the target's armor (JOURNEY-UI2);
 *   `ability_raw_damage_under_state`  — BEFORE armor (JREF1's raw family). It
 *     used to fall to the generic prose path and print the backend's
 *     serialized prompt; its own template exists precisely so no renderer can
 *     word it "after armor", and this one never does.
 *
 * This file performs ZERO Combat arithmetic: it never multiplies a ratio,
 * subtracts armor or rounds a number.
 */
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import { readScenario } from "@/features/mastery/contracts/promptSemantics";

type Pair = readonly [string, string | number];

/** The Journey Combat templates, by which side of the target's armor they ask. */
export const COMBAT_TEMPLATES = {
  ability_damage_under_state: "after_armor",
  ability_raw_damage_under_state: "before_armor",
} as const;
type CombatTemplate = keyof typeof COMBAT_TEMPLATES;
const isCombatTemplate = (t: unknown): t is CombatTemplate =>
  typeof t === "string" && Object.prototype.hasOwnProperty.call(COMBAT_TEMPLATES, t);

/** A served ratio coefficient, written as the game writes it (1 → 100%). */
export const percent = (ratio: number) => `${Number((ratio * 100).toFixed(4))}%`;

export interface CombatPremise {
  champion: string;
  ability: string;
  slot: string;
  rank: number | null;
  metric: string;
  /** Which side of the target's armor the question asks. */
  mitigation: "before_armor" | "after_armor";
  pairs: Pair[];
}

/** Read the served Combat premise; null when this is not one. */
export function combatPremiseOf(challenge: MasterySliceChallengeView): CombatPremise | null {
  const p = challenge.promptSemantics as Record<string, unknown> | null | undefined;
  if (!p || !isCombatTemplate(p.template)) return null;
  const ctx = (p.context ?? {}) as Record<string, unknown>;
  let pairs: Pair[] = [];
  try {
    pairs = [...readScenario(p.scenario)];
  } catch {
    return null;
  }
  return {
    champion: typeof p.champion_display === "string" ? p.champion_display : "",
    ability: typeof p.ability_name === "string" ? p.ability_name : "",
    slot: typeof p.subject_ref === "string" ? p.subject_ref : "",
    rank: typeof ctx.ability_rank === "number" ? ctx.ability_rank : null,
    metric: typeof p.metric === "string" ? p.metric : "",
    mitigation: COMBAT_TEMPLATES[p.template],
    pairs,
  };
}

/** A served premise value, by key (`undefined` when not stated). */
export const premiseValue = (p: CombatPremise, key: string): string | number | undefined =>
  p.pairs.find(([k]) => k === key)?.[1];

/**
 * JOURNEY5 — which part of the ability the premise is about (e.g. Pantheon E's
 * `"unempowered cast (no Mortal Will)"`), verbatim from the scenario pair
 * `ability_component`; null when the server states none.
 */
export function abilityComponentOf(p: CombatPremise): string | null {
  const v = premiseValue(p, "ability_component");
  return v === undefined || v === "" ? null : String(v);
}

/** The damage type the served metric names ("physical damage"), else "damage". */
function damageWords(metric: string): string {
  if (metric.includes("physical")) return "physical damage";
  if (metric.includes("magic")) return "magic damage";
  if (metric.includes("true")) return "true damage";
  return "damage";
}

/**
 * The question sentence, from the structured premise (no prose parsed):
 *   "How much physical damage does Zed's Rank 1 Shadow Slash deal before armor?"
 *   "How much physical damage does Zed's Rank 1 Shadow Slash deal to Ahri?"
 * The ability's served component, when there is one, closes the sentence.
 */
export function combatQuestionSentence(p: CombatPremise): string {
  const target = premiseValue(p, "target");
  const component = abilityComponentOf(p);
  const ability = [p.rank !== null ? `Rank ${p.rank}` : null, p.ability || p.slot].filter(Boolean).join(" ");
  const where = p.mitigation === "before_armor"
    ? " before armor"
    : target !== undefined ? ` to ${target}` : " after armor";
  return `How much ${damageWords(p.metric)} does ${p.champion}'s ${ability} deal${where}${
    component ? `, ${component}` : ""}?`;
}

/**
 * Premise facts that change the answer and have NO object on the board, as
 * short words for the question's cue line. Today that is one: items whose
 * effects the scenario declares inactive (`item_effects: inactive`). A value
 * that is a board object (level, items, stats, armor, a recalled result) is
 * never repeated here.
 */
export function premiseNotes(p: CombatPremise): string[] {
  const effects = premiseValue(p, "item_effects");
  return effects === "inactive" ? ["Item effects inactive"] : [];
}
