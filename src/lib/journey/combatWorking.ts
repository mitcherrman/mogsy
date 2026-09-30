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

function abilityOf(v: unknown) {
  const a = obj(v, ["slot", "name", "rank"]);
  return { slot: text(a.slot), name: text(a.name), rank: num(a.rank) };
}

/** The `formula` sub-shape every damage working shares (flat + ratios). */
function formulaOf(v: unknown): { flat: number; ratios: CombatWorkingRatio[] } {
  const formula = obj(v, ["flat", "ratios"]);
  if (!Array.isArray(formula.ratios)) throw new Off();
  const ratios = formula.ratios.map((r) => {
    const x = obj(r, ["stat", "label", "ratio", "value"]);
    return { stat: text(x.stat), label: text(x.label), ratio: num(x.ratio), value: num(x.value) };
  });
  return { flat: num(formula.flat), ratios };
}

function answerOf(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") throw new Off();
  return String(v);
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
    const { ratios, ...formula } = formulaOf(o.formula);
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
      formula: { flat: formula.flat, ratios },
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

// ── JP5 — ONE CARRIER, TYPED CALCULATIONS ────────────────────────────────────
//
// The server sends every Journey working through the same key
// (`combat_working`); `contract` names the shape and `calculation` what it
// explains. Each contract has its own allowlist reader below, and
// `readJourneyWorking` dispatches on `contract`: an unknown contract is no
// working, exactly as an off-contract block is.

export const RAW_DAMAGE_WORKING_CONTRACT = "raw_damage_working.v1";
export const COOLDOWN_WORKING_CONTRACT = "cooldown_working.v1";

/** One term of a raw damage: the flat base, or one ratio's contribution. */
export type RawDamageTerm =
  | { term: "flat"; value: number }
  | { term: "ratio"; stat: string; value: number };

/** `raw_damage_working.v1` — `physical_ability_raw_damage`. */
export interface RawDamageWorking {
  contract: typeof RAW_DAMAGE_WORKING_CONTRACT;
  calculation: "physical_ability_raw_damage";
  damageType: string;
  attacker: { side: string; champion: string };
  ability: { slot: string; name: string; rank: number };
  /** The same sub-shape as `combat_working.v1`'s: each ratio's value is the EXACT stat used. */
  formula: { flat: number; ratios: CombatWorkingRatio[] };
  /** The server's per-term contributions, in formula order (flat first). */
  terms: RawDamageTerm[];
  rawDamage: number;
  answer: string;
}

/** `cooldown_working.v1` — `cooldown_under_haste`. */
export interface CooldownWorking {
  contract: typeof COOLDOWN_WORKING_CONTRACT;
  calculation: "cooldown_under_haste";
  champion: { side: string; champion: string };
  ability: { slot: string; name: string; rank: number };
  baseCooldown: number;
  abilityHaste: number;
  /** THE haste transformation, served: 100 / (100 + haste). */
  cooldownMultiplier: number;
  effectiveCooldown: number;
  unit: string;
  answer: string;
}

export type JourneyWorking = CombatWorking | RawDamageWorking | CooldownWorking;

/** How far the served terms may sit from the served total (each is rounded to 4 places). */
const TERM_SLACK = 0.00005;

function readRawDamageWorking(raw: unknown): RawDamageWorking | null {
  try {
    const o = obj(raw, ["contract", "calculation", "damage_type", "attacker", "ability", "formula",
      "terms", "raw_damage", "answer"]);
    if (o.contract !== RAW_DAMAGE_WORKING_CONTRACT || o.calculation !== "physical_ability_raw_damage") return null;
    const formula = formulaOf(o.formula);
    if (!Array.isArray(o.terms)) return null;
    const terms = o.terms.map((t): RawDamageTerm => {
      const x = t as Obj;
      if (x && typeof x === "object" && x.term === "flat") {
        const f = obj(t, ["term", "value"]);
        return { term: "flat", value: num(f.value) };
      }
      const r = obj(t, ["term", "stat", "value"]);
      if (r.term !== "ratio") throw new Off();
      return { term: "ratio", stat: text(r.stat), value: num(r.value) };
    });
    const rawDamage = num(o.raw_damage);
    // The layout the chain draws: the flat term, then one term per ratio, in
    // the formula's order — and they must add up to the served total. A block
    // that does not is not drawn (the reveal keeps its words).
    const ratioTerms = terms.slice(1);
    if (terms[0]?.term !== "flat" || terms[0].value !== formula.flat
      || ratioTerms.length !== formula.ratios.length
      || ratioTerms.some((t, i) => t.term !== "ratio" || t.stat !== formula.ratios[i].stat)) return null;
    const sum = terms.reduce((s, t) => s + t.value, 0);
    if (Math.abs(sum - rawDamage) > TERM_SLACK * terms.length) return null;
    return {
      contract: RAW_DAMAGE_WORKING_CONTRACT, calculation: "physical_ability_raw_damage",
      damageType: text(o.damage_type), attacker: side(o.attacker), ability: abilityOf(o.ability),
      formula, terms, rawDamage, answer: answerOf(o.answer),
    };
  } catch {
    return null;
  }
}

function readCooldownWorking(raw: unknown): CooldownWorking | null {
  try {
    const o = obj(raw, ["contract", "calculation", "champion", "ability", "base_cooldown", "ability_haste",
      "cooldown_multiplier", "effective_cooldown", "unit", "answer"]);
    if (o.contract !== COOLDOWN_WORKING_CONTRACT || o.calculation !== "cooldown_under_haste") return null;
    const multiplier = num(o.cooldown_multiplier);
    if (!(multiplier > 0 && multiplier <= 1)) return null;
    return {
      contract: COOLDOWN_WORKING_CONTRACT, calculation: "cooldown_under_haste",
      champion: side(o.champion), ability: abilityOf(o.ability),
      baseCooldown: num(o.base_cooldown), abilityHaste: num(o.ability_haste),
      cooldownMultiplier: multiplier, effectiveCooldown: num(o.effective_cooldown),
      unit: text(o.unit), answer: answerOf(o.answer),
    };
  } catch {
    return null;
  }
}

/**
 * JP5 — read the served working of ANY known calculation, or `null` (none, an
 * unknown contract, or off-contract). Never throws.
 */
export function readJourneyWorking(raw: unknown): JourneyWorking | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  switch ((raw as Obj).contract) {
    case COMBAT_WORKING_CONTRACT: return readCombatWorking(raw);
    case RAW_DAMAGE_WORKING_CONTRACT: return readRawDamageWorking(raw);
    case COOLDOWN_WORKING_CONTRACT: return readCooldownWorking(raw);
    default: return null;
  }
}
