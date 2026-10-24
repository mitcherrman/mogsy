/**
 * Academy Pulse — creator spotlights (YouTube videos / Shorts, Twitch channels).
 *
 * Turns an approved `CreatorRecord` into the `CreatorItem` the PULSE-1
 * Creator scene and `PulseVideoViewer` already draw. The media is reduced to
 * a validated id / login, so the existing `embedUrl` / `platformUrl` build the
 * player and the watch link; nothing the owner typed is used as a URL.
 */
import type { CreatorItem, CreatorMedia } from "../../model/pulse-types";
import type { ChallengeSource } from "./creator-challenge";
import { CHALLENGE_SOURCES, validateCreatorChallenge } from "./creator-challenge";
import type { CreatorRecord, PartnerOmission, TwitchLiveEvidence } from "./partner-contract";
import { DEFAULT_PARTNER_IMAGE_HOSTS, TEXT_LIMITS, cleanText, parseInstant, safeImageSrc } from "./partner-validate";
import { decideLive, parseTwitchChannelUrl } from "./twitch";
import { parseYouTubeUrl, youtubeDurationLabel } from "./youtube";

export interface CreatorOptions {
  now: number;
  liveEvidence?: readonly TwitchLiveEvidence[];
  trustedLiveSources?: ReadonlySet<TwitchLiveEvidence["source"]>;
  liveMaxAgeMs?: number;
  imageHosts?: readonly string[];
  challengeSources?: Readonly<Record<string, ChallengeSource>>;
}

export type CreatorDecision =
  | { ok: true; item: CreatorItem; validUntil: number | null; notes: PartnerOmission[] }
  | { ok: false; omission: PartnerOmission };

export function validateCreator(rec: CreatorRecord, opts: CreatorOptions): CreatorDecision {
  const rid = String(rec.id);
  const omit = (reason: PartnerOmission["reason"], detail: string): CreatorDecision => ({ ok: false, omission: { recordId: rid, scope: "item", reason, detail } });
  const { now } = opts;

  const approvedAt = rec.approval ? parseInstant(rec.approval.approvedAt) : null;
  if (rec.status !== "approved" || !rec.approval || !cleanText(rec.approval.approvedBy, 200) || approvedAt === null || approvedAt > now) {
    return omit("not-approved", `Creator status is "${rec.status}"${rec.approval ? "" : " with no approval"}.`);
  }

  let validUntil: number | null = null;
  if (rec.activeFrom !== undefined || rec.activeUntil !== undefined) {
    const from = rec.activeFrom === undefined ? -Infinity : parseInstant(rec.activeFrom);
    const until = rec.activeUntil === undefined ? Infinity : parseInstant(rec.activeUntil);
    if (from === null || until === null || until <= from) return omit("invalid-window", "Feature window is malformed or inverted.");
    if (now < from || now >= until) return omit("outside-window", now < from ? "Feature has not started." : "Feature has ended.");
    if (Number.isFinite(until)) validUntil = until;
  }

  const id = cleanText(rec.id, 80);
  const creatorName = cleanText(rec.creatorName, TEXT_LIMITS.name);
  const creatorTag = cleanText(rec.creatorTag, TEXT_LIMITS.tag);
  const title = cleanText(rec.media?.title, TEXT_LIMITS.title);
  if (!id || !creatorName || !creatorTag || !title) return omit("invalid-text", "A display field is empty, too long or contains control characters.");

  const hosts = opts.imageHosts ?? DEFAULT_PARTNER_IMAGE_HOSTS;
  let customThumb: string | null = null;
  if (rec.media.thumbnailUrl !== undefined) {
    customThumb = safeImageSrc(rec.media.thumbnailUrl, hosts);
    if (!customThumb) return omit("invalid-thumbnail", "Custom still is not a same-origin path or an allowed image host.");
  }

  const notes: PartnerOmission[] = [];
  let media: CreatorMedia;
  if (rec.media.platform === "youtube") {
    const yt = parseYouTubeUrl(rec.media.url);
    if (!yt) return omit("invalid-media-url", "Not a YouTube video or Short URL.");
    media = {
      platform: "youtube",
      videoId: yt.videoId,
      title,
      durationLabel: youtubeDurationLabel(yt.format, rec.media.durationSeconds),
      thumbnailUrl: customThumb ?? yt.thumbnailUrl,
    };
  } else if (rec.media.platform === "twitch") {
    const login = parseTwitchChannelUrl(rec.media.channelUrl);
    if (!login) return omit("invalid-media-url", "Not a Twitch channel URL.");
    const live = decideLive(login, opts.liveEvidence ?? [], { now, trustedSources: opts.trustedLiveSources, maxAgeMs: opts.liveMaxAgeMs });
    if (!live.live && (live.reason === "untrusted" || live.reason === "stale" || live.reason === "malformed")) {
      notes.push({
        recordId: rid,
        scope: "field",
        reason: live.reason === "untrusted" ? "live-evidence-untrusted" : "live-evidence-stale",
        detail: "Live state not shown: evidence is untrusted, stale or malformed.",
      });
    }
    if (live.validUntil !== null) validUntil = validUntil === null ? live.validUntil : Math.min(validUntil, live.validUntil);
    media = {
      platform: "twitch",
      channel: login,
      title,
      live: live.live,
      viewersLabel: live.live ? live.viewersLabel : "",
      thumbnailUrl: customThumb,
      thumbnailChampion: cleanText(rec.media.artChampion, 40) ?? undefined,
    };
  } else {
    return omit("invalid-media-url", "Unsupported platform.");
  }

  let challenge: CreatorItem["challenge"] = null;
  if (rec.challenge) {
    const c = validateCreatorChallenge(rec.challenge, opts.challengeSources ?? CHALLENGE_SOURCES);
    if (c.ok) challenge = c.challenge;
    else notes.push({ recordId: rid, scope: "field", reason: c.reason, detail: c.detail });
  }

  const fixture = rec.provenance?.source !== "owner-entry";
  if (fixture) {
    // samples connect to nothing (the PULSE-1 fixture rule): the viewer shows its labelled stand-in player
    media = media.platform === "youtube"
      ? { ...media, videoId: null, thumbnailUrl: customThumb }
      : { ...media, channel: null };
  }
  const item: CreatorItem = {
    id: `partner-creator-${id}`,
    kind: "creator",
    category: "creator-spotlight",
    provenance: fixture ? "fixture" : "live",
    title: `${creatorName}: ${title}`,
    creatorName,
    creatorTag,
    media,
    challenge,
  };
  return { ok: true, item, validUntil, notes };
}
