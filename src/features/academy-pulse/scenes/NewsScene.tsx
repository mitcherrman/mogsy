/**
 * News & events — "the broadcast".
 *
 * A champion splash drifts behind a scanline; the headline is struck in by a
 * light wipe while a signal bar runs along the bottom. An Event carries a live
 * countdown instead of a dateline. The full announcement opens in the
 * expanded view.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import type { NewsItem } from "../model/pulse-types";
import { ChampionArt, EASE_OUT, Kicker, fade, pop, rise, sceneRoot, usePulseArt, wipe, type SceneProps } from "./scene-kit";

export function countdownParts(targetIso: string, now: number): { d: number; h: number; m: number; s: number } | null {
  const t = Date.parse(targetIso);
  if (!Number.isFinite(t) || t <= now) return null;
  let rest = Math.floor((t - now) / 1000);
  const d = Math.floor(rest / 86400); rest -= d * 86400;
  const h = Math.floor(rest / 3600); rest -= h * 3600;
  const m = Math.floor(rest / 60);
  return { d, h, m, s: rest - m * 60 };
}

function Countdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const parts = countdownParts(startsAt, now);
  if (!parts) return <p className="apulse-chip">Starting now</p>;
  const cells: [string, number][] = [["days", parts.d], ["hrs", parts.h], ["min", parts.m], ["sec", parts.s]];
  return (
    <div className="apulse-countdown" role="timer" aria-label={`Starts in ${parts.d} days, ${parts.h} hours and ${parts.m} minutes`}>
      {cells.map(([unit, v]) => (
        <span key={unit} className="apulse-count-cell" aria-hidden>
          <b>{String(v).padStart(2, "0")}</b>
          <i>{unit}</i>
        </span>
      ))}
    </div>
  );
}

export default function NewsScene({ item, onExpand }: SceneProps<NewsItem>) {
  const art = usePulseArt();
  return (
    <motion.div className="apulse-scene apulse-news" data-variant={item.variant} variants={sceneRoot(0.15, 0.09)}>
      <motion.div
        className="apulse-news-art"
        aria-hidden
        variants={{
          enter: { opacity: 0, scale: 1.18 },
          show: { opacity: 1, scale: 1.04, transition: { duration: 1.6, ease: EASE_OUT } },
          exit: { opacity: 0, transition: { duration: 0.25 } },
        }}
      >
        <ChampionArt src={art.championSplash(item.artChampion)} className="apulse-news-splash" />
        <span className="apulse-scan" />
      </motion.div>

      <div className="apulse-stack apulse-news-text">
        <Kicker>
          <span className="apulse-live-dot" aria-hidden /> {item.kicker}
        </Kicker>
        <motion.h3 variants={wipe} className="apulse-title apulse-title-lg">{item.headline}</motion.h3>
        <motion.p variants={rise} className="apulse-body apulse-hide-short">{item.summary}</motion.p>
        {item.variant === "event" && item.startsAt ? (
          <motion.div variants={pop}><Countdown startsAt={item.startsAt} /></motion.div>
        ) : (
          <motion.p variants={fade} className="apulse-dateline">{item.dateLabel}</motion.p>
        )}
        <motion.div variants={pop} className="apulse-actions">
          <button type="button" className="apulse-btn apulse-btn-ghost" onClick={onExpand} data-testid="pulse-news-open">
            {item.ctaLabel}
          </button>
        </motion.div>
      </div>
      <span className="apulse-signal-bar" aria-hidden />
    </motion.div>
  );
}
