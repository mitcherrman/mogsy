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
): string | null {
  if (!manifest || !championName) return null;
  return resolveAssetUrl(manifest.champions?.[championName]?.loading);
}