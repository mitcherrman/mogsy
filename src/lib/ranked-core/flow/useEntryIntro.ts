/**
 * RFX1 Phase 2B2/2B3 — THE ENTRY PRESENTATION COORDINATOR.
 *
 * ONE owner for the pre-match rhythm. There is no `setTimeout(2000)` in the
 * intro component and no second match state: this reads three things — when
 * the card first painted, the server's authoritative `started_at`, and the
 * clock skew — and answers one question, "is the intro still up".
 *
 * THE RHYTHM (2B3)
 * ────────────────
 *   match found
 *     → the intro, for AT LEAST `ENTRY_INTRO_MIN_MS`, measured from the
 *       instant the card actually first paints on this device
 *     → the arena and Round 1, VISIBLE and LOCKED, for `ENTRY_MIN_LEAD_MS`
 *     → `started_at`: input live, with the whole configured answer window
 *       still ahead of it.
 *
 * The reveal is pinned to `started_at`, so surplus presentation budget goes
 * to the CARD and the locked preview stays at its 700 ms. There is no
 * ceiling on the intro and there is no local timer: this reads the server's
 * instant and the card's real first paint, and answers one question.
 *
 * The floor is the SERVER's promise, not this hook's: `entry_lead_ms` in
 * `ranked_public/pacing.py` is sized as the client's own entry path plus the
 * floor plus the preview, per creation source. This hook only ever CLIPS —
 * if the lead-in is short or already spent the card ends early or never
 * appears, because the one thing the entry presentation may never do is cost
 * the player answer time.
 *
 * THE LATCH IS STILL THE WHOLE POINT, not defensive coding. The window's
 * natural predicate reads `null` for `started_at` — indistinguishable from
 * "no round yet" — in three ordinary states: between a settled round and the
 * next, on a phased segment with no engine round, and on a completed match.
 * Derived alone, the card would drop over the arena every time a round
 * settled, and sit over a finished match for ever. Latched, "we have left the
 * entry" is stated once and stays stated — which is also the replay
 * protection: a refresh or a reconnect is not a fresh entry, and a fresh
 * entry happens once per mount.
 */
import { useRef } from "react";

import { useServerInstantWake } from "./useServerInstantWake";
import { entryIntroDurationMs, entryIntroExitMs, entryIntroHolding } from "../pacing";

export interface EntryIntroWindow {
  /** Is the card up on this render? */
  up: boolean;
  /**
   * How long the card is on course to be VISIBLE for, from its real first
   * paint — the contract's own measurement, published as `data-intro-ms`.
   * Null before a `started_at` exists to measure against.
   */
  visibleMs: number | null;
}

export function useEntryIntro(args: {
  /**
   * A FRESH entry only. A player recovering a match in progress is not being
   * introduced to it, and gets the honest "Recovering match…" sentence.
   */
  eligible: boolean;
  /** Round 1's authoritative start, or null while the match is still resolving. */
  startedAt: string | null | undefined;
  skewMs: number;
}): EntryIntroWindow {
  const { eligible, startedAt, skewMs } = args;
  const closed = useRef(false);
  /**
   * WHEN THE CARD FIRST PAINTED — the client-known entry instant, and the
   * anchor the minimum is measured from. Captured on the first eligible
   * render, which on every real path is the arena's first paint: the route
   * transition and the first snapshot fetch both still lie ahead of it.
   */
  const firstVisible = useRef<number | null>(null);
  if (eligible && !closed.current && firstVisible.current === null) {
    firstVisible.current = Date.now();
  }

  // Server instant -> LOCAL instant. `skewMs` is server-minus-local
  // (`snapshotSkewMs`), so the local reading of a server timestamp is that
  // timestamp less the skew — the same correction `msUntilAnswerable` makes.
  const startedAtMs = startedAt ? Date.parse(startedAt) - skewMs : null;
  const anchor = firstVisible.current ?? Date.now();
  const exitMs = entryIntroExitMs(startedAtMs);
  const visibleMs = startedAtMs === null || Number.isNaN(startedAtMs)
    ? null : entryIntroDurationMs(startedAtMs, anchor);

  // Come down AT the exit instant rather than on the next 1s tick or the next
  // poll — the same pattern, and the same reason, as the presentation cutoff.
  // Null once the latch has closed, so no timer outlives the entry. The
  // instant is already LOCAL, so no skew is applied a second time.
  useServerInstantWake(
    eligible && !closed.current && exitMs !== null ? new Date(exitMs).toISOString() : null, 0);

  if (!eligible || closed.current) return { up: false, visibleMs: null };
  if (!entryIntroHolding(startedAtMs, Date.now())) {
    // Render-phase, and deliberately: the card must be gone on the SAME render
    // that first sees the exit instant pass, not one effect later.
    closed.current = true;
    return { up: false, visibleMs: null };
  }
  return { up: true, visibleMs };
}
