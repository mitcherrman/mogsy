/**
 * Player activity — "the medallion forge".
 *
 * The player's chosen Mogzy rises inside a forged medallion while its rune
 * rings draw themselves; the achievement's name wipes in, the score counts up
 * on a sealed plate and the tier seal stamps down in a burst of motes.
 * Exploring the achievement turns the medallion over: criteria and rarity.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { ActivityItem } from "../model/pulse-types";
import {
  CountUp,
  EASE_OUT,
  Kicker,
  MASCOT_NAME,
  Motes,
  RuneRings,
  fade,
  mascotSrc,
  pop,
  rise,
  sceneRoot,
  wipe,
  type SceneProps,
} from "./scene-kit";

const TIER_LABEL: Record<ActivityItem["achievement"]["tier"], string> = {
  gold: "Gold",
  silver: "Silver",
  crystal: "Crystal",
};

export default function ActivityScene({ item, reduced, onInteract }: SceneProps<ActivityItem>) {
  const [open, setOpen] = useState(false);
  const { player, achievement, score } = item;
  const toggle = () => { setOpen((v) => !v); onInteract(); };

  return (
    <motion.div className="apulse-scene apulse-activity" data-tier={achievement.tier} variants={sceneRoot(0.1)}>
      <motion.button
        type="button"
        className="apulse-medallion"
        variants={{
          enter: { opacity: 0, scale: 0.4, rotate: -40 },
          show: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 0.9, ease: EASE_OUT } },
          exit: { opacity: 0, scale: 0.7, transition: { duration: 0.22 } },
        }}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`${item.id}-detail`}
        aria-label={open ? `Hide ${achievement.name} details` : `Explore ${achievement.name}`}
        data-testid="pulse-activity-explore"
      >
        <RuneRings className="apulse-medallion-runes" />
        <span className="apulse-medallion-disc" aria-hidden />
        <motion.img
          className="apulse-medallion-mascot"
          src={mascotSrc(player.mascot)}
          alt=""
          draggable={false}
          variants={{
            enter: { opacity: 0, y: 26 },
            show: { opacity: 1, y: 0, transition: { delay: 0.35, duration: 0.7, ease: EASE_OUT } },
            exit: { opacity: 0, transition: { duration: 0.15 } },
          }}
        />
        <motion.span
          className="apulse-seal"
          aria-hidden
          variants={{
            enter: { opacity: 0, scale: 2.4, rotate: -25 },
            show: { opacity: 1, scale: 1, rotate: -8, transition: { delay: 1.35, type: "spring", stiffness: 520, damping: 18 } },
            exit: { opacity: 0, transition: { duration: 0.15 } },
          }}
        >
          <svg viewBox="0 0 24 24" focusable="false"><path d="M12 2.5 14.6 8l6 .7-4.5 4.1 1.2 5.9L12 15.8l-5.3 2.9 1.2-5.9L3.4 8.7l6-.7z" /></svg>
        </motion.span>
        <span className="apulse-burst" aria-hidden><Motes reduced={reduced} count={12} /></span>
      </motion.button>

      <div className="apulse-activity-text">
        <AnimatePresence mode="wait">
          {!open ? (
            <motion.div key="front" className="apulse-stack" variants={sceneRoot(0.25, 0.08)} initial="enter" animate="show" exit="exit">
              <Kicker>Achievement unlocked</Kicker>
              <motion.h3 variants={wipe} className="apulse-title apulse-gold-text">{achievement.name}</motion.h3>
              <motion.p variants={rise} className="apulse-byline">
                <span className="apulse-player">{player.displayName}</span>
                <span className="apulse-dot" aria-hidden>·</span>
                <span className="apulse-muted">{MASCOT_NAME[player.mascot]}</span>
              </motion.p>
              <motion.div variants={pop} className="apulse-score-plate">
                <CountUp to={score.value} reduced={reduced} delay={0.6} className="apulse-score-value" />
                <span className="apulse-score-label">{score.label}</span>
              </motion.div>
              <motion.p variants={fade} className="apulse-context apulse-hide-short">{achievement.context}</motion.p>
            </motion.div>
          ) : (
            <motion.div
              key="back"
              id={`${item.id}-detail`}
              className="apulse-stack apulse-detail"
              initial={{ opacity: 0, rotateY: -60 }}
              animate={{ opacity: 1, rotateY: 0, transition: { duration: 0.45, ease: EASE_OUT } }}
              exit={{ opacity: 0, rotateY: 60, transition: { duration: 0.2 } }}
            >
              <p className="apulse-kicker">{TIER_LABEL[achievement.tier]} achievement</p>
              <p className="apulse-detail-desc">{achievement.description}</p>
              <ul className="apulse-criteria">
                {achievement.criteria.map((c) => <li key={c}>{c}</li>)}
              </ul>
              {achievement.rarityPct !== null && (
                <div className="apulse-rarity" aria-label={`Held by ${achievement.rarityPct}% of players (sample figure)`}>
                  <span className="apulse-rarity-bar"><i style={{ width: `${Math.max(3, achievement.rarityPct)}%` }} /></span>
                  <span className="apulse-muted">{achievement.rarityPct}% hold it</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
