import { resolvePatchReportAsset, type PatchReportCard } from "@/lib/patch-reports/api";
import {
  getChampionIcon,
  getChampionLoading,
  getChampionSplash,
  type ChampionManifest,
} from "@/hooks/useChampionAssets";

/**
 * Deck artwork resolution (PHD1). Pure given the canonical champion asset
 * manifest; nothing here fabricates a URL that the manifest or the report does
 * not already name.
 *
 * - A Summoner's Rift champion card names its catalog identity in
 *   `mogzy_entity_ref`, which is the manifest key ("K'Sante", "Tahm Kench").
 * - A mode card (ARAM: Mayhem › Bard) is `entity_type: "system"` with a null
 *   ref, but the backend's own `mogzy_image_path` names the champion asset
 *   folder (`assets/champions/Bard/icon.png`). That folder is matched against
 *   the manifest's own paths, never against the display name.
 * - Items and anything else keep the report's own image (Mogzy-served first,
 *   official second), exactly as the List View does.
 */
export type DeckArt = {
  /** Wide splash (1215×717) for the desktop stage. */
  splash: string | null;
  /** Portrait loading art (308×560) for phones and slivers. */
  loading: string | null;
  /** Square icon: items, the touched-ability rail fallback, the rail ticks. */
  icon: string | null;
  /** Manifest champion key when the art is a champion's. */
  champion: string | null;
};

const CHAMPION_FOLDER = /^assets\/champions\/([^/]+)\//i;

export type ManifestFolderIndex = ReadonlyMap<string, string>;

/** `folder → manifest key`, read from the manifest's own icon/splash paths. */
export function indexManifestFolders(manifest: ChampionManifest | null | undefined): ManifestFolderIndex {
  const index = new Map<string, string>();
  if (!manifest?.champions) return index;
  for (const [key, asset] of Object.entries(manifest.champions)) {
    const path = asset.icon || asset.splash || asset.loading || "";
    const folder = CHAMPION_FOLDER.exec(path)?.[1];
    if (folder) index.set(folder.toLowerCase(), key);
  }
  return index;
}

export function championKeyFor(
  card: Pick<PatchReportCard, "entity_type" | "mogzy_entity_ref" | "mogzy_image_path">,
  manifest: ChampionManifest | null | undefined,
  folders: ManifestFolderIndex,
): string | null {
  const ref = card.mogzy_entity_ref?.trim();
  if (card.entity_type === "champion" && ref && manifest?.champions?.[ref]) return ref;
  const folder = CHAMPION_FOLDER.exec(card.mogzy_image_path ?? "")?.[1];
  if (folder) return folders.get(folder.toLowerCase()) ?? null;
  return null;
}

export function resolveDeckArt(
  card: PatchReportCard,
  manifest: ChampionManifest | null | undefined,
  folders: ManifestFolderIndex,
): DeckArt {
  const champion = championKeyFor(card, manifest, folders);
  const reportIcon = resolvePatchReportAsset(card.mogzy_image_path) ?? card.official_image_url ?? null;
  if (champion) {
    return {
      splash: getChampionSplash(manifest, champion),
      loading: getChampionLoading(manifest, champion),
      icon: getChampionIcon(manifest, champion) ?? reportIcon,
      champion,
    };
  }
  return { splash: null, loading: null, icon: reportIcon, champion: null };
}
