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

/**
 * Rotating daily themes. The active theme is derived from the UTC day so it
 * stays stable for the entire day and varies day-to-day.
 */
const DAILY_THEMES: { title: string; blurb: string }[] = [
  { title: "Champion Cooldowns", blurb: "Memorize the timing windows that win trades." },
  { title: "Item Knowledge", blurb: "Recognize core builds and component paths." },
  { title: "Champion Basics", blurb: "Identify champions, roles, and signature kits." },
  { title: "Rune Recognition", blurb: "Spot keystones, secondaries, and shards on sight." },
  { title: "Summoner Spells", blurb: "Track summoner cooldowns to control objectives." },
  { title: "Item Components", blurb: "Trace finished items back to their components." },
  { title: "Ability Identification", blurb: "Name the spell from the icon alone." },
];

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getTodaysTheme(): { title: string; blurb: string } {
  // Stable day-of-year index so the theme is consistent for the entire UTC day.
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return DAILY_THEMES[dayOfYear % DAILY_THEMES.length];
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
  themeTitle: string;
  themeBlurb: string;
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
  const theme = getTodaysTheme();
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
    themeTitle: theme.title,
    themeBlurb: theme.blurb,
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