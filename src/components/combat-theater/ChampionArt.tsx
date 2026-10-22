/**
 * Champion artwork resolved from Mogzy's existing asset manifest only
 * (`useChampionAssets` → `/api/assets/champions`). No new asset pipeline:
 * when nothing resolves (manifest unreachable, unknown champion, broken
 * image) the component renders a neutral glyph rather than inventing art.
 *
 * Resolution order, per variant:
 *   portrait  loading art → splash → icon
 *   icon      icon (manifest) → square icon (ability-icon store)
 */
import { useEffect, useState } from "react";
import { Swords } from "lucide-react";

import type { ChampionManifest } from "@/hooks/useChampionAssets";

import { resolveIconUrl, resolvePortraitUrl } from "./visuals";

export function ChampionArt({
  manifest,
  champion,
  variant,
  className,
}: {
  manifest: ChampionManifest | null;
  champion: string;
  variant: "portrait" | "icon";
  className?: string;
}) {
  const url = variant === "portrait" ? resolvePortraitUrl(manifest, champion) : resolveIconUrl(manifest, champion);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);

  if (!url || broken) {
    return (
      <div className={`ct-portrait__glyph ${className ?? ""}`} data-testid="champion-art-fallback" aria-label={champion}>
        <Swords className="h-8 w-8" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={champion}
      className={className}
      draggable={false}
      decoding="async"
      onError={() => setBroken(true)}
      data-testid={`champion-art-${variant}`}
    />
  );
}
