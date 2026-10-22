/**
 * PT5.3 — the 3, 2, 1 count-in that opens every blind round, as pure functions.
 *
 * PRE-START ONLY. The count-in is the game's cue that a round is about to
 * start; it ends at the automatic start (`AUTO_START`) and nothing of it runs
 * while the interval is measured. It is identical for every round — it never
 * sees the ability, the rank, an item or the target — so its rhythm carries no
 * information about the duration being timed.
 *
 * Every number here is a share of one fixed schedule: 3 at 0 ms, 2 at 1,000,
 * 1 at 2,000, and the start due at 3,000. The hook that drives it
 * (`useCountIn`) reads the beat from the time that has REALLY passed since the
 * count-in began, so a stalled or throttled frame shows the current beat (and
 * skips one that already passed) instead of replaying them late.
 */

/** The beats, in the order they are shown. */
export const COUNT_IN_BEATS = [3, 2, 1] as const;
export type CountInBeat = typeof COUNT_IN_BEATS[number];

/** One beat on screen. */
export const COUNT_IN_STEP_MS = 1_000;

/** The whole count-in: the automatic start is due this long after it began. */
export const COUNT_IN_MS = COUNT_IN_BEATS.length * COUNT_IN_STEP_MS;

/**
 * The beat on screen `elapsedMs` after the count-in began, or null once the
 * start is due (or for a reading that is not a real elapsed time).
 */
export function countInBeatAt(elapsedMs: number): CountInBeat | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs >= COUNT_IN_MS) return null;
  const i = Math.floor(Math.max(0, elapsedMs) / COUNT_IN_STEP_MS);
  return COUNT_IN_BEATS[i];
}

/** True once the automatic start is due. */
export function countInDue(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= COUNT_IN_MS;
}

/** The final beat sounds and looks stronger, as the quiz clock's last second does. */
export function countInIsFinal(beat: CountInBeat): boolean {
  return beat === 1;
}

/**
 * The identity of one count-in pass over a round: `<round>:<pass>`. A re-count
 * after a hold or a hidden tab is a new pass (it sounds again); a re-render, a
 * StrictMode double effect or a second presenter of the same pass is not.
 */
export function countInPassId(roundId: string, pass: number): string {
  return `${roundId}:${pass}`;
}
