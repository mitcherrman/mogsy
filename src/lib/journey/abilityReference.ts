/**
 * MISC-W1B F08 — STATED ABILITY REFERENCES: a formula a Journey child STATED
 * as its premise, kept inspectable on that ability's board tile afterwards.
 *
 * WHY. K2 (`knowledge.ts`) marks only REVEALED facts with the gold `!` — a
 * stated premise is "on the question that states it". But a later child that
 * RECALLS the formula (Daily S-A: c3 states Pantheon E, c4 / c5 recall it) no
 * longer prints it, so the learner had no way to look it up again. This is the
 * missing half: a REFERENCE, never a mark. It does not say "learned", it draws
 * no `!`, and it is not a Saved arrival.
 *
 * THE DISCLOSURE WINDOW. A formula is referenceable from the child that first
 * STATES it (its `learner.states`, served from that child's open, the instant
 * its premise is on the question) — never earlier: only REACHED children up to
 * the step on screen are read, so a later child's statement is never shown.
 * A later child's ledger (`established`, `source: "stated"`) carries the same
 * fact; it is read too, so a payload whose stating child is already folded
 * away still resolves. When a formula is restated, the latest statement wins.
 *
 * WHAT IT CARRIES. The served formula verbatim (flat per rank, ratios, damage
 * type) — never evaluated: no stat is multiplied, no damage is computed, so
 * an unanswered result cannot leak through it.
 *
 * ONE CONTROL PER ABILITY. An ability whose formula a reveal TAUGHT already
 * wears K2's `!` with that formula on its card; it gets no stated reference.
 */
import type { J3Formula, JourneyJ3 } from "./j3";
import { JOURNEY_KNOWLEDGE_OBJECT_CONTRACT } from "./j3";
import type { JourneyKnowledge } from "./knowledge";

const FORMULA_KIND = "ability_damage_formula";

export interface StatedAbilityReference {
  /** K1 object key, `<side>:<champion_id>:<slot>`. */
  key: string;
  fact: string;
  formula: J3Formula;
  /** The child (0-based) whose premise stated it — the latest statement. */
  child: number;
}

export type StatedAbilityReferences = ReadonlyMap<string, StatedAbilityReference>;
export const NO_STATED_REFERENCES: StatedAbilityReferences = new Map();

const isFormula = (v: unknown): v is J3Formula =>
  typeof v === "object" && v !== null && Array.isArray((v as J3Formula).flatByRank) && Array.isArray((v as J3Formula).ratios);

/**
 * The stated formulas the board may offer at `stepIndex` (the child on
 * screen), by ability object key. Pure: reads the reached prefix only.
 */
export function statedAbilityReferences(
  journey: JourneyJ3 | null | undefined, stepIndex: number, knowledge: JourneyKnowledge,
): StatedAbilityReferences {
  if (!journey || journey.reask || journey.knowledgeContract !== JOURNEY_KNOWLEDGE_OBJECT_CONTRACT) return NO_STATED_REFERENCES;
  const out = new Map<string, StatedAbilityReference>();
  const offer = (fact: string, kind: string, value: unknown, object: { type: string; key: string } | null | undefined, child: number) => {
    if (kind !== FORMULA_KIND || !isFormula(value) || object?.type !== "ability" || child > stepIndex) return;
    const prior = out.get(object.key);
    if (prior && prior.child >= child) return;
    out.set(object.key, { key: object.key, fact, formula: value, child });
  };
  for (const c of journey.children) {
    if (c.index > stepIndex) continue;
    for (const s of c.learner.states) offer(s.fact, s.kind, s.value, s.knowledge?.object, c.index);
    for (const e of c.learner.established) {
      if (e.source === "stated") offer(e.fact, e.kind, e.value, e.knowledge?.object, e.child);
    }
  }
  // A taught (revealed) formula is K2's: its `!` card already carries it.
  for (const key of [...out.keys()]) {
    if (knowledge.get(key)?.facts.some((f) => f.kind === FORMULA_KIND)) out.delete(key);
  }
  return out;
}

/** A reference's provenance, as distinct from K2's "learned Step N". */
export const statedLabel = (child: number) => `stated Step ${child + 1}`;
