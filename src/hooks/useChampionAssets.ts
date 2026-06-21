import { useQuery } from "@tanstack/react-query";

const API_BASE_URL = (
  (import.meta.env.VITE_COMBAT_API_URL as string | undefined) ||
  "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

export type ChampionAsset = {
  icon: string;
  splash: string;
  loading: string;
  cutout: string;
  /**
   * Optional per-skin overrides keyed by a stable skin key (e.g. "0_default",
   * "1_blood_moon"). Backend may or may not include this; when absent the
   * default splash/loading/icon are used.
   */
  skins?: Record<string, { splash?: string; loading?: string; icon?: string; label?: string }>;
};

export type ChampionManifest = {
  ok?: boolean;
  count?: number;
  champions: Record<string, ChampionAsset>;
};

/**
 * Fetch the backend-managed champion asset manifest from the Combat/Railway API
 * at GET {VITE_COMBAT_API_URL}/api/assets/champions. The manifest paths are
 * relative (e.g. "assets/champions/Akali/cutouts/Akali_Cutout.png"); resolve
 * with `resolveAssetUrl` before using in <img src>.
 */
export function useChampionAssets() {
  return useQuery<ChampionManifest | null>({
    queryKey: ["champion-assets"],
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/assets/champions`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as ChampionManifest;
        return data ?? null;
      } catch {
        return null;
      }
    },
  });
}

/** Resolve a possibly-relative manifest path against the Combat API base. */
export function resolveAssetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

/** Look up a champion's transparent cutout PNG URL from the manifest. */
export function getChampionCutout(
  manifest: ChampionManifest | null | undefined,
  championName?: string,
): string | null {
  if (!manifest || !championName) return null;
  return resolveAssetUrl(manifest.champions?.[championName]?.cutout);
}

/**
 * Look up a champion's rectangular splash art URL from the manifest, falling
 * back to the loading screen art when splash is unavailable.
 */
export function getChampionSplash(
  manifest: ChampionManifest | null | undefined,
  championName?: string,
): string | null {
  if (!manifest || !championName) return null;
  const c = manifest.champions?.[championName];
  return resolveAssetUrl(c?.splash || c?.loading);
}

/** Look up a champion's loading screen art URL (no splash fallback). */
export function getChampionLoading(
  manifest: ChampionManifest | null | undefined,
  championName?: string,
  skinKey?: string,
): string | null {
  if (!manifest || !championName) return null;
  const c = manifest.champions?.[championName];
  if (!c) return null;
  if (skinKey && c.skins?.[skinKey]?.loading) {
    return resolveAssetUrl(c.skins[skinKey].loading);
  }
  return resolveAssetUrl(c.loading);
}

/** Look up a champion's square icon URL from the manifest. */
export function getChampionIcon(
  manifest: ChampionManifest | null | undefined,
  championName?: string,
  skinKey?: string,
): string | null {
  if (!manifest || !championName) return null;
  const c = manifest.champions?.[championName];
  if (!c) return null;
  if (skinKey && c.skins?.[skinKey]?.icon) {
    return resolveAssetUrl(c.skins[skinKey].icon);
  }
  return resolveAssetUrl(c.icon);
}

/**
 * Return an ordered list of skin keys for a champion, including a synthetic
 * "default" entry first. Returns an empty array when the champion is unknown.
 */
export function getChampionSkins(
  manifest: ChampionManifest | null | undefined,
  championName?: string,
): { key: string; label: string }[] {
  if (!manifest || !championName) return [];
  const c = manifest.champions?.[championName];
  if (!c) return [];
  const out: { key: string; label: string }[] = [{ key: "default", label: "Default" }];
  const extra = c.skins ? Object.entries(c.skins) : [];
  for (const [key, val] of extra) {
    if (key === "default") continue;
    out.push({ key, label: val?.label || prettifySkinKey(key) });
  }
  return out;
}

function prettifySkinKey(key: string): string {
  return key
    .replace(/^\d+[_-]?/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || key;
}