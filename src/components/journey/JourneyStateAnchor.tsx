/**
 * JP4 — ONE STATE ANCHOR on a board half's fixed anchor row (`anchors.ts`
 * decides which): an icon-led, fixed-height token.
 *
 *   value      [Long Sword] BONUS AD 21 [▪][◆][◆]   the sources, tiny, trailing
 *   asked      [Cloth Armor] ARMOR ?
 *   revealed   [Cloth Armor] ARMOR 24 !             learned at this reveal (glows once)
 *   learned    [Cloth Armor] ARMOR !                learned earlier: recall it
 *   recall     [Cloth Armor] ARMOR recall           relied on, never learned here
 *
 * A value with SERVED sources (backend `stat_sources`) opens their breakdown on
 * hover / tap — each item and shard's own share, the exact total, and the
 * whole number the board shows. Nothing is summed here: every line is served.
 */
import { useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { JourneySide, JourneyStatSource } from "@/lib/journey/contract";
import type { BoardAnchor } from "@/lib/journey/anchors";
import { mnemonicForStat } from "@/lib/journey/statIcons";
import {
  exactNumber, exactValueNote, formatStatGain, formatStatValue, isRoundedForDisplay, JOURNEY_STAT_META, type JourneyStatKey,
} from "@/lib/journey/stats";
import { AbilityIcon, ItemIcon, ShardIcon, StatMnemonicIcon } from "./JourneyIcons";

function SourceIcon({ source, size, testId }: { source: JourneyStatSource; size: "source" | "inline"; testId?: string }) {
  return source.kind === "item"
    ? <ItemIcon itemId={source.itemId} name={source.name} size={size} testId={testId} />
    : <ShardIcon shardId={source.shardId} name={source.name} size={size} testId={testId} />;
}

/** "+10", "+5.4": a served share, exactly as served. */
const share = (v: number) => `${v < 0 ? "−" : "+"}${exactNumber(Math.abs(v))}`;

function SourcesCard({ label, statKey, sources, total }: {
  label: string; statKey: JourneyStatKey; sources: JourneyStatSource[]; total: number;
}) {
  const rounded = isRoundedForDisplay(total);
  return (
    <div className="journey-sources" data-testid="journey-sources-card">
      <div className="journey-know-pop__title">{label} · sources</div>
      <ul className="journey-sources__rows">
        {sources.map((s, i) => (
          <li key={i} className="journey-sources__row" data-source-kind={s.kind}
            aria-label={`${s.name}: ${share(s.value)}`}>
            <SourceIcon source={s} size="inline" />
            <span aria-hidden className="journey-sources__name">{s.name}</span>
            <span aria-hidden className="journey-sources__value">{share(s.value)}</span>
          </li>
        ))}
      </ul>
      <div className="journey-sources__total" aria-label={`Total ${exactNumber(total)}`}>
        <span aria-hidden>{rounded ? "Exact" : "Total"}</span>
        <span aria-hidden className="journey-sources__value">{exactNumber(total)}</span>
      </div>
      {rounded && (
        <div className="journey-sources__shown">
          Shown as {formatStatValue(total, statKey)} · rounded for display
        </div>
      )}
    </div>
  );
}

/** Hover opens, a click / tap pins, Escape / outside closes (the `!`'s own model). */
function HoverPopover({ trigger, children, label, testId }: {
  trigger: (props: Record<string, unknown>) => ReactNode; children: ReactNode; label: string; testId: string;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const set = (next: boolean, pin = false) => { pinned.current = next && pin; setOpen(next); };
  return (
    <Popover open={open} onOpenChange={(n) => set(n)}>
      <PopoverTrigger asChild>
        {trigger({
          "aria-label": label,
          onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === "mouse" && !open) set(true); },
          onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === "mouse" && !pinned.current) set(false); },
          onClick: (e: React.MouseEvent) => { e.preventDefault(); if (open && pinned.current) set(false); else set(true, true); },
        })}
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={4} collisionPadding={8} data-testid={`${testId}-pop`}
        aria-label={label} onOpenAutoFocus={(e) => e.preventDefault()}
        className="journey-know-pop w-auto max-w-[min(17rem,calc(100vw-16px))] p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function JourneyStateAnchor({ side, anchor, mark = null, fresh = false }: {
  side: JourneySide;
  anchor: BoardAnchor;
  /** The `!` for a learned face (`JourneyKnowledgeMark`, placement "chip"). */
  mark?: ReactNode;
  /** Learned at this reveal, just now: the one-shot glow. */
  fresh?: boolean;
}) {
  const id = side.side;
  const { face } = anchor;
  const isStat = anchor.kind === "stat";
  const testId = isStat ? `journey-stat-${id}-${anchor.key}` : `journey-readout-${id}-${anchor.slot}`;
  const statKey: JourneyStatKey | null = isStat ? anchor.key : null;
  const mnemonic = statKey ? mnemonicForStat(statKey) : null;
  const meta = isStat ? JOURNEY_STAT_META[anchor.key] : null;
  const ability = !isStat ? side.abilities.find((a) => a.slot === anchor.slot) : null;
  const value = isStat && face === "value" ? anchor.stat.value : null;
  const sources = isStat && face === "value" ? anchor.stat.sources ?? [] : [];
  const noun = isStat ? meta!.long : `${anchor.slot}${ability?.name ? ` ${ability.name}` : ""} raw damage`;
  const delta = isStat ? anchor.delta : null;
  const recallStep = isStat && anchor.stat.recalledFrom ? anchor.stat.recalledFrom.child + 1 : null;
  const gain = isStat ? anchor.gain : null;
  const spoken = face === "value" && delta
    ? `${noun}: ${formatStatValue(delta.from, statKey!)} to ${formatStatValue(delta.to, statKey!)}`
    : face === "value" ? `${noun}: ${formatStatValue(value!, statKey!)}${
      gain !== null ? ` (${formatStatGain(gain, statKey!)} from the last change)` : ""}`
    : face === "asked" ? `${noun}: asked in this question`
    : face === "revealed" ? `${noun}: ${anchor.fact?.display}, learned now`
    : face === "learned" ? `${noun}: learned Step ${(anchor.fact?.child ?? 0) + 1}, open its mark to recall`
    : `${noun}: recall it${recallStep !== null ? ` from step ${recallStep}` : ""}`;

  const body = (
    <>
      {isStat
        ? (mnemonic
          ? <StatMnemonicIcon mnemonic={mnemonic} size="anchor" testId={`${testId}-icon`} />
          : null)
        : <AbilityIcon champion={side.championName} slot={anchor.slot} size="anchor" testId={`${testId}-icon`} />}
      <span aria-hidden className="journey-anchor__label">
        {isStat ? meta!.short : <><span className="journey-long">Raw damage</span><span className="journey-short">Raw</span></>}
      </span>
      {face === "value" && delta && (
        <span aria-hidden className="journey-anchor__value">
          <span className="journey-anchor__from">{formatStatValue(delta.from, statKey!)}</span>
          <span className="journey-anchor__arrow">→</span>
          {formatStatValue(delta.to, statKey!)}
        </span>
      )}
      {face === "value" && !delta && (
        <span aria-hidden className="journey-anchor__value">{formatStatValue(value!, statKey!)}</span>
      )}
      {face === "asked" && <span aria-hidden className="journey-anchor__value journey-unknown">?</span>}
      {face === "revealed" && (
        <span aria-hidden key={anchor.fact?.display} className="journey-anchor__value journey-learned-value"
          data-testid={`${testId}-learned`}>{anchor.fact?.display}</span>
      )}
      {face === "recall" && (
        // Relied on and not learned here (a stated fact, or a Journey before K1):
        // where it came from, never a number.
        <span aria-hidden className="journey-anchor__recall">
          recall{recallStep !== null ? ` · step ${recallStep}` : ""}
        </span>
      )}
      {sources.length > 0 && (
        <span aria-hidden className="journey-anchor__sources" data-testid={`${testId}-sources`}>
          {sources.map((s, i) => <SourceIcon key={i} source={s} size="source" testId={`${testId}-source-${i}`} />)}
        </span>
      )}
      {mark}
    </>
  );
  const common = {
    // The DISPLAY face: a value that a transition changed keeps JP3's names.
    "data-testid": testId, "data-face": face === "value" && delta ? "delta" : face === "value" && gain !== null ? "gained" : face,
    "data-kind": anchor.kind,
    "data-focus": anchor.focused ? "true" : undefined,
    "data-just-learned": fresh ? "true" : undefined,
    "data-gain": gain !== null && value !== null ? gain : undefined,
    "data-changed": delta || gain !== null ? "true" : undefined,
    title: value !== null && sources.length === 0 ? exactValueNote(value) ?? undefined : undefined,
    className: `journey-chip journey-anchor journey-anchor--${face}${delta || gain !== null ? " journey-chip--delta" : ""}${
      anchor.focused ? " journey-focus" : ""}`,
  };
  if (sources.length > 0 && value !== null) {
    return (
      <HoverPopover label={`${noun} ${formatStatValue(value, statKey!)}: where it comes from`}
        testId={testId} trigger={(p) => (
          <button type="button" {...common} {...p} data-has-sources="true">{body}</button>
        )}>
        <SourcesCard label={meta!.short} statKey={statKey!} sources={sources} total={value} />
      </HoverPopover>
    );
  }
  return <span {...common} role="group" aria-label={spoken}>{body}</span>;
}
