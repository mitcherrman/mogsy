/**
 * PT4.4 — the champion asset manifest for the backdrop art, read through the
 * app's query cache when there is one (the warm fetch already put it there) and
 * through a plain fetch when there is not (a unit test, a bare mount). Failure
 * is silence: the manifest is decoration, never a reason to block a round.
 */
import { useContext, useEffect, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { championAssetsQuery, type ChampionManifest } from "@/hooks/useChampionAssets";

export function useSplashManifest(): ChampionManifest | null {
  const client = useContext(QueryClientContext);
  const [manifest, setManifest] = useState<ChampionManifest | null>(
    () => client?.getQueryData<ChampionManifest | null>(championAssetsQuery.queryKey) ?? null,
  );
  useEffect(() => {
    if (manifest) return;
    let live = true;
    const load = client ? client.fetchQuery(championAssetsQuery) : championAssetsQuery.queryFn();
    void Promise.resolve(load).then((m) => { if (live && m) setManifest(m); }).catch(() => {});
    return () => { live = false; };
  }, [client, manifest]);
  return manifest;
}
