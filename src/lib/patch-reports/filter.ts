import type { MogzyStatus, PatchEntityType, PatchReportCard } from "./api";

export const STATUS_LABELS: Record<MogzyStatus, string> = {
  matches: "Matches",
  applied: "Applied",
  pending: "Pending",
  mismatch: "Mismatch",
  unresolved: "Unresolved",
  needs_interpretation: "Needs interpretation",
  not_represented: "Not represented",
};

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
