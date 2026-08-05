/**
 * Normalized question premise FACTS (RA7).
 *
 * `metadata.assets.entities` (RA3-MEDIA-P4/RA5) is every entity a question
 * states as given. This is its counterpart for the givens that are NOT
 * entities: the quantities and the damage type of a combat question. "Caitlyn
 * hits Ahri with Piltover Peacemaker" is drawable from the entity collection;
 * "for 600 raw physical damage, against armor rising 60 → 100" is not, and
 * before this block it existed only inside the prompt paragraph.
 *
 * This module is the single reader for that block, exactly as
 * `questionMediaEntities` is for the entity collection. It resolves nothing and
 * derives nothing — the backend emits a per-family allow-list of facts the
 * prompt already states, and this reads them back with the types it advertises.
 *
 * Backward compatibility is the default: a payload with no `premise_facts` key
 * — every payload frozen before RA7, and every family that declares no facts —
 * returns `null`, and every consumer falls back to what it rendered before.
 */

import type { QuizQuestion } from "@/lib/quiz/api";

/**
 * Which resistance a hit is mitigated by. It is the DAMAGE type the backend
 * states; the defensive stat it maps to (armor / magic resist) is a naming
 * convention a renderer applies, not a second backend fact.
 */
export type PremiseDamageType = "physical" | "magic";

export type QuestionPremiseFacts = {
  damageType?: PremiseDamageType;
  /** The stated raw damage of the hit, before mitigation. */
  rawDamage?: number;
  /** The resistance the premise gives the target. */
  targetResist?: number;
  /**
   * The resistance the premise says the target ends with, when it states a
   * change. Absent whenever the premise states a single, static resistance —
   * which is most questions, and is different from "the change was zero".
   */
  targetResistAfter?: number;
};

const DAMAGE_TYPES: ReadonlySet<string> = new Set<PremiseDamageType>([
  "physical",
  "magic",
]);

/**
 * A stated quantity, or undefined. Finite numbers only: a NaN or an infinity
 * would render as "NaN" in a premise tablet, which is worse than showing
 * nothing and falling back. Strings are NOT coerced — a quantity that arrived
 * as text is a payload this build does not understand.
 */
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Read the premise-fact block off a question, or `null` when the payload
 * carries none. An unrecognised damage type is DROPPED rather than degraded:
 * there is no neutral damage type to fall back to, and guessing one would
 * mislabel the defensive stat the layout draws.
 */
export function getQuestionPremiseFacts(
  question: QuizQuestion,
): QuestionPremiseFacts | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const assets = meta.assets as Record<string, unknown> | undefined;
  const raw = assets?.premise_facts as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return null;

  const damageType =
    typeof raw.damage_type === "string" && DAMAGE_TYPES.has(raw.damage_type)
      ? (raw.damage_type as PremiseDamageType)
      : undefined;

  const facts: QuestionPremiseFacts = {
    ...(damageType ? { damageType } : {}),
    ...(num(raw.raw_damage) !== undefined ? { rawDamage: num(raw.raw_damage)! } : {}),
    ...(num(raw.target_resist) !== undefined
      ? { targetResist: num(raw.target_resist)! }
      : {}),
    ...(num(raw.target_resist_after) !== undefined
      ? { targetResistAfter: num(raw.target_resist_after)! }
      : {}),
  };

  return Object.keys(facts).length > 0 ? facts : null;
}

/** The defensive stat a damage type is mitigated by, for labels and alt text. */
export const RESIST_LABEL: Record<PremiseDamageType, string> = {
  physical: "Armor",
  magic: "Magic Resist",
};

/** The damage type as it reads in a sentence ("600 raw physical damage"). */
export const DAMAGE_TYPE_LABEL: Record<PremiseDamageType, string> = {
  physical: "Physical",
  magic: "Magic",
};

/**
 * A quantity as the prompt prints it. The backend already freezes integral
 * values as integers, so this only has to avoid a long float tail on the rare
 * fractional one — it never rounds a value into a different number.
 */
export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
