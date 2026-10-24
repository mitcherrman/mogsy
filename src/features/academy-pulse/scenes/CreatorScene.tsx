/**
 * Creator spotlight — "the screen".
 *
 * The thumbnail switches on like an old crystal screen (a line of light that
 * opens to the full picture); a YouTube video wears its duration, a Twitch
 * stream a pulsing LIVE pill and its audience. Only a still is drawn here:
 * Watch opens the expanded viewer, which alone may load a player. A creator's
 * challenge is offered as its own entry beneath.
 */
import { motion } from "framer-motion";

import { youtubeThumbnail } from "../model/pulse-embed";
import type { CreatorItem } from "../model/pulse-types";
import { ChampionArt, EASE_OUT, Kicker, pop, rise, sceneRoot, usePulseArt, type SceneProps } from "./scene-kit";

export default function CreatorScene({ item, onExpand }: SceneProps<CreatorItem>) {
  const art = usePulseArt();
  const { media } = item;
  const thumb = media.thumbnailUrl
    ?? (media.platform === "youtube" ? youtubeThumbnail(media.videoId) : null)
    ?? art.championSplash(media.thumbnailChampion);

  return (
    <motion.div className="apulse-scene apulse-creator" data-platform={media.platform} variants={sceneRoot(0.45, 0.08)}>
      <motion.button
        type="button"
        className="apulse-screen"
        onClick={onExpand}
        aria-label={`Watch ${media.title} by ${item.creatorName}`}
        data-testid="pulse-creator-watch"
        variants={{
          enter: { opacity: 0, scaleY: 0.02, scaleX: 0.6, filter: "brightness(4)" },
          show: {
            opacity: 1, scaleY: 1, scaleX: 1, filter: "brightness(1)",
            transition: { scaleX: { duration: 0.25 }, scaleY: { delay: 0.2, duration: 0.45, ease: EASE_OUT }, filter: { delay: 0.3, duration: 0.6 }, opacity: { duration: 0.15 } },
          },
          exit: { opacity: 0, scaleY: 0.02, transition: { duration: 0.22 } },
        }}
      >
        <ChampionArt src={thumb} className="apulse-screen-img" />
        <span className="apulse-screen-glass" aria-hidden />
        <span className="apulse-play" aria-hidden>
          <svg viewBox="0 0 24 24" focusable="false"><path d="M8 5.5v13l11-6.5z" /></svg>
        </span>
        {media.platform === "youtube" ? (
          <span className="apulse-duration" aria-hidden>{media.durationLabel}</span>
        ) : media.live ? (
          <span className="apulse-live" aria-hidden><i />Live · {media.viewersLabel}</span>
        ) : null}
        <span className="apulse-platform" aria-hidden>{media.platform === "youtube" ? "YouTube" : "Twitch"}</span>
      </motion.button>

      <div className="apulse-stack apulse-creator-text">
        <Kicker>{item.creatorTag}</Kicker>
        <motion.p variants={rise} className="apulse-title apulse-title-sm">{item.creatorName}</motion.p>
        <motion.p variants={rise} className="apulse-body apulse-clamp-2">{media.title}</motion.p>
        <motion.div variants={pop} className="apulse-actions">
          {item.challenge ? (
            <button type="button" className="apulse-btn apulse-btn-ghost" onClick={onExpand} data-testid="pulse-creator-challenge">
              {item.challenge.title}
            </button>
          ) : (
            <button type="button" className="apulse-btn apulse-btn-ghost" onClick={onExpand}>
              {media.platform === "twitch" ? "Watch stream" : "Watch"}
            </button>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
