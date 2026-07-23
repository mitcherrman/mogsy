/**
 * Display-safe canonical-state view (G5.2A).
 *
 * `MasteryStateView` is a projection of a backend snapshot chosen for rendering
 * an HP/resource/effects panel. It deliberately does NOT mirror the full backend
 * canonical snapshot: no calculation evidence, no future/unrevealed state, no
 * arbitrary `custom_state` internals unless the backend explicitly projected
 * them as display labels. Every number here is a backend-provided value; the
 * frontend never derives max HP, resources, or effect magnitudes itself.
 */

import {
  MasteryContractParseError,
  arr,
  nnum,
  nstr,
  num,
  rec,
  strList,
} from "./common";
import { MasterySnapshotId, snapshotId } from "./ids";

export interface MasteryActiveEffectView {
  readonly effectId: string;
  readonly label: string;
  readonly magnitude: number | null;
  readonly unit: string | null;
}

export interface MasteryInventoryItemView {
  readonly name: string;
  readonly itemId: number | null;
}

export interface MasteryChampionView {
  readonly championId: string;
  readonly displayName: string | null;
  readonly currentHealth: number;
  readonly maxHealth: number | null;
  readonly resourceType: string | null;
  readonly currentResource: number | null;
  readonly maxResource: number | null;
  readonly activeEffects: readonly MasteryActiveEffectView[];
  /** Display-only inventory item labels — never used for any calculation. */
  readonly inventorySummary: readonly string[];
  // --- additive progression display fields (null/empty for sets that omit them,
  //     e.g. the Ahri chain). All are backend-provided display facts. ---
  readonly level: number | null;
  readonly abilityRanks: Readonly<Record<string, number>>;
  readonly abilityPower: number | null;
  /** Item-derived ability haste. Null when the set never grants any. */
  readonly abilityHaste: number | null;
  /** Attack-damage model (physical champions). base + bonus = total. */
  readonly baseAttackDamage: number | null;
  readonly bonusAttackDamage: number | null;
  readonly totalAttackDamage: number | null;
  readonly gold: number | null;
  readonly armor: number | null;
  readonly magicResist: number | null;
  readonly archetype: string | null;
  readonly inventoryItems: readonly MasteryInventoryItemView[];
}

export interface MasteryStateView {
  readonly snapshotId: MasterySnapshotId;
  readonly patchKeyDigest: string | null;
  readonly validationStatus: string | null;
  readonly label: string | null;
  readonly championA: MasteryChampionView;
  readonly championB: MasteryChampionView;
}

function readEffect(value: unknown, label: string): MasteryActiveEffectView {
  const e = rec(value, label);
  return {
    effectId: nstr(e.effect_id, `${label}.effect_id`) ?? "",
    label: nstr(e.label, `${label}.label`) ?? "",
    magnitude: nnum(e.magnitude, `${label}.magnitude`),
    unit: nstr(e.unit, `${label}.unit`),
  };
}

function readAbilityRanks(value: unknown, label: string): Record<string, number> {
  if (value === undefined || value === null) return {};
  const r = rec(value, label);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function readInventoryItems(value: unknown, label: string): MasteryInventoryItemView[] {
  const items = arr(value ?? [], label);
  return items.map((it, i) => {
    const o = rec(it, `${label}[${i}]`);
    return {
      name: nstr(o.name, `${label}[${i}].name`) ?? "",
      itemId: nnum(o.item_id, `${label}[${i}].item_id`),
    };
  });
}

function readChampion(value: unknown, label: string): MasteryChampionView {
  const c = rec(value, label);
  const effects = arr(c.active_effects ?? [], `${label}.active_effects`);
  return {
    championId: nstr(c.champion_id, `${label}.champion_id`) ?? "",
    displayName: nstr(c.display_name, `${label}.display_name`),
    currentHealth: num(c.current_health, `${label}.current_health`),
    maxHealth: nnum(c.max_health, `${label}.max_health`),
    resourceType: nstr(c.resource_type, `${label}.resource_type`),
    currentResource: nnum(c.current_resource, `${label}.current_resource`),
    maxResource: nnum(c.max_resource, `${label}.max_resource`),
    activeEffects: effects.map((e, i) => readEffect(e, `${label}.active_effects[${i}]`)),
    inventorySummary: strList(c.inventory_summary ?? [], `${label}.inventory_summary`),
    level: nnum(c.level, `${label}.level`),
    abilityRanks: readAbilityRanks(c.ability_ranks, `${label}.ability_ranks`),
    abilityPower: nnum(c.ability_power, `${label}.ability_power`),
    abilityHaste: nnum(c.ability_haste, `${label}.ability_haste`),
    baseAttackDamage: nnum(c.base_attack_damage, `${label}.base_attack_damage`),
    bonusAttackDamage: nnum(c.bonus_attack_damage, `${label}.bonus_attack_damage`),
    totalAttackDamage: nnum(c.total_attack_damage, `${label}.total_attack_damage`),
    gold: nnum(c.gold, `${label}.gold`),
    armor: nnum(c.armor, `${label}.armor`),
    magicResist: nnum(c.magic_resist, `${label}.magic_resist`),
    archetype: nstr(c.archetype, `${label}.archetype`),
    inventoryItems: readInventoryItems(c.inventory_items, `${label}.inventory_items`),
  };
}

export function readStateView(value: unknown, label = "state"): MasteryStateView {
  const s = rec(value, label);
  if (!("champion_a" in s) || !("champion_b" in s)) {
    throw new MasteryContractParseError(`${label} requires champion_a and champion_b`, label);
  }
  return {
    snapshotId: snapshotId(s.snapshot_id, `${label}.snapshot_id`),
    patchKeyDigest: nstr(s.patch_key_digest, `${label}.patch_key_digest`),
    validationStatus: nstr(s.validation_status, `${label}.validation_status`),
    label: nstr(s.label, `${label}.label`),
    championA: readChampion(s.champion_a, `${label}.champion_a`),
    championB: readChampion(s.champion_b, `${label}.champion_b`),
  };
}
