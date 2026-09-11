/**
 * PT1.13 — THE CANONICAL FREE-vs-PREMIUM MATRIX.
 *
 * ONE PRODUCT-LEVEL SOURCE OF TRUTH for what Free gets, what Mogzy Premium
 * adds, what is actually shipped, and how (or whether) the distinction is
 * enforced. Every user-facing description of the subscription should read
 * from here rather than restating a benefit list of its own — which is how
 * `/lol/premium`, `HubPremiumPanel` and the SEO description drifted apart
 * from each other and from the code.
 *
 * THIS FILE IS NOT AN ENTITLEMENT AUTHORITY, AND MUST NEVER BECOME ONE
 * ────────────────────────────────────────────────────────────────────
 * It DESCRIBES reality; it does not create it. The authority is, and stays:
 *
 *   backend   `services/entitlement.py` — `resolve_capability` →
 *             `Capability(can_build, can_save, can_view_snapshot,
 *             can_view_trends, …)`, composed from PT1.4 effective Pro
 *             (Stripe OR a valid manual grant) in Postgres.
 *   frontend  `@/lib/pro/entitlement` (`effectivePro`) and the server
 *             `capability` object each gated pane already renders from.
 *
 * Nothing in this module is read by a gate, a fetch, a route guard or a
 * paywall. If a future change makes a component branch on a row here to
 * decide ACCESS, that change is a bug: the row would then be a client-side
 * entitlement, and a client-side entitlement is not one.
 * `matrix.test.ts` fences this with a repo-wide import check.
 *
 * HOW A ROW IS WRITTEN
 * ────────────────────
 * `free` and `premium` describe what each tier can DO TODAY, in production.
 * Where they are identical the row still exists and `differentiator` is
 * false — those rows are the most valuable ones in the file, because they
 * are what stops the sales page promising to WITHDRAW something Free
 * already has. (PT1.6 found three such claims live on `/lol/premium`.)
 *
 * `userFacingSummary: null` means DO NOT MARKET THIS. It is the single
 * mechanism that keeps an internal row — a disabled meter, an admin-only
 * API — out of the comparison UI without deleting the knowledge that it
 * exists.
 *
 * PT1.13B — MARKETABLE AND AVAILABLE ARE TWO DIFFERENT QUESTIONS
 * ─────────────────────────────────────────────────────────────
 * PT1.13 conflated them: it withheld every non-`shipped` row, which was the
 * right answer to "may this be advertised as available" and the wrong answer
 * to "may a buyer be told this is coming". The page is now a LIVING
 * CHECKLIST — Free today, Premium today, and Premium soon — so the two
 * questions are asked separately:
 *
 *   `userFacingSummary !== null`   may appear on the page at all
 *   `status === "shipped"`         may appear as AVAILABLE
 *
 * A marketable row that is `partial` or `planned` renders as **Coming soon**,
 * never with a checkmark and never in the hero or the lead cards. When the
 * feature lands, one word changes here — `partial` → `shipped` — and the row
 * moves from the Coming soon treatment to the available one with no edit to
 * the page, the hero, the tests' intent or a second roadmap list. That is the
 * entire point of the phase: there is no roadmap document to fall out of
 * date, because the roadmap IS the matrix.
 *
 * The judgement a status cannot make for you is whether a row is a BENEFIT.
 * Credit metering is a billing mechanism; the Pro Play research API is admin
 * tooling. Both are real, both are `partial`, and neither is something a
 * buyer wants — so both stay `userFacingSummary: null`. "Partial" is not a
 * synonym for "announce it".
 */

/** Where a row belongs in the product, for grouping the comparison. */
export type BenefitGroup =
  | "play"
  | "practice"
  | "analytics"
  | "review"
  | "combat"
  | "proplay"
  | "profile";

/**
 * How real this row is, in production, right now.
 *
 *  `shipped`  a user can do it today on mogzy.lol. The ONLY status that may
 *             render as available.
 *  `partial`  real implementation exists, but the full user-facing feature
 *             is not usable — limited, switched off, or missing a front
 *             door. Renders as "Coming soon" when marketable.
 *  `planned`  does not exist yet. Renders as "Coming soon" when marketable.
 *
 * `partial` and `planned` differ for US, not for the reader: both are
 * "Coming soon" on the page, because a buyer cannot spend a distinction
 * between "the backend is done" and "nothing is written". Keep them apart in
 * the matrix anyway — they are very different amounts of remaining work, and
 * the internal view prints them.
 */
export type BenefitStatus = "shipped" | "partial" | "planned";

/**
 * WHERE the Free/Premium difference is actually imposed.
 *
 *  `backend`      a server gate refuses or projects. The only kind that is a
 *                 security boundary.
 *  `frontend`     a client branch. Cosmetic only — anyone can defeat it, and
 *                 nothing behind it may be worth money on its own.
 *  `both`
 *  `none`         no difference is imposed because there is no difference.
 *  `inert`        gating code exists and is switched OFF platform-wide, so it
 *                 imposes nothing today.
 *  `unreachable`  the surface itself cannot be reached in production.
 */
export type BenefitEnforcement =
  | "backend"
  | "frontend"
  | "both"
  | "none"
  | "inert"
  | "unreachable";

/**
 * Metadata a later contextual upsell needs. PT1.13 deliberately PLACES NONE
 * of these — it only records, per benefit, what an upsell would say and
 * where it would be honest to say it. `surfaces` are product surface ids,
 * not routes, so a placement decision is not baked in here either.
 */
export interface BenefitUpsell {
  /** Button text. Imperative, under ~24 characters. */
  cta: string;
  /** One sentence of value, in the reader's terms. No price, no adjectives. */
  value: string;
  /** Surfaces where this benefit is the thing the reader is already doing. */
  surfaces: readonly string[];
}

export interface PremiumBenefit {
  id: string;
  group: BenefitGroup;
  /** Short product name. This is the row label in every comparison. */
  label: string;
  /** What a Free account can do today. Never aspirational. */
  free: string;
  /** What a Premium account can do today. */
  premium: string;
  status: BenefitStatus;
  enforcement: BenefitEnforcement;
  /** Exactly where the distinction lives, for an engineer. Internal only. */
  enforcementNote: string;
  /** Does Premium differ from Free at all? False rows are anti-claims. */
  differentiator: boolean;
  /**
   * The one-line description a user may be shown, or `null` for
   * "internal knowledge, never marketed". Null is load-bearing.
   *
   * Non-null on a `partial`/`planned` row means "announce this as Coming
   * soon", NOT "announce this". Availability is `status`'s job alone.
   */
  userFacingSummary: string | null;
  /** A true limit a reader deserves to know before paying. */
  caveat?: string;
  /**
   * A live contradiction between what something CLAIMS and what the code
   * does. Surfaced in the internal view; never rendered to a buyer.
   */
  discrepancy?: string;
  upsell?: BenefitUpsell;
}

/**
 * The matrix. Ordered by group, then by how central the row is to that
 * group's story.
 *
 * Audited against production on 2026-09-08: the deployed bundle
 * (`assets/index-rY8NYK-v.js`), the live Railway API, and the
 * `create-checkout` offer catalog.
 */
export const PREMIUM_MATRIX: readonly PremiumBenefit[] = [
  // ─────────────────────────────────────────────────────────── play
  {
    id: "ranked",
    group: "play",
    label: "Ranked",
    free: "Every Ranked match, the full ladder, and permanent question discovery.",
    premium: "The same. Ranked is not metered, shortened or tiered.",
    status: "shipped",
    enforcement: "none",
    enforcementNote:
      "No entitlement call exists anywhere under ranked_public/ or routes/ranked_public.py.",
    differentiator: false,
    userFacingSummary: "Ranked play is complete on Free — matches, ladder and discovery.",
  },
  {
    id: "time-trial",
    group: "play",
    label: "Time Trial",
    free: "Every official run, the streak, and the personal best.",
    premium: "The same.",
    status: "shipped",
    enforcement: "none",
    enforcementNote: "routes/daily_score_attack.py calls no entitlement resolver.",
    differentiator: false,
    userFacingSummary: "Time Trial and its streak are free.",
  },
  {
    id: "daily-challenge",
    group: "play",
    label: "Daily Challenge",
    free: "The full daily run.",
    premium: "The same.",
    status: "shipped",
    enforcement: "none",
    enforcementNote:
      "No gate on the Daily Challenge route or its services. Reachable: Quiz.tsx:1404 navigates to /quiz/daily-challenge from the lobby — this is the CURRENT Daily Challenge, not the legacy Daily that was retired from the frontend.",
    differentiator: false,
    userFacingSummary: "The Daily Challenge is free.",
  },

  // ─────────────────────────────────────────────────────── practice
  {
    id: "practice-packs",
    group: "practice",
    label: "Practice sets & subjects",
    free: "Every curated set and every subject on the practice rail.",
    premium: "The same.",
    status: "shipped",
    enforcement: "none",
    enforcementNote:
      "GET /api/quiz/questions?category= is anonymous. PT1.7A restored these to Free.",
    differentiator: false,
    userFacingSummary: "All curated practice sets and subjects are free.",
  },
  {
    id: "practice-builder",
    group: "practice",
    label: "Practice Builder",
    free: "Not available. Free practises the curated sets and subjects.",
    premium:
      "Assemble a session yourself — pick the pool, the category, the difficulty and the length (5–30), then run it.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "services/entitlement.py require_build(); routes/practice_builder.py:225/248/264/396. 403 PREMIUM_REQUIRED.",
    differentiator: true,
    userFacingSummary:
      "Build your own practice session — choose the pool, subject, difficulty and length.",
    upsell: {
      cta: "Build a set",
      value: "Practise exactly the thing you are trying to fix, not a set someone else chose.",
      surfaces: ["quiz-lobby", "practice-rail", "results-screen"],
    },
  },
  {
    id: "practice-pools",
    group: "practice",
    label: "Practice from your own record",
    free: "Not available as a practice source.",
    premium:
      "Draw a session from the questions you own, the ones you have missed, or your weakest categories — not just the open bank.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "Capability.allowed_pools — Free is (), Premium is (bank, owned, missed, weak). Selection SQL in services/practice_builder.py.",
    differentiator: true,
    userFacingSummary:
      "Practise from what you own, what you have missed, or your weakest subjects.",
    upsell: {
      cta: "Practise your misses",
      value: "Turn the questions you got wrong into the set you play next.",
      surfaces: ["review-pane", "missed-bank", "trends-pane"],
    },
  },
  {
    id: "saved-practice-sets",
    group: "practice",
    label: "Saved practice sets",
    free:
      "Cannot create or edit one. Anything already saved stays readable, renameable and deletable forever.",
    premium: "Create and edit up to 100 saved configurations.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "require_save() on create/edit only. services/saved_practice_sets.py deliberately leaves list/read/rename/delete ungated so a lapse destroys nothing.",
    differentiator: true,
    userFacingSummary: "Save the sets you build and come back to them.",
    upsell: {
      cta: "Save this set",
      value: "Keep the sessions that work and replay them whenever you want.",
      surfaces: ["practice-builder"],
    },
  },

  // ────────────────────────────────────────────────────── analytics
  {
    id: "performance-snapshot",
    group: "analytics",
    label: "Recent performance",
    free:
      "Your most recent 50 eligible answers: accuracy, days studied, the span they cover, and the same figures per category and per mode — with a warning when a percentage rests on too few answers.",
    premium: "The same figures, kept in full alongside the trend reading.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "PT1.11 — one query, two projections. routes/analytics.py serves both tiers; services/personal_analytics.project_report() applies the SNAPSHOT_* allow-list to Free. Free is bounded by ANSWERS, Premium by DAYS.",
    differentiator: false,
    caveat: "Reads Practice and Time Trial answers. Ranked rounds are not included.",
    userFacingSummary:
      "Your own results are free: your last 50 answers, your accuracy, your study days, and how you did by subject and by mode.",
  },
  {
    id: "performance-trends",
    group: "analytics",
    label: "Performance trends",
    free: "No windows and no comparison — the snapshot is a count of answers, not a period.",
    premium:
      "Choose a 7, 30 or 90-day window, compare it against the period before it, and see whether each subject is improving, steady or declining — with a day-by-day study-volume series.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "Capability.can_view_trends / trend_windows. A window a tier is not offered is 400 INVALID_WINDOW, never clamped. `previous`, `delta`, `series` and every direction field are withheld by the allow-list.",
    differentiator: true,
    caveat: "Reads Practice and Time Trial answers. Ranked rounds are not included.",
    userFacingSummary:
      "See how your accuracy and study volume have moved over 7, 30 or 90 days, and which way each subject is going.",
    upsell: {
      cta: "See your trend",
      value: "Find out whether this week is actually better than the last one.",
      surfaces: ["trends-pane", "results-screen", "knowledge-breakdown"],
    },
  },
  {
    id: "recurring-weaknesses",
    group: "analytics",
    label: "Recurring weaknesses",
    free: "Not available.",
    premium:
      "The subjects that came back weak in both periods — a repeated problem, not one bad session — each with a one-tap handoff into the Practice Builder.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "`recurring_weak` and per-category `is_recurring_weak` are Premium-only fields. PT1.12 CTAs: trends-practise-all → {pool:'weak'}, trends-practise-category → {pool:'bank', category}.",
    differentiator: true,
    caveat:
      "Weak is measured against your own average in the same period, so it names a repeated problem rather than a low score.",
    userFacingSummary:
      "See which weak spots keep coming back, and turn them straight into a practice set.",
    upsell: {
      cta: "Fix what keeps coming back",
      value: "Stop re-learning the same subject by accident.",
      surfaces: ["trends-pane", "knowledge-breakdown", "results-screen"],
    },
  },

  // ───────────────────────────────────────────────────────── review
  {
    id: "study-history",
    group: "review",
    label: "Study history",
    free: "Your 10 most recent completed sessions.",
    premium: "Every session you have ever completed.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "FREE_HISTORY_LIMIT = 10, routes/quiz.py:57. The query is LIMITed server-side; an indeterminate entitlement degrades to the Free limit WITHOUT the upsell rather than showing a paywall.",
    differentiator: true,
    userFacingSummary: "Keep every study session on record, not just the last ten.",
    upsell: {
      cta: "See your full history",
      value: "Your record does not stop ten sessions ago.",
      surfaces: ["history-pane"],
    },
  },
  {
    id: "missed-question-bank",
    group: "review",
    label: "Missed Question Bank",
    free:
      "Review the questions you missed on each results screen, session by session, as you finish them.",
    premium:
      "One bank of every question you have ever missed, across every session, with your answer, the right answer and the explanation.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "routes/quiz.py:926 — non-Premium receives a locked payload carrying NO attempt data. An indeterminate lookup is 503, never the paywall.",
    differentiator: true,
    userFacingSummary:
      "Every question you have ever missed, in one place — with the right answer and why.",
    upsell: {
      cta: "Open your missed bank",
      value: "The questions you got wrong, collected instead of scattered across sessions.",
      surfaces: ["review-pane", "results-screen"],
    },
  },
  {
    id: "question-library",
    group: "review",
    label: "Your question library",
    free: "Every question you have discovered in Ranked, permanently, with an account.",
    premium: "The same. Discoveries are earned, and a lapse never takes one back.",
    status: "shipped",
    enforcement: "none",
    enforcementNote:
      "The library requires an ACCOUNT (403 ACCOUNT_REQUIRED for anonymous), never Premium. No entitlement call on the path.",
    differentiator: false,
    userFacingSummary:
      "Questions you discover in Ranked are yours permanently, on Free and on Premium alike.",
  },

  // ───────────────────────────────────────────────────────── combat
  {
    id: "combat-lab-1v1",
    group: "combat",
    label: "Combat Lab (1v1)",
    free: "Unlimited simulations, and the JSON export, with no account required.",
    premium: "The same.",
    status: "shipped",
    enforcement: "inert",
    enforcementNote:
      "A per-day credit meter exists (services/combat_lab_credits.py) but production app_settings.combat_sim_tokens_required_for_non_pro is {\"enabled\": false}. Live probe 2026-09-08: anonymous GET /api/combat-lab/credits → unlimited:true, tokens_required:false.",
    differentiator: false,
    discrepancy:
      "/lol/premium sells 'Unlimited Combat Lab' and 'Unlimited Saves & Exports' as Premium. Free already has both, unlimited, today — the page promises to withdraw a capability players have.",
    userFacingSummary: "The 1v1 Combat Lab is free and unlimited, exports included.",
  },
  {
    id: "combat-lab-metering",
    group: "combat",
    label: "Combat Lab credit metering",
    free: "Not metered.",
    premium: "Not metered.",
    status: "partial",
    enforcement: "inert",
    enforcementNote:
      "Correct code that is not enforcing. Flipping the app_settings flag would make Free metered and Premium unlimited in one step — which is a PRICING decision, not a deploy.",
    differentiator: false,
    userFacingSummary: null,
  },
  {
    id: "team-combat",
    group: "combat",
    label: "Team Combat",
    free: "Not included.",
    premium: "Simulate whole 3v3 and 5v5 team fights, not just one champion against another.",
    status: "partial",
    enforcement: "backend",
    enforcementNote:
      "Backend READY: /api/combat-lab/team-simulate/readiness/v1 → available (probed 2026-09-08), gated by services/combat_lab_access.py with 402 premium_required and a fail-closed 503 for an indeterminate lookup. Frontend NOT OFFERED: VITE_TEAM_SIM_ENABLED is absent from the production bundle, so /combat-lab/team-sim is unregistered and the Combat Lab entry link is not rendered; the /dev alias is dead-code-eliminated in production builds.",
    differentiator: true,
    discrepancy:
      "The backend flag was turned on (PT1.6 measured it 'unavailable'; it now answers 'available') while the frontend flag stayed off. A shipped, billable, Premium-only feature is currently reachable by nobody. PT1.13B announces it as Coming soon and does NOT enable it; activation is its own pass.",
    userFacingSummary: "Simulate whole 3v3 and 5v5 team fights.",
  },

  // ──────────────────────────────────────────────────────── proplay
  {
    id: "pro-play",
    group: "proplay",
    label: "Pro Play",
    free: "The whole Pro Play surface — the Explorer, dossiers, matchups and Pro Play quizzes.",
    premium: "The same. Pro Play is not the Premium subscription.",
    status: "shipped",
    enforcement: "none",
    enforcementNote:
      "Naming trap: 'Pro' is Pro Play (esports) and 'Premium' is the subscription — docs/naming-premium-vs-pro-play.md. No entitlement call on any public Pro Play route.",
    differentiator: false,
    userFacingSummary: "Pro Play is free, and is not part of the subscription.",
  },
  {
    id: "pro-play-research",
    group: "proplay",
    label: "Pro Play research API",
    free: "Not available.",
    premium: "Not available.",
    status: "partial",
    enforcement: "backend",
    enforcementNote:
      "routes/pro_play_search.py, pro_play_comparison.py and pro_play_worlds_focus.py are admin-gated on purpose — 'whether this is Free, Premium or public belongs to the Premium workstream'. The underlying services carry no gate, so the tier is still an open decision.",
    differentiator: false,
    userFacingSummary: null,
  },

  // ──────────────────────────────────────────────────────── profile
  {
    id: "profile-themes",
    group: "profile",
    label: "Premium profile themes",
    free: "Five profile themes.",
    premium: "Eight further profile themes.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "PT2E: `protect_profile_premium_fields`, the BEFORE UPDATE trigger on profiles, refuses a self-service CHANGE of custom_theme to a Premium theme unless `may_equip_profile_theme` says yes — Global Premium Access OR the canonical PT1.4 per-account rule. Exactly the shape PT2C gave frames, and composed from the same two terms. Acquisition is authorized; the STORED value never is, so a lapsed member keeps the theme they chose and simply cannot switch to another. The free list is STATIC (`FREE_PROFILE_THEMES` in src/lib/profile-themes.ts, restated by `profile_theme_requires_premium`), replacing app_settings.theme_config.free_themes, which let the two halves of the product disagree about which themes were locked.",
    differentiator: true,
    discrepancy:
      "CLOSED, and the feature it gated was redefined at the same time. A profile theme used to be a SITEWIDE theme: `useSitewideTheme` wrote `theme-<custom_theme>` onto <html>, so a paid cosmetic recoloured the Academy entrance, /welcome, /profile, the Ranked tutorial and the admin console, while the modern League surfaces excluded themselves by path. PT2E scoped it to the profile card — the one place it reads as personalisation — and only then added the server gate PT2C named as the next surface of its shape. The onboarding 'pick 1 premium theme to try for free' grant went with it; its whole entitlement was a localStorage key any visitor could write, so it was never a grant a server could honour.",
    userFacingSummary: "Eight more profile themes.",
  },
  {
    id: "profile-frames",
    group: "profile",
    label: "Profile frames",
    free: "The default frame.",
    premium: "Choose any frame.",
    status: "shipped",
    enforcement: "backend",
    enforcementNote:
      "PT2C: `protect_profile_premium_fields`, the BEFORE UPDATE trigger on profiles, refuses a self-service CHANGE of profile_frame to a Premium frame unless `may_equip_profile_frame` says yes — Global Premium Access OR the canonical PT1.4 per-account rule. Profile.tsx still renders the grid only when isPro, but that is now presentation over a server decision rather than the only decision. Acquisition is authorized; the STORED value never is, so a lapsed member keeps the frame they equipped and cannot switch to another — the approved lapse policy, and the same shape the theme picker already had.",
    differentiator: true,
    discrepancy:
      "CLOSED. PT1.13B fixed the client half: the save payload read `profile_frame: isPro ? selectedFrame : \"default\"`, which DESTROYED a lapsed member's stored frame on their next unrelated profile save. PT2C fixed the server half it named as the follow-up — a crafted profiles.update() could set any Premium frame with no entitlement, because cosmetics had no backend gate at all. Both halves turn on the same distinction: the change is authorized, the stored value is not re-authorized. PT2E did the same for themes.",
    userFacingSummary: "Profile frames."
  },
  {
    id: "ad-free",
    group: "profile",
    label: "Ad-free",
    free: "No ads today. Ads are planned, and Free will see them.",
    premium: "No ads, once ads launch.",
    status: "planned",
    enforcement: "inert",
    enforcementNote:
      "src/lib/ads/policy.ts suppresses ads for Premium and is fully tested (fail-closed while a signed-in reader's entitlement is unresolved), but VITE_ADS_ENABLED is absent from the production bundle so the global kill switch is off and no placement renders anything. Third-party additionally requires a CMP that does not exist.",
    differentiator: true,
    caveat: "No ads run anywhere on Mogzy today. This matters once they do.",
    discrepancy:
      "INTENT VERIFIED, NOT ASSUMED (PT1.13B). docs/advertising.md records a real, deliberately preserved AdSense account (ca-pub-9823769047605421) previously declined for site readiness rather than configuration, lists 'request review' as owner action 5 and 'after approval: enable flags deliberately' as owner action 7, and src/lib/ads/houseAds.ts already ships a creative titled 'Go ad-free with Mogzy Premium'. So this is a real intended benefit rather than a stale row — but it is worth nothing until the owner completes those actions, and the caveat says so on the page.",
    userFacingSummary: "No ads, once ads launch.",
  },
  {
    id: "card-animations",
    group: "profile",
    label: "Animated card styles",
    free: "The standard card style.",
    premium: "Animated styles for the cards you play with.",
    status: "partial",
    enforcement: "unreachable",
    enforcementNote:
      "Play.tsx:721 gates animations on an admin-configured pro_only flag and the picker is built, but /play, /swipe and /swipe-game all redirect to /lol under LEAGUE_ONLY_MODE, so no reader can reach the surface they decorate.",
    differentiator: true,
    discrepancy:
      "ANNOUNCED ON THE OWNER'S INSTRUCTION, AND THE WEAKEST ROW ON THE PAGE. Unlike every other Coming soon item, this one is not waiting on its own implementation — it is built. It is waiting on LEAGUE_ONLY_MODE being lifted, i.e. on the whole Swipe/Play product family being un-hidden, for which no phase is scoped. Announcing it commits us to that. Worth revisiting: if Swipe is not coming back, this row should return to internal-only rather than sit on the page indefinitely.",
    userFacingSummary: "Animated styles for the cards you play with.",
  },

  // ──────────────────────────── claimed on the sales page, nonexistent
  {
    id: "curated-learning-journeys",
    group: "practice",
    label: "Learning Journeys",
    free: "Not included.",
    premium: "Guided quiz paths that build a subject up in order, instead of random sets.",
    status: "planned",
    enforcement: "none",
    enforcementNote: "No implementation in either repository. Nothing is scoped.",
    differentiator: true,
    discrepancy:
      "Zero implementation, in either repository, and no phase scoped. PT1.13 removed it from the page as an invented claim; PT1.13B restores it as an explicitly Coming soon checklist item on the owner's instruction. It must never lose that treatment while this row says `planned`.",
    userFacingSummary: "Guided quiz paths that build a subject up in order.",
  },
  {
    id: "earned-matchup-cards",
    group: "practice",
    label: "Matchup Cards",
    free: "Not included.",
    premium: "Beat a matchup set, earn the card for it.",
    status: "planned",
    enforcement: "none",
    enforcementNote: "No implementation in either repository. Nothing is scoped.",
    differentiator: true,
    discrepancy:
      "Zero implementation, in either repository. It was previously in the hero paragraph AND the <meta name=\"description\">, so it was being indexed as a live benefit — PT1.6 found that on 2026-09-04 and it was still live on 2026-09-08. PT1.13B may show it on the checklist as Coming soon, but it must never return to the hero, the lead cards or the page metadata while this row says `planned`.",
    userFacingSummary: "Beat a matchup set, earn the card for it.",
  },
] as const;

/** Group order and the heading each group carries in the comparison. */
export const BENEFIT_GROUPS: readonly { id: BenefitGroup; label: string }[] = [
  { id: "play", label: "Play" },
  { id: "practice", label: "Practice & learning" },
  { id: "analytics", label: "Analytics" },
  { id: "review", label: "History & review" },
  { id: "combat", label: "Combat tools" },
  { id: "proplay", label: "Pro Play" },
  { id: "profile", label: "Profile" },
] as const;

export function benefitById(id: string): PremiumBenefit | undefined {
  return PREMIUM_MATRIX.find((b) => b.id === id);
}

/**
 * Rows a user-facing surface may render AT ALL.
 *
 * One condition, and it is an editorial one: the row's author wrote copy for
 * it. Status is deliberately NOT checked here — a Coming soon item belongs on
 * the checklist. Use :func:`availableBenefits` when you need "usable today".
 */
export function presentableBenefits(): readonly PremiumBenefit[] {
  return PREMIUM_MATRIX.filter((b) => b.userFacingSummary !== null);
}

/**
 * Presentable rows a reader can actually use right now.
 *
 * THE ONLY SET THAT MAY BE RENDERED AS AVAILABLE. The hero, the lead cards
 * and any checkmark treatment draw from this and from nothing else.
 */
export function availableBenefits(): readonly PremiumBenefit[] {
  return presentableBenefits().filter((b) => b.status === "shipped");
}

/**
 * Presentable rows that are announced but not yet usable.
 *
 * `partial` and `planned` collapse into one reader-facing state on purpose —
 * see the status doc. This is the set the page renders with the Coming soon
 * treatment, and it is what makes the page a living checklist: a status flip
 * moves a row out of here and into `availableBenefits()` with no other edit.
 */
export function comingSoonBenefits(): readonly PremiumBenefit[] {
  return presentableBenefits().filter((b) => b.status !== "shipped");
}

/** Rows kept as internal knowledge and never shown to a reader. */
export function internalOnlyBenefits(): readonly PremiumBenefit[] {
  return PREMIUM_MATRIX.filter((b) => b.userFacingSummary === null);
}

/**
 * Available rows where Premium genuinely adds something — the sales list.
 *
 * Shipped ONLY, because this feeds the lead cards and every "what you get"
 * claim. A Coming soon row is never in here.
 */
export function premiumBenefits(): readonly PremiumBenefit[] {
  return availableBenefits().filter((b) => b.differentiator);
}

/**
 * Available rows that are complete on Free.
 *
 * These are the anti-claims, and they belong ON the page: the honest answer
 * to "what do I lose by not paying?" is often "nothing", and saying so is
 * what keeps the rest of the list believable.
 */
export function freeBenefits(): readonly PremiumBenefit[] {
  return availableBenefits().filter((b) => !b.differentiator);
}

/** Presentable rows of one group, in matrix order — available AND upcoming. */
export function benefitsInGroup(group: BenefitGroup): readonly PremiumBenefit[] {
  return presentableBenefits().filter((b) => b.group === group);
}

/** Groups that have at least one presentable row, in canonical order. */
export function populatedGroups(): readonly { id: BenefitGroup; label: string }[] {
  return BENEFIT_GROUPS.filter((g) => benefitsInGroup(g.id).length > 0);
}

/**
 * Every row where something CLAIMS more (or less) than the code does.
 * Internal only — a buyer is shown the corrected page, not the correction.
 */
export function discrepancies(): readonly PremiumBenefit[] {
  return PREMIUM_MATRIX.filter((b) => b.discrepancy !== undefined);
}

/**
 * Benefits a later contextual upsell may draw on: shipped, differentiating,
 * marketable, and with copy already written. PT1.13 places none of these.
 */
export function upsellEligible(): readonly PremiumBenefit[] {
  return premiumBenefits().filter((b) => b.upsell !== undefined);
}

/** Upsell-eligible benefits relevant to one product surface id. */
export function upsellsForSurface(surface: string): readonly PremiumBenefit[] {
  return upsellEligible().filter((b) => b.upsell!.surfaces.includes(surface));
}
