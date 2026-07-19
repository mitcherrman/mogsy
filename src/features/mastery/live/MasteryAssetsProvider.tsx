/**
 * Live champion-art provider (J1).
 *
 * Loads the existing backend champion manifest (same endpoint as
 * `useChampionAssets`) once, module-cached, and supplies champion icon URLs to
 * the pure player components through `MasteryAssetsContext`. Lives in the live
 * package because it makes a network/env call — the player package stays pure.
 * Icon-path resolution reuses `getChampionIcon`/`resolveAssetUrl`; no Data Dragon
 * URL logic is duplicated here.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { getChampionIcon, type ChampionManifest } from "@/hooks/useChampionAssets";
import { MasteryAssetsContext, type MasteryAssets } from "../player/MasteryAssets";
import { championName } from "../player/playerFormat";

const API_BASE = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

// Load once per app session; shared across every provider mount.
let manifestPromise: Promise<ChampionManifest | null> | null = null;
function loadManifest(): Promise<ChampionManifest | null> {
  // Never reach out to the network under unit tests — components fall back.
  if (import.meta.env?.MODE === "test") return Promise.resolve(null);
  if (!manifestPromise) {
    manifestPromise = fetch(`${API_BASE}/api/assets/champions`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<ChampionManifest>) : null))
      .catch(() => null);
  }
  return manifestPromise;
}

export function MasteryAssetsProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<ChampionManifest | null>(null);
  useEffect(() => {
    let alive = true;
    loadManifest().then((m) => { if (alive) setManifest(m); });
    return () => { alive = false; };
  }, []);
  const value = useMemo<MasteryAssets>(
    () => ({
      championIconUrl: (championId, displayName) =>
        getChampionIcon(manifest, displayName ?? championName(championId)) ??
        getChampionIcon(manifest, championName(championId)),
    }),
    [manifest],
  );
  return <MasteryAssetsContext.Provider value={value}>{children}</MasteryAssetsContext.Provider>;
}
