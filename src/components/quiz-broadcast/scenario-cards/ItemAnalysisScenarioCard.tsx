import { useMemo } from "react";
import type { ItemAnalysisSubject, ScenarioSectionData } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import { ScenarioBadge, ScenarioDivider, ScenarioHeroIcon, ScenarioSection, ScenarioTitle } from "./primitives";

/**
 * Item Analysis card — second Scenario Card implementation, proving the
 * primitives generalize beyond combat calculations.
 *
 * Items have no splash art, so the hero is the item icon (ScenarioHeroIcon)
 * over the frame's dark fallback background.
 *
 * IMPORTANT: item metadata usually IS the answer (cost questions store cost,
 * stat questions store the stat). The card itself is legitimate context, but
 * the data sections are gated on `revealed` so they only appear with the
 * answer — during the question phase the card shows badge + art + name only.
 */
export function ItemAnalysisScenarioCard({
  item,
  revealed,
}: {
  item: ItemAnalysisSubject;
  revealed: boolean;
}) {
  const sections = useMemo<ScenarioSectionData[]>(() => {
    if (!revealed) return [];
    const out: ScenarioSectionData[] = [];

    if (item.cost != null) {
      out.push({
        title: "Item Information",
        entries: [{ title: `${item.cost.toLocaleString()} Gold` }],
      });
    }

    const statEntries = item.statValue
      ? [{ title: `${item.statValue.value} ${item.statValue.label}` }]
      : item.statCodes.map((code) => ({ title: prettifyStatCode(code) }));
    if (statEntries.length) {
      out.push({ title: "Stats", entries: statEntries });
    }

    if (item.buildsInto) {
      out.push({ title: "Builds Into", entries: [{ title: item.buildsInto }] });
    }

    return out;
  }, [item, revealed]);

  return (
    <ScenarioCardFrame
      backgroundUrl={null}
      backgroundAlt={item.name}
      gradientClass="bg-[linear-gradient(to_top,rgba(3,2,2,0.92)_0%,rgba(3,2,2,0.7)_26%,rgba(3,2,2,0.25)_44%,transparent_60%)]"
    >
      <ScenarioBadge>Item Analysis</ScenarioBadge>

      <ScenarioHeroIcon iconUrl={item.icon} alt={item.name} />

      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[5%]">
        <ScenarioTitle>{item.name}</ScenarioTitle>
        <div className="mt-[0.4vmin] text-[0.95vmin] font-semibold uppercase tracking-[0.24em] text-white/60">
          Item
        </div>

        {sections.length > 0 && (
          <>
            <ScenarioDivider />
            {sections.map((section) => (
              <ScenarioSection key={section.title} section={section} />
            ))}
          </>
        )}
      </div>
    </ScenarioCardFrame>
  );
}

const STAT_CODE_LABELS: Record<string, string> = {
  AD: "Attack Damage",
  AP: "Ability Power",
  HP: "Health",
  MANA: "Mana",
  ARMOR: "Armor",
  MR: "Magic Resist",
  ABILITY_HASTE: "Ability Haste",
  ATTACK_SPEED: "Attack Speed",
  CRIT: "Critical Strike",
  CRIT_CHANCE: "Critical Strike",
  LETHALITY: "Lethality",
  LIFESTEAL_PERCENT: "Lifesteal",
  OMNIVAMP: "Omnivamp",
  MOVE_SPEED: "Move Speed",
  MOVEMENT_SPEED: "Move Speed",
  HP5: "Health Regen",
  MP5: "Mana Regen",
  HEAL_SHIELD_POWER: "Heal & Shield Power",
  MAGIC_PEN: "Magic Penetration",
  ARMOR_PEN: "Armor Penetration",
  TENACITY: "Tenacity",
  GOLD_PER_10: "Gold Generation",
};

function prettifyStatCode(code: string): string {
  const known = STAT_CODE_LABELS[code.toUpperCase()];
  if (known) return known;
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
