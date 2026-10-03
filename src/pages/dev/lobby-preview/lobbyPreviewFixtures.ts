/**
 * MALT — INERT demo state for the Leaguecraft lobby preview.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The lobby's whole information architecture is about a MATURE account: a
 * role mastery ledger, a Ranked progression bar, a recent-duels record and a
 * long-term personal ledger. A fresh local account renders every one of those
 * empty, so the design could only ever be judged in its least interesting
 * state. "Timmy" is an experienced regular player — not an elite one — whose
 * numbers fill all three sheets so the composition can be reviewed as it will
 * actually be read.
 *
 * WHY IT CANNOT CONTAMINATE PRODUCTION
 * ────────────────────────────────────
 * This module is a set of frozen literals and nothing else. It performs no
 * fetch, no write, no storage access and no auth call, and it is imported by
 * exactly ONE module: the `/dev/lobby-preview` page, which is lazily loaded
 * and reachable only by typing that URL. The lobby components it feeds are
 * presentation-only by contract (`RankedLobbyHero` and `LeaguecraftHub` both
 * fetch nothing), so the preview is a pure render of these constants.
 *
 * There is therefore no code path from Timmy to a real account:
 *  - nothing here is ever PASSED to an API client, only to React props;
 *  - `/quiz` does not import this file, so a production visitor to the real
 *    lobby cannot reach these values under any flag or query string;
 *  - `/dev/*` is classified `developer_route` by the ads policy and is not
 *    linked from any navigation.
 *
 * To remove the demo later, delete this directory and its route line. Nothing
 * else references it.
 *
 * TRUTHFULNESS OF THE SHAPES
 * ──────────────────────────
 * Every object below is typed against the REAL contract it stands in for
 * (`RankedProgressionView`, `MatchHistoryEntryView`, `QuizProgress`, …), so a
 * fixture cannot drift into a shape the backend would never send. What it
 * cannot do is invent product capability: there is no per-role accuracy field
 * here because there is none on the wire, and the preview must show the same
 * gaps the real lobby shows.
 */

import type {
  QuizProgress,
  QuizSet,
  QuizHistoryResponse,
  MissedQuestionsResponse,
} from "@/lib/quiz/api";
import type {
  MatchHistoryEntryView,
  MatchReviewView,
  RankedProgressionView,
} from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";
import {
  SYNTHETIC_RANKED_HISTORY,
  SYNTHETIC_RANKED_REVIEWS,
} from "@/pages/dev/lobby-preview/syntheticRankedHistory";
import type { DemoRoleMastery } from "@/components/quiz/RankedLobbyHero";
import type { RankedState } from "@/lib/quiz/featured-mock";
import { fixtureInstant } from "@/pages/dev/lobby-preview/history/fixtureClock";
import { FIRST_DAILY, FULL_DAILY, TIMMY_DAILY } from "@/pages/dev/lobby-preview/history/timmyHistoryInput";
import { ANALYTICS_LAB } from "@/pages/dev/lobby-preview/history/analyticsLabInput";
import { ANALYTICS_LAB_FACTS } from "@/pages/dev/lobby-preview/history/analyticsLabFacts";
import type { AnalyticsLabScenario } from "@/pages/dev/lobby-preview/history/analyticsLabSource";
import type { TimmyHistoryScenario } from "@/pages/dev/lobby-preview/history/timmyHistorySource";
import { FIRST_DAILY_FACTS, FULL_DAILY_FACTS, TIMMY_DAILY_FACTS } from "@/pages/dev/lobby-preview/history/timmyDailyFacts";
import { deriveLibrary, type LobbyPreviewLibrary } from "@/pages/dev/lobby-preview/timmyLibrary";
import {
  MISSED_UNAVAILABLE_ERROR,
  TIMMY_MISSED_LOCKED,
  TIMMY_MISSED_PREMIUM,
  TIMMY_QUIZ_HISTORY_FREE,
  TIMMY_QUIZ_HISTORY_PREMIUM,
  TIMMY_QUIZ_HISTORY_UNAVAILABLE,
} from "@/pages/dev/lobby-preview/timmyPractice";

export type { LobbyPreviewLibrary };

/** The accounts the preview switches between. */
export type LobbyPreviewProfile = "timmy" | "firstDaily" | "fullDaily" | "analyticsLab" | "newcomer";

/**
 * The entitlement a preview account is shown under. The server decides it
 * (History capability, quiz-history window, Missed bank) and one account's
 * three reads always agree, so it is chosen once per account state.
 */
export type PreviewEntitlement = "premium" | "free" | "unavailable";

/*
 * HUB5: every timestamp here is an offset from the fixed fixture anchor
 * (`history/fixtureClock.ts`), in UTC. The preview used to date its rows from
 * page load in local time, so a certification made today no longer described
 * the page tomorrow, or in another timezone.
 */

// ── Ranked ─────────────────────────────────────────────────────────────────

/**
 * Out of placements, mid-ladder. Gold rather than Diamond on purpose: the
 * point of the demo is a believable regular, and the permanent centre state
 * has to be judged on a rank most accounts will actually hold.
 *
 * Every derived number is internally consistent the way the backend's own
 * would be — the rating sits inside the tier, and `ratingToNext` plus
 * `progressPercent` agree with it — because an incoherent fixture would make
 * the progression bar lie about what a real one looks like.
 */
export const TIMMY_PROGRESSION: RankedProgressionView = Object.freeze({
  rating: 1284,
  tier: "gold",
  nextTier: "diamond",
  nextTierRating: 1500,
  ratingToNext: 216,
  progressPercent: 57,
  rated: true,
  matchesRated: 214,
});

/** Placements complete — so the centre renders its PERMANENT design. */
export const TIMMY_RANKED_STATE: RankedState = Object.freeze({
  placementMatchesRemaining: 0,
  isPlaced: true,
  estimatedGain: 24,
  estimatedLoss: 12,
});

/** A brand-new account: nothing played, placements untouched. */
export const NEWCOMER_RANKED_STATE: RankedState = Object.freeze({
  placementMatchesRemaining: 5,
  isPlaced: false,
  estimatedGain: 24,
  estimatedLoss: 12,
});

/**
 * Twenty rows — the same window `useRankedMatchHistory` requests — so the
 * derived per-role ledger is exercised at its real scope rather than at a
 * convenient one. The newest nine are the synthetic match set the Leaguecraft
 * Record shows (`syntheticRankedHistory.ts`); these are the eleven OLDER rows
 * that continue it.
 *
 * Deliberately UNEVEN across the five roles. Timmy is a Mid main who also
 * plays a lot of Jungle, dabbles Top and ADC, and has one Support game on
 * record; the win rates differ per role and the rating deltas vary in size.
 *
 * HUB5 corrections: these rows used to be dated 6-31 days back, so several
 * were NEWER than the synthetic record they follow; they now continue it,
 * strictly older. The voided no-contest now moves no rating, as a void does.
 */
const TIMMY_OLDER_SPECS: Array<{
  role: RankedRole;
  outcome: "win" | "loss" | "draw";
  delta: number | null;
  opponent: string | null;
  bot: boolean;
  days: number;
  terminal?: { reason: "forfeit" | "no_contest"; rounds: number };
}> = [
  { role: "mid", outcome: "win", delta: 23, opponent: null, bot: true, days: 17 },
  { role: "top", outcome: "win", delta: 20, opponent: "Bramblehide", bot: false, days: 18 },
  { role: "jungle", outcome: "draw", delta: null, opponent: "Vexmarrow", bot: false, days: 20,
    terminal: { reason: "no_contest", rounds: 4 } },
  { role: "mid", outcome: "win", delta: 24, opponent: "Lanterna", bot: false, days: 21 },
  { role: "adc", outcome: "loss", delta: -12, opponent: "Fletchwind", bot: false, days: 23 },
  { role: "mid", outcome: "draw", delta: 0, opponent: "Sylvara", bot: false, days: 24 },
  { role: "jungle", outcome: "win", delta: 17, opponent: null, bot: true, days: 26 },
  { role: "support", outcome: "loss", delta: -10, opponent: "Wardlight", bot: false, days: 27 },
  { role: "mid", outcome: "win", delta: 21, opponent: "Emberquill", bot: false, days: 29 },
  { role: "top", outcome: "loss", delta: -13, opponent: "Stonewarden", bot: false, days: 30 },
  // One pre-rating row: the delta columns must survive a null, which is what
  // every historical result on a pre-F2.2 backend actually carries.
  { role: "mid", outcome: "win", delta: null, opponent: "Duskrune", bot: false, days: 33 },
];

/**
 * The ladder, continued. The synthetic record walks back from Timmy's current
 * rating; its oldest rated match STARTED at `ratingAfter - ratingDelta`, which
 * is where the newest older row must have finished. Each older row then ends
 * where the one after it began. A voided or pre-rating row moved nothing and
 * the walk steps over it.
 */
const TIMMY_OLDER_RATING_AFTER: Array<number | null> = (() => {
  const oldestRated = [...SYNTHETIC_RANKED_HISTORY].reverse()
    .find((m) => m.ratingDelta !== null && m.ratingAfter !== null)!;
  let running = oldestRated.ratingAfter! - oldestRated.ratingDelta!;
  return TIMMY_OLDER_SPECS.map((row) => {
    if (row.delta === null) return null;
    const after = running;
    running -= row.delta;
    return after;
  });
})();

const TIMMY_OLDER_ROWS: readonly MatchHistoryEntryView[] = Object.freeze(
  TIMMY_OLDER_SPECS.map((row, idx) => ({
    matchId: `demo-timmy-${idx + SYNTHETIC_RANKED_HISTORY.length}`,
    viewerOutcome: row.outcome,
    terminalReason: row.terminal?.reason ?? "combat",
    completionReason: row.terminal ? row.terminal.reason : "rounds_complete",
    // Match LENGTH, never a score: the contract carries the round a duel ended
    // on and no per-round results. A short one is a duel that ended early.
    finalRoundNumber: row.terminal?.rounds ?? (idx % 4 === 0 ? 7 : idx % 3 === 0 ? 3 : 5),
    completedAt: fixtureInstant(row.days, 20 - (idx % 6)),
    isBotMatch: row.bot,
    viewerClass: "mage",
    opponentClass: "marksman",
    viewerRole: row.role,
    opponentRole: null,
    opponentDisplayName: row.opponent,
    opponentIsBot: row.bot,
    ratingDelta: row.delta,
    ratingAfter: TIMMY_OLDER_RATING_AFTER[idx],
    host: null,
  })) satisfies MatchHistoryEntryView[],
);

/**
 * The centre parchment's own ledger, and the sample the role tally is computed
 * over. Twenty rows, because a five-role tally built from nine games tells you
 * very little.
 *
 * It OPENS with the same nine matches the Leaguecraft Record shows — one demo
 * account cannot have two different recent histories on one screen — and
 * continues into the older rows below, which exist to give the tally depth and
 * to keep a pre-rating (`delta: null`) row on the wire.
 */
export const TIMMY_MATCH_HISTORY: readonly MatchHistoryEntryView[] = Object.freeze([
  ...SYNTHETIC_RANKED_HISTORY,
  ...TIMMY_OLDER_ROWS,
] satisfies MatchHistoryEntryView[]);

/**
 * THE RECORD'S RANKED ROWS — the synthetic match set.
 *
 * Re-exported from `syntheticRankedHistory.ts`, which is where the nine
 * theoretical matches and every one of their rounds are defined. It lives in
 * its own module because it is a substantial dataset with a rule of its own
 * (every question declares its true subject and the icon hint is derived from
 * that declaration), and because a filename that says SYNTHETIC is the
 * cheapest possible guard against anyone mistaking it for real play.
 *
 * PREVIEW ONLY. `Quiz.tsx` passes none of this: production reads the
 * account's own Ranked history and per-match review from the backend, through
 * `ranked-public/client`. Nothing in this directory may name an endpoint —
 * `LobbyPreviewPage.test.tsx` scans these sources for one.
 */
export const TIMMY_RANKED_RECORD_PREVIEW = SYNTHETIC_RANKED_HISTORY;
export const TIMMY_MATCH_REVIEWS = SYNTHETIC_RANKED_REVIEWS;

/**
 * PT1.2 / HUB5 — the Owned collection, DERIVED from every Ranked round each
 * account actually submitted: Timmy's ordinary Ranked matches and his Daily
 * stages' child matches alike, through `timmyLibrary.ts` (the backend's
 * discovery rule). Nothing is authored here, so the collection cannot claim a
 * question the record beside it never asked, and one question is one ref on
 * every surface (`history/questionIdentity.ts`).
 */
const RANKED_COMPLETED_AT = new Map(SYNTHETIC_RANKED_HISTORY.map((m) => [m.matchId, m.completedAt]));
const dailyMatches = (facts: typeof TIMMY_DAILY_FACTS, built: typeof TIMMY_DAILY) =>
  facts.runs.flatMap((run) => {
    const runId = `${facts.idPrefix}-run-${String(run.number).padStart(2, "0")}`;
    return built.rows.daily_run_stages
      .filter((s) => s.run_id === runId)
      .map((s) => ({ completedAt: run.completedAt, review: built.reviews[s.child_match_id] }));
  });

export const TIMMY_QUESTION_LIBRARY: LobbyPreviewLibrary = deriveLibrary([
  ...Object.values(SYNTHETIC_RANKED_REVIEWS).map((review) => ({
    completedAt: RANKED_COMPLETED_AT.get(review.matchId)!, review,
  })),
  ...dailyMatches(TIMMY_DAILY_FACTS, TIMMY_DAILY),
]);

export const FIRST_DAILY_QUESTION_LIBRARY: LobbyPreviewLibrary = deriveLibrary(
  dailyMatches(FIRST_DAILY_FACTS, FIRST_DAILY),
);

/** HUB6.2 — the full-length Daily account's Owned questions. */
export const FULL_DAILY_QUESTION_LIBRARY: LobbyPreviewLibrary = deriveLibrary(
  dailyMatches(FULL_DAILY_FACTS, FULL_DAILY),
);

/** HUB6.3D — the Analytics Lab's Owned questions. */
export const ANALYTICS_LAB_QUESTION_LIBRARY: LobbyPreviewLibrary = deriveLibrary(
  dailyMatches(ANALYTICS_LAB_FACTS, ANALYTICS_LAB),
);

/** A new account owns nothing. The empty Library has to stay the real one. */
export const NEWCOMER_QUESTION_LIBRARY: LobbyPreviewLibrary = deriveLibrary([]);

/**
 * Every frozen match review the preview may open, by match id: the Ranked
 * record's and each Daily stage's child match. Daily children are here and
 * ONLY here — they are never rows of the ordinary Ranked record.
 */
export const TIMMY_ALL_REVIEWS: Readonly<Record<string, MatchReviewView>> = Object.freeze({
  ...SYNTHETIC_RANKED_REVIEWS,
  ...TIMMY_DAILY.reviews,
});

/**
 * Representative Role Mastery scores — DEMO ONLY, and the clearest example of
 * what this file is for.
 *
 * The product has NO mastery score: nothing computes one, no endpoint returns
 * one, and `RankedLobbyHero` deliberately derives none. These values exist so
 * the mature-state summary band can be judged as a design before the product
 * can fill it, and they reach exactly one surface — the preview page. A real
 * account is shown its own recent win rate instead, labelled as recent.
 *
 * Ordered to match Timmy's actual play: strongest where he has the games and
 * the win rate, weakest on the role he has barely touched. A mastery score
 * that disagreed with the record printed beside it would make the band read
 * as decorative, which is the one thing the demo must not teach us — so when
 * the record's match set changed, these moved with it. Mid leads on seven
 * games; ADC trails on two.
 */
export const TIMMY_ROLE_MASTERY: Partial<Record<RankedRole, DemoRoleMastery>> = Object.freeze({
  mid: { score: 742, label: "Adept" },
  jungle: { score: 518, label: "Practised" },
  top: { score: 264, label: "Apprentice" },
  support: { score: 193, label: "Apprentice" },
  adc: { score: 61, label: "Novice" },
});

// ── Academy ────────────────────────────────────────────────────────────────

/**
 * An established but ordinary student. Gold Academy, four-figure question
 * count, a 71% lifetime accuracy — good, not elite — and a best streak well
 * above the current one, which is what a long-running real account looks like.
 */
export const TIMMY_PROGRESS: QuizProgress = Object.freeze({
  user_id: "demo-timmy",
  rank_name: "Gold",
  total_attempts: 3418,
  correct_attempts: 2427,
  attempts: 3418,
  correct: 2427,
  accuracy: 71,
  current_streak: 6,
  best_streak: 34,
  total_xp: 48250,
  xp: 48250,
  academy_tier: "gold",
  academy_next_tier: "diamond",
  academy_current_tier_xp: 40000,
  academy_next_tier_xp: 75000,
  academy_xp_to_next: 26750,
  academy_progress_percent: 24,
});

/** A brand-new account: signed in, nothing recorded. */
export const NEWCOMER_PROGRESS: QuizProgress = Object.freeze({
  user_id: "demo-newcomer",
  total_attempts: 0,
  correct_attempts: 0,
  current_streak: 0,
  best_streak: 0,
  total_xp: 0,
});

// ── The rest of the hub (so the preview is the whole page, not a fragment) ──

export const PREVIEW_SETS: readonly QuizSet[] = Object.freeze([
  { id: 1, name: "All Current Questions", description: "Everything Leaguecraft asks.", question_count: 4820 },
  { id: 2, name: "Champion Cooldowns", description: "Ability timing windows.", question_count: 1290 },
  { id: 3, name: "Item Exact Stats", description: "Finished item stat lines.", question_count: 860 },
  { id: 4, name: "Rune Recognition", description: "Keystones and shards on sight.", question_count: 410 },
]);

/**
 * Timmy's study record. Free, it is a FULL Free window: the endpoint serves a
 * Free account its most recent `free_limit` sessions and flags the
 * truncation, so the ledger reads "your last 10 of 96" over exactly the ten
 * rows it counted. Premium, the same career arrives whole; with the
 * entitlement lookup failed, the Free window without the limit flag or an
 * upsell. All three are cut from ONE session list in `timmyPractice.ts`.
 *
 * NO RANKED ROWS, deliberately. The Ranked duel writes none of these — it has
 * its own contract.
 */
export const TIMMY_QUIZ_HISTORY: QuizHistoryResponse = TIMMY_QUIZ_HISTORY_FREE;

export const NEWCOMER_QUIZ_HISTORY: QuizHistoryResponse = Object.freeze({
  ok: true,
  is_pro: false,
  total_count: 0,
  limited: false,
  free_limit: 10,
  upsell_message: null,
  entitlement_status: "ok",
  results: [],
});

/** The first-Daily account is Premium (its History was generated entitled)
 *  and has never played Practice. */
const FIRST_DAILY_QUIZ_HISTORY: QuizHistoryResponse = Object.freeze({
  ...NEWCOMER_QUIZ_HISTORY,
  is_pro: true,
});

/**
 * The Missed bank. Free, it is LOCKED — a Free account meets the paywall, and
 * a locked bank carries no data. Premium, it is the real first page of
 * Timmy's Practice misses (`timmyPractice.ts`).
 */
export const TIMMY_MISSED_QUESTIONS: MissedQuestionsResponse = TIMMY_MISSED_LOCKED;

export const NEWCOMER_MISSED_QUESTIONS: MissedQuestionsResponse = TIMMY_MISSED_LOCKED;

const FIRST_DAILY_MISSED_QUESTIONS: MissedQuestionsResponse = Object.freeze({
  ok: true, is_pro: true, locked: false, results: [], total_count: 0, limit: 25, offset: 0,
});

/** What one entitlement state changes: the three server-decided reads. */
export interface EntitlementView {
  label: string;
  history: QuizHistoryResponse;
  /** The Missed bank as served, or null when its read failed. */
  missedQuestions: MissedQuestionsResponse | null;
  /** The Missed hook's failure line when its read failed. */
  missedError: string | null;
  /** Which generated History golden this state reads: a HUB2.3 Timmy-family
   *  scenario, or (HUB6.3D) an Analytics Lab scenario generated by HUB6.3B. */
  dailyHistory: TimmyHistoryScenario | AnalyticsLabScenario;
}

/** Everything one preview state needs, in the shape the hub's props expect. */
export interface LobbyPreviewState {
  label: string;
  displayName: string | null;
  signedIn: boolean;
  rankedRole: RankedRole | null;
  ranked: RankedState;
  progress: QuizProgress;
  progression: RankedProgressionView | null;
  matchHistory: readonly MatchHistoryEntryView[];
  /** The Leaguecraft Record's Ranked rows (never a Daily child match). */
  rankedRecord: readonly MatchHistoryEntryView[];
  /** Every frozen review this account can open — Ranked and Daily stages. */
  reviews: Readonly<Record<string, MatchReviewView>>;
  /** REVIEW's OWNED collection — see `TIMMY_QUESTION_LIBRARY`. */
  questionLibrary: LobbyPreviewLibrary;
  /** DEMO ONLY — see `TIMMY_ROLE_MASTERY`. Null for the newcomer state, which
   *  must render exactly what a real new account renders. */
  demoRoleMastery: Partial<Record<RankedRole, DemoRoleMastery>> | null;
  entitlements: Partial<Record<PreviewEntitlement, EntitlementView>>;
  defaultEntitlement: PreviewEntitlement;
}

const TIMMY_ENTITLEMENTS: Record<PreviewEntitlement, EntitlementView> = {
  premium: {
    label: "Premium",
    history: TIMMY_QUIZ_HISTORY_PREMIUM,
    missedQuestions: TIMMY_MISSED_PREMIUM,
    missedError: null,
    dailyHistory: "timmy_premium",
  },
  free: {
    label: "Free",
    history: TIMMY_QUIZ_HISTORY_FREE,
    missedQuestions: TIMMY_MISSED_LOCKED,
    missedError: null,
    dailyHistory: "timmy_free",
  },
  unavailable: {
    label: "Entitlement unavailable",
    history: TIMMY_QUIZ_HISTORY_UNAVAILABLE,
    missedQuestions: null,
    missedError: MISSED_UNAVAILABLE_ERROR,
    dailyHistory: "timmy_unavailable",
  },
};

export const LOBBY_PREVIEW_STATES: Record<LobbyPreviewProfile, LobbyPreviewState> = {
  timmy: {
    label: "Timmy — established player",
    displayName: "Timmy",
    signedIn: true,
    rankedRole: "mid",
    ranked: TIMMY_RANKED_STATE,
    progress: TIMMY_PROGRESS,
    progression: TIMMY_PROGRESSION,
    matchHistory: TIMMY_MATCH_HISTORY,
    rankedRecord: TIMMY_RANKED_RECORD_PREVIEW,
    reviews: TIMMY_ALL_REVIEWS,
    questionLibrary: TIMMY_QUESTION_LIBRARY,
    demoRoleMastery: TIMMY_ROLE_MASTERY,
    entitlements: TIMMY_ENTITLEMENTS,
    defaultEntitlement: "premium",
  },
  firstDaily: {
    label: "First Daily — one 4-stage run",
    displayName: "Rookie",
    signedIn: true,
    rankedRole: null,
    ranked: NEWCOMER_RANKED_STATE,
    progress: NEWCOMER_PROGRESS,
    progression: null,
    matchHistory: [],
    rankedRecord: [],
    reviews: FIRST_DAILY.reviews,
    questionLibrary: FIRST_DAILY_QUESTION_LIBRARY,
    demoRoleMastery: null,
    entitlements: {
      premium: {
        label: "Premium",
        history: FIRST_DAILY_QUIZ_HISTORY,
        missedQuestions: FIRST_DAILY_MISSED_QUESTIONS,
        missedError: null,
        dailyHistory: "first_daily",
      },
    },
    defaultEntitlement: "premium",
  },
  /* HUB6.2 — full-length stage shapes: a ten-module Standard with two Meta
     Reflex blocks and a Mastery slice, 22- and 28-question Time Trials, and
     a long mixed Survival that goes out of strikes. Premium, like the
     first-Daily account, and with no Practice or Ranked record. */
  fullDaily: {
    label: "Full-length Daily — real stage sizes",
    displayName: "Marathoner",
    signedIn: true,
    rankedRole: null,
    ranked: NEWCOMER_RANKED_STATE,
    progress: NEWCOMER_PROGRESS,
    progression: null,
    matchHistory: [],
    rankedRecord: [],
    reviews: FULL_DAILY.reviews,
    questionLibrary: FULL_DAILY_QUESTION_LIBRARY,
    demoRoleMastery: null,
    entitlements: {
      premium: {
        label: "Premium",
        history: FIRST_DAILY_QUIZ_HISTORY,
        missedQuestions: FIRST_DAILY_MISSED_QUESTIONS,
        missedError: null,
        dailyHistory: "full_daily",
      },
    },
    defaultEntitlement: "premium",
  },
  /* HUB6.3D — the Analytics Lab: 14 production-shaped Dailies (first
     4-stage Daily, then 5-stage), generated through HUB6.3B's real route —
     previous comparisons, records (new / tied / below), streaks, series,
     public categories, exact-question history, strike attribution, Review
     sources. Premium / Free / Entitlement-unavailable over the same facts.
     NOT production data: a development account for the Premium analytics. */
  analyticsLab: {
    label: "Analytics Lab — 14 Dailies",
    displayName: "Analytics Lab",
    signedIn: true,
    rankedRole: null,
    ranked: NEWCOMER_RANKED_STATE,
    progress: NEWCOMER_PROGRESS,
    progression: null,
    matchHistory: [],
    rankedRecord: [],
    reviews: ANALYTICS_LAB.reviews,
    questionLibrary: ANALYTICS_LAB_QUESTION_LIBRARY,
    demoRoleMastery: null,
    entitlements: {
      premium: {
        label: "Premium",
        history: FIRST_DAILY_QUIZ_HISTORY,
        missedQuestions: FIRST_DAILY_MISSED_QUESTIONS,
        missedError: null,
        dailyHistory: "lab_premium",
      },
      free: {
        label: "Free",
        history: NEWCOMER_QUIZ_HISTORY,
        missedQuestions: TIMMY_MISSED_LOCKED,
        missedError: null,
        dailyHistory: "lab_free",
      },
      unavailable: {
        label: "Entitlement unavailable",
        history: NEWCOMER_QUIZ_HISTORY,
        missedQuestions: null,
        missedError: MISSED_UNAVAILABLE_ERROR,
        dailyHistory: "lab_unavailable",
      },
    },
    defaultEntitlement: "premium",
  },
  newcomer: {
    label: "New player — nothing on record",
    displayName: "Newcomer",
    signedIn: true,
    rankedRole: null,
    ranked: NEWCOMER_RANKED_STATE,
    progress: NEWCOMER_PROGRESS,
    progression: null,
    matchHistory: [],
    rankedRecord: [],
    reviews: {},
    questionLibrary: NEWCOMER_QUESTION_LIBRARY,
    demoRoleMastery: null,
    entitlements: {
      free: {
        label: "Free",
        history: NEWCOMER_QUIZ_HISTORY,
        missedQuestions: NEWCOMER_MISSED_QUESTIONS,
        missedError: null,
        dailyHistory: "newcomer",
      },
    },
    defaultEntitlement: "free",
  },
};
