/**
 * PT5 — Mastery Slice wire → PT1 views.
 *
 * One slice is one champion ability, so every stage shares the champion,
 * ability, icon and splash (`toRoundView`'s helpers, unchanged); only the rank,
 * the ability haste and the item move. The item's art is Mogzy's own asset
 * store (`assets/items/{id}.png`, the convention the Pro Play inventory and
 * the quiz surfaces use) — never a DDragon URL.
 *
 * A reveal's "previous" cooldown is filled ONLY from a previous stage that was
 * locked and released; a voided stage stays unknown.
 */
import { resolveAssetUrl, type ChampionManifest } from "@/hooks/useChampionAssets";
import type { PtSliceDeal, PtSliceModifier, PtSliceRelease, PtSliceStage } from "@/lib/perfect-timing/sliceContract";
import { toSliceRevealBase } from "@/lib/perfect-timing/sliceContract";
import type { PtRevealView, PtRoundView, PtSliceItemView } from "@/lib/perfect-timing/viewModel";
import { perfectTimingIconUrl, perfectTimingSplashUrl } from "./roundView";

export function sliceItemIconUrl(itemId: number): string | null {
  return Number.isInteger(itemId) && itemId > 0 ? resolveAssetUrl(`assets/items/${itemId}.png`) : null;
}

export function toItemView(m: PtSliceModifier | null): PtSliceItemView | null {
  return m ? { itemId: m.item_id, name: m.name, abilityHaste: m.ability_haste, iconUrl: sliceItemIconUrl(m.item_id) } : null;
}

/** The round view of stage `i` (0-based) of a slice. */
export function toSliceRoundView(deal: PtSliceDeal, i: number, manifest?: ChampionManifest | null): PtRoundView {
  const s: PtSliceStage = deal.stages[i];
  const prev = i > 0 ? deal.stages[i - 1] : null;
  return {
    // A closed stage (resumed deal) has no round id; its key only has to be unique on screen.
    roundId: s.round_id ?? `${deal.slice_id}:${s.stage}`,
    championName: deal.champion,
    abilityName: deal.ability_name,
    slot: deal.slot,
    rank: s.rank,
    rankCount: deal.rank_count,
    iconUrl: perfectTimingIconUrl(deal.champion, deal.slot),
    splashUrl: perfectTimingSplashUrl(deal.champion, manifest),
    index: i + 1,
    total: deal.stages.length,
    slice: {
      kind: s.kind,
      stage: s.stage,
      total: deal.stages.length,
      abilityHaste: s.ability_haste,
      item: toItemView(s.modifier),
      previous: prev ? { kind: prev.kind, rank: prev.rank, item: toItemView(prev.modifier) } : null,
    },
  };
}

/**
 * The reveal view of a slice release. `previous` is the release of the stage
 * before, if (and only if) that stage was locked.
 */
export function toSliceRevealView(r: PtSliceRelease, assumption: string, previous: PtSliceRelease | null): PtRevealView {
  const item = r.authority.item;
  return {
    ...toSliceRevealBase(r),
    slice: {
      kind: r.kind,
      stage: r.stage,
      baseCooldownMs: r.calculation.base_cooldown_ms,
      abilityHaste: r.calculation.ability_haste,
      exactMs: r.calculation.exact_ms,
      item: item ? { itemId: item.item_id, name: item.name, abilityHaste: item.ability_haste, iconUrl: sliceItemIconUrl(item.item_id) } : null,
      previous: previous && previous.stage === r.stage - 1
        ? { kind: previous.kind, rank: previous.calculation.rank, targetMs: previous.target_ms }
        : null,
      assumption,
    },
  };
}
