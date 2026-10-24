/**
 * Premium — "the vault".
 *
 * A Hextech crest's two shutters swing open on a column of light; the
 * benefits ignite one after another, each a real row of the canonical Premium
 * matrix (resolved by the provider — this scene never writes a claim), and the
 * gold action settles beneath them.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import type { PremiumItem } from "../model/pulse-types";
import { EASE_OUT, Kicker, Motes, RuneRings, pop, rise, sceneRoot, wipe, type SceneProps } from "./scene-kit";

export default function PremiumScene({ item, reduced, onInteract }: SceneProps<PremiumItem>) {
  return (
    <motion.div className="apulse-scene apulse-premium" variants={sceneRoot(0.55, 0.16)}>
      <motion.div
        className="apulse-vault"
        aria-hidden
        variants={{
          enter: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
          exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
        }}
      >
        <span className="apulse-vault-beam" />
        <RuneRings className="apulse-vault-runes" />
        <svg className="apulse-vault-gem" viewBox="0 0 60 80" focusable="false">
          <defs>
            <linearGradient id="apulse-gem" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff4d6" />
              <stop offset="0.45" stopColor="#f2c56b" />
              <stop offset="1" stopColor="#8a5a1c" />
            </linearGradient>
          </defs>
          <path d="M30 4 54 28 30 76 6 28z" fill="url(#apulse-gem)" />
          <path d="M30 4 40 28 30 76 20 28z" fill="#fff" opacity="0.28" />
          <path d="M6 28h48" stroke="#fff6dc" strokeWidth="1.2" opacity="0.7" />
        </svg>
        <motion.span
          className="apulse-shutter apulse-shutter-l"
          variants={{
            enter: { rotateY: 0, opacity: 1 },
            show: { rotateY: -105, opacity: 0, transition: { delay: 0.25, duration: 0.9, ease: EASE_OUT, opacity: { delay: 0.75, duration: 0.4 } } },
            exit: { rotateY: 0, transition: { duration: 0.2 } },
          }}
        />
        <motion.span
          className="apulse-shutter apulse-shutter-r"
          variants={{
            enter: { rotateY: 0, opacity: 1 },
            show: { rotateY: 105, opacity: 0, transition: { delay: 0.25, duration: 0.9, ease: EASE_OUT, opacity: { delay: 0.75, duration: 0.4 } } },
            exit: { rotateY: 0, transition: { duration: 0.2 } },
          }}
        />
        <span className="apulse-burst"><Motes reduced={reduced} count={10} /></span>
      </motion.div>

      <div className="apulse-stack apulse-premium-text">
        <Kicker>Mogzy Premium</Kicker>
        <motion.h3 variants={wipe} className="apulse-title apulse-gold-text">{item.headline}</motion.h3>
        <ul className="apulse-benefits">
          {item.benefits.map((b) => (
            <motion.li key={b.id} variants={rise} title={b.summary}>
              <span className="apulse-benefit-spark" aria-hidden />
              {b.label}
            </motion.li>
          ))}
        </ul>
        <motion.div variants={pop} className="apulse-actions">
          <Link to={item.ctaHref} className="apulse-btn apulse-btn-gold" onClick={onInteract} data-testid="pulse-premium-cta">
            {item.ctaLabel}
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
