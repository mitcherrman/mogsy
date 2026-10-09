import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { isChampionsSectionChampionCard } from "@/lib/patch-impact/eligibility";
import type { PatchReportCard } from "@/lib/patch-reports/api";
import type { ReportGroupNode } from "@/lib/patch-reports/report-structure";

/**
 * The backend publishes spell icons but never a passive's. For a Summoner's
 * Rift Champions-section champion the passive art Mogzy already stores (the
 * same `passive.png` Combat Lab and Journey show) stands in, keyed by the
 * catalog identity only, never guessed from the display name. Anything else
 * (Arena / mode cards, items, unmapped champions) keeps the slot letter.
 */
export function storedPassiveIconUrl(card: PatchReportCard, group: ReportGroupNode): string | null {
  if (group.slot !== "P" || group.iconUrl) return null;
  if (!isChampionsSectionChampionCard(card)) return null;
  const ref = card.mogzy_entity_ref?.trim();
  return ref ? getAbilityIconUrl(ref, "P") : null;
}
