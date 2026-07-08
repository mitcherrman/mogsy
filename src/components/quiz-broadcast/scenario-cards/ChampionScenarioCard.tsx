import { useMemo, useState } from "react";
import { getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import { ScenarioCardFrame } from "./ScenarioCardFrame";

/**
 * Cinematic champion splash card (formerly ChampionSplashCard in
 * BroadcastRenderer). Visuals unchanged: manifest splash art, light streak,
 * champion gradient, hidden label block.
 */
export function ChampionScenarioCard({ champion }: { champion: string }) {
  const { data: championManifest } = useChampionAssets();
  const [primaryFailed, setPrimaryFailed] = useState(false);

  const url = useMemo(() => {
    if (primaryFailed) return null;
    return getChampionSplash(championManifest, champion);
  }, [championManifest, champion, primaryFailed]);

  return (
    <ScenarioCardFrame
      backgroundUrl={url}
      backgroundAlt={champion}
      onBackgroundError={() => setPrimaryFailed(true)}
      gradientClass="bg-gradient-to-t from-black/80 via-black/10 to-black/40"
      lightStreak
    >
      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[6%] opacity-0">
        <div className="text-[1.05vmin] font-bold uppercase tracking-[0.35em] text-[#e8c97a]/90">Champion</div>
        <div className="mt-1 text-[2.6vmin] font-black uppercase tracking-wide text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)]">
          {champion}
        </div>
        <div className="mt-2 h-[2px] w-[40%] bg-gradient-to-r from-[#d4b35a] to-transparent" />
      </div>
    </ScenarioCardFrame>
  );
}
