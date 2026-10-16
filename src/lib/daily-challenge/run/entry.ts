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

/**
 * PGM1 — router state a More Challenges card's Play sends for a Daily bonus
 * stage (Time Trial, Survival). The player already chose that stage, so a run
 * that loads onto `optional-entry` goes straight on into it instead of asking
 * again. It never starts a run (the card offers Play only for a run whose main
 * Daily is complete) and never skips the server's stage order.
 */
export const DAILY_CONTINUE_STATE = { continueDaily: true } as const;

export function hasDailyContinueIntent(state: unknown): boolean {
  return (state as { continueDaily?: unknown } | null)?.continueDaily === true;
}
