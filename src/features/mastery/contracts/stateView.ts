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
