/**
 * JOURNEY5 — THE STRUCTURED COMBAT REVEAL (`combat_working.v1`).
 *
 * A Journey Combat child's reveal entry (`own_challenge_reveals[]`, the submit
 * response's `challenge_reveal`, and a match-review challenge row) may carry an
 * OPTIONAL `combat_working` block: the server's own derivation, from the
 * ability's formula to the rounded answer. Every number in it is the SERVER's,
 * already rounded for display.
 *
 * This reader is a typed ALLOWLIST and FAILS CLOSED TO "NO WORKING": every
 * object is checked against its exact key set, every number must be finite,
 * and anything off-contract — an unknown key, a missing field, a wrong type —
 * returns `null`. It never throws: a malformed working block must never take
 * the match (or the review) down; the reveal simply falls back to the served
 * prose explanation, exactly as before the block existed.
 *
 * Nothing here computes a League value. The renderer prints these numbers
 * verbatim (`JourneyCombatWorking`).
 */

export const COMBAT_WORKING_CONTRACT = "combat_working.v1";

export interface CombatWorkingRatio {
  stat: string;
  label: string;
  ratio: number;
  value: number;
}

export interface CombatWorking {
  contract: typeof COMBAT_WORKING_CONTRACT;
  calculation: string;
  damageType: string;
  attacker: { side: string; champion: string };
  target: { side: string; champion: string };
  ability: { slot: string; name: string; rank: number };
  formula: { flat: number; ratios: CombatWorkingRatio[] };
  attackerStats: Record<string, number>;
  rawDamage: number;
  targetArmor: {
    value: number;
    source: "stated" | "recalled";
    /** 0-based teaching child; present only for a recalled armor. */
    establishedInChild: number | null;
  };
  penetration: { lethality: number; armorPenPercent: number; armorPenFlat: number };
  effectiveArmor: number;
  mitigationMultiplier: number;
  finalDamage: number;
  /** The rounded answer, as the server states it. */
  answer: string;
}

class Off extends Error {}

type Obj = Record<string, unknown>;

function obj(v: unknown, keys: readonly string[], optional: readonly string[] = []): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Off();
  const o = v as Obj;
  for (const k of Object.keys(o)) {
    if (!keys.includes(k) && !optional.includes(k)) throw new Off();
  }
  for (const k of keys) if (!(k in o)) throw new Off();
  return o;
}
const num = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Off();
  return v;
};
const text = (v: unknown): string => {
  if (typeof v !== "string" || v.length === 0) throw new Off();
  return v;
};

function side(v: unknown) {
  const o = obj(v, ["side", "champion"]);
  return { side: text(o.side), champion: text(o.champion) };
}

/**
 * Read a served `combat_working` block, or `null` when there is none or it is
 * off-contract. Never throws.
 */
export function readCombatWorking(raw: unknown): CombatWorking | null {
  if (raw === null || raw === undefined) return null;
  try {
    const o = obj(raw, [
      "contract", "calculation", "damage_type", "attacker", "target", "ability", "formula",
      "attacker_stats", "raw_damage", "target_armor", "penetration", "effective_armor",
      "mitigation_multiplier", "final_damage", "answer",
    ]);
    if (o.contract !== COMBAT_WORKING_CONTRACT) return null;
    const ability = obj(o.ability, ["slot", "name", "rank"]);
    const formula = obj(o.formula, ["flat", "ratios"]);
    if (!Array.isArray(formula.ratios)) return null;
    const ratios = formula.ratios.map((r) => {
      const x = obj(r, ["stat", "label", "ratio", "value"]);
      return { stat: text(x.stat), label: text(x.label), ratio: num(x.ratio), value: num(x.value) };
    });
    const statsRaw = o.attacker_stats;
    if (!statsRaw || typeof statsRaw !== "object" || Array.isArray(statsRaw)) return null;
    const attackerStats: Record<string, number> = {};
    for (const [k, v] of Object.entries(statsRaw as Obj)) attackerStats[k] = num(v);
    const armor = obj(o.target_armor, ["value", "source"], ["established_in_child"]);
    if (armor.source !== "stated" && armor.source !== "recalled") return null;
    let establishedInChild: number | null = null;
    if (armor.source === "recalled") {
      establishedInChild = num(armor.established_in_child);
      if (!Number.isInteger(establishedInChild) || establishedInChild < 0) return null;
    } else if ("established_in_child" in armor) {
      return null;
    }
    const pen = obj(o.penetration, ["lethality", "armor_pen_percent", "armor_pen_flat"]);
    const answer = o.answer;
    if (typeof answer !== "string" && typeof answer !== "number") return null;
    return {
      contract: COMBAT_WORKING_CONTRACT,
      calculation: text(o.calculation),
      damageType: text(o.damage_type),
      attacker: side(o.attacker),
      target: side(o.target),
      ability: { slot: text(ability.slot), name: text(ability.name), rank: num(ability.rank) },
      formula: { flat: num(formula.flat), ratios },
      attackerStats,
      rawDamage: num(o.raw_damage),
      targetArmor: { value: num(armor.value), source: armor.source, establishedInChild },
      penetration: {
        lethality: num(pen.lethality),
        armorPenPercent: num(pen.armor_pen_percent),
        armorPenFlat: num(pen.armor_pen_flat),
      },
      effectiveArmor: num(o.effective_armor),
      mitigationMultiplier: num(o.mitigation_multiplier),
      finalDamage: num(o.final_damage),
      answer: String(answer),
    };
  } catch {
    // Off-contract (or anything else unexpected): no working, never a crash.
    return null;
  }
}
