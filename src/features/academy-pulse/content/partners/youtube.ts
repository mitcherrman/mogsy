/**
 * Academy Pulse — YouTube videos and Shorts.
 *
 * Parses the URL forms people actually paste and reduces every one of them to
 * an 11-character video id, from which the watch page, the still and (in
 * `model/pulse-embed.ts`) the privacy-enhanced player are all derived. The
 * owner's URL is never echoed back as a link.
 *
 * What this cannot know without the YouTube Data API (an API key): whether the
 * video still exists, is public or embeddable, its real title, or its
 * duration. Those are owner-entered or unknown; see the P2C handoff.
 */

/** The same id rule as `model/pulse-embed.ts`. */
export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const NOCOOKIE_HOSTS = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);

export interface YouTubeRef {
  videoId: string;
  /** `short` only when the URL was a /shorts/ link: a /watch link to a Short cannot be told apart offline. */
  format: "video" | "short";
  watchUrl: string;
  /** YouTube's own 480×360 still. It exists for every video (higher resolutions do not always). */
  thumbnailUrl: string;
}

/** A YouTube video or Short from a pasted URL, or null when it is not one. */
export function parseYouTubeUrl(raw: string): YouTubeRef | null {
  if (typeof raw !== "string" || raw.length > 2048 || raw.trim() !== raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  let id: string | null = null;
  let format: YouTubeRef["format"] = "video";
  if (host === "youtu.be") {
    id = segments.length === 1 ? segments[0] : null;
  } else if (WATCH_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === "watch") id = url.searchParams.get("v");
    else if (segments.length === 2 && segments[0] === "shorts") {
      id = segments[1];
      format = "short";
    } else if (segments.length === 2 && (segments[0] === "embed" || segments[0] === "live")) id = segments[1];
  } else if (NOCOOKIE_HOSTS.has(host)) {
    if (segments.length === 2 && segments[0] === "embed") id = segments[1];
  }
  if (!id || !YOUTUBE_VIDEO_ID.test(id)) return null;
  return {
    videoId: id,
    format,
    watchUrl: format === "short" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/**
 * The scene's corner label. A Short says so; a known running time reads
 * "m:ss" / "h:mm:ss"; an unknown one says "Video" rather than inventing a length.
 */
export function youtubeDurationLabel(format: YouTubeRef["format"], durationSeconds: number | undefined): string {
  if (format === "short") return "Short";
  if (durationSeconds === undefined || !Number.isInteger(durationSeconds) || durationSeconds <= 0 || durationSeconds > 24 * 3600) {
    return "Video";
  }
  const h = Math.floor(durationSeconds / 3600);
  const m = Math.floor((durationSeconds % 3600) / 60);
  const s = durationSeconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
