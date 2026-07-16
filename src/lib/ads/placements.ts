/**
 * Central registry of ad placements.
 *
 * Every mountable ad location in the product must be declared here. Pages
 * never invent placement strings — they import `AdPlacement` and pass a
 * registered id to `<AdSlot>`. Unknown ids are rejected at type level and,
 * defensively, at runtime by the policy resolver.
 *
 * This is provider-neutral infrastructure: no Google/AdSense code or ids
 * live here. See docs/advertising.md.
 */

export type AdPlacement =
  | "lol_hub_mid"
  | "quiz_selection_lower"
  | "quiz_results"
  | "daily_challenge_results"
  | "ranked_queue"
  | "ranked_results"
  | "combat_results"
  | "docs_inline"
  | "docs_sidebar"
  | "profile_history"
  | "broadcast_below"
  // Typed targets for the legacy compatibility gate (useLegacyAdGate) —
  // rendered by the pre-existing Swipe/blog surfaces, not by <AdSlot>.
  | "swipe_interstitial"
  | "blog_inline";

export type AdSurface =
  | "hub"
  | "quiz"
  | "ranked"
  | "combat"
  | "docs"
  | "profile"
  | "broadcast"
  | "swipe"
  | "blog";

export interface AdPlacementMeta {
  /** Human-readable name for admin/docs/analytics. */
  label: string;
  surface: AdSurface;
  /** Reserved height (px) applied ONLY when a visible unit renders. */
  minHeight: number;
  /** House promotions may render here. */
  allowHouse: boolean;
  /** A third-party provider may EVENTUALLY mount here (still gated by flags). */
  allowThirdParty: boolean;
  /** Show the dashed dev placeholder when placeholders are enabled. */
  devPlaceholder: boolean;
  /** Frequency/state caveats for future integrators. */
  notes?: string;
}

export const AD_PLACEMENTS: Record<AdPlacement, AdPlacementMeta> = {
  lol_hub_mid: {
    label: "League hub — between sections",
    surface: "hub",
    minHeight: 120,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
  },
  quiz_selection_lower: {
    label: "Quiz set selection — below the set list",
    surface: "quiz",
    minHeight: 100,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
    notes: "Selection screen only. Never eligible once a question is active.",
  },
  quiz_results: {
    label: "Quiz results — below score summary",
    surface: "quiz",
    minHeight: 120,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
  },
  daily_challenge_results: {
    label: "Daily challenge results — below outcome",
    surface: "quiz",
    minHeight: 120,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
  },
  ranked_queue: {
    label: "Ranked queue — outside queue controls",
    surface: "ranked",
    minHeight: 100,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
    notes:
      "Ranked currently ships only as the /dev/ranked-duel staff prototype; not mounted anywhere yet.",
  },
  ranked_results: {
    label: "Ranked results — below outcome and rating",
    surface: "ranked",
    minHeight: 120,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
    notes:
      "Never during active rounds, round transitions, or reconnect/recovery. Not mounted yet.",
  },
  combat_results: {
    label: "Combat Lab results — below final state",
    surface: "combat",
    minHeight: 120,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
  },
  docs_inline: {
    label: "League Docs — after intro content",
    surface: "docs",
    minHeight: 100,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
  },
  docs_sidebar: {
    label: "League Docs — sidebar",
    surface: "docs",
    minHeight: 250,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
    notes: "No stable sidebar layout exists yet; registered for the future.",
  },
  profile_history: {
    label: "Profile — below history",
    surface: "profile",
    minHeight: 100,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: true,
    notes: "Not mounted yet.",
  },
  broadcast_below: {
    label: "Broadcast public viewer — below player",
    surface: "broadcast",
    minHeight: 100,
    allowHouse: true,
    allowThirdParty: false,
    devPlaceholder: true,
    notes:
      "Public viewer only. Never in Broadcast Studio or OBS-rendered views. Not mounted yet.",
  },
  swipe_interstitial: {
    label: "Swipe game — interstitial between matches",
    surface: "swipe",
    minHeight: 0,
    allowHouse: true,
    allowThirdParty: true,
    devPlaceholder: false,
    notes:
      "Legacy surface: frequency, mode, and creatives come from app_settings/ad_creatives via useAdSystem; layout is owned by SwipeAd/SwipeAdCard. Policy-gated via useLegacyAdGate.",
  },
  blog_inline: {
    label: "Blog post — author-placed inline unit",
    surface: "blog",
    minHeight: 100,
    allowHouse: false,
    allowThirdParty: true,
    devPlaceholder: true,
    notes: "Legacy surface: rendered by the blog adsense block via GatedAdBanner.",
  },
};

export function isKnownPlacement(id: string): id is AdPlacement {
  return Object.prototype.hasOwnProperty.call(AD_PLACEMENTS, id);
}
