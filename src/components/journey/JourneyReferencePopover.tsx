/**
 * JPX — REFERENCE POPUPS for the board's occupied item slots and stat shards.
 *
 * What an object IS, available from the first frame: an item's canonical
 * stats, a shard's contribution to that champion. Reference only — nothing
 * here reads the Journey's knowledge ledger or a withheld value, and the
 * numbers are the served authorities' own (`lib/journey/itemReference.ts`;
 * the side's served `stat_sources`), printed verbatim.
 *
 * The control is a transparent button filling its tile (the tile keeps its own
 * box, so nothing moves). Same interaction as the knowledge `!`: a mouse hover
 * opens it and leaving closes it; a click or tap pins it open, a second
 * click/tap or an outside tap closes it; Enter/Space toggle, Escape closes.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { JourneyShard, JourneySide, JourneyStatSource } from "@/lib/journey/contract";
import { loadItemReference, itemStatLine, type ItemReferenceStat } from "@/lib/journey/itemReference";
import type { ChampionPortraitPopup } from "@/lib/journey/portraitPopup";
import { exactNumber, JOURNEY_STAT_META } from "@/lib/journey/stats";

function ReferencePopover({ label, testId, title, children }: {
  label: string;
  testId: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const set = (next: boolean, pin = false) => {
    pinned.current = next && pin;
    setOpen(next);
  };
  return (
    <Popover open={open} onOpenChange={(next) => set(next)}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testId} aria-label={label} className="journey-ref-btn"
          onPointerEnter={(e) => { if (e.pointerType === "mouse" && !open) set(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pinned.current) set(false); }}
          onClick={(e) => {
            e.preventDefault();
            if (open && pinned.current) set(false);
            else set(true, true);
          }} />
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={6} collisionPadding={8}
        data-testid={`${testId}-pop`} aria-label={label}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="journey-know-pop journey-ref-pop w-auto max-w-[min(17rem,calc(100vw-16px))] p-0">
        <div className="journey-know-pop__title">{title}</div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

type ItemLoad = { state: "loading" } | { state: "error" } | { state: "ready"; stats: ItemReferenceStat[] };

function ItemStats({ itemId, testId }: { itemId: number; testId: string }) {
  const [load, setLoad] = useState<ItemLoad>({ state: "loading" });
  useEffect(() => {
    let live = true;
    loadItemReference(itemId).then(
      (stats) => { if (live) setLoad({ state: "ready", stats }); },
      () => { if (live) setLoad({ state: "error" }); },
    );
    return () => { live = false; };
  }, [itemId]);
  if (load.state !== "ready") {
    return (
      <p className="journey-ref-pop__note" data-testid={`${testId}-status`}>
        {load.state === "loading" ? "Loading stats…" : "Stats unavailable right now."}
      </p>
    );
  }
  if (load.stats.length === 0) return <p className="journey-ref-pop__note">No stat bonuses.</p>;
  return (
    <ul className="journey-know-pop__lines" data-testid={`${testId}-stats`}>
      {load.stats.map((s) => (
        <li key={s.key} className="journey-know-pop__line">
          <span className="font-black text-white">{itemStatLine(s)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The transparent control over an occupied item slot: its canonical stats. */
export function JourneyItemReference({ itemId, name, testId }: { itemId: number; name: string; testId: string }) {
  return (
    <ReferencePopover label={`${name}: item stats`} testId={testId} title={name}>
      <ItemStats itemId={itemId} testId={testId} />
    </ReferencePopover>
  );
}

/**
 * What a served shard contributes to THIS champion: the served `stat_sources`
 * (the backend stat-mod authority's own value, Adaptive Force already
 * resolved to AD or AP for the champion) wherever a stat on the board or in the
 * champion's established state lists it. A shard no served stat lists says so
 * rather than guessing a number.
 */
export function shardContributions(side: JourneySide, popup: ChampionPortraitPopup | null, shard: JourneyShard) {
  const out = new Map<string, { label: string; value: string }>();
  const take = (stat: string, sources: readonly JourneyStatSource[] | undefined) => {
    for (const s of sources ?? []) {
      if (s.kind !== "stat_mod" || s.shardId !== shard.shardId || s.row !== shard.row || out.has(stat)) continue;
      const meta = (JOURNEY_STAT_META as Record<string, { long: string }>)[stat];
      out.set(stat, { label: meta?.long ?? stat, value: `${s.value < 0 ? "−" : "+"}${exactNumber(Math.abs(s.value))}` });
    }
  };
  for (const st of side.stats) take(st.key, st.sources);
  const current = popup?.checkpoints.find((c) => c.node === popup.current) ?? null;
  for (const [stat, entry] of Object.entries(current?.entries ?? {})) take(stat, entry?.sources);
  return [...out.values()];
}

/** The transparent control over a shard: its row, name and served contribution. */
/** "+9 Adaptive Force", "+10% Attack Speed", "+10 Health per level": the served effect, verbatim. */
export const shardEffectLine = (e: NonNullable<JourneyShard["effects"]>[number]) =>
  `${e.value < 0 ? "−" : "+"}${exactNumber(Math.abs(e.value))}${e.unit === "percent" ? "%" : ""} ${e.label}`;

export function JourneyShardReference({ side, popup, shard, testId }: {
  side: JourneySide;
  popup: ChampionPortraitPopup | null;
  shard: JourneyShard;
  testId: string;
}) {
  // The served canonical contribution first (every shard, from the first state);
  // the stated-stat `stat_sources` only for a backend that does not serve it.
  const effects = shard.effects ?? [];
  const lines = effects.length > 0
    ? effects.map((e) => ({ label: "", value: shardEffectLine(e), key: e.key }))
    : shardContributions(side, popup, shard).map((l) => ({ ...l, key: l.label, value: `${l.value} ${l.label}` }));
  return (
    <ReferencePopover label={`${shard.name}, ${shard.row} shard: contribution to ${side.championName}`}
      testId={testId} title={`${shard.name} · ${shard.row} shard`}>
      {lines.length > 0 ? (
        <ul className="journey-know-pop__lines" data-testid={`${testId}-stats`}>
          {lines.map((l) => (
            <li key={l.key} className="journey-know-pop__line">
              <span className="font-black text-white">{l.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="journey-ref-pop__note" data-testid={`${testId}-status`}>
          No value is published for this shard in this state.
        </p>
      )}
    </ReferencePopover>
  );
}
