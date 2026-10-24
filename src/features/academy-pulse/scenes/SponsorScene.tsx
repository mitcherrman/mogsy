/**
 * Sponsor — "the billboard".
 *
 * Deliberately calmer than the editorial scenes and visibly different: a
 * silver frame instead of gold, a permanent SPONSORED band, the sponsor's name
 * beside it, and the campaign artwork on its own plate. A placeholder campaign
 * (no `href`) shows its action inert and says why.
 */
import { motion } from "framer-motion";

import type { SponsorItem } from "../model/pulse-types";
import { EASE_OUT, fade, pop, rise, sceneRoot, type SceneProps } from "./scene-kit";

export default function SponsorScene({ item, onInteract }: SceneProps<SponsorItem>) {
  return (
    <motion.div className="apulse-scene apulse-sponsor" variants={sceneRoot(0.2, 0.09)}>
      <motion.p variants={fade} className="apulse-sponsored-band">
        <span>Sponsored</span>
        <span className="apulse-sponsor-name">{item.sponsorName}</span>
      </motion.p>
      <motion.div
        className="apulse-sponsor-art"
        variants={{
          enter: { opacity: 0, x: 30 },
          show: { opacity: 1, x: 0, transition: { duration: 0.8, ease: EASE_OUT } },
          exit: { opacity: 0, transition: { duration: 0.2 } },
        }}
      >
        {item.artUrl ? (
          <img src={item.artUrl} alt={`${item.sponsorName} campaign artwork`} draggable={false} />
        ) : (
          <span className="apulse-sponsor-placeholder" role="img" aria-label="Placeholder campaign artwork">
            <span className="apulse-sponsor-grid" aria-hidden />
            <span className="apulse-sponsor-ph-label" aria-hidden>Campaign art</span>
          </span>
        )}
      </motion.div>
      <div className="apulse-stack apulse-sponsor-text">
        <motion.h3 variants={rise} className="apulse-title apulse-title-sm">{item.campaignTitle}</motion.h3>
        <motion.p variants={rise} className="apulse-body apulse-hide-short">{item.tagline}</motion.p>
        <motion.div variants={pop} className="apulse-actions">
          {item.href ? (
            <a
              href={item.href}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="apulse-btn apulse-btn-silver"
              onClick={onInteract}
              data-testid="pulse-sponsor-cta"
            >
              {item.ctaLabel}
            </a>
          ) : (
            <button type="button" className="apulse-btn apulse-btn-silver" disabled aria-describedby={`${item.id}-inert`} data-testid="pulse-sponsor-cta">
              {item.ctaLabel}
            </button>
          )}
          {!item.href && <span id={`${item.id}-inert`} className="apulse-note">No sponsor connected</span>}
        </motion.div>
      </div>
    </motion.div>
  );
}
