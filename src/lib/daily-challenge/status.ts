/**
 * TODAY'S DAILY, FOR THE LOBBY.
 *
 * The PLAY record draws one clause for the Daily Challenge: whether today is
 * already finished, or can be picked up where it left off. The authority is
 * the Daily PARENT RUN (`GET /api/daily-run/today`, DCMOD) — the same run the
 * `/quiz/daily-challenge` page plays — so the clause and the button beside it
 * can never describe two different products.
 *
 * An UNKNOWN day — not read yet, no account, or the service unreachable —
 * renders as ordinary and playable: an unknown day is not a finished one.
 *
 * The parent run keeps no streak or theme, so both stay null; the record
 * already omits them when absent.
 */

import { httpDailyRunTransport, isDailyRunAborted } from "./run/client";
import type { DailyRunTransport } from "./run/client";
import type { DailyRun } from "./run/contracts";

export interface DailyStatusView {
  /** Has the Daily service actually answered? False = the ordinary clause. */
  known: boolean;
  /** Today's official run is finished. */
  completed: boolean;
  /** A run exists and can be picked up where it left off. */
  resumable: boolean;
  /** Stages finished / in the day, when a run exists. */
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

export function dailyStatusFrom(run: DailyRun | null): DailyStatusView {
  if (!run) {
    return { ...UNKNOWN_DAILY_STATUS, known: true };
  }
  const finished = run.stages.filter(
    (s) => s.status === "completed" || s.status === "skipped").length;
  return {
    known: true,
    completed: run.status === "completed",
    resumable: run.status === "active",
    resolved: finished,
    total: run.stages.length,
    streak: null,
    theme: null,
  };
}

/**
 * Read the status, or return the unknown one.
 *
 * Never throws (except on abort) and never surfaces a message: this feeds a
 * clause on a lobby, and a Daily service that is briefly unreachable must
 * leave the rest of the record working.
 */
export async function readDailyStatus(
  signal?: AbortSignal,
  transport: DailyRunTransport = httpDailyRunTransport,
): Promise<DailyStatusView> {
  try {
    return dailyStatusFrom(await transport.readToday(signal));
  } catch (e) {
    if (isDailyRunAborted(e)) throw e;
    return UNKNOWN_DAILY_STATUS;
  }
}
