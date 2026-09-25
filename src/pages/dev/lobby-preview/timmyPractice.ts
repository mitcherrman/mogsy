/**
 * HUB5 — Timmy's Practice record, in the three entitlement states the lobby
 * preview can show, all from ONE set of facts.
 *
 * WHAT IS AUTHORED
 * ────────────────
 *  - The ten newest Practice sessions, as the quiz-history endpoint returns
 *    them (score / total per session).
 *  - For the sessions the Missed bank's first page reaches, WHICH bank
 *    question was missed and which wrong option was picked. The count per
 *    session is checked against the session's own score.
 *  - 86 older sessions, generated deterministically (no clock, no random), so
 *    a Premium account is served its whole career the way the endpoint does.
 *
 * WHAT IS DERIVED (as the backend derives it — `routes/quiz.py`)
 * ───────────────────────────────────────────────────────────────
 *  - Free: the newest `free_limit` sessions, `limited` because the career is
 *    longer, with the upsell.
 *  - Premium: every session, never limited. The Missed bank: newest misses
 *    first, one page of `MISSED_QUESTIONS_PAGE_SIZE`, and `total_count` over
 *    every session's misses.
 *  - Entitlement lookup failed: the Free window WITHOUT `limited` or an
 *    upsell (`entitlement_status: "error"`), and the Missed bank's 503 — an
 *    error, never a paywall.
 *
 * Every missed item names its question through `questionIdentity.ts`, so a
 * `quiz:` question Timmy missed here is the same prompt, the same answer and
 * the same identity as when a Daily stage or a Ranked round asked it.
 */
import type { MissedQuestion, MissedQuestionsResponse, QuizHistoryEntry, QuizHistoryResponse } from "@/lib/quiz/api";
import { MISSED_QUESTIONS_PAGE_SIZE } from "@/components/quiz/workspace/useMissedQuestions";
import { fixtureInstant } from "./history/fixtureClock";
import { identityOf, quizContentOf, quizRef } from "./history/questionIdentity";

const FREE_LIMIT = 10;

const session = (
  session_id: number, completedAt: string, mode: string, category: string | null,
  score: number, total_questions: number, duration_seconds: number | null,
): QuizHistoryEntry => ({
  session_id, date: completedAt, completed_at: completedAt, mode, category, score, total_questions,
  // The endpoint's own rounding: one decimal place of the whole percentage.
  accuracy: Math.round((1000 * score) / total_questions) / 10,
  duration_seconds,
});

/**
 * The ten newest sessions — the Free window. Varied on purpose: both modes the
 * stream carries plus a categoryless legacy backfill, accuracy across the
 * ledger's whole tint range, question counts of 5 / 10 / 12 / 20, and one row
 * with no duration.
 */
const NEWEST: readonly QuizHistoryEntry[] = [
  session(96, fixtureInstant(0, 16), "standard", "Champion Cooldowns", 9, 10, 214),
  session(95, fixtureInstant(0, 9), "daily", null, 5, 5, 96),
  session(94, fixtureInstant(1, 21), "standard", "Item Exact Stats", 6, 10, 331),
  session(93, fixtureInstant(2, 19), "standard", "Rune Recognition", 8, 10, 187),
  session(92, fixtureInstant(3, 8), "daily", null, 3, 5, 74),
  session(91, fixtureInstant(4, 23), "standard", "Objectives & Timers", 1, 5, 412),
  session(90, fixtureInstant(6, 18), "standard", "Wave Management", 7, 10, 268),
  session(89, fixtureInstant(9, 22), "standard", "Summoner Spells", 17, 20, 501),
  session(88, fixtureInstant(18, 20), "legacy", null, 4, 10, null),
  session(87, fixtureInstant(26, 17), "standard", "Vision Control", 11, 12, 143),
];

/** The older career, generated rather than typed: a fixed cycle of
 *  categories, lengths and miss counts, dated back from session 87. */
const OLDER_CATEGORIES = [
  "Champion Cooldowns", "Item Exact Stats", "Rune Recognition", "Objectives & Timers",
  "Wave Management", "Summoner Spells", "Vision Control",
];
const OLDER_TOTALS = [10, 10, 5, 12, 10, 20, 10];
const OLDER: readonly QuizHistoryEntry[] = Array.from({ length: 86 }, (_, k) => {
  const id = 86 - k;
  const total = OLDER_TOTALS[id % OLDER_TOTALS.length];
  const misses = (id * 3) % Math.max(2, Math.floor(total / 2));
  return session(
    id, fixtureInstant(27 + Math.floor(k / 2), 12 + (id % 8)), "standard",
    OLDER_CATEGORIES[id % OLDER_CATEGORIES.length], total - misses, total, 120 + ((id * 37) % 400),
  );
});

export const TIMMY_PRACTICE_SESSIONS: readonly QuizHistoryEntry[] = Object.freeze([...NEWEST, ...OLDER]);

/**
 * The misses the Missed bank's first page reaches, newest session first:
 * `[bank question key, index of the wrong option picked]`.
 */
const SESSION_MISSES: Readonly<Record<number, Array<[string, number]>>> = {
  96: [["annie-q-cooldown", 1]],
  94: [["rabadon-ap", 1], ["sunfire-health", 2], ["bork-attack-speed", 1], ["liandry-ap", 3]],
  93: [["electrocute-hits", 2], ["first-strike-window", 1]],
  92: [["warmog-health", 1], ["ignite-cooldown", 2]],
  91: [["dragon-first-spawn", 1], ["baron-first-spawn", 3], ["inhibitor-respawn", 1], ["turret-plates-fall", 2]],
  90: [["cannon-cadence", 1], ["first-minions", 1], ["freeze-definition", 2]],
  89: [["ignite-cooldown", 1], ["teleport-cooldown", 1], ["exhaust-duration", 2]],
  88: [["ezreal-e-cooldown", 1], ["warmog-health", 2], ["rabadon-ap", 3], ["dragon-first-spawn", 2],
    ["cannon-cadence", 2], ["electrocute-hits", 1]],
};

const missesOf = (s: QuizHistoryEntry) => s.total_questions - s.score;

function missedPage(): { results: MissedQuestion[]; totalCount: number } {
  const results: MissedQuestion[] = [];
  for (const s of TIMMY_PRACTICE_SESSIONS) {
    if (results.length >= MISSED_QUESTIONS_PAGE_SIZE) break;
    const authored = SESSION_MISSES[s.session_id];
    if (!authored) {
      if (missesOf(s) > 0) throw new Error(`Practice session ${s.session_id}: its misses are not authored`);
      continue;
    }
    if (authored.length !== missesOf(s)) {
      throw new Error(`Practice session ${s.session_id}: ${authored.length} misses authored, the score says ${missesOf(s)}`);
    }
    if (new Set(authored.map(([k]) => k)).size !== authored.length) {
      throw new Error(`Practice session ${s.session_id}: one question missed twice in one session`);
    }
    const doneAt = Date.parse(s.completed_at!);
    // Newest attempt first, as the endpoint orders them.
    authored.map(([key, picked], i) => ({ key, picked, i })).reverse().forEach(({ key, picked, i }) => {
      const ref = quizRef(key);
      const identity = identityOf(ref);
      const content = quizContentOf(ref);
      if (picked === content.correctIndex) throw new Error(`${ref}: a miss must pick a wrong option`);
      if (s.category && identity.category !== s.category) {
        throw new Error(`${ref} is not a ${s.category} question`);
      }
      results.push({
        attempt_id: s.session_id * 100 + i,
        question_id: identity.quizQuestionId!,
        question_text: content.prompt,
        selected_answer: content.options[picked],
        correct_answer: content.options[content.correctIndex],
        category: identity.category,
        difficulty: null,
        missed_at: new Date(doneAt - (authored.length - i) * 20_000).toISOString(),
        explanation: typeof content.explanation?.scenario_note === "string" ? content.explanation.scenario_note : null,
      });
    });
  }
  if (results.length !== MISSED_QUESTIONS_PAGE_SIZE) {
    throw new Error(`the Missed bank's first page holds ${results.length}, not ${MISSED_QUESTIONS_PAGE_SIZE}`);
  }
  return { results, totalCount: TIMMY_PRACTICE_SESSIONS.reduce((n, s) => n + missesOf(s), 0) };
}

const MISSED = missedPage();

const HISTORY_UPSELL = "Free accounts save your last 10 results. Upgrade to Mogzy Premium to unlock your full quiz history.";
const MISSED_UPSELL = "Upgrade to Mogzy Premium to review every question you missed and practice your weak spots.";

/** Free: the newest ten of a longer career, flagged `limited`. */
export const TIMMY_QUIZ_HISTORY_FREE: QuizHistoryResponse = Object.freeze({
  ok: true, is_pro: false, total_count: TIMMY_PRACTICE_SESSIONS.length, limited: true,
  free_limit: FREE_LIMIT, upsell_message: HISTORY_UPSELL, entitlement_status: "ok",
  results: TIMMY_PRACTICE_SESSIONS.slice(0, FREE_LIMIT),
});

/** Premium: the whole career. */
export const TIMMY_QUIZ_HISTORY_PREMIUM: QuizHistoryResponse = Object.freeze({
  ok: true, is_pro: true, total_count: TIMMY_PRACTICE_SESSIONS.length, limited: false,
  free_limit: FREE_LIMIT, upsell_message: null, entitlement_status: "ok",
  results: [...TIMMY_PRACTICE_SESSIONS],
});

/** Entitlement lookup failed: the Free window, no limit flag, no upsell. */
export const TIMMY_QUIZ_HISTORY_UNAVAILABLE: QuizHistoryResponse = Object.freeze({
  ok: true, is_pro: false, total_count: TIMMY_PRACTICE_SESSIONS.length, limited: false,
  free_limit: FREE_LIMIT, upsell_message: null, entitlement_status: "error",
  results: TIMMY_PRACTICE_SESSIONS.slice(0, FREE_LIMIT),
});

/** Free: the bank is Premium-only, and a locked bank carries no data. */
export const TIMMY_MISSED_LOCKED: MissedQuestionsResponse = Object.freeze({
  ok: true, is_pro: false, locked: true, results: [], upsell_message: MISSED_UPSELL,
});

/** Premium: the first page, newest first, and the whole bank's count. */
export const TIMMY_MISSED_PREMIUM: MissedQuestionsResponse = Object.freeze({
  ok: true, is_pro: true, locked: false, results: MISSED.results,
  total_count: MISSED.totalCount, limit: MISSED_QUESTIONS_PAGE_SIZE, offset: 0,
});

/** What the Missed hook shows when the endpoint answers 503 (entitlement
 *  unknown): its own failure line, never the paywall. */
export const MISSED_UNAVAILABLE_ERROR = "Could not load missed questions.";
