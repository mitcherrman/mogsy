/**
 * THE ARENA'S RESULT BEAT — how long a settled question stays on screen.
 *
 * One pair of numbers, in the shared layer, because more than one mode now
 * paces itself by them and a second copy would be a second answer to "how long
 * does a result last". They are LIVE RANKED'S, unchanged: `useRankedMatch` has
 * held a resolved round for `REVEAL_HOLD_MS` since the mode shipped, and
 * lengthened it to `REVEAL_HOLD_LEVEL_UP_MS` when the settlement carried a
 * level-up. Moving the declaration here changed neither value and neither
 * caller's behaviour.
 *
 * WHY A MODE MAY REACH FOR THE LONGER ONE
 * ───────────────────────────────────────
 * The distinction Ranked draws is not "level-up" — it is STRICTLY MORE TO READ.
 * A settlement that only says which side won is the short beat; one that also
 * has to deliver a new ability is the long one. Any mode with the same shape of
 * decision may reuse the same two numbers for it, and the Daily does: a card
 * that resolves with nothing but its verdict takes the short beat, and a card
 * whose explanation survived the mode's display policy takes the long one.
 *
 * WHAT THESE ARE NOT
 * ──────────────────
 * Authority over anything. No score, no correctness, no expiry and no server
 * state is decided by a beat length; a mode that changed one would change how
 * long a picture is held and nothing else. They are also not a floor on how
 * long a player may look at something — a mode that lets the player linger
 * (the Tutorial's scripted steps) simply does not use them.
 */

/** A settled question, held for its ordinary result beat. */
export const REVEAL_HOLD_MS = 1500;

/** Held longer when the settlement carries strictly more to read. */
export const REVEAL_HOLD_LEVEL_UP_MS = 2600;

/**
 * RG3 — the same allowance, for the same reason, when the round shipped
 * EVIDENCE.
 *
 * 1500ms is sized for a verdict and a highlighted tablet, which are read at a
 * glance. A factual line under the grid is a sentence, and a beat that ends
 * before it can be read is worse than no line at all — the player registers
 * that something appeared and that they missed it.
 *
 * Deliberately the SAME number as the level-up hold rather than a third one:
 * the two cases make the identical claim ("this settlement has more in it"),
 * and inventing a second duration would imply a distinction nobody measured.
 * It is applied ONLY when evidence actually exists, so the ordinary round —
 * which is most rounds — keeps its 1500ms exactly.
 */
export const REVEAL_HOLD_EVIDENCE_MS = REVEAL_HOLD_LEVEL_UP_MS;

/**
 * RFX1 Phase 2A — the shortest reveal a LIVE settlement is ever given.
 *
 * Only reached when the client discovered the resolution late (it learns on
 * its own poll, up to one interval after the server resolved, possibly on the
 * opponent's request). Long enough for the viewer's verdict and the opponent's
 * staggered beat (~400ms later) to both land.
 */
export const REVEAL_HOLD_MIN_MS = 900;

/**
 * The reveal hold, ANCHORED TO THE SERVER'S CLOCK.
 *
 * The hold used to run a fixed duration from the moment THIS client noticed the
 * settlement, while the next round's `started_at` is anchored to the moment the
 * SERVER resolved. A late discovery therefore ate the module-title window and
 * could leave the new question appearing in the same instant it became
 * answerable. Now the hold ends no later than `started_at − titleMs`, so the
 * title keeps its window whenever the server's budget allows it, and the
 * nominal hold is never lengthened.
 *
 * `msUntilNextAnswerable` is server-anchored (skew-corrected) time until the
 * next round's `started_at`, or null when there is no next round (match over,
 * a phased segment with no engine round yet) — then the nominal hold stands.
 */
export function anchoredRevealHoldMs(
  nominalMs: number, msUntilNextAnswerable: number | null, titleMs: number,
): number {
  if (msUntilNextAnswerable === null || Number.isNaN(msUntilNextAnswerable)) return nominalMs;
  return Math.max(REVEAL_HOLD_MIN_MS, Math.min(nominalMs, msUntilNextAnswerable - titleMs));
}

/**
 * RFX1 2B1 — the least time the next question stays on screen, locked, before
 * it becomes answerable, when the swap waited for its media. The module title
 * owns `MODULE_TITLE_MS` of the lead-in; the swap may borrow the part of it
 * above this floor and never more.
 */
export const SWAP_MEDIA_MIN_LEAD_MS = 1000;

/**
 * How long the swap may still wait for the next round's critical media, given
 * the server-anchored time left until that round's `started_at`. 0 when there
 * is no budget (or no next round): the swap happens now and the media simply
 * finishes loading on screen. It can never reach past `started_at`.
 */
export function swapMediaWaitMs(msUntilNextAnswerable: number | null): number {
  if (msUntilNextAnswerable === null || Number.isNaN(msUntilNextAnswerable)) return 0;
  return Math.max(0, msUntilNextAnswerable - SWAP_MEDIA_MIN_LEAD_MS);
}

/**
 * RFX1 2B1 — ROUND 1's entry preparation. When round 1 arrives with a server
 * lead-in still ahead of it, the arena may keep its existing "Entering the
 * arena…" placeholder while round 1's critical media loads and decodes, for at
 * most `ENTRY_PREP_CAP_MS`, and never later than `started_at −
 * ENTRY_MIN_LEAD_MS`. With no lead-in left (a reload into a live round, an
 * old backend) there is no wait at all.
 */
export const ENTRY_PREP_CAP_MS = 1500;
export const ENTRY_MIN_LEAD_MS = 700;

/** The entry wait budget for round 1, or 0 for none. */
export function entryPrepBudgetMs(msUntilAnswerable: number | null): number {
  if (msUntilAnswerable === null || Number.isNaN(msUntilAnswerable)) return 0;
  return Math.max(0, Math.min(ENTRY_PREP_CAP_MS, msUntilAnswerable - ENTRY_MIN_LEAD_MS));
}

/**
 * RFX1 2B1 closeout — THE PRESENTATION CUTOFF.
 *
 * Every intro face is off screen by `started_at − MODULE_TITLE_END_MARGIN_MS`.
 * Once the server's instant arrives the arena must unmistakably be the live
 * question: a module name still sitting in the header while the clock runs and
 * input is open says "intro" about a round the player may already be
 * answering.
 *
 * The margin is small on purpose — it buys the face's own fade-out, not a
 * beat of its own.
 */
export const MODULE_TITLE_END_MARGIN_MS = 150;

/**
 * How long the module title may still play, given the server-anchored time
 * left until `started_at`. Never longer than `MODULE_TITLE_MS`, and 0 when
 * the round is already answerable — there is no intro to play over a live
 * question.
 */
export function moduleTitleWindowMs(
  msUntilAnswerable: number | null, nominalMs: number,
): number {
  if (msUntilAnswerable === null || Number.isNaN(msUntilAnswerable)) return nominalMs;
  return Math.max(0, Math.min(nominalMs, msUntilAnswerable - MODULE_TITLE_END_MARGIN_MS));
}

/**
 * The instant the arena must be out of its intro presentation: the server's
 * `started_at` less `MODULE_TITLE_END_MARGIN_MS`, as an ISO string for
 * `useServerInstantWake`. Null when there is no start to anchor to.
 */
export function presentationCutoffAt(startedAtIso: string | null | undefined): string | null {
  if (!startedAtIso) return null;
  const t = Date.parse(startedAtIso);
  return Number.isNaN(t) ? null : new Date(t - MODULE_TITLE_END_MARGIN_MS).toISOString();
}

/**
 * RFX1 2B2 — THE VISIBLE ENTRY INTRO'S EXIT.
 *
 * The intro occupies the server's Round-1 lead-in and nothing else. It starts
 * when the arena mounts (the match is known, the first snapshot is not) and it
 * is GONE by `started_at − ENTRY_MIN_LEAD_MS`, which is the same margin the
 * 2B1 preparation wait already respects — so the first question is on screen,
 * prepared and stable, for at least that long before input opens.
 *
 * It adds NO time of its own. `started_at` is the server's, written once at
 * match creation; this only decides how much of the period already ahead of it
 * is spent looking at a duel card rather than at a locked question. If the
 * lead-in is short (a bot match seen late, a staff match with no lead, a
 * reload into a running round) the exit instant is already in the past and the
 * intro ends immediately — server timing wins, every time.
 */
export function entryIntroExitAt(startedAtIso: string | null | undefined): string | null {
  if (!startedAtIso) return null;
  const t = Date.parse(startedAtIso);
  return Number.isNaN(t) ? null : new Date(t - ENTRY_MIN_LEAD_MS).toISOString();
}

/**
 * Is the intro still inside its window? `msUntilAnswerable` is the
 * skew-corrected time left until Round 1's `started_at`; null (no round yet,
 * no start) means the match is still resolving, which IS an intro state.
 */
export function entryIntroHolding(msUntilAnswerable: number | null): boolean {
  // `null` is "no round yet", which IS an intro state. `NaN` is an
  // unparseable `started_at`, which is not: a window that cannot be proven to
  // exist must not be held open, or a broken timestamp would leave the card
  // on screen for the whole match.
  if (msUntilAnswerable === null) return true;
  if (Number.isNaN(msUntilAnswerable)) return false;
  return msUntilAnswerable > ENTRY_MIN_LEAD_MS;
}
