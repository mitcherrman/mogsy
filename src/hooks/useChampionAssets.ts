import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ChampionAsset = {
  icon: string;
  splash: string;
  loading: string;
  cutout: string;
};

export type ChampionManifest = {
  version: string;
  champions: Record<string, ChampionAsset>;
};

/**
 * Fetch the backend-managed champion asset manifest.
 * URLs are owned by the edge function — never hardcode them in components.
 */
export function useChampionAssets() {
  return useQuery<ChampionManifest | null>({
    queryKey: ["champion-assets"],
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("assets-champions", {
        method: "GET",
      });
      if (error || !data) return null;
      return data as ChampionManifest;
    },
  });
}

/** Look up a champion's cutout URL from the manifest. */
export function getChampionCutout(
  manifest: ChampionManifest | null | undefined,
  championName?: string,
): string | null {
  if (!manifest || !championName) return null;
  return manifest.champions?.[championName]?.cutout ?? null;
}