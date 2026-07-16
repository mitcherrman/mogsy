/**
 * Minimal internal house promotions.
 *
 * These are ordinary product recommendations, not paid ads, and are never
 * styled to imitate an external advertisement. Pro users only see creatives
 * with `showToPro: true` (never the "remove ads" upsell).
 */

import type { AdPlacement } from "./placements";

export interface HouseAdCreative {
  id: string;
  title: string;
  body: string;
  ctaText: string;
  /** Internal route only — house promos never link off-site. */
  to: string;
  showToPro: boolean;
}

const PRO_UPSELL: HouseAdCreative = {
  id: "pro-upgrade",
  title: "Go ad-free with Mogzy Pro",
  body: "Support the project and remove third-party ads everywhere.",
  ctaText: "Upgrade to Pro",
  to: "/lol/pro",
  showToPro: false,
};

const COMBAT_LAB: HouseAdCreative = {
  id: "explore-combat-lab",
  title: "Explore Combat Lab",
  body: "Simulate full item builds and duels with real champion math.",
  ctaText: "Open Combat Lab",
  to: "/combat-lab",
  showToPro: true,
};

const DAILY_CHALLENGE: HouseAdCreative = {
  id: "daily-challenge",
  title: "Today's Daily Challenge",
  body: "One fresh set of questions every day. Keep your streak alive.",
  ctaText: "Play the Daily",
  to: "/quiz",
  showToPro: true,
};

const QUIZ_HISTORY: HouseAdCreative = {
  id: "quiz-history",
  title: "Review your quiz history",
  body: "See what you missed and where your knowledge is strongest.",
  ctaText: "View history",
  to: "/lol/history",
  showToPro: true,
};

const HOUSE_ADS: Partial<Record<AdPlacement, HouseAdCreative[]>> = {
  lol_hub_mid: [DAILY_CHALLENGE, COMBAT_LAB],
  quiz_selection_lower: [PRO_UPSELL, COMBAT_LAB],
  quiz_results: [PRO_UPSELL, QUIZ_HISTORY, COMBAT_LAB],
  daily_challenge_results: [PRO_UPSELL, QUIZ_HISTORY],
  ranked_queue: [DAILY_CHALLENGE],
  ranked_results: [PRO_UPSELL, QUIZ_HISTORY],
  combat_results: [PRO_UPSELL, DAILY_CHALLENGE],
  docs_inline: [PRO_UPSELL, COMBAT_LAB],
  docs_sidebar: [COMBAT_LAB],
  profile_history: [DAILY_CHALLENGE],
};

/**
 * Deterministic pick (first eligible) — no rotation/campaign system yet.
 * Returns null when nothing is appropriate for this viewer.
 */
export function pickHouseAd(placement: AdPlacement, isPro: boolean): HouseAdCreative | null {
  const candidates = HOUSE_ADS[placement] ?? [];
  return candidates.find((c) => !isPro || c.showToPro) ?? null;
}
