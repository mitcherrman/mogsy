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
 *
 * JATTN1 — two board cues live here: RELEVANT NOW (`RelevantReticle`, ice
 * corner ticks outset from the object; the old gold `.journey-focus` glow is
 * gone from the board) and the CHANGED resting face (`.journey-changed`: one
 * thin green inner rim, the same on an ability tile and an item slot).
 */
import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type {
  AbilitySlot, JourneyAbility, JourneyItem, JourneySide, JourneyStat,
} from "@/lib/journey/contract";
import { exactValueNote, formatStatGain, formatStatValue, JOURNEY_STAT_META } from "@/lib/journey/stats";
import { RELEVANT_LABEL } from "@/lib/journey/attention";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";
import { JourneyItemReference } from "./JourneyReferencePopover";

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

/**
 * JATTN1 — the RELEVANT NOW cue: four outset corner ticks (ice, never gold),
 * drawn in once when the child opens (keyed on the step, so the next child
 * draws them again) and static after. Decorative: what it means is in its
 * object's accessible name (`RELEVANT_LABEL`). It lays out nothing.
 */
export function RelevantReticle({ step, testId }: { step: number; testId?: string }) {
  return <span key={step} aria-hidden data-testid={testId} data-step={step} className="journey-reticle" />;
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

/**
 * "LV 7" — with the server's previous level kept beside it for the whole child.
 * JATTN1: its host (`journey-level-host`, exactly the chip's size) carries the
 * RELEVANT reticle outside the chip's clipped box.
 */
export function LevelBadge({ level, from = null, relevant = false, step = 0, testId }: {
  level: number; from?: number | null; relevant?: boolean; step?: number; testId?: string;
}) {
  return (
    <span className="journey-level-host">
      <span data-testid={testId} data-changed={from !== null ? "true" : undefined}
        data-relevant={relevant ? "true" : undefined}
        className={`journey-chip journey-level inline-flex shrink-0 items-baseline gap-1 overflow-hidden rounded-md border px-1.5 font-semibold uppercase tracking-[0.16em] ${
          from !== null ? "journey-chip--delta" : "border-[#d4b35a]/35 bg-black/55"}`}>
        <span className="text-white/70">Lv</span>
        {from !== null && <span className="journey-level__from text-white/55 line-through decoration-white/40">{from}</span>}
        {/* MOTION-V1: the new number rolls in during the beat (CSS); it is the final value from the first frame. */}
        <span className="journey-level__to inline-block font-black text-white">{level}</span>
        {relevant && <span className="sr-only">, {RELEVANT_LABEL}</span>}
      </span>
      {relevant && <RelevantReticle step={step} testId={testId ? `${testId}-relevant` : undefined} />}
    </span>
  );
}

/**
 * One ability: its icon (or slot letter) with the slot badge, and a pip per
 * rank, filled to the current rank. Rank 0 is LOCKED (an R before 6), drawn
 * dim with a lock, never as missing.
 */
export function AbilityRankPips({ ability, champion, side, rankFrom = null, unlocked = false, relevant = false, step = 0 }: {
  ability: JourneyAbility;
  champion: string;
  side: JourneySide["side"];
  rankFrom?: number | null;
  unlocked?: boolean;
  /** JATTN1 — the current question is about this ability (the server's focus). */
  relevant?: boolean;
  /** The step on screen: the reticle draws in once per child. */
  step?: number;
}) {
  const locked = ability.rank === 0;
  const url = resolveAssetUrl(ability.icon) ?? getAbilityIconUrl(champion, ability.slot as AbilitySlot);
  const changed = rankFrom !== null || unlocked;
  const label = `${champion} ${ability.slot}${ability.name ? ` (${ability.name})` : ""}: ${
    locked ? "not learned" : ability.maxRank !== null
      ? `rank ${ability.rank} of ${ability.maxRank}` : `rank ${ability.rank}`}${
    rankFrom !== null ? `, up from ${rankFrom}` : ""}${unlocked ? ", just unlocked" : ""}${relevant ? `, ${RELEVANT_LABEL}` : ""}`;
  return (
    <span role="img" aria-label={label} title={label}
      data-testid={`journey-ability-${side}-${ability.slot}`}
      data-rank={ability.rank} data-max-rank={ability.maxRank}
      data-locked={locked ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      data-relevant={relevant ? "true" : undefined}
      className="journey-ability relative flex shrink-0 flex-col items-center gap-[3px]">
      <span className={`relative flex items-center justify-center overflow-hidden rounded-md border bg-black/70 ${
        changed ? "journey-changed" : ""} ${sideRim(side)}`}
        style={{ width: "var(--jb-ability)", height: "var(--jb-ability)" }}>
        <span className={locked ? "h-full w-full opacity-30 grayscale" : `h-full w-full ${unlocked ? "journey-unlock-art" : ""}`}>
          <Art url={url} alt="" mono={ability.slot} />
        </span>
        <span aria-hidden className="absolute bottom-0 right-0 rounded-tl-[4px] bg-[#d4b35a] px-[3px] text-[0.5625rem] font-black leading-[0.8rem] text-[#2a1f08]">
          {ability.slot}
        </span>
        {locked && (
          <Lock aria-hidden className="absolute h-[45%] w-[45%] text-white/70" strokeWidth={2.5} />
        )}
        {unlocked && !locked && (
          // MOTION-V1: the lock it WAS, shown only while the beat runs (CSS),
          // lifting off as the icon lights up. Hidden otherwise.
          <Lock aria-hidden data-testid={`journey-unlock-${side}-${ability.slot}`}
            className="journey-unlock-lock absolute h-[45%] w-[45%] text-white/80" strokeWidth={2.5} />
        )}
        {ability.maxRank === null && !locked && (
          // The contract states the rank but not the maximum (J2): the rank is
          // printed ON the tile, top-left, rather than as pips of a length this
          // client would have to guess — and on the tile it costs no height.
          <span aria-hidden data-testid={`journey-pips-${side}-${ability.slot}`} data-rank-only="true"
            data-new={rankFrom !== null || unlocked ? "true" : undefined}
            className={`journey-rank-digit absolute left-0 top-0 rounded-br-[4px] px-[3px] font-black leading-[0.8rem] ${
              rankFrom !== null || unlocked ? "bg-[#8fd0a0] text-[#0d2418]" : "bg-black/80 text-[#f3dca0]"}`}>
            {ability.rank}
          </span>
        )}
      </span>
      {relevant && <RelevantReticle step={step} testId={`journey-relevant-${side}-${ability.slot}`} />}
      {ability.maxRank === null ? null : (
      <span aria-hidden className="flex gap-[2px]" data-testid={`journey-pips-${side}-${ability.slot}`}>
        {Array.from({ length: ability.maxRank }, (_, i) => (
          <span key={i} data-filled={i < ability.rank ? "true" : "false"}
            data-new={rankFrom !== null && i >= rankFrom && i < ability.rank ? "true" : undefined}
            className={`journey-pip block rounded-full ${i < ability.rank
              ? (rankFrom !== null && i >= rankFrom ? "bg-[#8fd0a0]" : "bg-[#e8c97a]")
              : "bg-white/15"}`} />
        ))}
      </span>
      )}
    </span>
  );
}

/**
 * Six fixed slots. An empty slot is a dashed box of the same size. JP2: a slot
 * holding a STACK (identical stackable consumables, `lib/journey/inventory.ts`)
 * wears the game's count in its bottom-right corner — absolutely positioned,
 * so a stack changes nothing about the slot's box.
 */
export function InventorySlots({ side, items, newSlots, relevantSlots, step = 0, gainTags }: {
  side: JourneySide;
  items: JourneyItem[];
  newSlots: ReadonlySet<number>;
  /** JATTN1 — occupied slots the current question is about (the server's focus). */
  relevantSlots: ReadonlySet<number>;
  step?: number;
  /**
   * MOTION-V1 — while the beat runs, a NEW item's own stat lines as the server
   * published them ("+10 AH"), by slot. Drawn as a transient tag anchored to
   * that slot, absolutely positioned (it lays out nothing); gone with the beat.
   */
  gainTags?: ReadonlyMap<number, readonly string[]>;
}) {
  const assets = useMasteryAssets();
  return (
    <span role="list" aria-label={`${side.championName} items`}
      data-testid={`journey-items-${side.side}`} className="journey-items relative flex shrink-0 gap-[3px]">
      {/* JATTN1 â€” a relevant item's reticle, outside the slot's clipped box (anchored like the gain tags). */}
      {[...relevantSlots].filter((slot) => items.some((x) => x.slot === slot)).map((slot) => (
        <span key={`relevant-${step}-${slot}`} aria-hidden data-testid={`journey-relevant-${side.side}-item-${slot}`}
          className="journey-reticle journey-reticle--item" style={{ left: `calc(${slot} * (var(--jb-slot) + var(--jb-item-gap, 3px)) - 2px)` }}
          data-step={step} />
      ))}
      {[...(gainTags ?? [])].map(([slot, tags]) => (
        <span key={`gain-${slot}`} aria-hidden data-testid={`journey-item-gain-${side.side}-${slot}`}
          className="journey-item-gain"
          // Anchored to its slot, opening INWARD so it never leaves the board.
          style={slot < 3
            ? { left: `calc(${slot} * (var(--jb-slot) + 3px))` }
            : { right: `calc(${5 - slot} * (var(--jb-slot) + 3px))` }}>
          {tags.join(" · ")}
        </span>
      ))}
      {Array.from({ length: 6 }, (_, slot) => {
        const it = items.find((x) => x.slot === slot) ?? null;
        const isNew = it !== null && newSlots.has(slot);
        const relevant = it !== null && relevantSlots.has(slot);
        const qty = it?.quantity ?? 1;
        return (
          <span key={slot} role="listitem"
            aria-label={it ? `${it.name}${qty > 1 ? `, ${qty}` : ""}${isNew ? ", just bought" : ""}${relevant ? `, ${RELEVANT_LABEL}` : ""}` : "Empty slot"}
            title={it ? `${it.name}${qty > 1 ? ` ×${qty}` : ""}` : undefined}
            data-testid={`journey-item-${side.side}-${slot}`}
            data-item-id={it?.itemId}
            data-quantity={qty > 1 ? qty : undefined}
            data-new={isNew ? "true" : undefined}
            data-relevant={relevant ? "true" : undefined}
            data-inspect={it?.itemId ? "true" : undefined}
            className={`relative flex items-center justify-center overflow-hidden rounded-[5px] border ${
              it ? `bg-black/70 ${sideRim(side.side)}` : "border-dashed border-white/15 bg-black/25"} ${
              isNew ? "journey-changed" : ""}`}
            style={{ width: "var(--jb-slot)", height: "var(--jb-slot)" }}>
            {it && <Art url={resolveAssetUrl(it.icon) ?? assets.itemIconUrl(it.itemId)} alt="" mono={it.name} />}
            {/* JPX — an occupied item is inspectable: its canonical stats. Empty slots stay inert. */}
            {it?.itemId ? <JourneyItemReference itemId={it.itemId} name={it.name}
              testId={`journey-item-ref-${side.side}-${slot}`} /> : null}
            {qty > 1 && (
              <span aria-hidden data-testid={`journey-item-qty-${side.side}-${slot}`} className="journey-item-qty">
                {qty}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * One premise stat. Its faces, in one fixed-height chip:
 *   plain    "Armor 52"                (JP3: derived values shown whole)
 *   delta    "Armor 52 → 92"           (the server's from/to, kept all child long)
 *   withheld "Armor ?"                 (the value is NOT in the payload)
 *   recalled "Armor recall · step 3"   (withheld; the learner must remember it)
 *   learned  "Armor 24 !"              (JP3: withheld on the wire, FILLED by the
 *                                       learner's own established fact — K2's
 *                                       reveal display, never a served stat)
 */
export function StatChip({ side, stat, delta = null, gain = null, focused = false, learned = null }: {
  side: JourneySide["side"];
  stat: JourneyStat;
  delta?: { from: number; to: number } | null;
  /**
   * JOURNEY-UI3 — the server's item DELTA on this stat (J3 `stat_change`). The
   * chip takes the existing "changed" face; the number itself is in its label,
   * the State sheet and the beat line. It is never added to anything, and it
   * takes no extra width (a badge here overflowed the chip at every width).
   */
  gain?: number | null;
  focused?: boolean;
  /**
   * JP3 — the learner's established value for this WITHHELD stat (its reveal's
   * display, verbatim), its step, its `!` and whether it was learned just now.
   */
  learned?: { display: string; step: number; mark: ReactNode; fresh: boolean } | null;
}) {
  const meta = JOURNEY_STAT_META[stat.key];
  const value = stat.withheld ? null : stat.value;
  const recalled = stat.withheld && stat.withheldReason === "recalled";
  const face = learned ? "learned" : recalled ? "recalled" : value === null ? "withheld" : delta ? "delta" : gain !== null ? "gained" : "plain";
  const from = stat.recalledFrom ? `step ${stat.recalledFrom.child + 1}` : null;
  const exact = value !== null && !delta ? exactValueNote(value) : null;
  return (
    <span data-testid={`journey-stat-${side}-${stat.key}`} data-face={face}
      data-gain={gain !== null && value !== null ? gain : undefined}
      data-focus={focused ? "true" : undefined}
      data-just-learned={learned?.fresh ? "true" : undefined}
      title={exact ?? undefined}
      aria-label={learned ? `${meta.long}: ${learned.display}, learned Step ${learned.step}`
        : recalled ? `${meta.long}: recall it${from ? ` from ${from}` : ""}`
        : value === null ? `${meta.long}: asked in this question`
        : delta ? `${meta.long}: ${formatStatValue(delta.from, stat.key)} to ${formatStatValue(delta.to, stat.key)}`
          : `${meta.long}: ${formatStatValue(value, stat.key)}${gain !== null ? ` (${formatStatGain(gain, stat.key)} from the last change)` : ""}`}
      className={`journey-chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 font-semibold uppercase tracking-[0.12em] ${
        face === "learned" ? "journey-chip--learned"
          : face === "delta" || face === "gained" ? "journey-chip--delta" : face === "withheld" || face === "recalled"
          ? "border-dashed border-[#e8c97a]/60 bg-[#e8c97a]/10" : "border-[#d4b35a]/30 bg-black/50"} ${
        focused ? "journey-focus" : ""}`}>
      <span className="text-white/70">{meta.short}</span>
      {learned ? (
        <>
          <span key={learned.display} className="journey-learned-value font-black text-[#fff3d0]"
            data-testid={`journey-stat-${side}-${stat.key}-learned`}>
            {learned.display}
          </span>
          {learned.mark}
        </>
      ) : recalled ? (
        // The number is NOT on the wire and the learner has no established
        // value for it: say where it came from; never print a value.
        <span className="font-black normal-case tracking-normal text-[#f3dca0]" data-testid={`journey-stat-${side}-${stat.key}-recall`}>
          recall{from ? ` · ${from}` : ""}
        </span>
      ) : value === null ? (
        <span className="journey-unknown font-black text-[#f3dca0]">?</span>
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

/**
 * JP3 — an ability VALUE readout ("E raw damage ?" → "E raw damage 85 !"):
 * the board's slot for a value the Journey asks about an ability. `?` while
 * asked and not yet established; the learner's established value (K2's reveal
 * display) once it is. Same fixed-height chip as a stat.
 */
export function AbilityReadoutChip({ side, slot, label, learned, focused = false }: {
  side: JourneySide["side"];
  slot: AbilitySlot;
  /** "raw damage" (band) / "raw" (compact). */
  label: { long: string; short: string };
  learned: { display: string; step: number; mark: ReactNode; fresh: boolean } | null;
  focused?: boolean;
}) {
  return (
    <span data-testid={`journey-readout-${side}-${slot}`} data-face={learned ? "learned" : "withheld"}
      data-just-learned={learned?.fresh ? "true" : undefined}
      aria-label={learned ? `${slot} ${label.long}: ${learned.display}, learned Step ${learned.step}`
        : `${slot} ${label.long}: asked in this question`}
      className={`journey-chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 font-semibold uppercase tracking-[0.12em] ${
        learned ? "journey-chip--learned" : "border-dashed border-[#e8c97a]/60 bg-[#e8c97a]/10"} ${
        focused ? "journey-focus" : ""}`}>
      <span className="text-white/70">
        {slot} <span className="journey-long">{label.long}</span><span aria-hidden className="journey-short">{label.short}</span>
      </span>
      {learned ? (
        <>
          <span key={learned.display} className="journey-learned-value font-black text-[#fff3d0]"
            data-testid={`journey-readout-${side}-${slot}-value`}>
            {learned.display}
          </span>
          {learned.mark}
        </>
      ) : (
        <span className="journey-unknown font-black text-[#f3dca0]">?</span>
      )}
    </span>
  );
}
