import { useMemo, useState } from "react";
import { getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import type { CombatCooldownSubject } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";

/**
 * Calculation-context card for derived combat_simulation questions
 * (formerly CombatCooldownSubjectCard in BroadcastRenderer). Shows the
 * champion art plus the calculation inputs: ability, level/rank, item
 * haste sources. This card is question context, never a spoiler.
 */
export function CombatCalculationScenarioCard({ subject }: { subject: CombatCooldownSubject }) {
  const { data: championManifest } = useChampionAssets();
  const [splashFailed, setSplashFailed] = useState(false);

  // Prefer the metadata-provided splash; fall back to the manifest.
  const splashUrl = useMemo(() => {
    if (!splashFailed && subject.championSplash) return subject.championSplash;
    return getChampionSplash(championManifest, subject.champion);
  }, [splashFailed, subject.championSplash, subject.champion, championManifest]);

  const slotLine = [subject.abilitySlot, subject.abilityName].filter(Boolean).join(" · ");
  const stateLine = [
    subject.level != null ? `Level ${subject.level}` : null,
    subject.abilityRank != null ? `Rank ${subject.abilityRank}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScenarioCardFrame
      backgroundUrl={splashUrl}
      backgroundAlt={subject.champion}
      onBackgroundError={() => setSplashFailed(true)}
      gradientClass="bg-gradient-to-t from-black/90 via-black/25 to-black/45"
    >
      {/* Calculation context stack */}
      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[5%]">
        <div className="text-[1.05vmin] font-bold uppercase tracking-[0.35em] text-[#e8c97a]/90">
          Cooldown Calculation
        </div>
        <div className="mt-1 text-[2.5vmin] font-black uppercase tracking-wide text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)]">
          {subject.champion}
        </div>
        {slotLine && (
          <div className="mt-0.5 text-[1.5vmin] font-bold uppercase tracking-[0.14em] text-[#f3dca0]/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {slotLine}
          </div>
        )}
        {stateLine && (
          <div className="mt-0.5 text-[1.15vmin] font-semibold uppercase tracking-[0.28em] text-white/70">
            {stateLine}
          </div>
        )}

        {/* Icon strip: champion + ability + items */}
        <div className="mt-[4%] flex items-center gap-[3%]">
          {subject.championIcon && (
            <SubjectStripIcon url={subject.championIcon} alt={subject.champion} />
          )}
          {subject.abilityIcon && (
            <SubjectStripIcon url={subject.abilityIcon} alt={subject.abilityName ?? "Ability"} highlight />
          )}
          {subject.itemIcons.map(
            (it) => it.icon && <SubjectStripIcon key={it.name} url={it.icon} alt={it.name} label={it.name} />,
          )}
        </div>

        <div className="mt-[4%] h-[2px] w-[40%] bg-gradient-to-r from-[#d4b35a] to-transparent" />
      </div>
    </ScenarioCardFrame>
  );
}

function SubjectStripIcon({
  url,
  alt,
  label,
  highlight,
}: {
  url: string;
  alt: string;
  label?: string;
  highlight?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <img
        src={url}
        alt={alt}
        onError={() => setErrored(true)}
        className={`h-[5.2vmin] w-[5.2vmin] rounded-lg border object-cover shadow-[0_8px_22px_-6px_rgba(0,0,0,0.85)] ${
          highlight ? "border-[#f3dca0]/70 ring-1 ring-[#f3dca0]/40" : "border-[#d4b35a]/40"
        }`}
      />
      {label && (
        <div className="max-w-[7vmin] truncate text-[0.85vmin] font-bold uppercase tracking-[0.18em] text-[#e8c97a]/85">
          {label}
        </div>
      )}
    </div>
  );
}
