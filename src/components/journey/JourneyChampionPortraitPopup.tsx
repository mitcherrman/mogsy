/**
 * JP5 — THE CHAMPION PORTRAIT POPUP: the board's circular portrait is a control.
 * Click / tap it for a compact sheet of that champion's stats as the learner
 * has ESTABLISHED them (`lib/journey/portraitPopup.ts`) — a small League stat
 * table that starts mostly empty and fills in as the Journey teaches:
 *
 *   AHRI · Lv 2                   [Current state ▾]
 *   HP          —
 *   Armor       24     Lv 2 base · Step 3
 *   MR          —
 *   …
 *
 * A row with served provenance opens it in place (Lv 3 base +50.08, Cloth
 * Armor +15, exact 65.08). The checkpoint selector lists only the Journey's
 * own reached states (no stat-category filter, no calculator).
 *
 * The portrait wears the existing gold `!` when a champion stat was LEARNED by
 * a reveal (K2's grammar: established, never "you were right"); a question
 * about one of this champion's stats outlines it (`focused`). The sheet is
 * portalled (Radix Popover), so the board's `overflow: hidden` never clips it,
 * and it lays out nothing on the board.
 */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { JourneySide, JourneyStatSource } from "@/lib/journey/contract";
import {
  entryBasis, portraitPopupLabel, PORTRAIT_POPUP_STATS, type ChampionPortraitPopup, type PortraitPopupCheckpoint, type PortraitPopupEntry,
} from "@/lib/journey/portraitPopup";
import { exactNumber, isRoundedForDisplay, JOURNEY_STAT_META } from "@/lib/journey/stats";
import { ItemIcon, ShardIcon } from "./JourneyIcons";
import { JourneyPortrait } from "./JourneyPrimitives";

/** A served source's share, exactly as served ("+15", "+5.4"; a level base unsigned). */
const share = (s: JourneyStatSource) =>
  (s.kind === "level" ? exactNumber(s.value) : `${s.value < 0 ? "−" : "+"}${exactNumber(Math.abs(s.value))}`);

/** One served stat source: its icon (an item, a shard, or the level), its name, its share. */
export function JourneyStatSourceRow({ source, testId }: { source: JourneyStatSource; testId?: string }) {
  const name = source.kind === "level" ? `Lv ${source.level} base` : source.name;
  return (
    <li className="journey-source-row" data-source-kind={source.kind} data-testid={testId}
      aria-label={`${name}: ${share(source)}`}>
      {source.kind === "item" ? <ItemIcon itemId={source.itemId} name={source.name} size="inline" />
        : source.kind === "stat_mod" ? <ShardIcon shardId={source.shardId} name={source.name} size="inline" />
          : <span aria-hidden className="journey-source-row__lv">Lv</span>}
      <span aria-hidden className="journey-source-row__name">{name}</span>
      <span aria-hidden className="journey-source-row__value">{share(source)}</span>
    </li>
  );
}

const checkpointLabel = (cp: PortraitPopupCheckpoint, current: boolean) => {
  const steps = cp.firstStep === cp.lastStep ? `Step ${cp.firstStep}` : `Steps ${cp.firstStep}–${cp.lastStep}`;
  return current ? "Current state" : [steps, `Lv ${cp.level}`, cp.note].filter(Boolean).join(" · ");
};

function Row({ stat, entry, testId }: { stat: (typeof PORTRAIT_POPUP_STATS)[number]; entry: PortraitPopupEntry | undefined; testId: string }) {
  const [open, setOpen] = useState(false);
  const label = portraitPopupLabel(stat);
  if (!entry) {
    return (
      <li className="journey-portrait-popup__row" data-stat={stat} data-known="false" data-testid={testId}
        aria-label={`${JOURNEY_STAT_META[stat].long}: not established`}>
        <span aria-hidden className="journey-portrait-popup__stat">{label}</span>
        <span aria-hidden className="journey-portrait-popup__value journey-portrait-popup__value--unknown">—</span>
      </li>
    );
  }
  const detail = entry.sources.length > 0 || (entry.exact !== null && isRoundedForDisplay(entry.exact));
  const basis = `${entryBasis(entry)} · ${entry.how === "learned" ? "learned" : "stated"} Step ${entry.step}`;
  const spoken = `${JOURNEY_STAT_META[stat].long}: ${entry.display}, ${basis}`;
  const body = (
    <>
      <span aria-hidden className="journey-portrait-popup__stat">{label}</span>
      <span aria-hidden className="journey-portrait-popup__value">{entry.display}</span>
      <span aria-hidden className="journey-portrait-popup__basis">{basis}</span>
    </>
  );
  return (
    <li className="journey-portrait-popup__row" data-stat={stat} data-known="true" data-how={entry.how} data-testid={testId}>
      {detail ? (
        <button type="button" className="journey-portrait-popup__line" aria-expanded={open} aria-label={`${spoken}. ${open ? "Hide" : "Show"} where it comes from`}
          onClick={() => setOpen((o) => !o)} data-testid={`${testId}-toggle`}>
          {body}
          <ChevronDown aria-hidden className={`journey-portrait-popup__chev ${open ? "rotate-180" : ""}`} strokeWidth={2.5} />
        </button>
      ) : (
        <span className="journey-portrait-popup__line" role="group" aria-label={spoken}>{body}</span>
      )}
      {detail && open && (
        <ul className="journey-portrait-popup__sources" data-testid={`${testId}-sources`}>
          {entry.sources.map((s, i) => <JourneyStatSourceRow key={i} source={s} testId={`${testId}-source-${i}`} />)}
          {entry.exact !== null && (
            <li className="journey-source-row journey-source-row--total" aria-label={`Exact ${exactNumber(entry.exact)}`}>
              <span aria-hidden className="journey-source-row__name">
                {isRoundedForDisplay(entry.exact) ? `Exact · shown ${entry.display}` : "Total"}
              </span>
              <span aria-hidden className="journey-source-row__value">{exactNumber(entry.exact)}</span>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function JourneyChampionPortraitPopup({ side, popup, fresh = false, focused = false, testId }: {
  side: JourneySide;
  popup: ChampionPortraitPopup | null;
  /** A stat was learned just now: the `!` settles in with one glow (JP3). */
  fresh?: boolean;
  /** The question on screen is about one of this champion's stats. */
  focused?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const current = popup?.current ?? null;
  const [picked, setPicked] = useState<number | null>(current);
  // The sheet follows the board: a new state on screen resets the choice to it.
  useEffect(() => { setPicked(current); }, [current]);
  const checkpoints = popup?.checkpoints ?? [];
  const cp = checkpoints.find((c) => c.node === picked) ?? checkpoints.find((c) => c.node === current) ?? null;
  const learned = popup?.learned ?? false;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="journey-portrait-btn" data-testid={testId}
          data-learned={learned ? "true" : undefined} data-focus={focused ? "true" : undefined}
          aria-label={`${side.championName} stats${learned ? ", learned facts" : ""}`}>
          <JourneyPortrait side={side} />
          {learned && (
            <span aria-hidden data-testid={`${testId}-mark`} data-just-learned={fresh ? "true" : undefined}
              className="journey-know journey-know--portrait">!</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" sideOffset={6} collisionPadding={8}
        data-testid={`${testId}-sheet`} aria-label={`${side.championName} stats`}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="journey-know-pop journey-portrait-popup w-[min(16.5rem,calc(100vw-16px))] p-0">
        <div className="journey-portrait-popup__head">
          <span className="journey-portrait-popup__title">
            {side.championName}{cp ? <span className="journey-portrait-popup__lv"> · Lv {cp.level}</span> : null}
          </span>
          {checkpoints.length > 1 ? (
            <label className="journey-portrait-popup__state">
              <span className="sr-only">Journey state</span>
              <select data-testid={`${testId}-state`} value={cp?.node ?? ""}
                onChange={(e) => setPicked(Number(e.target.value))}>
                {checkpoints.map((c) => (
                  <option key={c.node} value={c.node}>{checkpointLabel(c, c.node === current)}</option>
                ))}
              </select>
              <ChevronDown aria-hidden className="journey-portrait-popup__state-chev" strokeWidth={2.5} />
            </label>
          ) : (
            <span className="journey-portrait-popup__state journey-portrait-popup__state--fixed">Current state</span>
          )}
        </div>
        {/* The served transition that led into this state ("Leona buys Cloth Armor."). */}
        {cp?.note && <p className="journey-portrait-popup__note" data-testid={`${testId}-note`}>{cp.note}</p>}
        <ul className="journey-portrait-popup__rows" data-testid={`${testId}-rows`} data-node={cp?.node}>
          {PORTRAIT_POPUP_STATS.map((stat) => (
            <Row key={`${cp?.node}:${stat}`} stat={stat} entry={cp?.entries[stat]} testId={`${testId}-row-${stat}`} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
