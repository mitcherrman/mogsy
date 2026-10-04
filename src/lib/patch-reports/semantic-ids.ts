import type { PatchReportCard, PatchReportChange } from "./api";

/**
 * Patch Hub semantic identity — deterministic, URL-safe anchors for the four
 * levels of a patch report: official section → entity → ability/group →
 * individual change.
 *
 * Built ONLY from structured payload fields (`section_id`, `entity_type`,
 * `entity_name`, `ability_slot`, `group_title`, `property_name`), never from
 * rendered prose (`context_text`, `detail_text`) and never from `card.id`, which
 * is a database row id that changes on every rebuild.
 *
 * Grammar (segments joined by `__`, which a slug can never contain):
 *   section : s-<section_id>
 *   entity  : s-<section_id>__e-<entity_type>-<entity_name>
 *   group   : <entity>__g-<ability_slot | group_title | general>
 *   change  : <group>__c-<property_name>
 * Every id is a valid HTML id and a valid URL fragment as-is.
 *
 * The backend has no per-change id (see the payload characterization tests):
 * two changes that share group + property in one card are told apart by their
 * 1-based occurrence order, `-2`, `-3`… (the first keeps the bare id so adding a
 * later duplicate never renames earlier anchors). Two distinct Riot groups that
 * share a slot (26.15 Riven: "R - Blade of the Exile" and "R - Wind Slash") are
 * told apart the same way: `g-r`, `g-r-2`.
 */

const SEGMENT_SEPARATOR = "__";

/** Lowercase ASCII slug: diacritics folded, everything else → single hyphens. */
export function slugifySegment(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const slugOr = (input: string | null | undefined, fallback: string): string =>
  slugifySegment(input) || fallback;

/** Official section key: Riot's own anchor id, falling back to its title. */
export function sectionKey(card: Pick<PatchReportCard, "section_id" | "section_title">): string {
  return slugOr(card.section_id, "") || slugOr(card.section_title, "section");
}

export function sectionAnchor(
  card: Pick<PatchReportCard, "section_id" | "section_title">,
): string {
  return `s-${sectionKey(card)}`;
}

export function entityAnchor(
  card: Pick<PatchReportCard, "section_id" | "section_title" | "entity_type" | "entity_name">,
): string {
  const name = slugOr(card.entity_name, "entity");
  return `${sectionAnchor(card)}${SEGMENT_SEPARATOR}e-${card.entity_type}-${name}`;
}

/**
 * Ability/system group segment. The ability slot is the most stable structured
 * handle (Riot renames abilities, not Q/W/E/R/Passive); a group without a slot
 * (Base Stats, Bugfixes, a mode rule) is keyed by its title.
 */
export function groupSegment(
  change: Pick<PatchReportChange, "ability_slot" | "group_title">,
): string {
  const slot = slugifySegment(change.ability_slot);
  if (slot) return slot;
  return slugOr(change.group_title, "general");
}

export function groupAnchor(
  card: Pick<PatchReportCard, "section_id" | "section_title" | "entity_type" | "entity_name">,
  change: Pick<PatchReportChange, "ability_slot" | "group_title">,
): string {
  return `${entityAnchor(card)}${SEGMENT_SEPARATOR}g-${groupSegment(change)}`;
}

export function changeAnchor(
  card: Pick<PatchReportCard, "section_id" | "section_title" | "entity_type" | "entity_name">,
  change: Pick<PatchReportChange, "ability_slot" | "group_title" | "property_name">,
): string {
  return `${groupAnchor(card, change)}${SEGMENT_SEPARATOR}c-${slugOr(change.property_name, "change")}`;
}

/** Returns `base`, or `base-2`, `base-3`… once `base` has been issued. */
function uniquify(base: string, issued: Map<string, number>): string {
  const seen = (issued.get(base) ?? 0) + 1;
  issued.set(base, seen);
  return seen === 1 ? base : `${base}-${seen}`;
}

export type CardAnchors = {
  entity: string;
  /** One entry per change, in payload order, parallel to `card.changes`. */
  changes: Array<{ group: string; change: string }>;
};

/** The Riot group a change is published under; the grouping key for a card. */
export const groupKey = (change: Pick<PatchReportChange, "group_title">): string =>
  (change.group_title ?? "").trim();

/**
 * Anchors for one card's whole change list with collisions resolved by
 * occurrence order. Changes belong to the group of their Riot `group_title`;
 * each distinct group gets one anchor. Pure: depends only on the card's
 * structured fields, plus an optional `entity` anchor when the report had to
 * disambiguate it (see {@link reportEntityAnchors}) so child ids stay prefixed
 * by their parent.
 */
export function cardAnchors(
  card: PatchReportCard,
  entity: string = entityAnchor(card),
): CardAnchors {
  const issuedGroups = new Map<string, number>();
  const issuedChanges = new Map<string, number>();
  const groupByKey = new Map<string, string>();
  return {
    entity,
    changes: (card.changes ?? []).map((change) => {
      const key = groupKey(change);
      let group = groupByKey.get(key);
      if (!group) {
        group = uniquify(`${entity}${SEGMENT_SEPARATOR}g-${groupSegment(change)}`, issuedGroups);
        groupByKey.set(key, group);
      }
      const base = `${group}${SEGMENT_SEPARATOR}c-${slugOr(change.property_name, "change")}`;
      return { group, change: uniquify(base, issuedChanges) };
    }),
  };
}

/**
 * Report-wide entity anchors, parallel to `cards`. Within one section the
 * backend guarantees (section_id, entity_type, entity_name) is unique, but
 * distinct names can still slug to the same text ("Nunu & Willump" vs
 * "Nunu and Willump"), and payloads with a missing `section_id` collapse to the
 * title — so collisions get an occurrence suffix instead of a duplicate DOM id.
 */
export function reportEntityAnchors(cards: readonly PatchReportCard[]): string[] {
  const issued = new Map<string, number>();
  return cards.map((card) => uniquify(entityAnchor(card), issued));
}
