/**
 * Frontend-only mock for "Featured Daily Challenge" and "Featured Ranked Quiz"
 * states. The backend does not yet expose these surfaces, but the Quiz UI needs
 * a clear daily/ranked progression loop now. All state is persisted to
 * localStorage and resets on UTC day rollover.
 *
 * Replace these helpers with real API calls once the backend supports them.
 */

const DAILY_KEY = "quiz:daily-challenge-v1";
const RANKED_KEY = "quiz:ranked-state-v1";
const RECENT_XP_KEY = "quiz:recent-xp-gain-v1";

export const DAILY_CHALLENGE_TARGET = 5;
export const DAILY_CHALLENGE_XP_BONUS = 250;
export const RANKED_PLACEMENT_MATCHES = 5;
export const RANKED_QUEUE_XP_EST = { gain: 24, loss: 12 };

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function yesterdayUtcKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type DailyChallengeState = {
  date: string;
  answered: number;
  correct: number;
  target: number;
  xpBonus: number;
  dailyStreak: number;
  lastCompletedDate: string | null;
  completed: boolean;
  remaining: number;
};

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export function getDailyChallenge(): DailyChallengeState {
  const today = todayUtcKey();
  const stored = readJSON<Partial<DailyChallengeState>>(DAILY_KEY) || {};
  let answered = stored.date === today ? Number(stored.answered ?? 0) : 0;
  let correct = stored.date === today ? Number(stored.correct ?? 0) : 0;
  let dailyStreak = Number(stored.dailyStreak ?? 0);
  const lastCompletedDate = (stored.lastCompletedDate as string | null) ?? null;

  // If the previous day wasn't completed and isn't today, the streak resets to 0.
  if (
    lastCompletedDate &&
    lastCompletedDate !== today &&
    lastCompletedDate !== yesterdayUtcKey()
  ) {
    dailyStreak = 0;
  }

  const target = DAILY_CHALLENGE_TARGET;
  const completed = answered >= target;
  return {
    date: today,
    answered,
    correct,
    target,
    xpBonus: DAILY_CHALLENGE_XP_BONUS,
    dailyStreak,
    lastCompletedDate,
    completed,
    remaining: Math.max(0, target - answered),
  };
}

export function recordDailyAnswer(isCorrect: boolean): DailyChallengeState {
  const current = getDailyChallenge();
  if (current.completed) return current;
  const next: DailyChallengeState = {
    ...current,
    answered: current.answered + 1,
    correct: current.correct + (isCorrect ? 1 : 0),
  };
  next.remaining = Math.max(0, next.target - next.answered);
  next.completed = next.answered >= next.target;
  if (next.completed && current.lastCompletedDate !== current.date) {
    const wasYesterday = current.lastCompletedDate === yesterdayUtcKey();
    next.dailyStreak = wasYesterday ? current.dailyStreak + 1 : 1;
    next.lastCompletedDate = current.date;
  }
  writeJSON(DAILY_KEY, next);
  return next;
}

export type RankedState = {
  placementMatchesRemaining: number;
  isPlaced: boolean;
  estimatedGain: number;
  estimatedLoss: number;
};

export function getRankedState(attempts: number): RankedState {
  const stored = readJSON<Partial<RankedState>>(RANKED_KEY) || {};
  const baseAttempts = Math.max(attempts, Number(stored.placementMatchesRemaining ? 0 : 0));
  const remaining = Math.max(0, RANKED_PLACEMENT_MATCHES - baseAttempts);
  return {
    placementMatchesRemaining: remaining,
    isPlaced: remaining === 0,
    estimatedGain: RANKED_QUEUE_XP_EST.gain,
    estimatedLoss: RANKED_QUEUE_XP_EST.loss,
  };
}

export function recordRecentXpGain(xp: number): void {
  if (!Number.isFinite(xp) || xp <= 0) return;
  writeJSON(RECENT_XP_KEY, { xp, at: Date.now() });
}

export function getRecentXpGain(maxAgeMs = 30 * 60 * 1000): number | null {
  const v = readJSON<{ xp: number; at: number }>(RECENT_XP_KEY);
  if (!v) return null;
  if (Date.now() - Number(v.at || 0) > maxAgeMs) return null;
  return Number(v.xp) || null;
}