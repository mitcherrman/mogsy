/**
 * Ticker — every scene, for short glass.
 *
 * On the shortest laptop screens the Orrery's column leaves Pulse little more
 * than a strip of glass. There a full scene would be cramped, so each item is
 * shown as one broadcast line instead: the scene's sigil, its kicker, its one
 * sentence, and Open, which shows the full scene in the expanded view. The
 * rotation, cadence and controls are unchanged.
 */
import { motion } from "framer-motion";

import { pulseItemLabel } from "../content/live/live-items";
import type { PulseItem, PulseSceneKind } from "../model/pulse-types";
import { EASE_OUT, fade, pop, rise, sceneRoot, type SceneProps } from "./scene-kit";

const SIGIL: Record<PulseSceneKind, string> = {
  activity: "M12 2.5 14.6 8l6 .7-4.5 4.1 1.2 5.9L12 15.8l-5.3 2.9 1.2-5.9L3.4 8.7l6-.7z",
  minigame: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2v7l5 3",
  leaderboard: "M4 20V11h4v9M10 20V5h4v15M16 20v-6h4v6",
  news: "M4 6h16M4 11h16M4 16h10",
  premium: "M12 3 20 10 12 21 4 10z",
  sponsor: "M4 7h16v10H4zM4 7l8 6 8-6",
  creator: "M5 6h14v12H5zM10 9.5v5l4.5-2.5z",
  insight: "M4 18l5-6 4 3 7-9",
  question: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01",
  challenge: "M9 3h6M10 3v5L6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2L14 8V3",
};

export default function TickerScene({ item, onExpand }: SceneProps<PulseItem>) {
  return (
    <motion.div className="apulse-scene apulse-ticker" data-kind={item.kind} variants={sceneRoot(0.05, 0.07)}>
      <motion.span
        className="apulse-ticker-sigil"
        aria-hidden
        variants={{
          enter: { opacity: 0, scale: 0.4, rotate: -60 },
          show: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 0.6, ease: EASE_OUT } },
          exit: { opacity: 0, scale: 0.7, transition: { duration: 0.18 } },
        }}
      >
        <svg viewBox="0 0 24 24" focusable="false"><path d={SIGIL[item.kind]} /></svg>
      </motion.span>
      <div className="apulse-stack apulse-ticker-text">
        <motion.p variants={fade} className="apulse-kicker">{pulseItemLabel(item)}</motion.p>
        <motion.p variants={rise} className="apulse-ticker-line">{item.title}</motion.p>
      </div>
      <motion.button variants={pop} type="button" className="apulse-btn apulse-btn-ghost" onClick={onExpand} data-testid="pulse-ticker-open">
        Open
      </motion.button>
    </motion.div>
  );
}
