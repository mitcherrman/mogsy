/**
 * Academy Pulse — external players.
 *
 * Compact scenes only ever draw a still thumbnail. An embedded player is built
 * here, and only when the viewer asks to watch in the expanded view: nothing
 * from YouTube or Twitch loads during the Orrery's startup.
 */
import type { CreatorMedia } from "./pulse-types";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_CHANNEL = /^[A-Za-z0-9_]{3,25}$/;

/** The privacy-enhanced YouTube player, or null when the media has no real video. */
export function embedUrl(media: CreatorMedia, parentHost: string): string | null {
  if (media.platform === "youtube") {
    if (!media.videoId || !YOUTUBE_ID.test(media.videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${media.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  }
  if (!media.channel || !TWITCH_CHANNEL.test(media.channel) || !parentHost) return null;
  const parent = encodeURIComponent(parentHost);
  return `https://player.twitch.tv/?channel=${encodeURIComponent(media.channel)}&parent=${parent}&autoplay=true`;
}

/** The page on the platform itself, or null for a sample. */
export function platformUrl(media: CreatorMedia): string | null {
  if (media.platform === "youtube") {
    return media.videoId && YOUTUBE_ID.test(media.videoId) ? `https://www.youtube.com/watch?v=${media.videoId}` : null;
  }
  return media.channel && TWITCH_CHANNEL.test(media.channel) ? `https://www.twitch.tv/${media.channel}` : null;
}

/** YouTube's own still for a real video (used when the item carries no thumbnail). */
export function youtubeThumbnail(videoId: string | null): string | null {
  return videoId && YOUTUBE_ID.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}
