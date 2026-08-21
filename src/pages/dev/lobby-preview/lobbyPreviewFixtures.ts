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

import type { QuizProgress, QuizSet, QuizHistoryResponse } from "@/lib/quiz/api";
import type {
  MatchHistoryEntryView,
  RankedProgressionView,
} from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";
import type { DemoRoleMastery } from "@/components/quiz/RankedLobbyHero";
import type { RankedState } from "@/lib/quiz/featured-mock";

/** The two states the preview switches between. */
export type LobbyPreviewProfile = "timmy" | "newcomer";

/**
 * Timestamps are relative to page load, so the "last played" and match-age
 * lines stay believable however long after this file was written the preview
 * is opened. Days back, at a fixed hour, so a render is stable within a day.
 */
function daysAgo(days: number, hour = 20): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

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
 * convenient one.
 *
 * Deliberately UNEVEN across the five roles. Timmy is a Mid main who also
 * plays a lot of Jungle, dabbles Top and ADC, and has one Support game on
 * record; the win rates differ per role and the rating deltas vary in size.
 * Five identical blocks would have told us nothing about how the ledger reads
 * when the numbers actually disagree.
 */
const TIMMY_ROWS: Array<{
  role: RankedRole;
  outcome: "win" | "loss" | "draw";
  delta: number | null;
  opponent: string | null;
  bot: boolean;
  days: number;
}> = [
  { role: "mid", outcome: "win", delta: 22, opponent: "Sylvara", bot: false, days: 0 },
  { role: "mid", outcome: "win", delta: 19, opponent: null, bot: true, days: 0 },
  { role: "jungle", outcome: "loss", delta: -14, opponent: "Korrin", bot: false, days: 1 },
  { role: "mid", outcome: "win", delta: 25, opponent: "Belveth99", bot: false, days: 1 },
  { role: "top", outcome: "loss", delta: -11, opponent: "IronGrove", bot: false, days: 2 },
  { role: "jungle", outcome: "win", delta: 18, opponent: null, bot: true, days: 3 },
  { role: "mid", outcome: "loss", delta: -13, opponent: "Nocturnaut", bot: false, days: 3 },
  { role: "adc", outcome: "win", delta: 21, opponent: "Quiverling", bot: false, days: 4 },
  { role: "jungle", outcome: "win", delta: 16, opponent: "Thornwake", bot: false, days: 5 },
  { role: "mid", outcome: "win", delta: 23, opponent: null, bot: true, days: 6 },
  { role: "top", outcome: "win", delta: 20, opponent: "Bramblehide", bot: false, days: 8 },
  { role: "jungle", outcome: "loss", delta: -15, opponent: "Vexmarrow", bot: false, days: 9 },
  { role: "mid", outcome: "win", delta: 24, opponent: "Lanterna", bot: false, days: 11 },
  { role: "adc", outcome: "loss", delta: -12, opponent: "Fletchwind", bot: false, days: 12 },
  { role: "mid", outcome: "draw", delta: 0, opponent: "Sylvara", bot: false, days: 14 },
  { role: "jungle", outcome: "win", delta: 17, opponent: null, bot: true, days: 16 },
  { role: "support", outcome: "loss", delta: -10, opponent: "Wardlight", bot: false, days: 19 },
  { role: "mid", outcome: "win", delta: 21, opponent: "Emberquill", bot: false, days: 22 },
  { role: "top", outcome: "loss", delta: -13, opponent: "Stonewarden", bot: false, days: 26 },
  // One pre-rating row: the delta columns must survive a null, which is what
  // every historical result on a pre-F2.2 backend actually carries.
  { role: "mid", outcome: "win", delta: null, opponent: "Duskrune", bot: false, days: 31 },
];

export const TIMMY_MATCH_HISTORY: readonly MatchHistoryEntryView[] = Object.freeze(
  TIMMY_ROWS.map((row, i) => ({
    matchId: `demo-timmy-${i}`,
    viewerOutcome: row.outcome,
    terminalReason: "combat",
    completionReason: "rounds_complete",
    finalRoundNumber: 5,
    completedAt: daysAgo(row.days, 20 - (i % 6)),
    isBotMatch: row.bot,
    viewerClass: "mage",
    opponentClass: "marksman",
    viewerRole: row.role,
    opponentRole: null,
    opponentDisplayName: row.opponent,
    opponentIsBot: row.bot,
    ratingDelta: row.delta,
    ratingAfter: row.delta === null ? null : TIMMY_PROGRESSION.rating,
  })) satisfies MatchHistoryEntryView[],
);

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
 * the win rate, weakest on the role he has touched once. A mastery score that
 * disagreed with the record printed beside it would make the band read as
 * decorative, which is the one thing the demo must not teach us.
 */
export const TIMMY_ROLE_MASTERY: Partial<Record<RankedRole, DemoRoleMastery>> = Object.freeze({
  mid: { score: 742, label: "Adept" },
  jungle: { score: 518, label: "Practised" },
  top: { score: 264, label: "Apprentice" },
  adc: { score: 193, label: "Apprentice" },
  support: { score: 61, label: "Novice" },
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

export const TIMMY_QUIZ_HISTORY: QuizHistoryResponse = Object.freeze({
  ok: true,
  is_pro: false,
  total_count: 96,
  limited: true,
  free_limit: 10,
  upsell_message: null,
  entitlement_status: "ok",
  results: [
    { session_id: 96, date: daysAgo(0), mode: "practice", category: "Champion Cooldowns", score: 9, total_questions: 10, accuracy: 90 },
    { session_id: 95, date: daysAgo(1), mode: "practice", category: "Item Exact Stats", score: 6, total_questions: 10, accuracy: 60 },
    { session_id: 94, date: daysAgo(2), mode: "practice", category: "Rune Recognition", score: 8, total_questions: 10, accuracy: 80 },
    { session_id: 93, date: daysAgo(4), mode: "practice", category: "Champion Cooldowns", score: 7, total_questions: 10, accuracy: 70 },
  ],
});

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
  history: QuizHistoryResponse;
  /** DEMO ONLY — see `TIMMY_ROLE_MASTERY`. Null for the newcomer state, which
   *  must render exactly what a real new account renders. */
  demoRoleMastery: Partial<Record<RankedRole, DemoRoleMastery>> | null;
}

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
    history: TIMMY_QUIZ_HISTORY,
    demoRoleMastery: TIMMY_ROLE_MASTERY,
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
    history: NEWCOMER_QUIZ_HISTORY,
    demoRoleMastery: null,
  },
};
