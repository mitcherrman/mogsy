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
 * mechanism that keeps an internal row — a disabled meter, an unreachable
 * cosmetic, a backend that ships ahead of its front door — out of the
 * comparison UI without deleting the knowledge that it exists.
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
 *  `shipped`  a user can do it today on mogzy.lol.
 *  `partial`  built and reachable, but limited, disabled, or missing a
 *             front door — never presentable as available.
 *  `planned`  does not exist. Not renderable in any user-facing surface.
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
    label: "Team Combat (3v3 / 5v5)",
    free: "Not available.",
    premium:
      "Not offered yet either. The backend is live and Premium-gated; there is no way into it from the site.",
    status: "partial",
    enforcement: "backend",
    enforcementNote:
      "Backend READY: /api/combat-lab/team-simulate/readiness/v1 → available (probed 2026-09-08), gated by services/combat_lab_access.py with 402 premium_required and a fail-closed 503 for an indeterminate lookup. Frontend NOT OFFERED: VITE_TEAM_SIM_ENABLED is absent from the production bundle, so /combat-lab/team-sim is unregistered and the Combat Lab entry link is not rendered; the /dev alias is dead-code-eliminated in production builds.",
    differentiator: true,
    discrepancy:
      "The backend flag was turned on (PT1.6 measured it 'unavailable'; it now answers 'available') while the frontend flag stayed off. A shipped, billable, Premium-only feature is currently reachable by nobody.",
    userFacingSummary: null,
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
    label: "Premium site themes",
    free: "Five themes.",
    premium: "Nine further themes, including the cycling theme.",
    status: "shipped",
    enforcement: "frontend",
    enforcementNote:
      "src/lib/profile-themes.ts isPro flags, applied by FloatingThemeSwitcher and Profile.tsx. Client-side only, and correctly so — a cosmetic is not a security boundary. The switcher is mounted OUTSIDE the LoL section, so /profile is the reachable entry.",
    differentiator: true,
    userFacingSummary: "Nine more site themes.",
  },
  {
    id: "profile-frames",
    group: "profile",
    label: "Profile frames",
    free: "The default frame.",
    premium: "Choose any frame.",
    status: "shipped",
    enforcement: "frontend",
    enforcementNote: "Profile.tsx:998–1000 renders the choice; Profile.tsx:422 persists it.",
    differentiator: true,
    discrepancy:
      "Profile.tsx:422 writes `profile_frame: isPro ? selectedFrame : \"default\"`, so a lapsed member's stored frame is DESTROYED on their next profile save. `custom_theme` on the next line is not clamped, which is evidence the clamp is incidental rather than intended. This contradicts the lapse guarantee that services/saved_practice_sets.py states explicitly.",
    userFacingSummary: "Profile frames.",
  },
  {
    id: "ad-free",
    group: "profile",
    label: "No third-party ads",
    free: "Sees no ads — because no ads are served to anyone.",
    premium: "The same.",
    status: "planned",
    enforcement: "inert",
    enforcementNote:
      "src/lib/ads/policy.ts suppresses ads for Premium and is fully tested, but VITE_ADS_ENABLED is absent from the production bundle, so the global kill switch is off and no placement renders anything. Third-party additionally requires a CMP that does not exist.",
    differentiator: false,
    discrepancy:
      "'Ad-free' is a real, correct, tested Premium rule that is worth nothing today. It becomes a genuine benefit the moment ads are switched on, and not before.",
    userFacingSummary: null,
  },
  {
    id: "card-animations",
    group: "profile",
    label: "Premium card animations",
    free: "Unreachable.",
    premium: "Unreachable.",
    status: "partial",
    enforcement: "unreachable",
    enforcementNote:
      "Play.tsx:721 gates animations on an admin-configured pro_only flag, but /play, /swipe and /swipe-game all redirect to /lol under LEAGUE_ONLY_MODE.",
    differentiator: false,
    userFacingSummary: null,
  },

  // ──────────────────────────── claimed on the sales page, nonexistent
  {
    id: "curated-learning-journeys",
    group: "practice",
    label: "Curated Learning Journeys",
    free: "Does not exist.",
    premium: "Does not exist.",
    status: "planned",
    enforcement: "none",
    enforcementNote: "No implementation in either repository.",
    differentiator: false,
    discrepancy:
      "Listed on /lol/premium as a Premium feature with a 'Coming soon' badge. Nothing by this or any equivalent name exists in the frontend or the backend, and no phase has been scoped for it.",
    userFacingSummary: null,
  },
  {
    id: "earned-matchup-cards",
    group: "practice",
    label: "Earned Matchup Cards",
    free: "Does not exist.",
    premium: "Does not exist.",
    status: "planned",
    enforcement: "none",
    enforcementNote: "No implementation in either repository.",
    differentiator: false,
    discrepancy:
      "Listed on /lol/premium AND named in the page's SEO description and hero paragraph as something Premium unlocks. It exists nowhere in either repository — PT1.6 recorded the same finding on 2026-09-04 and it is still on the live page.",
    userFacingSummary: null,
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
 * Rows a user-facing surface may render.
 *
 * TWO conditions, and both are necessary: a row must be shipped (`partial`
 * and `planned` are never presentable as available) AND must carry a
 * `userFacingSummary` (its author decided it is worth describing). This is
 * the only function any UI should use to decide what to show.
 */
export function presentableBenefits(): readonly PremiumBenefit[] {
  return PREMIUM_MATRIX.filter(
    (b) => b.status === "shipped" && b.userFacingSummary !== null
  );
}

/** Presentable rows where Premium genuinely adds something. The sales list. */
export function premiumBenefits(): readonly PremiumBenefit[] {
  return presentableBenefits().filter((b) => b.differentiator);
}

/**
 * Presentable rows that are complete on Free.
 *
 * These are the anti-claims, and they belong ON the page: the honest answer
 * to "what do I lose by not paying?" is often "nothing", and saying so is
 * what keeps the rest of the list believable.
 */
export function freeBenefits(): readonly PremiumBenefit[] {
  return presentableBenefits().filter((b) => !b.differentiator);
}

/** Presentable rows of one group, in matrix order. */
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
