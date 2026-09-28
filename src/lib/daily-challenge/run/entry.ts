/**
 * Router state the Ranked Hub's Play sends to `/quiz/daily-challenge`. Play
 * already says "start today's Daily", so the page starts (or resumes) the run
 * on arrival — there is no Begin screen between the press and the game.
 *
 * Its own module so the hub can import it without pulling in the lazily
 * loaded Daily page.
 */
export const DAILY_START_STATE = { startDaily: true } as const;

export function hasDailyStartIntent(state: unknown): boolean {
  return (state as { startDaily?: unknown } | null)?.startDaily === true;
}
