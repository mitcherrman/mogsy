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
