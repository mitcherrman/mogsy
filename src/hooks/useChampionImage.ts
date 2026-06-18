import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "champion-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

// In-memory cache so repeated cards for the same champion don't re-fetch.
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Resolve a champion portrait URL by champion name using the existing
 * Combat Lab champion-images storage system. Returns undefined while
 * loading and null if no image is configured.
 */
export function useChampionImage(championName?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!championName) return undefined;
    const cached = cache.get(championName);
    return cached ?? undefined;
  });

  useEffect(() => {
    if (!championName) return;
    let cancelled = false;

    const cached = cache.get(championName);
    if (cached !== undefined) {
      setUrl(cached ?? undefined);
      return;
    }

    const existing = inflight.get(championName);
    const promise =
      existing ??
      (async () => {
        try {
          const { data } = await supabase
            .from("champion_images")
            .select("storage_path")
            .eq("champion_id", championName)
            .maybeSingle();
          if (!data?.storage_path) return null;
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(data.storage_path, SIGNED_URL_TTL);
          return signed?.signedUrl ?? null;
        } catch {
          return null;
        }
      })();

    if (!existing) inflight.set(championName, promise);

    promise.then((resolved) => {
      cache.set(championName, resolved);
      inflight.delete(championName);
      if (!cancelled) setUrl(resolved ?? undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [championName]);

  return url;
}