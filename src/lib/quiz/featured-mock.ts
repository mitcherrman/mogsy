/**
 * Frontend-only local state for the Ranked lobby figure and the recent-XP
 * nudge. Persisted to localStorage.
 *
 * The Daily half of this file is gone. It mirrored the five-question in-page
 * Daily — its target, its XP bonus, its theme rota and a client-side streak —
 * and every one of those is a server fact in DC2, read through
 * `src/lib/daily-challenge/status.ts`. Nothing here is a Daily authority any
 * more, and nothing should become one.
 */

const RANKED_KEY = "quiz:ranked-state-v1";
const RECENT_XP_KEY = "quiz:recent-xp-gain-v1";

export const RANKED_PLACEMENT_MATCHES = 5;
export const RANKED_QUEUE_XP_EST = { gain: 24, loss: 12 };

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