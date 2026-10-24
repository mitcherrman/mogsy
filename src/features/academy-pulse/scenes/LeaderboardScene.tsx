/**
 * Leaderboard — "the ascent".
 *
 * Rows cascade into the standings in their earlier order; a beat later the
 * climbing player slides up through the others (a real layout animation, so
 * every row reflows) trailing gold, and an ▲ badge counts the places gained.
 * Any row can be inspected: a card turns in over the list with that player's
 * detail. Player identities are data-ready (id, name, mascot, profile link)
 * so a live board drops in unchanged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";

import type { LeaderboardEntry, LeaderboardItem } from "../model/pulse-types";
import { EASE_OUT, Kicker, MASCOT_NAME, mascotSrc, rise, sceneRoot, slideIn, type SceneProps } from "./scene-kit";

/** The order before the climb: the mover back at its earlier rank. */
export function preMovementOrder(entries: readonly LeaderboardEntry[], movement: LeaderboardItem["movement"]): LeaderboardEntry[] {
  if (!movement) return [...entries];
  const out = [...entries];
  const [mover] = out.splice(movement.toRank - 1, 1);
  out.splice(Math.min(movement.fromRank - 1, out.length), 0, mover);
  return out;
}

const CLIMB_DELAY_MS = 1500;

export default function LeaderboardScene({ item, reduced, onInteract }: SceneProps<LeaderboardItem>) {
  const [climbed, setClimbed] = useState(reduced || !item.movement);
  const [inspect, setInspect] = useState<LeaderboardEntry | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (climbed) return;
    const t = window.setTimeout(() => setClimbed(true), CLIMB_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [climbed]);

  const rows = useMemo(
    () => (climbed ? item.entries : preMovementOrder(item.entries, item.movement)),
    [climbed, item.entries, item.movement],
  );
  const moverId = item.movement ? item.entries[item.movement.toRank - 1]?.player.id : null;
  const gained = item.movement ? item.movement.fromRank - item.movement.toRank : 0;

  return (
    <motion.div className="apulse-scene apulse-board" variants={sceneRoot(0.05, 0.06)}>
      <div className="apulse-board-head">
        <Kicker>{item.board}</Kicker>
        <motion.span variants={rise} className="apulse-chip">{item.period}</motion.span>
      </div>
      <LayoutGroup>
        <ol className="apulse-board-list" aria-label={`${item.board} standings, ${item.period}`}>
          {rows.map((e, i) => {
            const isMover = e.player.id === moverId;
            return (
              <motion.li
                key={e.player.id}
                layout={reduced ? false : "position"}
                transition={{ layout: { duration: 0.9, ease: EASE_OUT } }}
                variants={slideIn}
                className="apulse-board-row"
                data-rank={i + 1}
                data-mover={isMover ? (climbed ? "arrived" : "waiting") : undefined}
              >
                <button
                  type="button"
                  className="apulse-board-hit"
                  onClick={(ev) => { trigger.current = ev.currentTarget; setInspect(e); onInteract(); }}
                  aria-label={`Inspect ${e.player.displayName}, rank ${i + 1}, ${e.score.toLocaleString("en-US")} points`}
                  data-testid={`pulse-board-row-${i + 1}`}
                >
                  <span className="apulse-rank" aria-hidden>
                    {i === 0 ? (
                      <svg viewBox="0 0 24 24" className="apulse-crown" focusable="false"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>
                    ) : i + 1}
                  </span>
                  <img className="apulse-avatar" src={mascotSrc(e.player.mascot)} alt="" draggable={false} />
                  <span className="apulse-board-name">{e.player.displayName}</span>
                  {isMover && climbed && gained > 0 && (
                    <motion.span
                      className="apulse-climb"
                      initial={{ opacity: 0, y: 6, scale: 0.6 }}
                      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: reduced ? 0 : 0.55, type: "spring", stiffness: 420, damping: 20 } }}
                      aria-hidden
                    >
                      ▲{gained}
                    </motion.span>
                  )}
                  <span className="apulse-board-score">{e.score.toLocaleString("en-US")}</span>
                </button>
              </motion.li>
            );
          })}
        </ol>
      </LayoutGroup>

      <AnimatePresence>
        {inspect && (
          <motion.div
            key={inspect.player.id}
            className="apulse-inspect"
            role="dialog"
            aria-label={`${inspect.player.displayName} details`}
            initial={{ opacity: 0, x: 40, rotateY: -25 }}
            animate={{ opacity: 1, x: 0, rotateY: 0, transition: { duration: 0.45, ease: EASE_OUT } }}
            exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
          >
            <img className="apulse-inspect-mascot" src={mascotSrc(inspect.player.mascot)} alt="" draggable={false} />
            <div className="apulse-stack">
              <p className="apulse-kicker">Rank {item.entries.findIndex((x) => x.player.id === inspect.player.id) + 1} · {MASCOT_NAME[inspect.player.mascot]}</p>
              <p className="apulse-title apulse-title-sm">{inspect.player.displayName}</p>
              {inspect.detail && (
                <dl className="apulse-stats">
                  <div><dt>Accuracy</dt><dd>{inspect.detail.accuracyPct}%</dd></div>
                  <div><dt>Streak</dt><dd>{inspect.detail.streak}d</dd></div>
                  <div><dt>Best at</dt><dd>{inspect.detail.favouriteSubject}</dd></div>
                </dl>
              )}
            </div>
            <button
              type="button"
              className="apulse-icon-btn apulse-inspect-close"
              onClick={() => { setInspect(null); onInteract(); trigger.current?.focus(); }}
              aria-label="Close player details"
              data-testid="pulse-board-inspect-close"
              autoFocus
            >
              <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
