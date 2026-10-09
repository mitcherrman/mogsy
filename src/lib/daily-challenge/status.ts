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
 *
 * DV2-P2A — "completed" is the PLAYER's fact: today's Daily is done. For
 * v1–v4 that is the parent run completing. For a plan v5+ run it is the MAIN
 * Daily (Standard) completing, while the parent may stay active — and so
 * resumable — for the optional More Challenges and Review. `completed` and
 * `resumable` are therefore both true on such a day (`optionalOpen`).
 */

import { httpDailyRunTransport, isDailyRunAborted } from "./run/client";
import type { DailyRunTransport } from "./run/client";
import type { DailyRun } from "./run/contracts";
import { hasMainDaily, isMainDailyComplete } from "./run/contracts";

export interface DailyStatusView {
  /** Has the Daily service actually answered? False = the ordinary clause. */
  known: boolean;
  /**
   * Today's Daily is complete, as the player understands it: the parent run
   * (v1–v4) or the MAIN Daily (v5+).
   */
  completed: boolean;
  /** A run exists and is still open: it can be picked up where it left off. */
  resumable: boolean;
  /**
   * DV2-P2A — the Daily is complete AND optional content (More Challenges,
   * Review) is still open on the same run. Only ever true for v5+.
   */
  optionalOpen: boolean;
  /**
   * Stages finished / in the day — a LEGACY (v1–v4) fact only, where every
   * stage is part of the one challenge. Null for v5+: there, optional stages
   * are not part of the Daily, and no all-stage count is offered.
   */
  resolved: number | null;
  total: number | null;
  /** The CURRENT streak, or null when there is none to claim. */
  streak: number | null;
  theme: string | null;
}

export const UNKNOWN_DAILY_STATUS: DailyStatusView = Object.freeze({
  known: false, completed: false, resumable: false, optionalOpen: false,
  resolved: 0, total: 0, streak: null, theme: null,
});

export function dailyStatusFrom(run: DailyRun | null): DailyStatusView {
  if (!run) {
    return { ...UNKNOWN_DAILY_STATUS, known: true };
  }
  const resumable = run.status === "active";
  if (hasMainDaily(run)) {
    const completed = isMainDailyComplete(run);
    return {
      known: true,
      completed,
      resumable,
      optionalOpen: completed && resumable,
      resolved: null,
      total: null,
      streak: null,
      theme: null,
    };
  }
  const finished = run.stages.filter(
    (s) => s.status === "completed" || s.status === "skipped").length;
  return {
    known: true,
    completed: run.status === "completed",
    resumable,
    optionalOpen: false,
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
