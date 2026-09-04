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
  QuestionLibraryEntryView,
  QuestionLibrarySummaryView,
  RankedProgressionView,
  ReviewQuestion,
  ReviewRound,
} from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";
import {
  SYNTHETIC_MATCH_SPECS,
  SYNTHETIC_QUESTION_BANK,
  SYNTHETIC_RANKED_HISTORY,
  SYNTHETIC_RANKED_REVIEWS,
} from "@/pages/dev/lobby-preview/syntheticRankedHistory";
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

/**
 * The ladder Timmy actually walked, rather than the same number twenty times.
 *
 * `ratingAfter` used to be `TIMMY_PROGRESSION.rating` on EVERY row, which is a
 * shape the backend could never send: it would mean two hundred rated matches
 * all finishing on the same score. It matters now because the Ranked record
 * design prints the rating a match started from, derived as
 * `ratingAfter - ratingDelta` — against a flat column that derivation produced
 * the same pair on every row and told us nothing about the design.
 *
 * So the chain is walked BACKWARDS from Timmy's current standing: the newest
 * match ends on it, and each older match ends where the one after it began.
 * A pre-rating row (`delta: null`) has no `ratingAfter` at all and the walk
 * simply carries past it — which is exactly what a real account with results
 * older than rating application looks like.
 */
const TIMMY_RATING_AFTER: Array<number | null> = (() => {
  const out: Array<number | null> = [];
  let running = TIMMY_PROGRESSION.rating;
  for (const row of TIMMY_ROWS) {
    if (row.delta === null) {
      out.push(null);
      continue;
    }
    out.push(running);
    running -= row.delta;
  }
  return out;
})();

/**
 * Terminal reasons, so the record is not one shape repeated. Most duels are
 * played out; the fixture carries one forfeit and one void result because the
 * contract has three `terminal_reason` values and a design that only ever
 * meets the common one has not been reviewed.
 */
const TIMMY_TERMINAL: Record<number, { reason: "forfeit" | "no_contest"; rounds: number }> = {
  4: { reason: "forfeit", rounds: 2 },
  11: { reason: "no_contest", rounds: 4 },
};

/**
 * One deliberately LONG match, so the preview exercises what the common case
 * cannot: a question timeline that has to page. Five icons a page means a
 * 15-round match is three pages, which is the only length that proves both
 * arrows, both edges, and a middle page where neither is disabled.
 */
const TIMMY_LONG_MATCHES: Record<number, number> = { 2: 15 };

const TIMMY_OLDER_ROWS: readonly MatchHistoryEntryView[] = Object.freeze(
  TIMMY_ROWS.slice(SYNTHETIC_RANKED_HISTORY.length).map((row, idx) => {
    const i = idx + SYNTHETIC_RANKED_HISTORY.length;
    return ({
    matchId: `demo-timmy-${i}`,
    viewerOutcome: row.outcome,
    terminalReason: TIMMY_TERMINAL[i]?.reason ?? "combat",
    completionReason: TIMMY_TERMINAL[i] ? TIMMY_TERMINAL[i].reason : "rounds_complete",
    // Match LENGTH, never a score: the contract carries the round a duel ended
    // on and no per-round results. A short one is a duel that ended early.
    finalRoundNumber:
      TIMMY_TERMINAL[i]?.rounds ??
      TIMMY_LONG_MATCHES[i] ??
      (i % 4 === 0 ? 7 : i % 3 === 0 ? 3 : 5),
    completedAt: daysAgo(row.days, 20 - (i % 6)),
    isBotMatch: row.bot,
    viewerClass: "mage",
    opponentClass: "marksman",
    viewerRole: row.role,
    opponentRole: null,
    opponentDisplayName: row.opponent,
    opponentIsBot: row.bot,
    ratingDelta: row.delta,
    ratingAfter: TIMMY_RATING_AFTER[i],
  });
  }) satisfies MatchHistoryEntryView[],
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
 * PT1.2 — Timmy's Personal Question Library, DERIVED from the same synthetic
 * matches his record and reviews are derived from.
 *
 * Nothing is authored here. A question enters the collection exactly the way
 * the real backend admits one: the round was SUBMITTED (`answer` is not
 * null — an unanswered round records no discovery), the counters are the
 * number of those submissions and how many were right, and `firstSeenAt` is
 * the oldest match the question appeared in. Meta Reflex rounds are skipped
 * because they carry no canonical ref, which is also true in production.
 *
 * Consequence worth keeping: this fixture cannot show a collection Timmy's
 * demo matches did not actually produce.
 */
function deriveLibrary() {
  type Acc = {
    ref: string; prompt: string; category: string;
    answered: number; correct: number; firstDaysAgo: number; lastDaysAgo: number;
    firstMatchId: string; firstRoundNumber: number;
  };
  const byRef = new Map<string, Acc>();
  for (const match of SYNTHETIC_MATCH_SPECS) {
    match.rounds.forEach((round, i) => {
      if (round === "meta-reflex") return;
      if (round.answer === null) return; // never submitted -> never discovered
      const q = SYNTHETIC_QUESTION_BANK[round.q];
      if (!q) return;
      const ref = `ranked:${q.id}`;
      const existing = byRef.get(ref);
      const correct = round.answer === q.correctIndex ? 1 : 0;
      if (!existing) {
        byRef.set(ref, {
          ref, prompt: q.prompt, category: q.category,
          answered: 1, correct,
          firstDaysAgo: match.daysAgo, lastDaysAgo: match.daysAgo,
          firstMatchId: match.id, firstRoundNumber: i + 1,
        });
        return;
      }
      existing.answered += 1;
      existing.correct += correct;
      // MATCHES runs newest-first, so a later iteration is always older.
      if (match.daysAgo > existing.firstDaysAgo) {
        existing.firstDaysAgo = match.daysAgo;
        existing.firstMatchId = match.id;
        existing.firstRoundNumber = i + 1;
      }
      if (match.daysAgo < existing.lastDaysAgo) existing.lastDaysAgo = match.daysAgo;
    });
  }
  const iso = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(20, 0, 0, 0);
    return d.toISOString();
  };
  const entries: QuestionLibraryEntryView[] = [...byRef.values()]
    // The API's one ordering: most recently encountered first.
    .sort((a, b) => a.lastDaysAgo - b.lastDaysAgo || a.ref.localeCompare(b.ref))
    .map((a) => ({
      canonicalQuestionRef: a.ref,
      firstSeenAt: iso(a.firstDaysAgo),
      lastSeenAt: iso(a.lastDaysAgo),
      timesAnswered: a.answered,
      timesCorrect: a.correct,
      accuracy: a.answered ? a.correct / a.answered : null,
      firstMatchId: a.firstMatchId,
      firstRoundNumber: a.firstRoundNumber,
      metadataStatus: "resolved",
      metadataSource: "frozen_round",
      question: { prompt: a.prompt, category: a.category },
    }));
  const totalAnswered = entries.reduce((n, e) => n + e.timesAnswered, 0);
  const totalCorrect = entries.reduce((n, e) => n + e.timesCorrect, 0);
  return {
    summary: {
      uniqueDiscovered: entries.length,
      totalAnswered,
      totalCorrect,
      accuracy: totalAnswered ? totalCorrect / totalAnswered : null,
    } satisfies QuestionLibrarySummaryView,
    entries,
  };
}

const TIMMY_LIBRARY = deriveLibrary();

export const TIMMY_QUESTION_LIBRARY: LobbyPreviewLibrary = Object.freeze({
  summary: TIMMY_LIBRARY.summary,
  entries: Object.freeze(TIMMY_LIBRARY.entries) as readonly QuestionLibraryEntryView[],
});

/** A new account owns nothing. The empty Library has to stay the real one. */
export const NEWCOMER_QUESTION_LIBRARY: LobbyPreviewLibrary = Object.freeze({
  summary: { uniqueDiscovered: 0, totalAnswered: 0, totalCorrect: 0, accuracy: null },
  entries: Object.freeze([]) as readonly QuestionLibraryEntryView[],
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
 * Timmy's study record — a FULL Free window, so the unified History ledger can
 * be judged at the density a real account actually reaches.
 *
 * THE WINDOW IS THE POINT, AND IT IS EXACT.
 * The quiz-history endpoint serves a Free account its most recent
 * `free_limit` sessions and flags the truncation. Timmy is `is_pro: false`
 * with
 * `free_limit: 10`, so the honest payload is TEN rows out of a career of 96 —
 * not four, which was a placeholder, and not twelve, which no Free account
 * could ever be served. The ledger's scope line therefore reads "your last 10
 * of 96", the ten rows below it are exactly what it counted, and the Free-cap
 * notice under them is the real one. Nothing here is inconsistent with
 * anything else here: change `free_limit` and the row count has to move too.
 *
 * WHAT THE ROWS ARE FOR. Every field a row can vary by is varied, because the
 * ledger has to stay readable when they disagree:
 *   - the two modes the stream actually carries — practice sets (`standard`,
 *     which carry the set name as their category) and the legacy Daily
 *     (`daily`, which carries none) — plus one older `legacy` backfill row
 *     with no category at all, so the neutral fallback label is on screen;
 *   - accuracy across the ledger's full tint range: two sessions at 90%+, a
 *     run of middling ones, and a genuine 20% so the rough tone is visible;
 *   - question counts that are not all ten, so the score column has to hold
 *     alignment against 5, 12 and 20;
 *   - durations from 74 seconds to nearly nine minutes, and ONE row with none
 *     at all, because real history has them and the column must not collapse;
 *   - ages from today to nearly a month back, so the date column is exercised
 *     by both a same-day and a much older stamp.
 *
 * Every `accuracy` equals its own `score / total_questions`. A fixture whose
 * figures disagreed with each other would make the summary line untestable by
 * eye, which is the one thing this data exists to support.
 *
 * NO RANKED ROWS, deliberately. The Ranked duel writes none of these — it has
 * its own contract — and Ranked full history is Phase B. Inventing one here
 * would put a record on screen that Phase A cannot honestly serve.
 */
export const TIMMY_QUIZ_HISTORY: QuizHistoryResponse = Object.freeze({
  ok: true,
  is_pro: false,
  total_count: 96,
  limited: true,
  free_limit: 10,
  upsell_message: null,
  entitlement_status: "ok",
  results: [
    { session_id: 96, date: daysAgo(0), completed_at: daysAgo(0, 20), mode: "standard", category: "Champion Cooldowns", score: 9, total_questions: 10, accuracy: 90, duration_seconds: 214 },
    { session_id: 95, date: daysAgo(0), completed_at: daysAgo(0, 9), mode: "daily", category: null, score: 5, total_questions: 5, accuracy: 100, duration_seconds: 96 },
    { session_id: 94, date: daysAgo(1), completed_at: daysAgo(1, 21), mode: "standard", category: "Item Exact Stats", score: 6, total_questions: 10, accuracy: 60, duration_seconds: 331 },
    { session_id: 93, date: daysAgo(2), completed_at: daysAgo(2, 19), mode: "standard", category: "Rune Recognition", score: 8, total_questions: 10, accuracy: 80, duration_seconds: 187 },
    { session_id: 92, date: daysAgo(3), completed_at: daysAgo(3, 8), mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60, duration_seconds: 74 },
    { session_id: 91, date: daysAgo(4), completed_at: daysAgo(4, 23), mode: "standard", category: "Objectives & Timers", score: 2, total_questions: 10, accuracy: 20, duration_seconds: 412 },
    { session_id: 90, date: daysAgo(6), completed_at: daysAgo(6, 18), mode: "standard", category: "Wave Management", score: 7, total_questions: 10, accuracy: 70, duration_seconds: 268 },
    { session_id: 89, date: daysAgo(9), completed_at: daysAgo(9, 22), mode: "standard", category: "Summoner Spells", score: 15, total_questions: 20, accuracy: 75, duration_seconds: 501 },
    { session_id: 88, date: daysAgo(18), completed_at: daysAgo(18, 20), mode: "legacy", category: null, score: 4, total_questions: 10, accuracy: 40, duration_seconds: null },
    { session_id: 87, date: daysAgo(26), completed_at: daysAgo(26, 17), mode: "standard", category: "Vision Control", score: 11, total_questions: 12, accuracy: 91.7, duration_seconds: 143 },
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

/**
 * MALT — the Review pane's bank, for both demo accounts.
 *
 * BOTH ARE LOCKED, and that is the fixture being truthful rather than the
 * fixture being lazy. Timmy's quiz history already carries `is_pro: false`
 * with the Free cap applied (`limited`, 96 sessions, ten of them served), so
 * a Pro-only missed-question bank that opened for him would be a demo account
 * contradicting itself — and the paywall is the state a real free player
 * meets, which makes it the one worth reviewing in place.
 *
 * A populated bank is a Pro state. It is covered by the Review pane's own
 * tests and is reachable on `/quiz#review` with a Pro account; it is not
 * invented here, because a demo that shows an entitlement the demo account
 * does not have is exactly the kind of thing this fixture file exists to
 * prevent.
 */
export const TIMMY_MISSED_QUESTIONS: MissedQuestionsResponse = Object.freeze({
  ok: true,
  is_pro: false,
  locked: true,
  results: [],
  upsell_message:
    "Upgrade to Mogzy Premium to review every question you missed and practice your weak spots.",
});

export const NEWCOMER_MISSED_QUESTIONS: MissedQuestionsResponse = Object.freeze({
  ok: true,
  is_pro: false,
  locked: true,
  results: [],
  upsell_message:
    "Upgrade to Mogzy Premium to review every question you missed and practice your weak spots.",
});

/** A frozen collection page: the two halves `OwnedQuestionsPane` reads. */
export interface LobbyPreviewLibrary {
  summary: QuestionLibrarySummaryView;
  entries: readonly QuestionLibraryEntryView[];
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
  history: QuizHistoryResponse;
  /** The Review pane's bank — see `TIMMY_MISSED_QUESTIONS`. */
  missedQuestions: MissedQuestionsResponse;
  /** REVIEW's OWNED collection — see `TIMMY_QUESTION_LIBRARY`. */
  questionLibrary: LobbyPreviewLibrary;
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
    missedQuestions: TIMMY_MISSED_QUESTIONS,
    questionLibrary: TIMMY_QUESTION_LIBRARY,
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
    missedQuestions: NEWCOMER_MISSED_QUESTIONS,
    questionLibrary: NEWCOMER_QUESTION_LIBRARY,
    demoRoleMastery: null,
  },
};
