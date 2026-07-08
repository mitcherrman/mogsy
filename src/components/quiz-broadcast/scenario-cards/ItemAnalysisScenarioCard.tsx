import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ItemAnalysisSubject, ScenarioSectionData } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import { ScenarioBadge, ScenarioDivider, ScenarioSection, ScenarioTitle } from "./primitives";

/**
 * Item Analysis card — "artifact dossier" treatment.
 *
 * Zones (top to bottom):
 *   ITEM ANALYSIS badge
 *   hero artifact: oversized ghost item art + radial shrine rings + crisp
 *   floating icon on a pedestal glow
 *   recipe strip (build-path questions): known components + "?" -> final item;
 *   the "?" fills with the missing component ONLY at reveal (it's the answer)
 *   item name + subtitle, then reveal-gated data sections
 *
 * Spoiler rules: known_components appear verbatim in the question text, so the
 * strip is safe pre-reveal. missingComponent and the info sections are gated
 * on `revealed`.
 */
export function ItemAnalysisScenarioCard({
  item,
  revealed,
}: {
  item: ItemAnalysisSubject;
  revealed: boolean;
}) {
  const hasRecipe = item.knownComponents.length > 0;

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
      {/* Ghost art — oversized, blurred, faded copy of the item art filling
          the empty space. Slow drift keeps it alive without stealing focus. */}
      {item.icon && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <motion.img
            src={item.icon}
            alt=""
            className="absolute left-1/2 top-[26%] h-[52vmin] w-[52vmin] max-w-none -translate-x-[58%] -translate-y-1/2 rounded-[4vmin] object-cover opacity-[0.13] blur-md saturate-[1.15]"
            animate={{ x: ["-58%", "-52%", "-58%"], scale: [1, 1.06, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      )}

      <ScenarioBadge>Item Analysis</ScenarioBadge>

      {/* Hero artifact zone: shrine rings + glow + crisp floating icon */}
      <div className="absolute inset-x-0 top-[8%] flex h-[42%] items-center justify-center">
        <div className="relative flex items-center justify-center">
          {/* radial shrine rings */}
          <motion.div
            aria-hidden
            className="absolute h-[26vmin] w-[26vmin] rounded-full border border-[#d4b35a]/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            style={{ borderStyle: "dashed" }}
          />
          <motion.div
            aria-hidden
            className="absolute h-[20vmin] w-[20vmin] rounded-full border border-[#7dd3fc]/15"
            animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* soft hextech glow */}
          <motion.div
            aria-hidden
            className="absolute h-[15vmin] w-[15vmin] rounded-full bg-[#d4b35a]/25 blur-2xl"
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* particle specks */}
          {[
            { left: "-9vmin", top: "-5vmin", delay: 0 },
            { left: "9.5vmin", top: "-2vmin", delay: 1.6 },
            { left: "7vmin", top: "7vmin", delay: 3.1 },
          ].map((p, i) => (
            <motion.div
              key={i}
              aria-hidden
              className="absolute h-[0.45vmin] w-[0.45vmin] rounded-full bg-[#f3dca0]"
              style={{ left: p.left, top: p.top }}
              animate={{ y: [0, -8, 0], opacity: [0, 0.8, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
            />
          ))}

          {/* crisp hero icon with float */}
          <motion.div
            className="relative"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <HeroIcon iconUrl={item.icon} alt={item.name} />
          </motion.div>

          {/* pedestal shadow */}
          <motion.div
            aria-hidden
            className="absolute top-[9.5vmin] h-[1.6vmin] w-[11vmin] rounded-[50%] bg-black/55 blur-md"
            animate={{ scaleX: [1, 0.9, 1], opacity: [0.55, 0.4, 0.55] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>

      {/* Recipe / build-path strip */}
      {hasRecipe && (
        <div className="absolute inset-x-0 top-[52%] flex justify-center px-[6%]">
          <RecipeStrip item={item} revealed={revealed} />
        </div>
      )}

      {/* Bottom label + reveal-gated sections */}
      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[5%]">
        <ScenarioTitle>{item.name}</ScenarioTitle>
        <div className="mt-[0.4vmin] text-[0.95vmin] font-semibold uppercase tracking-[0.24em] text-white/60">
          {hasRecipe ? "Item · Build Path" : "Item"}
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

function HeroIcon({ iconUrl, alt }: { iconUrl?: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!iconUrl || errored) {
    return (
      <div className="flex h-[14vmin] w-[14vmin] items-center justify-center rounded-2xl border border-[#d4b35a]/40 bg-black/40 text-[3vmin] text-white/30">
        ?
      </div>
    );
  }
  return (
    <img
      src={iconUrl}
      alt={alt}
      onError={() => setErrored(true)}
      className="h-[14vmin] w-[14vmin] rounded-2xl border-2 border-[#d4b35a]/60 object-cover shadow-[0_18px_44px_-8px_rgba(0,0,0,0.9)] ring-1 ring-[#f3dca0]/30"
    />
  );
}

/**
 * known component chips + "?" slot -> final item. The "?" fills with the
 * missing component only when revealed (it is the correct answer).
 */
function RecipeStrip({ item, revealed }: { item: ItemAnalysisSubject; revealed: boolean }) {
  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-x-[0.9vmin] gap-y-[0.7vmin] rounded-xl border border-[#d4b35a]/25 bg-black/45 px-[1.6vmin] py-[1vmin] backdrop-blur-sm">
      {item.knownComponents.map((name) => (
        <span key={name} className="flex items-center gap-[0.9vmin]">
          <ComponentChip label={name} known />
          <Plus />
        </span>
      ))}

      {/* mystery slot / revealed answer */}
      {revealed && item.missingComponent ? (
        <motion.span
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <ComponentChip
            label={item.missingComponent.name}
            iconUrl={item.missingComponent.icon}
            answer
          />
        </motion.span>
      ) : (
        <motion.span
          className="flex h-[3.4vmin] min-w-[3.4vmin] items-center justify-center rounded-lg border border-[#f3dca0]/60 bg-black/60 px-[0.9vmin] text-[1.6vmin] font-black text-[#f3dca0]"
          animate={{ opacity: [0.55, 1, 0.55], boxShadow: [
            "0 0 4px rgba(243,220,160,0.15)",
            "0 0 12px rgba(243,220,160,0.4)",
            "0 0 4px rgba(243,220,160,0.15)",
          ] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        >
          ?
        </motion.span>
      )}

      <span className="mx-[0.4vmin] text-[1.5vmin] font-bold text-[#e8c97a]/80">→</span>

      {/* final item mini icon */}
      <MiniIcon iconUrl={item.icon} alt={item.name} />
    </div>
  );
}

function ComponentChip({
  label,
  iconUrl,
  known,
  answer,
}: {
  label: string;
  iconUrl?: string | null;
  known?: boolean;
  answer?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  return (
    <span
      className={`flex items-center gap-[0.6vmin] rounded-lg border px-[0.9vmin] py-[0.45vmin] text-[1vmin] font-bold uppercase tracking-[0.08em] ${
        answer
          ? "border-[#f3dca0]/80 bg-[#f3dca0]/15 text-[#f3dca0] shadow-[0_0_14px_rgba(243,220,160,0.3)]"
          : known
            ? "border-[#d4b35a]/50 bg-[#d4b35a]/10 text-white"
            : "border-white/20 bg-white/5 text-white/70"
      }`}
    >
      {iconUrl && !errored && (
        <img
          src={iconUrl}
          alt=""
          onError={() => setErrored(true)}
          className="h-[2.2vmin] w-[2.2vmin] rounded border border-[#d4b35a]/40 object-cover"
        />
      )}
      <span className="max-w-[11vmin] truncate">{label}</span>
    </span>
  );
}

function MiniIcon({ iconUrl, alt }: { iconUrl?: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!iconUrl || errored) {
    return (
      <span className="max-w-[10vmin] truncate text-[1vmin] font-bold uppercase text-white/80">{alt}</span>
    );
  }
  return (
    <img
      src={iconUrl}
      alt={alt}
      onError={() => setErrored(true)}
      className="h-[3.2vmin] w-[3.2vmin] rounded-lg border border-[#d4b35a]/50 object-cover shadow-[0_6px_16px_-4px_rgba(0,0,0,0.8)]"
    />
  );
}

function Plus() {
  return <span className="text-[1.4vmin] font-bold text-[#e8c97a]/70">+</span>;
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
