/**
 * PLAY1 — is today's Daily Challenge already finished?
 *
 * ONE PREDICATE, OVER STATE THE PAGE ALREADY HAS.
 * `Quiz.tsx` holds `dailyChallenge` from the moment it mounts: seeded from
 * `getDailyChallenge()` and then overwritten by the backend's own
 * `getDailyChallenge` response through `applyDailyChallengeResponse`. That
 * state is already handed to the match-entry record as `daily`, so the record
 * can answer this question BEFORE it draws the clause. Nothing here fetches,
 * and nothing needs to: a second read of the same endpoint to decide how to
 * render a card would be a request whose answer we are already holding.
 *
 * WHY THIS EXISTS AS A FUNCTION AND NOT AS `daily.completed`
 * ─────────────────────────────────────────────────────────
 * Because `completed` alone is not what the HOST does. `handlePlayDailyChallenge`
 * fetches the day's set, filters to `!q.answered`, and if nothing is left it
 * puts the page back to `sets` — i.e. it silently returns to the lobby. That
 * happens whenever there is nothing left to answer, which `completed` is only
 * one of the ways to say. The three clauses below are the three ways the same
 * payload can express it:
 *
 *   completed              the backend's own flag (`progress.completed`).
 *   remaining <= 0         the backend's own count of what is left.
 *   answered >= target     the arithmetic, for a payload that carries neither.
 *
 * A card that says "playable" and then bounces the player straight back is the
 * defect this closes, so the predicate is deliberately the UNION: if any of
 * the three says there is nothing to answer, the clause must not offer to.
 *
 * THE `target > 0` GUARD IS LOAD-BEARING. An empty or failed payload leaves
 * every count at zero, and `0 >= 0` is true — so without the guard a backend
 * outage would render every account's Daily Challenge as "complete for
 * today". Zero questions is not a finished day; it is an unknown one, and an
 * unknown day stays playable.
 */

import type { DailyChallengeState } from "@/lib/quiz/featured-mock";

export function isDailyChallengeComplete(
  daily: DailyChallengeState | null | undefined,
): boolean {
  if (!daily) return false;
  if (daily.completed) return true;
  // Both remaining clauses need a real target — see the guard note above.
  if (daily.target <= 0) return false;
  if (daily.remaining <= 0) return true;
  return daily.answered >= daily.target;
}
