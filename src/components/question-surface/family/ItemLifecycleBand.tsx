/**
 * Item lifecycle band (RA7) — purchase history and sell-swap scenarios.
 *
 * The premise of these families is a TRANSACTION over time: what the champion
 * started with, what survived, what they bought, what they gave up. The backend
 * has stated each item's stage since RA5, but the shipped presentation was one
 * undifferentiated "Loadout · Items" row plus a temporary icon strip whose
 * status treatment was a tint and an overlay — deliberately not a finished
 * treatment, and unable to show chronology at all.
 *
 * This band draws the chronology as the premise sentence reads it:
 *
 *     STARTED WITH        KEPT           BOUGHT          SOLD
 *     [Doran's Ring]      [Large Rod]    [Malignance]    [Doran's Ring ⨯]
 *
 * Each stage is a WORD, not a colour: the treatments (a faded, struck tile for
 * a sold item; a restrained rim for a purchase) reinforce a label that is
 * always present in text, so nothing is communicated by appearance alone.
 *
 * It shows no quantity, reads no correctness field, and receives no reveal
 * state — the stat being asked about (gold spent, total AP) is the ANSWER and
 * never appears here. Its inputs cannot change during a round, so its geometry
 * is identical before selection, after selection and after the reveal.
 */

import type {
  LifecycleEntry,
  LifecycleFamilyLayout,
} from "@/lib/question-surface/familyLayout";
import type { MediaEntityStatus } from "@/components/quiz-broadcast/scenario-cards/questionMediaEntities";
import { BandLabel, EntityTile, FamilyBandFrame } from "./familyBandPrimitives";

/** The stage heading, as the premise phrases it. */
const STAGE_HEADING: Record<MediaEntityStatus, string> = {
  starting: "Started with",
  current: "Has",
  retained: "Kept",
  purchased: "Bought",
  sold: "Sold",
};

/** The stage inside a sentence, for the spoken summary and per-item labels. */
const STAGE_PHRASE: Record<MediaEntityStatus, string> = {
  starting: "started with",
  current: "has",
  retained: "kept",
  purchased: "bought",
  sold: "sold",
};

/** An item's full history as words, e.g. "started with, then sold". */
export function entryHistory(entry: LifecycleEntry): string {
  return entry.statuses.map((s) => STAGE_PHRASE[s]).join(", then ");
}

/**
 * The spoken form of the transaction. Stage by stage, in the same order the
 * band draws, so a screen-reader user gets the chronology rather than a list of
 * item names whose grouping is purely visual.
 */
export function lifecycleSummary(layout: LifecycleFamilyLayout): string {
  const who = layout.champion?.name ?? "The champion";
  const stages = layout.groups.map((group) => {
    const names = group.entries
      // An item with a history is named with it, so the sentence carries the
      // same "started with, then sold" the visual caption does.
      .map((e) =>
        e.statuses.length > 1 ? `${e.item.name} (${entryHistory(e)})` : e.item.name,
      )
      .join(", ");
    return `${STAGE_PHRASE[group.status]} ${names}`;
  });
  return `${who} ${stages.join("; ")}.`;
}

function StageColumn({
  status,
  entries,
}: {
  status: MediaEntityStatus;
  entries: LifecycleEntry[];
}) {
  const sold = status === "sold";
  return (
    <div
      data-testid={`lifecycle-stage-${status}`}
      data-stage={status}
      className="flex min-w-0 flex-col gap-1"
    >
      <BandLabel>{STAGE_HEADING[status]}</BandLabel>
      <div className="flex flex-col gap-1">
        {entries.map((entry) => (
          <div
            key={String(entry.item.id ?? entry.item.name)}
            data-testid="lifecycle-item"
            data-item-status={status}
            className="flex min-w-0 items-center gap-1.5"
          >
            <EntityTile
              icon={entry.item.icon}
              name={entry.item.name}
              size="sm"
              faded={sold}
              struck={sold}
              accent={status === "purchased" ? "positive" : "gold"}
            />
            <div className="min-w-0">
              <div
                className={`truncate text-[11px] font-semibold leading-tight ${
                  sold ? "text-white/45 line-through decoration-[#ff9b9b]/80" : "text-white/90"
                }`}
              >
                {entry.item.name}
              </div>
              {/* An item with a history renders ONCE, in the stage it ends in,
                  and says how it got there — two tiles of the same icon in two
                  columns would read as two items rather than one item's story. */}
              {entry.statuses.length > 1 && (
                <div
                  data-testid="lifecycle-item-history"
                  className="truncate text-[10px] font-medium leading-tight text-white/45"
                >
                  {entryHistory(entry)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ItemLifecycleBand({ layout }: { layout: LifecycleFamilyLayout }) {
  const { champion, groups } = layout;
  return (
    <FamilyBandFrame
      testId="family-band-lifecycle"
      label="Item transactions"
      summary={lifecycleSummary(layout)}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {champion && (
          <div className="flex min-w-0 items-center gap-2">
            <EntityTile
              icon={champion.icon}
              name={champion.name}
              shape="round"
              size="lg"
            />
            <div className="min-w-0">
              <BandLabel>Inventory</BandLabel>
              <div className="truncate text-sm font-bold leading-tight text-white">
                {champion.name}
              </div>
            </div>
          </div>
        )}
        {/* Stages wrap as a group so a four-stage premise reflows onto a second
            line on a narrow viewport instead of scrolling sideways. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-2">
          {groups.map((group) => (
            <StageColumn key={group.status} status={group.status} entries={group.entries} />
          ))}
        </div>
      </div>
    </FamilyBandFrame>
  );
}
