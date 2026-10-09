import type { MogzyStatus, PatchEntityType, PatchReportCard } from "./api";
import { MOGZY_STATUS_LABEL } from "./mogzy-status";

/**
 * The status filter's option labels. The filter matches each card's
 * `aggregate_status`, which the card header shows with the consumer vocabulary,
 * so the options use that same vocabulary (one map, `mogzy-status.ts`).
 */
export const STATUS_LABELS: Record<MogzyStatus, string> = MOGZY_STATUS_LABEL;

export function filterCards(
  cards: PatchReportCard[],
  search: string,
  typeFilter: PatchEntityType | "all",
  statusFilter: MogzyStatus | "all",
): PatchReportCard[] {
  const q = search.trim().toLowerCase();
  return cards.filter((card) => {
    if (typeFilter !== "all" && card.entity_type !== typeFilter) return false;
    if (statusFilter !== "all" && card.aggregate_status !== statusFilter) return false;
    if (!q) return true;
    return (
      card.entity_name.toLowerCase().includes(q) ||
      card.section_title.toLowerCase().includes(q) ||
      card.changes.some((ch) => ch.property_name.toLowerCase().includes(q))
    );
  });
}
