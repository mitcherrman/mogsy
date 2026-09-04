/**
 * Mogzy's OWN community channels — the destinations the Academy invites people
 * to, as opposed to the socials a *user* pins on their profile (those live in
 * `src/lib/social-validators.ts` and are unrelated).
 *
 * Every channel is resolved from the environment and **all of them are unset
 * today**: an audit of the repository on 2026-09-04 found no Mogzy-owned
 * Discord invite, YouTube channel, TikTok, Instagram or X handle anywhere —
 * not in `site-config.ts`, not in `.env`/`.env.example`, not in `index.html`.
 * The hub therefore renders the channels it can prove exist and says plainly
 * that the rest are not open yet, rather than shipping a link to nowhere.
 *
 * Turning one on is a deploy-time change, not a code change: set the matching
 * `VITE_COMMUNITY_*_URL` and the section links it automatically.
 *
 * A value that is not an absolute `https:` URL is treated as absent. That is
 * deliberate — a typo'd or placeholder value must fail closed to "not open
 * yet", never to a broken link on the front page.
 */

export type CommunityChannelId = "discord" | "youtube" | "tiktok" | "instagram" | "x";

export type CommunityChannel = {
  id: CommunityChannelId;
  /** Name shown to the user. */
  label: string;
  /** Env var an operator sets to switch this channel on. */
  envVar: string;
  /** Resolved destination, or `null` when the channel is not open yet. */
  url: string | null;
};

const CHANNEL_ENV: Record<CommunityChannelId, { label: string; envVar: string }> = {
  discord: { label: "Discord", envVar: "VITE_COMMUNITY_DISCORD_URL" },
  youtube: { label: "YouTube", envVar: "VITE_COMMUNITY_YOUTUBE_URL" },
  tiktok: { label: "TikTok", envVar: "VITE_COMMUNITY_TIKTOK_URL" },
  instagram: { label: "Instagram", envVar: "VITE_COMMUNITY_INSTAGRAM_URL" },
  x: { label: "X", envVar: "VITE_COMMUNITY_X_URL" },
};

/** Presentation order. Discord leads because it is the primary call to action. */
export const COMMUNITY_CHANNEL_ORDER: CommunityChannelId[] = [
  "discord",
  "youtube",
  "tiktok",
  "instagram",
  "x",
];

/** `https:` only. `http:` and every other scheme (including `javascript:`) is refused. */
function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Pure resolver, so the fail-closed rule is testable without touching `import.meta`. */
export function resolveCommunityChannels(
  env: Record<string, unknown> = {},
): CommunityChannel[] {
  return COMMUNITY_CHANNEL_ORDER.map((id) => ({
    id,
    label: CHANNEL_ENV[id].label,
    envVar: CHANNEL_ENV[id].envVar,
    url: normalizeUrl(env[CHANNEL_ENV[id].envVar]),
  }));
}

export const COMMUNITY_CHANNELS: CommunityChannel[] = resolveCommunityChannels(
  import.meta.env as unknown as Record<string, unknown>,
);

export function communityChannel(id: CommunityChannelId): CommunityChannel {
  // The map is built from COMMUNITY_CHANNEL_ORDER, so every id is present.
  return COMMUNITY_CHANNELS.find((c) => c.id === id)!;
}

/** The secondary row — everything except the Discord headline. */
export function secondaryCommunityChannels(
  channels: CommunityChannel[] = COMMUNITY_CHANNELS,
): CommunityChannel[] {
  return channels.filter((c) => c.id !== "discord");
}
