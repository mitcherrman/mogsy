/**
 * JP4 — THE JOURNEY'S ICONS: one small set of League-native pictures, drawn at
 * a few STANDARD sizes (`journey-ico--inline / --anchor / --node / --source`,
 * index.css "JP4"), so a question, the board, a knowledge card and a reasoning
 * node all speak the same visual vocabulary.
 *
 * Each icon REINFORCES a noun that is also written out; it is decorative
 * (`aria-hidden`) and the text beside it carries the meaning. A picture that
 * fails to load leaves its box empty rather than moving anything.
 *
 * Two treatments that must never be confused:
 *   * a STAT MNEMONIC (`StatMnemonicIcon`) — a ROUND badge with a gold ring:
 *     "Armor", drawn with Cloth Armor. Never an item the champion owns.
 *   * an ITEM (`ItemIcon`) — a SQUARE tile, like the board's inventory slots:
 *     an item that IS in the state (Doran's Blade as a Bonus AD source).
 */
import { useState } from "react";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";
import type { AbilitySlot } from "@/lib/journey/contract";
import { shardArtUrl, type StatMnemonic } from "@/lib/journey/statIcons";

export type JourneyIconSize = "inline" | "anchor" | "node" | "source";

function Pic({ url, className, testId, title, extra }: {
  url: string | null; className: string; testId?: string; title?: string;
  extra?: Record<string, string | undefined>;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span aria-hidden data-testid={testId} title={title} className={className} {...extra}>
      {url && !broken && (
        <img src={url} alt="" draggable={false} decoding="async" onError={() => setBroken(true)} />
      )}
    </span>
  );
}

/** A stat, drawn as its mnemonic item in a round badge (never a slot). */
export function StatMnemonicIcon({ mnemonic, size, testId }: {
  mnemonic: StatMnemonic; size: JourneyIconSize; testId?: string;
}) {
  const assets = useMasteryAssets();
  return (
    <Pic url={assets.itemIconUrl(mnemonic.itemId)} testId={testId}
      title={`${mnemonic.stat} (shown with ${mnemonic.itemName})`}
      extra={{ "data-mnemonic": String(mnemonic.itemId), "data-icon-kind": "stat" }}
      className={`journey-ico journey-ico--${size} journey-ico--mnemonic`} />
  );
}

/** An item that IS in the state: a square tile, the inventory's own shape. */
export function ItemIcon({ itemId, name, size, testId }: {
  itemId: number | null; name: string; size: JourneyIconSize; testId?: string;
}) {
  const assets = useMasteryAssets();
  return (
    <Pic url={itemId ? assets.itemIconUrl(itemId) : null} testId={testId} title={name}
      extra={{ "data-item-id": itemId ? String(itemId) : undefined, "data-icon-kind": "item" }}
      className={`journey-ico journey-ico--${size} journey-ico--item`} />
  );
}

/** A stat shard, in the owner's art; served id and name only. */
export function ShardIcon({ shardId, name, size, testId }: {
  shardId: string; name: string; size: JourneyIconSize | "board"; testId?: string;
}) {
  return (
    <Pic url={shardArtUrl(shardId)} testId={testId} title={name}
      extra={{ "data-shard-id": shardId, "data-icon-kind": "shard" }}
      className={`journey-ico journey-ico--${size} journey-ico--shard`} />
  );
}

/** A champion ability's icon (the board's own resolver). */
export function AbilityIcon({ champion, slot, size, testId }: {
  champion: string; slot: AbilitySlot; size: JourneyIconSize; testId?: string;
}) {
  return (
    <Pic url={getAbilityIconUrl(champion, slot)} testId={testId}
      extra={{ "data-slot": slot, "data-icon-kind": "ability" }}
      className={`journey-ico journey-ico--${size} journey-ico--ability`} />
  );
}

/** A champion's portrait, round. */
export function ChampionIcon({ championId, championName, size, testId }: {
  championId: string; championName: string; size: JourneyIconSize; testId?: string;
}) {
  const assets = useMasteryAssets();
  return (
    <Pic url={assets.championIconUrl(championId, championName)} testId={testId}
      extra={{ "data-champion": championName, "data-icon-kind": "champion" }}
      className={`journey-ico journey-ico--${size} journey-ico--champion`} />
  );
}
