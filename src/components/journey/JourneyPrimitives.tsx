/**
 * JOURNEY-UI1 — the Journey board's building blocks, in the Ranked scenario
 * card's visual language (`quiz-broadcast/scenario-cards/primitives.tsx`):
 * gold hairlines (#d4b35a), black glass tiles, the gold-ring portrait of
 * `ScenarioSubject`, `EntityIconSlot`'s never-collapsing icon box with a
 * monogram fallback and its `purchased` rim (#8fd0a0), and `ConditionChip`'s
 * uppercase micro-type.
 *
 * SIZES ARE FIXED PER DENSITY, NOT CONTENT-SIZED. Every box reads a CSS custom
 * property (`--jb-*`) that the board sets from the band's container query, so
 * a rank-up, an empty slot filling or a delta chip replacing a plain chip
 * changes what is INSIDE a box and never the box — the question below cannot
 * move when the state changes.
 *
 * Every value drawn is the server's. These components format; they never
 * derive, add or convert.
 */
import { useState } from "react";
import { Lock } from "lucide-react";
import type {
  AbilitySlot, JourneyAbility, JourneyItem, JourneySide, JourneyStat,
} from "@/lib/journey/contract";
import { formatStatValue, JOURNEY_STAT_META } from "@/lib/journey/stats";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";

const GOLD_RIM = "border-[#d4b35a]/55";
const COOL_RIM = "border-[#7fb2d4]/65";

/** The rim a side wears everywhere: gold for the subject, cool for the opponent. */
export const sideRim = (side: JourneySide["side"]) => (side === "subject" ? GOLD_RIM : COOL_RIM);

function Monogram({ text }: { text: string }) {
  return (
    <span aria-hidden className="text-[calc(var(--jb-mono,0.75rem))] font-black uppercase leading-none text-[#e8c97a]/85">
      {text.slice(0, 1)}
    </span>
  );
}

/** A remote image that falls back to a monogram in the SAME box when it fails. */
function Art({ url, alt, mono }: { url: string | null; alt: string; mono: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <Monogram text={mono} />;
  return (
    <img src={url} alt={alt} draggable={false} loading="lazy" onError={() => setBroken(true)}
      className="h-full w-full object-cover" />
  );
}

/** Champion portrait: the `ScenarioSubject` gold ring, round like the entity strip's champions. */
export function JourneyPortrait({ side, className = "" }: { side: JourneySide; className?: string }) {
  const assets = useMasteryAssets();
  const url = resolveAssetUrl(side.icon) ?? assets.championIconUrl(side.championId, side.championName);
  return (
    <span data-testid={`journey-portrait-${side.side}`}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-black/70 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.85)] ring-1 ring-[#f3dca0]/30 ${sideRim(side.side)} ${className}`}
      style={{ width: "var(--jb-portrait)", height: "var(--jb-portrait)" }}>
      <Art url={url} alt={side.championName} mono={side.championName} />
    </span>
  );
}

/** "LV 7" — with the server's previous level kept beside it for the whole child. */
export function LevelBadge({ level, from = null, focused = false, testId }: {
  level: number; from?: number | null; focused?: boolean; testId?: string;
}) {
  return (
    <span data-testid={testId} data-changed={from !== null ? "true" : undefined}
      data-focus={focused ? "true" : undefined}
      className={`journey-chip inline-flex shrink-0 items-baseline gap-1 rounded-md border px-1.5 font-semibold uppercase tracking-[0.16em] ${
        from !== null ? "journey-chip--delta" : "border-[#d4b35a]/35 bg-black/55"} ${focused ? "journey-focus" : ""}`}>
      <span className="text-white/70">Lv</span>
      {from !== null && <span className="text-white/55 line-through decoration-white/40">{from}</span>}
      <span className="font-black text-white">{level}</span>
    </span>
  );
}

/**
 * One ability: its icon (or slot letter) with the slot badge, and a pip per
 * rank, filled to the current rank. Rank 0 is LOCKED (an R before 6), drawn
 * dim with a lock, never as missing.
 */
export function AbilityRankPips({ ability, champion, side, rankFrom = null, unlocked = false, focused = false }: {
  ability: JourneyAbility;
  champion: string;
  side: JourneySide["side"];
  rankFrom?: number | null;
  unlocked?: boolean;
  focused?: boolean;
}) {
  const locked = ability.rank === 0;
  const url = resolveAssetUrl(ability.icon) ?? getAbilityIconUrl(champion, ability.slot as AbilitySlot);
  const changed = rankFrom !== null || unlocked;
  const label = `${champion} ${ability.slot}${ability.name ? ` (${ability.name})` : ""}: ${
    locked ? "not learned" : `rank ${ability.rank} of ${ability.maxRank}`}${
    rankFrom !== null ? `, up from ${rankFrom}` : ""}${unlocked ? ", just unlocked" : ""}`;
  return (
    <span role="img" aria-label={label} title={label}
      data-testid={`journey-ability-${side}-${ability.slot}`}
      data-rank={ability.rank} data-max-rank={ability.maxRank}
      data-locked={locked ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      data-focus={focused ? "true" : undefined}
      className="journey-ability flex shrink-0 flex-col items-center gap-[3px]">
      <span className={`relative flex items-center justify-center overflow-hidden rounded-md border bg-black/70 ${
        focused ? "journey-focus" : ""} ${changed ? "journey-changed" : ""} ${sideRim(side)}`}
        style={{ width: "var(--jb-ability)", height: "var(--jb-ability)" }}>
        <span className={locked ? "h-full w-full opacity-30 grayscale" : "h-full w-full"}>
          <Art url={url} alt="" mono={ability.slot} />
        </span>
        <span aria-hidden className="absolute bottom-0 right-0 rounded-tl-[4px] bg-[#d4b35a] px-[3px] text-[0.5625rem] font-black leading-[0.8rem] text-[#2a1f08]">
          {ability.slot}
        </span>
        {locked && (
          <Lock aria-hidden className="absolute h-[45%] w-[45%] text-white/70" strokeWidth={2.5} />
        )}
      </span>
      <span aria-hidden className="flex gap-[2px]" data-testid={`journey-pips-${side}-${ability.slot}`}>
        {Array.from({ length: ability.maxRank }, (_, i) => (
          <span key={i} data-filled={i < ability.rank ? "true" : "false"}
            data-new={rankFrom !== null && i >= rankFrom && i < ability.rank ? "true" : undefined}
            className={`journey-pip block rounded-full ${i < ability.rank
              ? (rankFrom !== null && i >= rankFrom ? "bg-[#8fd0a0]" : "bg-[#e8c97a]")
              : "bg-white/15"}`} />
        ))}
      </span>
    </span>
  );
}

/** Six fixed slots. An empty slot is a dashed box of the same size. */
export function InventorySlots({ side, items, newSlots, focusSlots }: {
  side: JourneySide;
  items: JourneyItem[];
  newSlots: ReadonlySet<number>;
  focusSlots: ReadonlySet<number>;
}) {
  const assets = useMasteryAssets();
  return (
    <span role="list" aria-label={`${side.championName} items`}
      data-testid={`journey-items-${side.side}`} className="flex shrink-0 gap-[3px]">
      {Array.from({ length: 6 }, (_, slot) => {
        const it = items.find((x) => x.slot === slot) ?? null;
        const isNew = it !== null && newSlots.has(slot);
        const focused = it !== null && focusSlots.has(slot);
        return (
          <span key={slot} role="listitem"
            aria-label={it ? `${it.name}${isNew ? ", just bought" : ""}` : "Empty slot"}
            title={it?.name ?? undefined}
            data-testid={`journey-item-${side.side}-${slot}`}
            data-item-id={it?.itemId}
            data-new={isNew ? "true" : undefined}
            data-focus={focused ? "true" : undefined}
            className={`relative flex items-center justify-center overflow-hidden rounded-[5px] border ${
              it ? `bg-black/70 ${sideRim(side.side)}` : "border-dashed border-white/15 bg-black/25"} ${
              isNew ? "ring-1 ring-[#8fd0a0]/80 journey-changed" : ""} ${focused ? "journey-focus" : ""}`}
            style={{ width: "var(--jb-slot)", height: "var(--jb-slot)" }}>
            {it && <Art url={resolveAssetUrl(it.icon) ?? assets.itemIconUrl(it.itemId)} alt="" mono={it.name} />}
          </span>
        );
      })}
    </span>
  );
}

/**
 * One premise stat. Three faces in one fixed-height chip:
 *   plain    "Armor 51.59"
 *   delta    "Armor 51.59 → 91.59"   (the server's from/to, kept all child long)
 *   withheld "Armor ?"                (the value is NOT in the payload)
 */
export function StatChip({ side, stat, delta = null, focused = false }: {
  side: JourneySide["side"];
  stat: JourneyStat;
  delta?: { from: number; to: number } | null;
  focused?: boolean;
}) {
  const meta = JOURNEY_STAT_META[stat.key];
  const value = stat.withheld ? null : stat.value;
  const face = value === null ? "withheld" : delta ? "delta" : "plain";
  return (
    <span data-testid={`journey-stat-${side}-${stat.key}`} data-face={face}
      data-focus={focused ? "true" : undefined}
      aria-label={value === null ? `${meta.long}: asked in this question`
        : delta ? `${meta.long}: ${formatStatValue(delta.from, stat.key)} to ${formatStatValue(delta.to, stat.key)}`
          : `${meta.long}: ${formatStatValue(value, stat.key)}`}
      className={`journey-chip inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap rounded-md border px-1.5 font-semibold uppercase tracking-[0.12em] ${
        face === "delta" ? "journey-chip--delta" : face === "withheld"
          ? "border-dashed border-[#e8c97a]/60 bg-[#e8c97a]/10" : "border-[#d4b35a]/30 bg-black/50"} ${
        focused ? "journey-focus" : ""}`}>
      <span className="text-white/70">{meta.short}</span>
      {value === null ? (
        <span className="font-black text-[#f3dca0]">?</span>
      ) : delta ? (
        <>
          <span className="text-white/55">{formatStatValue(delta.from, stat.key)}</span>
          <span aria-hidden className="text-[#8fd0a0]">→</span>
          <span className="font-black text-white">{formatStatValue(delta.to, stat.key)}</span>
        </>
      ) : (
        <span className="font-black text-white">{formatStatValue(value, stat.key)}</span>
      )}
    </span>
  );
}
