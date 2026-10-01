/**
 * JOURNEY-UI1 — THE STATE SHEET: the full detail behind the board.
 *
 * Both sides at once, stacked (never a carousel): portrait, level, every
 * ability with its name and rank, every item by name, EVERY premise stat by
 * its long label, tracked vitals when the Journey has them, and the change
 * log of the transition into this node. A withheld stat reads "asked in this
 * question" — the sheet has no more data than the board, it only has room.
 *
 * The existing bottom `Sheet` (Radix dialog): it opens over the arena from the
 * board's State control on a phone and on a desktop alike, and closing it
 * returns focus to that control.
 *
 * JP4 — the sheet is the board's FULL inspection: each side's stat-shard page
 * (served ids and names), a stated stat's served sources (Doran's Blade +10,
 * Adaptive Force +5.4 …) and, for a learned value, where it was learned. A
 * permanent legend says what the board's gold `!` means.
 */
import type { JourneyPublicState, JourneySide } from "@/lib/journey/contract";
import { journeySide } from "@/lib/journey/contract";
import { eventLine, markKey, transitionMarks } from "@/lib/journey/beat";
import { exactNumber, formatStatGain, formatStatValue, JOURNEY_STAT_META } from "@/lib/journey/stats";
import { learnedStatFact, NO_KNOWLEDGE, type JourneyKnowledge } from "@/lib/journey/knowledge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { MasteryAssetsProvider } from "@/features/mastery/live/MasteryAssetsProvider";
import { JourneyPortrait, LevelBadge, sideRim } from "./JourneyPrimitives";
import { ItemIcon, ShardIcon } from "./JourneyIcons";
import { JourneyStatSourceRow } from "./JourneyChampionPortraitPopup";

function SideDetail({ state, side, knowledge }: { state: JourneyPublicState; side: JourneySide; knowledge: JourneyKnowledge }) {
  const marks = transitionMarks(state.transition);
  const id = side.side;
  return (
    <section data-testid={`journey-sheet-side-${id}`}
      className={`journey-vars space-y-2 rounded-lg border bg-[#0b1727] p-3 ${sideRim(id)}`}
      style={{ ["--jb-portrait" as string]: "2.5rem" }}>
      <header className="flex items-center gap-2">
        <JourneyPortrait side={side} />
        <div className="min-w-0">
          <p className="truncate font-black uppercase tracking-[0.08em] text-white">{side.championName}</p>
          <LevelBadge level={side.level} from={marks.level[id]?.from ?? null} />
        </div>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {side.abilities.map((a) => (
          <div key={a.slot} className="contents" data-testid={`journey-sheet-ability-${id}-${a.slot}`}>
            <dt className="font-black text-[#e8c97a]">{a.slot}</dt>
            <dd className="text-white/85">
              {a.name ? `${a.name} · ` : ""}
              {a.rank === 0 ? "not learned"
                : a.maxRank !== null ? `rank ${a.rank} / ${a.maxRank}` : `rank ${a.rank}`}
            </dd>
          </div>
        ))}
      </dl>
      {side.shards && side.shards.length > 0 && (
        <div data-testid={`journey-sheet-shards-${id}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Stat shards</p>
          <ul className="space-y-0.5 text-xs text-white/85">
            {side.shards.map((sh) => (
              <li key={sh.row} className="flex items-center gap-1.5" data-shard-id={sh.shardId}>
                <ShardIcon shardId={sh.shardId} name={sh.name} size="inline" />
                <span>{sh.name}</span>
                <span className="text-white/45">· {sh.row}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Items</p>
        {side.items.length === 0 ? (
          <p className="text-xs text-white/60">No items</p>
        ) : (
          <ul className="text-xs text-white/85">
            {side.items.map((it) => (
              <li key={it.slot}>
                {it.name}{it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : ""}{marks.newItems.has(markKey(id, it.slot)) ? " · new" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(side.stats.length > 0 || side.vitals) && (
      <div data-testid={`journey-sheet-stats-${id}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Stats</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-xs">
          {side.stats.map((s) => {
            const delta = marks.stat.get(markKey(id, s.key));
            // JP3 — the board's grammar: a withheld stat the learner has
            // established reads as that value, with where it was learned.
            const learned = s.withheld ? learnedStatFact(knowledge, side, s, state.step.index) : null;
            return (
              <div key={s.key} className="contents" data-testid={`journey-sheet-stat-${id}-${s.key}`}>
                <dt className="text-white/70">{JOURNEY_STAT_META[s.key].long}</dt>
                <dd className="text-right font-bold tabular-nums text-white">
                  {learned ? `${learned.display} · learned Step ${learned.child + 1}`
                    : s.withheld && s.withheldReason === "recalled"
                    ? `recall it${s.recalledFrom ? ` — ${s.recalledFrom.source} in step ${s.recalledFrom.child + 1}` : ""}`
                    : s.withheld || s.value === null ? "? — asked in this question"
                    : delta ? `${formatStatValue(delta.from, s.key)} → ${formatStatValue(delta.to, s.key)}`
                      : (s.value === null ? "" : `${formatStatValue(s.value, s.key)}${
                        marks.gain.has(markKey(id, s.key))
                          ? ` (${formatStatGain(marks.gain.get(markKey(id, s.key))!, s.key)} from the last change)` : ""}`)}
                </dd>
                {s.sources && s.sources.length > 0 && s.value !== null && (
                  <dd className="col-span-2 mb-1 pl-2" data-testid={`journey-sheet-sources-${id}-${s.key}`}>
                    <ul className="space-y-0.5 text-[11px] text-white/70">
                      {/* JP5 — one served-source row (item, shard, or the level base) everywhere. */}
                      {s.sources.map((src, i) => <JourneyStatSourceRow key={i} source={src} />)}
                      <li className="flex border-t border-white/10 pt-0.5">
                        <span>Exact</span>
                        <span className="ml-auto font-bold tabular-nums text-white/85">{exactNumber(s.value)}</span>
                      </li>
                    </ul>
                  </dd>
                )}
              </div>
            );
          })}
          {side.vitals?.health && (
            <div className="contents">
              <dt className="text-white/70">Health (current)</dt>
              <dd className="text-right font-bold tabular-nums text-white">
                {side.vitals.health.current}{side.vitals.health.max !== null ? ` / ${side.vitals.health.max}` : ""}
              </dd>
            </div>
          )}
          {side.vitals?.resource && (
            <div className="contents">
              <dt className="text-white/70">{side.vitals.resource.kind}</dt>
              <dd className="text-right font-bold tabular-nums text-white">
                {side.vitals.resource.current}{side.vitals.resource.max !== null ? ` / ${side.vitals.resource.max}` : ""}
              </dd>
            </div>
          )}
        </dl>
      </div>
      )}
    </section>
  );
}

export function JourneyStateSheet({ state, open, onOpenChange, knowledge = NO_KNOWLEDGE }: {
  state: JourneyPublicState;
  /** JP3 — the learner's established facts (the board's own), for withheld stats. */
  knowledge?: JourneyKnowledge;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const name = (side: "subject" | "opponent") => journeySide(state, side).championName;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="journey-state-sheet"
        className="theme-lol max-h-[85dvh] overflow-y-auto border-[#d4b35a]/40 bg-[#07111f] text-white">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <SheetHeader>
            <SheetTitle className="ranked-title text-[#f3dca0]">
              {state.title ?? "Journey"} · Step {state.step.index + 1} of {state.step.count}
            </SheetTitle>
            <SheetDescription className="text-white/70">
              {state.step.nodeLabel ?? "The current state of both champions."}
            </SheetDescription>
          </SheetHeader>
          <MasteryAssetsProvider>
            <div className="grid gap-3 sm:grid-cols-2">
              <SideDetail state={state} side={state.sides[0]} knowledge={knowledge} />
              <SideDetail state={state} side={state.sides[1]} knowledge={knowledge} />
            </div>
          </MasteryAssetsProvider>
          <p data-testid="journey-sheet-legend" className="flex items-center gap-2 text-xs text-white/70">
            <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#e8c97a] text-[10px] font-black text-[#2a1f08]">!</span>
            <span><span className="font-bold text-[#f3dca0]">Learned knowledge.</span> Hover or tap a <span aria-hidden>!</span> on the board to recall what the Journey established.</span>
          </p>
          {state.transition && (
            <section data-testid="journey-sheet-changes">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Since the last step
              </p>
              <ul className="text-xs text-white/85">
                {state.transition.events.map((e, i) => <li key={i}>{eventLine(e, name)}</li>)}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
