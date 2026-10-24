/**
 * Academy Pulse — the content model.
 *
 * Pulse separates three things that must never know about each other:
 *
 *   CONTENT     what there is to show (a `PulseCatalogue`, from a provider)
 *   CADENCE     in which order categories take turns (`PulseCadence`)
 *   PRESENTATION the scene components, which only ever receive one item
 *
 * A *category* is a cadence slot ("sponsor", "leaderboard", …); a *kind* is the
 * scene component that draws an item. Several categories may share one kind
 * (an Event is drawn by the News scene), and any item inside a category can be
 * swapped without touching the cadence or the scenes.
 *
 * PROVENANCE. Every item says where it came from. `fixture` items are
 * development samples: the shell labels them on screen, and nothing about them
 * may be presented as real public activity. A future live provider sets `live`.
 */

export type PulseCategory =
  | "player-activity"
  | "mini-game"
  | "sponsor"
  | "leaderboard"
  | "news"
  | "premium"
  | "personal-insight"
  | "educational"
  | "creator-spotlight"
  | "community-challenge"
  | "event";

export type PulseSceneKind =
  | "activity"
  | "minigame"
  | "leaderboard"
  | "news"
  | "premium"
  | "sponsor"
  | "creator"
  | "insight"
  | "question"
  | "challenge";

export type PulseProvenance = "fixture" | "live";

/** Compact Mogzy poses (each has a small WebP derivative): a player's chosen mascot. */
export type PulseMascot = "base" | "cheering" | "thinking" | "explaining" | "holdingBook" | "peeking" | "raisingHand";

/** A player as Pulse shows one. `profileHref` is null for samples (nothing to open). */
export interface PulsePlayer {
  id: string;
  displayName: string;
  mascot: PulseMascot;
  profileHref: string | null;
}

interface ItemBase<K extends PulseSceneKind> {
  id: string;
  kind: K;
  category: PulseCategory;
  provenance: PulseProvenance;
  /** One sentence for assistive technology and the expanded view's heading. */
  title: string;
  /** Overrides the kind's default dwell (ms). */
  dwellMs?: number;
}

export interface ActivityItem extends ItemBase<"activity"> {
  player: PulsePlayer;
  achievement: {
    name: string;
    description: string;
    tier: "gold" | "silver" | "crystal";
    /** e.g. "Daily Challenge · 11 of 11" */
    context: string;
    criteria: string[];
    /** Share of players holding it, 0..100, or null when unknown. */
    rarityPct: number | null;
  };
  score: { value: number; label: string };
}

export interface MiniGameItem extends ItemBase<"minigame"> {
  name: string;
  tagline: string;
  /** The demo is a timing dial: the gold window, in degrees of a full sweep. */
  demo: { windowStartDeg: number; windowSizeDeg: number; sweepMs: number };
  playHref: string;
  playLabel: string;
}

export interface LeaderboardEntry {
  player: PulsePlayer;
  score: number;
  /** Optional detail for the inspect card. */
  detail?: { accuracyPct: number; streak: number; favouriteSubject: string };
}

export interface LeaderboardItem extends ItemBase<"leaderboard"> {
  board: string;
  period: string;
  /** Ranked AFTER the movement (index 0 = #1). */
  entries: LeaderboardEntry[];
  /** The climb the scene animates: the entry now at `toRank` was at `fromRank`. */
  movement: { fromRank: number; toRank: number } | null;
  href: string | null;
}

export interface NewsItem extends ItemBase<"news"> {
  variant: "announcement" | "event";
  kicker: string;
  headline: string;
  summary: string;
  body: string[];
  dateLabel: string;
  /** Champion whose art backs the scene (manifest name), optional. */
  artChampion?: string;
  /** Event countdown target (ISO). */
  startsAt?: string;
  href: string | null;
  ctaLabel: string;
}

export interface PremiumBenefitView {
  id: string;
  label: string;
  summary: string;
}

export interface PremiumItem extends ItemBase<"premium"> {
  headline: string;
  /** Resolved from the canonical Premium matrix by the provider; never written by hand. */
  benefits: PremiumBenefitView[];
  ctaHref: string;
  ctaLabel: string;
}

export interface SponsorItem extends ItemBase<"sponsor"> {
  sponsorName: string;
  campaignTitle: string;
  tagline: string;
  /** Campaign artwork; `null` draws the neutral placeholder plate. */
  artUrl: string | null;
  ctaLabel: string;
  /** Null for a placeholder campaign: the CTA is shown inert. */
  href: string | null;
}

export type CreatorMedia =
  | {
      platform: "youtube";
      /** Null for a sample: no real video is connected. */
      videoId: string | null;
      title: string;
      durationLabel: string;
      /** Thumbnail: a URL, or a champion splash from the manifest. */
      thumbnailUrl: string | null;
      thumbnailChampion?: string;
    }
  | {
      platform: "twitch";
      /** Null for a sample: no real channel is connected. */
      channel: string | null;
      title: string;
      live: boolean;
      viewersLabel: string;
      thumbnailUrl: string | null;
      thumbnailChampion?: string;
    };

export interface CreatorItem extends ItemBase<"creator"> {
  creatorName: string;
  creatorTag: string;
  media: CreatorMedia;
  challenge: { title: string; detail: string; href: string | null } | null;
}

export interface InsightItem extends ItemBase<"insight"> {
  headline: string;
  seriesLabel: string;
  /** Oldest first. */
  series: number[];
  deltaLabel: string;
  milestone: { label: string; current: number; target: number };
  href: string | null;
}

export interface QuestionItem extends ItemBase<"question"> {
  subject: string;
  prompt: string;
  options: { id: string; label: string; champion?: string }[];
  correctId: string;
  explanation: string;
  practiceHref: string;
}

export interface ChallengeItem extends ItemBase<"challenge"> {
  name: string;
  goalLabel: string;
  current: number;
  target: number;
  endsLabel: string;
  href: string | null;
}

export type PulseItem =
  | ActivityItem
  | MiniGameItem
  | LeaderboardItem
  | NewsItem
  | PremiumItem
  | SponsorItem
  | CreatorItem
  | InsightItem
  | QuestionItem
  | ChallengeItem;

/** Everything a provider offers, grouped by cadence category. Order inside a category is the rotation order. */
export type PulseCatalogue = Partial<Record<PulseCategory, readonly PulseItem[]>>;

/** Where content comes from. Phase 1 ships only the fixture provider. */
export interface PulseContentProvider {
  id: string;
  load(signal?: AbortSignal): Promise<PulseCatalogue>;
  /** Content already in hand (fixtures, a warm cache), so the first frame is not empty. */
  peek?(): PulseCatalogue | null;
}

/** Owner-configurable rotation order and guard rails. */
export interface PulseCadence {
  slots: readonly PulseCategory[];
  /** At most this many promotional scenes (sponsor, premium) in one cycle. */
  maxPromotionsPerCycle: number;
  /** Promotional scenes are at least this many positions apart (also across the cycle's wrap). */
  minPromotionGap: number;
}

export const PROMOTIONAL_CATEGORIES: ReadonlySet<PulseCategory> = new Set<PulseCategory>(["sponsor", "premium"]);

export const CATEGORY_LABEL: Record<PulseCategory, string> = {
  "player-activity": "Player activity",
  "mini-game": "Mini-game",
  sponsor: "Sponsored",
  leaderboard: "Leaderboard",
  news: "News",
  premium: "Premium",
  "personal-insight": "Your insight",
  educational: "Quick study",
  "creator-spotlight": "Creator spotlight",
  "community-challenge": "Community goal",
  event: "Event",
};

/** Default time on screen per kind (ms): richer scenes stay longer. */
export const KIND_DWELL_MS: Record<PulseSceneKind, number> = {
  activity: 9000,
  minigame: 11000,
  leaderboard: 10000,
  news: 9000,
  premium: 9500,
  sponsor: 8000,
  creator: 10000,
  insight: 9500,
  question: 12000,
  challenge: 9000,
};

export function dwellFor(item: PulseItem): number {
  return item.dwellMs ?? KIND_DWELL_MS[item.kind];
}
