import type { DocAbility, DocRangeComponent, DocRangeDetail } from "./api";

/**
 * How an ability's spatial facts are presented.
 *
 * CHAMPDATA Pass 12. These pages used to print one line — "Range: N" — from
 * `champion_abilities.range_text`, a Data Dragon import. 439 of the 692 served
 * values were not the ability's cast range: 137 matched nothing the wiki
 * publishes, 103 were a different quantity (an effect radius, a missile travel
 * distance), 65 belonged to self-cast abilities that have no range at all, and
 * 42 were engine sentinels — Hecarim's Onslaught of Shadows read "50000" and
 * Janna's Zephyr read "4294967295".
 *
 * The fix is not a better number. It is to stop pretending one number exists:
 * the wiki publishes a TYPED SET, and this module names each type so the page
 * can show four distances for Hecarim R and none for Master Yi W.
 */

const LABELS: Record<string, string> = {
  CAST_RANGE: "Cast range",
  TRAVEL_RANGE: "Travel range",
  EFFECT_RADIUS: "Effect radius",
  INNER_RADIUS: "Inner radius",
  COLLISION_RADIUS: "Collision radius",
  TETHER_RADIUS: "Tether radius",
  DETECTION_RADIUS: "Detection radius",
  WIDTH: "Width",
  ATTACK_RANGE_MODIFIER: "Attack range",
};

export function rangeComponentLabel(type: string): string {
  return LABELS[type] ?? type.toLowerCase().replace(/_/g, " ");
}

export type RangeRow = { label: string; text: string; note: string | null };

/**
 * The rows to render under an ability, in the authority's own order.
 *
 * A per-rank cast range is shown as the ladder the endpoint serves; every other
 * published distance is shown with its own label. When the cast range is
 * global, "Global" is the value — a word, because that is what the authority
 * says, and because the sentinel this replaces was only ever a number standing
 * in for one.
 */
export function rangeRows(ability: Pick<DocAbility, "range" | "range_detail">): RangeRow[] {
  const detail: DocRangeDetail | null = ability.range_detail ?? null;
  if (!detail) return [];

  const rows: RangeRow[] = [];
  const ladder = ability.range?.raw ?? null;
  const seenCast = new Set<DocRangeComponent>();

  if (ladder) {
    const cast = detail.components.find((c) => c.type === "CAST_RANGE");
    if (cast) seenCast.add(cast);
    rows.push({ label: "Cast range", text: ladder, note: cast?.note ?? null });
  }

  for (const component of detail.components) {
    if (seenCast.has(component)) continue;
    rows.push({
      label: rangeComponentLabel(component.type),
      text: component.value,
      note: component.note,
    });
  }
  return rows;
}

/**
 * The one-line explanation for an ability that shows no cast range, or null
 * when none is warranted. Absence is a fact here, not a gap to hide: an
 * ability that cannot be aimed does not have a range, and saying so is more
 * accurate than the number that used to sit in its place.
 */
export function rangeAbsenceNote(
  ability: Pick<DocAbility, "range" | "range_detail">,
): string | null {
  const detail = ability.range_detail;
  if (!detail || ability.range) return null;
  switch (detail.modelled) {
    case "global":
      return null; // "Cast range: Global" already carries it.
    case "no_range_published":
      return "Self-cast — this ability has no range.";
    case "not_established":
      return null;
    default:
      break;
  }
  // A cast range that IS shown — "300 - 1000", "550 – 700 (based on level)" —
  // explains itself; a note repeating the machine-readable reason beside it
  // would be noise. The note is for the case where nothing named "cast range"
  // appears at all.
  if (detail.components.some((c) => c.type === "CAST_RANGE")) return null;
  if (detail.components.length > 0) return "No cast range — this ability is not aimed at a point.";
  return null;
}
