/**
 * Continuity scope and the exact structural key (PH3-A §9).
 *
 * A key is built ONLY from structured payload fields: section/entity type,
 * entity name, ability slot, group title, property name. Never from `card.id`
 * (a DB row id), `mogzy_entity_ref` (may VETO, never identifies), `mogzy_property`
 * (veto only), or any prose (`context_text`, `detail_text`).
 */
import type { PatchReportCard, PatchReportChange } from "@/lib/patch-reports/api";
import { normalizeAbilitySlot } from "@/lib/patch-reports/report-structure";
import type { ContinuityScope, PatchContinuityKey, ScopeLabel } from "./types";
import { canonicalLabel } from "./value";

/**
 * The closed scope map: only these `(section_id, entity_type)` pairs may chain.
 * Everything else (Arena, ARAM, Classic, Systems, Support Adjustments, runes…)
 * is out of scope — its Riot lines are still returned, just never chained.
 */
export function scopeOfCard(
  card: Pick<PatchReportCard, "section_id" | "entity_type">,
): ContinuityScope | null {
  if (card.section_id === "patch-champions" && card.entity_type === "champion") {
    return "sr.champions";
  }
  if (card.section_id === "patch-items" && card.entity_type === "item") return "sr.items";
  return null;
}

/**
 * The key for one line, or null when entity or property is blank (no identity
 * can be formed). `scope` is passed in so the audit's "allowlist removed"
 * ablation can substitute a wider resolver without touching this function.
 */
export function continuityKey(
  scope: ScopeLabel,
  card: Pick<PatchReportCard, "entity_name">,
  change: Pick<PatchReportChange, "ability_slot" | "group_title" | "property_name">,
): PatchContinuityKey | null {
  const entity = canonicalLabel(card.entity_name);
  const property = canonicalLabel(change.property_name);
  if (entity === "" || property === "") return null;
  return {
    scope,
    entity,
    slot: normalizeAbilitySlot(change.ability_slot),
    group: canonicalLabel(change.group_title),
    property,
  };
}

/** Injective string form: a JSON array of the five canonical fields. */
export function continuityKeyString(key: PatchContinuityKey): string {
  return JSON.stringify([key.scope, key.entity, key.slot, key.group, key.property]);
}

/** The key without its property: "the same entity, slot and group". */
export function groupKeyString(key: PatchContinuityKey): string {
  return JSON.stringify([key.scope, key.entity, key.slot, key.group]);
}
