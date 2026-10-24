/**
 * Academy Pulse — the expanded video / stream viewer.
 *
 * Opens on a still. A real video or channel loads its player only when the
 * viewer presses Play (no third-party frame before that), and Academy Radio
 * yields for as long as it plays. A sample (no video connected) shows a
 * clearly labelled stand-in player so the flow and the radio hand-off can be
 * reviewed without inventing a real creator's content.
 */
import { useEffect, useState } from "react";

import { embedUrl, platformUrl, youtubeThumbnail } from "./model/pulse-embed";
import type { CreatorItem } from "./model/pulse-types";
import { ChampionArt, usePulseArt } from "./scenes/scene-kit";
import { useRadioYield } from "./useRadioYield";

export default function PulseVideoViewer({ item, reduced }: { item: CreatorItem; reduced: boolean }) {
  const art = usePulseArt();
  const { media } = item;
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const src = embedUrl(media, host);
  const external = platformUrl(media);
  const [playing, setPlaying] = useState(false);
  useRadioYield(playing);

  const thumb = media.thumbnailUrl
    ?? (media.platform === "youtube" ? youtubeThumbnail(media.videoId) : null)
    ?? art.championSplash(media.thumbnailChampion);
  const platformName = media.platform === "youtube" ? "YouTube" : "Twitch";

  // the stand-in's progress, so a sample "plays" visibly (and stops at the end)
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!playing || src) return;
    const id = window.setInterval(() => setT((v) => Math.min(100, v + 0.5)), 100);
    return () => window.clearInterval(id);
  }, [playing, src]);
  useEffect(() => {
    if (t < 100) return;
    setPlaying(false);
    setT(0);
  }, [t]);

  return (
    <div className="apulse-viewer" data-platform={media.platform} data-playing={playing ? "true" : "false"} data-testid="pulse-viewer">
      <div className="apulse-viewer-frame">
        {playing && src ? (
          <iframe
            src={src}
            title={`${media.title} (${platformName})`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <>
            <ChampionArt src={thumb} className="apulse-viewer-still" />
            {playing && !src && (
              <div className="apulse-viewer-sample" role="status">
                <p>Sample player · no {platformName} {media.platform === "youtube" ? "video" : "channel"} is connected</p>
                <span className="apulse-viewer-progress" aria-hidden><i style={{ width: `${t}%`, transition: reduced ? "none" : undefined }} /></span>
              </div>
            )}
            {!playing && (
              <button type="button" className="apulse-viewer-play" onClick={() => setPlaying(true)} data-testid="pulse-viewer-play">
                <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M8 5.5v13l11-6.5z" /></svg>
                <span>{src ? `Play here` : "Play sample"}</span>
              </button>
            )}
          </>
        )}
      </div>
      <div className="apulse-viewer-bar">
        <p className="apulse-viewer-meta">
          <b>{item.creatorName}</b> · {media.title}
          {item.provenance === "fixture" && <span className="apulse-sample-inline">Preview sample</span>}
        </p>
        <div className="apulse-actions">
          {playing && (
            <button type="button" className="apulse-btn apulse-btn-ghost" onClick={() => setPlaying(false)} data-testid="pulse-viewer-stop">
              Stop
            </button>
          )}
          {external ? (
            <a href={external} target="_blank" rel="noopener noreferrer" className="apulse-btn apulse-btn-ghost" onClick={() => setPlaying(false)}>
              Open on {platformName}
            </a>
          ) : (
            <span className="apulse-note">Opens on {platformName} once a real {media.platform === "youtube" ? "video" : "channel"} is connected</span>
          )}
        </div>
      </div>
      <p className="apulse-note apulse-viewer-radio" aria-live="polite">
        {playing ? "Academy Radio is paused while this plays." : "Academy Radio pauses while you watch."}
      </p>
    </div>
  );
}
