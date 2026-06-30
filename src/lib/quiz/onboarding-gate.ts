/**
 * Tracks anonymous user engagement for the quiz sign-up gate.
 * Action counts persist in localStorage (survive tab close).
 * Nudge-seen state lives in sessionStorage (resets each visit).
 */

const ACTION_COUNT_KEY = "quiz:gate:action_count";
const NUDGE_SEEN_KEY = "quiz:gate:nudge_seen";
const HUB_VISITED_KEY = "quiz:gate:hub_visited";

function readInt(storage: Storage, key: string): number {
  try {
    return parseInt(storage.getItem(key) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeInt(storage: Storage, key: string, value: number): void {
  try {
    storage.setItem(key, String(value));
  } catch {}
}

/** Increment the quiz action count and return the new total. */
export function incrementAnonymousActions(): number {
  const next = readInt(localStorage, ACTION_COUNT_KEY) + 1;
  writeInt(localStorage, ACTION_COUNT_KEY, next);
  return next;
}

export function getAnonymousActionCount(): number {
  return readInt(localStorage, ACTION_COUNT_KEY);
}

/** Called after the user signs up or links their account — clears gate state. */
export function resetGateState(): void {
  try {
    localStorage.removeItem(ACTION_COUNT_KEY);
    sessionStorage.removeItem(NUDGE_SEEN_KEY);
  } catch {}
}

/** Whether the soft nudge toast has already been shown this session. */
export function hasSoftNudgeBeenSeen(): boolean {
  try {
    return sessionStorage.getItem(NUDGE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSoftNudgeSeen(): void {
  try {
    sessionStorage.setItem(NUDGE_SEEN_KEY, "1");
  } catch {}
}

/** Mark that the user arrived via /lol hub (suppresses hub redirect on /quiz). */
export function markHubVisited(): void {
  try {
    sessionStorage.setItem(HUB_VISITED_KEY, "1");
  } catch {}
}

export function hasVisitedHub(): boolean {
  try {
    return sessionStorage.getItem(HUB_VISITED_KEY) === "1";
  } catch {
    return false;
  }
}
