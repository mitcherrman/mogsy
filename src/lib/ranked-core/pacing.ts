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
 * RFX1 2B3 — THE MODULE TITLE'S PRESENTATION FLOOR.
 *
 * The between-module beat is a PRESENTATION with an intended duration, not a
 * loading indicator whose length is whatever the network left over. Loading
 * already happens underneath it (2B1's Tier 3 preparation and the swap gate),
 * and the server already owns the window it sits in — but when a late
 * discovery or a media wait squeezed the remainder, the title still played
 * for whatever was left, which at 200 ms reads as a flicker rather than as a
 * module name.
 *
 * Below this floor the title is SKIPPED instead of flashed. A beat the player
 * cannot read is worse than no beat: it registers as something appearing and
 * being missed. Nothing is extended to reach the floor — the boundary is the
 * server's and this never moves it.
 */
export const MODULE_TITLE_MIN_MS = 600;

/**
 * How long the module title may still play, given the server-anchored time
 * left until `started_at`. Never longer than `MODULE_TITLE_MS`; 0 when the
 * round is already answerable (there is no intro to play over a live
 * question) and 0 when what remains is below `MODULE_TITLE_MIN_MS`.
 */
export function moduleTitleWindowMs(
  msUntilAnswerable: number | null, nominalMs: number,
): number {
  if (msUntilAnswerable === null || Number.isNaN(msUntilAnswerable)) return nominalMs;
  const room = Math.min(nominalMs, msUntilAnswerable - MODULE_TITLE_END_MARGIN_MS);
  // The floor applies to the room, never to the nominal beat: a caller that
  // deliberately asks for a shorter title than the floor still gets it.
  if (room < Math.min(nominalMs, MODULE_TITLE_MIN_MS)) return 0;
  return Math.max(0, room);
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
 * RFX1 2B3 — THE PRE-MATCH PRESENTATION CONTRACT.
 *
 * WHAT CHANGED FROM 2B2, AND WHY
 * ──────────────────────────────
 * In 2B2 the intro was a loading cover that happened to be visible: it was up
 * from the arena's first paint and came down at `started_at − 700 ms`, so its
 * length was "whatever the server's lead-in had left after the client
 * arrived". A fast machine got a long card, a slow one got a flash, and
 * neither was a decision anybody made.
 *
 * The intro is now PRESENTATION. Every fresh Ranked match is owed the same
 * deliberate beat before its first question, and loading runs underneath it
 * rather than defining it.
 *
 * THE THREE NUMBERS
 * ─────────────────
 *  * `ENTRY_INTRO_MIN_MS` — the beat the entry is owed, measured from the
 *    instant the intro is FIRST VISIBLE (the arena's first paint). It is a
 *    floor on presentation, and it is guaranteed by the SERVER's lead-in, not
 *    by a timer here: see `ranked_public/pacing.py`, whose queue and bot leads
 *    are the client's own entry path plus this floor plus the preview below.
 *  * `ENTRY_INTRO_MAX_MS` — the ceiling. A client that arrived early has
 *    slack; without a ceiling all of it would land on the card and the intro
 *    would be visibly longer on a fast desktop than on a phone. Above the
 *    ceiling the slack goes to the locked preview instead, where waiting reads
 *    as anticipation rather than as a stall.
 *  * `ENTRY_MIN_LEAD_MS` — the locked-arena preview: the prepared first
 *    question on screen, visible and NOT answerable, before `started_at`.
 *    Unchanged from 2B1, where the preparation wait already respected it.
 *
 * WHAT IS NOT NEGOTIABLE
 * ──────────────────────
 * `started_at` is the server's, written once inside the match-creation
 * transaction. Nothing here moves it, and the ceiling below is a hard clip:
 * if the lead-in is short or already spent — a reload into a running round, a
 * staff match created with a zero lead, a very late first snapshot — the exit
 * is in the past and the card never appears. The intro can only ever spend
 * time the player was not going to be answering in.
 */
export const ENTRY_INTRO_MIN_MS = 2000;
export const ENTRY_INTRO_MAX_MS = 2600;

/**
 * The instant the entry intro must be off screen, in local epoch ms.
 *
 * `startedAtMs` is Round 1's authoritative start, already skew-corrected into
 * LOCAL time by the caller. `firstVisibleMs` is when the card first painted.
 * Null when there is no start to anchor to — the match is still resolving,
 * which is itself an intro state and is decided by `entryIntroHolding`.
 */
export function entryIntroExitMs(
  startedAtMs: number | null, firstVisibleMs: number,
): number | null {
  if (startedAtMs === null || Number.isNaN(startedAtMs)) return null;
  // The server's ceiling wins over the presentation's preference, always.
  return Math.min(startedAtMs - ENTRY_MIN_LEAD_MS, firstVisibleMs + ENTRY_INTRO_MAX_MS);
}

/**
 * Is the intro still inside its window?
 *
 * `null` for `startedAtMs` is "no round yet", which IS an intro state — the
 * match is still resolving and there is nothing else to show. `NaN` is an
 * unparseable `started_at`, which is not: a window that cannot be proven to
 * exist must not be held open, or one broken timestamp would leave the card
 * on screen for the whole match.
 */
export function entryIntroHolding(
  startedAtMs: number | null, firstVisibleMs: number, nowMs: number,
): boolean {
  if (startedAtMs === null) return true;
  if (Number.isNaN(startedAtMs)) return false;
  const exit = entryIntroExitMs(startedAtMs, firstVisibleMs);
  return exit !== null && nowMs < exit;
}

/**
 * How much deliberate intro the server's lead-in actually bought, given when
 * the client first painted the card. Measurement and tests read this; nothing
 * in the product decides on it.
 */
export function entryIntroDurationMs(
  startedAtMs: number | null, firstVisibleMs: number,
): number {
  const exit = entryIntroExitMs(startedAtMs, firstVisibleMs);
  return exit === null ? 0 : Math.max(0, exit - firstVisibleMs);
}

/**
 * RFX1 2B3 — THE MATCH-COMPLETE PRESENTATION BEAT.
 *
 * Between the final round's ordinary result feedback and the end screen there
 * was NOTHING: the snapshot that carried `match_over` swapped the whole arena
 * for the terminal frame in the same render, and the final question's own
 * reveal was explicitly suppressed (`captureResolved(..., {hold: false})`).
 * The duel's last answer was never seen to land.
 *
 * So the lifecycle now runs: final round resolves → its NORMAL result beat
 * (the same `REVEAL_HOLD_MS` every other round gets) → this deliberate
 * match-complete beat → the end screen.
 *
 * It is a presentation constant and nothing else: no score, no standing and
 * no authority depends on it, and it is deliberately one number so the beat
 * can be retuned when the outro is actually designed without touching the
 * state machine that plays it.
 */
export const MATCH_OUTRO_MS = 1200;
