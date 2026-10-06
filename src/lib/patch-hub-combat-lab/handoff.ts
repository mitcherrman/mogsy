/**
 * Patch Hub → Combat Lab handoff (PH4-C). Champion only.
 *
 * WHAT THE LINK SAYS: "open Combat Lab with this champion as the attacker".
 * It does NOT say anything about a patch. Combat Lab has no patch-versioned
 * data, cannot compare before/after, and cannot be told a level, items or runes
 * by URL — and this module deliberately never tries. The only input is a card;
 * no patch version, projection, level or evidence reaches the URL.
 *
 * THE URL IS NOT BUILT HERE. `buildCombatLabMatchupUrl` is the one contract
 * Combat Lab publishes (`lib/combat-lab/matchup-link.ts`), and Pro Play already
 * uses it. This module only decides WHETHER a card may use it, and fails closed.
 */
import { buildCombatLabMatchupUrl, COMBAT_LAB_PARAM } from "@/lib/combat-lab/matchup-link";
import { isChampionsSectionChampionCard } from "@/lib/patch-impact/eligibility";
import type { PatchReportCard } from "@/lib/patch-reports/api";

export type CombatLabHandoff = {
  /** Site-relative Combat Lab URL from the canonical builder: `/combat-lab?attacker=<slug>`. */
  href: string;
  /** The visible and accessible label; says exactly what happens. */
  label: string;
};

/** "Open Vi in Combat Lab". No "test", "simulate", "compare" or "impact". */
export function combatLabHandoffLabel(championName: string): string {
  return `Open ${championName} in Combat Lab`;
}

/**
 * The handoff for a report entity, or null.
 *
 * Eligible only when ALL hold:
 *  - a Summoner's Rift Champions-section champion card (not Arena/Mayhem/system,
 *    items, runes), the same gate Patch Impact uses;
 *  - `mogzy_entity_ref` is a non-empty catalog identity (null means Mogzy does
 *    not map this champion; we never fall back to guessing from `entity_name`);
 *  - the canonical builder produces an `attacker` slug from it.
 */
export function combatLabHandoffFor(card: PatchReportCard): CombatLabHandoff | null {
  if (!isChampionsSectionChampionCard(card)) return null;
  const ref = card.mogzy_entity_ref?.trim();
  if (!ref) return null;
  const href = buildCombatLabMatchupUrl({ attacker: ref });
  if (!href.includes(`?${COMBAT_LAB_PARAM.attacker}=`)) return null;
  return { href, label: combatLabHandoffLabel(card.entity_name) };
}
