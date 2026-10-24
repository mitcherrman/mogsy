/**
 * Community challenge — "the vessel".
 *
 * A crystal vessel fills toward the shared goal with a slow liquid swell; the
 * tally counts up beside it. The Join action is inert for a sample.
 */
import { motion } from "framer-motion";

import type { ChallengeItem } from "../model/pulse-types";
import { CountUp, EASE_OUT, Kicker, pop, rise, sceneRoot, type SceneProps } from "./scene-kit";

export default function ChallengeScene({ item, reduced }: SceneProps<ChallengeItem>) {
  const frac = Math.min(1, item.current / item.target);
  const pct = Math.round(frac * 100);
  return (
    <motion.div className="apulse-scene apulse-challenge" variants={sceneRoot(0.15, 0.09)}>
      <motion.div
        className="apulse-vessel"
        role="img"
        aria-label={`${pct}% of the goal reached`}
        variants={{
          enter: { opacity: 0, y: 18, rotate: -6 },
          show: { opacity: 1, y: 0, rotate: 0, transition: { duration: 0.7, ease: EASE_OUT } },
          exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
        }}
      >
        <span className="apulse-vessel-glass" aria-hidden>
          <motion.span
            className="apulse-vessel-fill"
            variants={{
              enter: { height: "0%" },
              show: { height: `${pct}%`, transition: { delay: 0.5, duration: 1.6, ease: EASE_OUT } },
              exit: { opacity: 0 },
            }}
          >
            <span className="apulse-wave" />
          </motion.span>
        </span>
        <span className="apulse-vessel-pct" aria-hidden>{pct}%</span>
      </motion.div>

      <div className="apulse-stack apulse-challenge-text">
        <Kicker>Community challenge</Kicker>
        <motion.h3 variants={rise} className="apulse-title">{item.name}</motion.h3>
        <motion.p variants={rise} className="apulse-tally">
          <CountUp to={item.current} reduced={reduced} delay={0.5} duration={1.6} className="apulse-tally-num" />
          <span className="apulse-muted"> / {item.target.toLocaleString("en-US")}</span>
        </motion.p>
        <motion.p variants={rise} className="apulse-body apulse-hide-short">{item.goalLabel}</motion.p>
        <motion.div variants={pop} className="apulse-actions">
          <span className="apulse-chip">{item.endsLabel}</span>
          <button type="button" className="apulse-btn apulse-btn-ghost" disabled={!item.href} title={item.href ? undefined : "Sample challenge: nothing to join"}>
            Join
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
