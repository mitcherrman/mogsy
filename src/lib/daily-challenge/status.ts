/**
 * TODAY'S DAILY, FOR THE LOBBY (ARENA1 Step 5, §19).
 *
 * The PLAY record draws one clause for the Daily Challenge: whether today is
 * already finished, and what streak it is riding. Until now it read both from
 * `/api/quiz/daily-challenge` — the LEGACY endpoint, which describes a
 * different product: one attempt per question per day, no retry, no Meta
 * Reflex block, a different card count and a different notion of "completed".
 *
 * That was a real defect and not a cosmetic one. The record decides from it
 * whether to OFFER the mode, and the button it offers now opens the DC2 arena.
 * A day the legacy endpoint calls finished and DC2 does not (or the reverse)
 * produces a clause that either refuses a playable day or opens a finished one.
 *
 * So the authority is DC2's own `/today` and `/history`, and there is no
 * fallback to the legacy answer. An UNKNOWN day — not read yet, or a visitor
 * with no session — renders as ordinary and playable, which is the same safe
 * default the predicate it replaces documented at length: zero questions is
 * not a finished day, it is an unknown one.
 *
 * The legacy endpoint is untouched and still feeds the legacy in-page Daily
 * flow inside `Quiz.tsx`. It simply stopped being what the NEW entry believes.
 */

import { fetchHistory, fetchToday, isDcAborted } from "./client";
import type { DcHistory, DcToday } from "./contracts";

export interface DailyStatusView {
  /** Has DC2 actually answered? False = render the ordinary, playable clause. */
  known: boolean;
  /** Today's official run is finished. */
  completed: boolean;
  /** A run exists and can be picked up where it left off. */
  resumable: boolean;
  /** Cards settled / in the day, when a run exists. */
  resolved: number;
  total: number;
  /** The CURRENT streak, or null when there is none to claim. */
  streak: number | null;
  theme: string | null;
}

export const UNKNOWN_DAILY_STATUS: DailyStatusView = Object.freeze({
  known: false, completed: false, resumable: false,
  resolved: 0, total: 0, streak: null, theme: null,
});

/** The day before `iso` (YYYY-MM-DD), by UTC calendar arithmetic. */
function previousDay(iso: string): string | null {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 86_400_000).toISOString().slice(0, 10);
}

/**
 * IS THE STREAK STILL ALIVE?
 *
 * `daily_streak` on a history entry is the streak AS OF THAT RUN, and a run
 * three days old carries a number that stopped being true two days ago. The
 * backend recomputes it on completion, so nothing on the client can ask it —
 * which means the lobby either checks, or advertises a broken streak.
 *
 * The check is a comparison of two SERVER-supplied dates: today's challenge
 * date, and the date of the newest finished run. A streak survives if that run
 * was today (already played) or yesterday (still live). The one arithmetic
 * step — "the day before today" — is applied to the server's date, never to
 * the device's clock, which is the rule the lobby's Daily state has always had.
 */
export function liveStreak(today: DcToday, history: DcHistory): number | null {
  const finished = history.entries.find(
    (e) => e.status === "completed" && e.dailyStreak !== null);
  if (!finished) return null;
  const date = today.challenge.challengeDate;
  if (finished.challengeDate !== date && finished.challengeDate !== previousDay(date)) {
    return null;
  }
  return finished.dailyStreak;
}

export function dailyStatusFrom(today: DcToday, history: DcHistory | null): DailyStatusView {
  const run = today.run;
  return {
    known: true,
    completed: run?.status === "completed",
    resumable: run?.resumable === true,
    resolved: run?.resolvedCount ?? 0,
    total: run?.cardCount ?? today.challenge.cardCount,
    streak: history ? liveStreak(today, history) : null,
    theme: today.challenge.theme,
  };
}

/**
 * Read the status, or return the unknown one.
 *
 * Never throws and never surfaces a message: this feeds a clause on a lobby,
 * and a Daily service that is briefly unreachable must leave the rest of the
 * record working. The history read is separately optional — a failure there
 * costs the streak figure and nothing else.
 */
export async function readDailyStatus(signal?: AbortSignal): Promise<DailyStatusView> {
  let today: DcToday;
  try {
    today = await fetchToday(signal);
  } catch (e) {
    if (isDcAborted(e)) throw e;
    return UNKNOWN_DAILY_STATUS;
  }
  let history: DcHistory | null = null;
  try {
    history = await fetchHistory(5, signal);
  } catch (e) {
    if (isDcAborted(e)) throw e;
  }
  return dailyStatusFrom(today, history);
}
