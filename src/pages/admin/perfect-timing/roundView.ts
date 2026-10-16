/**
 * PT4 — wire round → PT1 round view, including the ability icon.
 *
 * Icons come only from Mogzy's approved asset helpers
 * (`src/lib/combat-lab/abilityIcons.ts`): the stored ability icon, else the
 * champion's square portrait, else null (PT1 draws the slot monogram). No
 * DDragon URL and no invented artwork.
 *
 * PT4.4: the champion splash comes from the same asset store through the
 * champion manifest (`getChampionSplash`), matched on the alphanumeric form of
 * the name, so "Kai'Sa" and "Dr. Mundo" find their folders. No manifest, or no
 * entry, is null and the screen simply draws without a backdrop.
 *
 * NAME BRIDGE. The icon map is keyed by asset-folder names and matches on the
 * alphanumeric form, which covers punctuation ("Kai'Sa", "Dr. Mundo"). Two
 * canonical `champion_abilities` names carry a second word the folder does not:
 * checked against PT3's eligible pool on the 2026-09-26 dev DB, 163 of 165
 * champions match directly and these two did not.
 */
import { getAbilityIconUrl, getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";
import { getChampionSplash, type ChampionManifest } from "@/hooks/useChampionAssets";
import type { PtDealRound } from "@/lib/perfect-timing/contract";
import type { PtRoundView, PtSlot } from "@/lib/perfect-timing/viewModel";

const ICON_NAME_BRIDGE: Readonly<Record<string, string>> = {
  "Nunu & Willump": "Nunu",
  "Renata Glasc": "Renata",
};

const alnum = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function perfectTimingIconUrl(champion: string, slot: PtSlot): string | null {
  const name = ICON_NAME_BRIDGE[champion] ?? champion;
  return getAbilityIconUrl(name, slot) ?? getChampionSquareIconUrl(name) ?? null;
}

/** The champion's splash art, or null when the manifest is absent or has no such champion. */
export function perfectTimingSplashUrl(champion: string, manifest: ChampionManifest | null | undefined): string | null {
  if (!manifest?.champions) return null;
  const name = ICON_NAME_BRIDGE[champion] ?? champion;
  if (manifest.champions[name]) return getChampionSplash(manifest, name);
  const wanted = alnum(name);
  const key = Object.keys(manifest.champions).find((k) => alnum(k) === wanted);
  return key ? getChampionSplash(manifest, key) : null;
}

/** `index` is 0-based here; the view's is 1-based. */
export function toRoundView(round: PtDealRound, index: number, total: number, manifest?: ChampionManifest | null): PtRoundView {
  return {
    roundId: round.round_id,
    championName: round.champion,
    abilityName: round.ability_name,
    slot: round.slot,
    rank: round.rank,
    rankCount: round.rank_count,
    iconUrl: perfectTimingIconUrl(round.champion, round.slot),
    splashUrl: perfectTimingSplashUrl(round.champion, manifest),
    index: index + 1,
    total,
  };
}
