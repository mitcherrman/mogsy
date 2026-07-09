import { useMemo, useState } from "react";
import { getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import type { CombatCooldownSubject, ScenarioSectionData } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import {
  ConditionChip,
  ScenarioBadge,
  ScenarioDivider,
  ScenarioSection,
  ScenarioSubject,
  ScenarioTitle,
} from "./primitives";

/**
 * Combat Calculation card — the reference Scenario Card implementation.
 * Pure composition of the shared primitives:
 *
 *   ScenarioBadge      COMBAT CALCULATION (top-left, over clean art)
 *   ScenarioTitle      WHO — champion name
 *   ScenarioSubject    WHAT — ability icon + slot badge + name
 *   ConditionChip[]    UNDER WHAT CONDITIONS — level, rank
 *   ScenarioDivider    gold hairline with shimmer
 *   ScenarioSection[]  USING WHAT BUILD — data-driven groups (items today;
 *                      runes/dragons/buffs/patch later, same shape)
 *
 * Future scenario types compose the same primitives with different data —
 * no changes to ScenarioCard or BroadcastRenderer needed.
 */
export function CombatCalculationScenarioCard({ subject }: { subject: CombatCooldownSubject }) {
  const { data: championManifest } = useChampionAssets();
  const [splashFailed, setSplashFailed] = useState(false);

  // Prefer the metadata-provided splash; fall back to the manifest.
  const splashUrl = useMemo(() => {
    if (!splashFailed && subject.championSplash) return subject.championSplash;
    return getChampionSplash(championManifest, subject.champion);
  }, [splashFailed, subject.championSplash, subject.champion, championManifest]);

  const sections = useMemo<ScenarioSectionData[]>(() => {
    const itemEntries = subject.itemIcons.map((item) => ({
      icon: item.icon,
      title: item.name,
      subtitle:
        item.effect ??
        (subject.itemIcons.length === 1 && subject.totalAbilityHaste != null
          ? `+${subject.totalAbilityHaste} Ability Haste`
          : undefined),
    }));
    return [{ title: "Loadout · Items", entries: itemEntries }];
  }, [subject.itemIcons, subject.totalAbilityHaste]);

  return (
    <ScenarioCardFrame
      backgroundUrl={splashUrl}
      backgroundAlt={subject.champion}
      onBackgroundError={() => setSplashFailed(true)}
      // Artwork breathes: scrim only where the information stack begins.
      gradientClass="bg-[linear-gradient(to_top,rgba(3,2,2,0.95)_0%,rgba(3,2,2,0.82)_30%,rgba(3,2,2,0.4)_48%,transparent_64%)]"
    >
      <ScenarioBadge>Combat Calculation</ScenarioBadge>

      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[5%]">
        <ScenarioTitle>{subject.champion}</ScenarioTitle>

        {subject.abilityName && (
          <ScenarioSubject
            iconUrl={subject.abilityIcon}
            slotBadge={subject.abilitySlot}
            title={subject.abilityName}
            subtitle={subject.abilitySlot ? `Ability · Slot ${subject.abilitySlot}` : "Ability"}
          />
        )}

        {(subject.level != null || subject.abilityRank != null) && (
          <div className="mt-[3%] flex flex-wrap gap-[0.8cqmin]">
            {subject.level != null && <ConditionChip label="Level" value={subject.level} />}
            {subject.abilityRank != null && <ConditionChip label="Rank" value={subject.abilityRank} />}
          </div>
        )}

        <ScenarioDivider />

        {sections.map((section) => (
          <ScenarioSection key={section.title} section={section} />
        ))}
      </div>
    </ScenarioCardFrame>
  );
}
