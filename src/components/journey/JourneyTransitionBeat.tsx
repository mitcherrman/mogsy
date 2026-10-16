/**
 * JOURNEY-UI1 / JOURNEY-MOTION-V1 — the transition beat, drawn ON the board.
 *
 * MOTION-V1: no scrim. The updated board stays fully visible and the objects
 * that changed animate in place (index.css `.journey-board[data-beat=active]`):
 * the level number rolls, a new rank pip fills, an unlocked R lights up, a new
 * item pops into its slot with the server's stat line beside it. The only
 * visible words are ONE compact stamp in the board's header
 * (`JourneyBeatStamp`, e.g. "Lv 6 · R unlocked"), so a player never looks at
 * an empty "transition screen" wondering whether the game froze.
 *
 * The full per-event lines — champion, item, stat line — are kept for
 * assistive tech in a visually hidden status region (`JourneyTransitionBeat`),
 * which also carries the full stamp words. Neither adds height or moves
 * anything. Both are mounted only while the server's beat runs; its LENGTH is
 * the server's (`beat.until`) whatever the motion preference.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { JourneyPublicState } from "@/lib/journey/contract";
import { journeySide } from "@/lib/journey/contract";
import { beatShortStamp, beatStamps, eventLine } from "@/lib/journey/beat";
import { formatStatGain, JOURNEY_STAT_META } from "@/lib/journey/stats";

/** The visible stamp, in the board's header row (replaces the node label while the beat runs). */
export function JourneyBeatStamp({ state }: { state: JourneyPublicState }) {
  const reduce = useReducedMotion();
  if (!state.transition) return null;
  return (
    <motion.span data-testid="journey-beat-stamp" aria-hidden
      className="journey-beat__stamp rounded-[4px] border border-[#8fd0a0]/60 bg-[#8fd0a0]/15 px-1 font-black uppercase text-[#d9f2df]"
      initial={reduce ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}>
      {beatShortStamp(state.transition)}
    </motion.span>
  );
}

/** The beat's status region: every event line, for screen readers. Lays out nothing. */
export function JourneyTransitionBeat({ state }: { state: JourneyPublicState }) {
  const t = state.transition;
  if (!t) return null;
  const name = (side: "subject" | "opponent") => journeySide(state, side).championName;

  // A real purchase, never an inferred stat or a question answer. Match stat
  // changes to the item the server names (prefer item ID over display name).
  // The full status region below already announces these events to AT.
  const notices = t.events.flatMap((event, index) => event.kind === "purchase"
    ? event.items.map((item) => ({
        key: `${index}:${event.side}:${item.slot}`,
        headline: `${name(event.side)} ${event.group === "recall" ? "recalls" : "buys"} ${item.name}`,
        gains: t.events.flatMap((change) => {
          if (change.kind !== "stat_change" || change.side !== event.side) return [];
          const matches = change.sourceItemId != null
            ? item.itemId != null && change.sourceItemId === item.itemId
            : change.source === item.name;
          return matches ? [`${formatStatGain(change.delta, change.key)} ${JOURNEY_STAT_META[change.key].short}`] : [];
        }),
      }))
    : []);

  return (
    <>
      {/* Centered over the board seam, NOT the answer grid. It has no layout
          footprint, no pointer target, and lasts only for the server's beat. */}
      {notices.length > 0 && (
        <div className="journey-beat__purchases" data-testid="journey-purchase-notices" aria-hidden="true">
          {notices.map((notice) => (
            <div key={notice.key} className="journey-beat__purchase" data-testid="journey-purchase-notice">
              <span className="journey-beat__purchase-headline">{notice.headline}</span>
              {notice.gains.length > 0 && (
                <span className="journey-beat__purchase-gains">{notice.gains.join(" · ")}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div data-testid="journey-beat" role="status" aria-live="polite" className="journey-beat sr-only">
        {beatStamps(t).map((w, i) => (
          <span key={w}>{i > 0 && <span> · </span>}<span className="journey-beat__word">{w}</span></span>
        ))}
        <ul>
          {t.events.map((e, i) => (
            <li key={i} data-testid="journey-beat-line" className="journey-beat__line">{eventLine(e, name)}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
