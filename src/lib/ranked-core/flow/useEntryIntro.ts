/**
 * RFX1 Phase 2B2 — THE ENTRY INTRO'S WINDOW, as a one-way latch.
 *
 * The visible duel card is up from the arena's first paint and comes down at
 * `started_at − ENTRY_MIN_LEAD_MS`, in server time. After that it can never
 * come back: entering the match happens once, and a card that reappeared over
 * a match in progress would be the worst possible regression this phase could
 * ship.
 *
 * THE LATCH IS THE WHOLE POINT, not defensive coding. The window's natural
 * predicate is "how long until Round 1 is answerable", and that reads `null`
 * — indistinguishable from "no round yet" — in two ordinary mid-match states:
 * between a settled round and the next one, and on a phased segment that has
 * no engine round at all. Derived alone, the card would drop over the arena
 * every time a round settled. Latched, "we have left the entry" is stated
 * once and stays stated.
 *
 * It decides nothing about timing. `started_at` is the server's, written once
 * at match creation; this only reads it. There is no minimum-duration timer
 * here, and no way for the card to outlive the instant above.
 */
import { useRef } from "react";

import { useServerInstantWake } from "./useServerInstantWake";
import { entryIntroExitAt, entryIntroHolding } from "../pacing";
import { msUntilAnswerable } from "../timerMath";

export function useEntryIntro(args: {
  /**
   * A FRESH entry only. A player recovering a match in progress is not being
   * introduced to it, and gets the honest "Recovering match…" sentence.
   */
  eligible: boolean;
  /** Round 1's authoritative start, or null while the match is still resolving. */
  startedAt: string | null | undefined;
  skewMs: number;
}): boolean {
  const { eligible, startedAt, skewMs } = args;
  const closed = useRef(false);

  // Come down AT the exit instant rather than on the next 1s tick or the next
  // poll — the same pattern, and the same reason, as the presentation cutoff.
  // Null once the latch has closed, so no timer outlives the entry.
  useServerInstantWake(
    eligible && !closed.current ? entryIntroExitAt(startedAt ?? null) : null, skewMs);

  if (!eligible || closed.current) return false;
  const holding = entryIntroHolding(
    startedAt ? msUntilAnswerable(startedAt, skewMs, Date.now()) : null);
  if (!holding) {
    // Render-phase, and deliberately: the card must be gone on the SAME render
    // that first sees the exit instant pass, not one effect later.
    closed.current = true;
    return false;
  }
  return true;
}
