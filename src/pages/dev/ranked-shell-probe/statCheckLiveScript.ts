/**
 * SCBS1 — a Stat Check block, played through, one SERVER snapshot per step.
 *
 * `?mrlive=1` on the shell probe walks the real `QuizRankedMatch` (real
 * controller, real arena, real Stat Check viewport) through the states a
 * player passes through around and inside a block, so the arena's geometry can
 * be measured at the BOUNDARIES — the first card and the last — and not only
 * on one static card.
 *
 * Nothing here is an engine. Each step is a canned, backend-shaped snapshot
 * built from the shared fixtures; the controller polls and renders it exactly
 * as it would a live one.
 *
 *   step  state                                        round  module
 *    0    pre-block: an ordinary quiz question           3     quiz
 *    1    the block has arrived, its state has not       4     Stat Check ("Loading the block…")
 *    2    the block's pre-challenge phase                4     Stat Check ("Starting…")
 *    3    FIRST card, live                               4     Stat Check
 *    4    first card, revealed                           4     Stat Check
 *    5    a MIDDLE card (3 / 5), live                    4     Stat Check
 *    6    that middle card, revealed                     4     Stat Check
 *    7    the FINAL card (5 / 5), live                   4     Stat Check
 *    8    the final card, revealed; waiting on opponent  4     Stat Check
 *    9    both players done, the block is being scored    4     Stat Check
 *   10    COMPLETION: block settled, next quiz           5     quiz
 *
 * Steps 1 and 2 are the two states a block can be in BEFORE its first card is
 * on screen: the public round (which names the segment) can be read before the
 * private snapshot that carries the viewer's own state, and a block opens in a
 * pre-challenge phase on a backend that still runs one.
 */
import {
  metaReflexSegmentMeta, metaReflexResolvedPayload, metaReflexState,
  modulePointsBlock, settledCardReveal, withPointsScoring,
} from "@/lib/ranked-public/fixtures";

export const STAT_CHECK_LIVE_LAST_STEP = 10;

/**
 * The server's lead-in before card 1 becomes answerable. A LIVE entry into a
 * block plays its entry beat (`meta-reflex-entry`, 1800 ms) OVER the first card
 * during this window, so the first card has to be measured with it up.
 */
const LEAD_IN_MS = 2600;
/** `started_at` of the block's round, stamped once when card 1 is first served. */
let blockStartMs: number | null = null;

export const STAT_CHECK_LIVE_STEP_NAMES = [
  "pre-first", "loading", "starting", "first", "first-reveal", "middle", "middle-reveal",
  "final", "final-reveal", "waiting", "completion",
] as const;

/** A card that is on screen and answerable, with `index` cards behind it. */
function live(index: number) {
  return metaReflexState(index, {
    own_card_reveals: Array.from({ length: index }, (_, i) => settledCardReveal(i)),
    own_revealing_card_index: null,
  });
}

/** Card `index` has settled and is being HELD on screen (`own_revealing_card_index`). */
function revealing(index: number) {
  return metaReflexState(index + 1, {
    own_card_reveals: Array.from({ length: index + 1 }, (_, i) => settledCardReveal(i)),
    own_revealing_card_index: index,
  });
}

/** The module a step is in, the round it is, and the segment state it serves. */
function scriptFor(step: number): {
  round: number; stat: boolean; state: Record<string, unknown> | null;
} {
  switch (step) {
    case 0: return { round: 3, stat: false, state: null };
    // The segment is named, the viewer's own state has not arrived.
    case 1: return { round: 4, stat: true, state: null };
    // Pre-challenge phase: no cards are published yet.
    case 2: return {
      round: 4, stat: true,
      state: metaReflexState(0, {
        phase: "ability", challenges: null, own_card_reveals: [],
        own_card_index: null, own_card_started_at: null, own_card_deadline: null,
      }),
    };
    case 3: return { round: 4, stat: true, state: live(0) };
    case 4: return { round: 4, stat: true, state: revealing(0) };
    case 5: return { round: 4, stat: true, state: live(2) };
    case 6: return { round: 4, stat: true, state: revealing(2) };
    case 7: return { round: 4, stat: true, state: live(4) };
    // The viewer has answered card 5; the opponent has not finished.
    case 8: return {
      round: 4, stat: true,
      state: metaReflexState(5, {
        own_card_reveals: Array.from({ length: 5 }, (_, i) => settledCardReveal(i)),
        own_revealing_card_index: 4,
      }),
    };
    case 9: return {
      round: 4, stat: true,
      state: metaReflexState(5, {
        own_card_reveals: Array.from({ length: 5 }, (_, i) => settledCardReveal(i)),
        own_revealing_card_index: null,
        opponent_finished: true, opponent_challenges_completed: 5,
      }),
    };
    default: return { round: 5, stat: false, state: null };
  }
}

/** The settled block, as the round-resolved read serves it. */
export function statCheckLiveSettled() {
  return {
    ...metaReflexResolvedPayload(),
    module_points: modulePointsBlock({ userA: { base: 4, speed: 1 }, userB: { base: 2 } }),
  };
}

/** Mutates a public/private envelope into this step's snapshot and returns it. */
export function applyStatCheckLive<T extends { payload: Record<string, unknown>; round_number?: number; server_time?: string }>(
  env: T, step: number,
): T {
  const { round, stat, state } = scriptFor(step);
  const payload = env.payload;
  const active = payload.active_round as Record<string, unknown> | null;
  if (active) active.round_number = round;
  payload.completed_rounds = round - 1;
  env.round_number = round;
  // A LIVE clock, so the per-card countdown shows a running number rather than
  // the fixture's long-expired "0s" (a different glyph width, and a locked card).
  // Every snapshot restamps it, so a card never expires under the measurement.
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  env.server_time = iso(now);
  payload.server_time = env.server_time;
  // The block's round opens `LEAD_IN_MS` after its first card is first served —
  // the anchor is taken ONCE, as the backend writes `started_at` once.
  if (step < 3) blockStartMs = null;
  if (stat && step >= 3 && blockStartMs === null) blockStartMs = now + LEAD_IN_MS;
  const startedMs = stat && step >= 3 && blockStartMs !== null ? blockStartMs : now - 1000;
  if (active) {
    active.started_at = iso(startedMs);
    active.active_deadline = iso(startedMs + 30_000);
  }
  if (stat) {
    payload.question = null;
    payload.segment = metaReflexSegmentMeta({
      phase: state?.phase === "ability" ? "ability" : "challenges",
      challenge_started_at: iso(now), challenge_deadline: iso(now + 36_000),
      card_started_at: iso(now), card_deadline: iso(now + 6000),
    });
    payload.segment_state = state === null ? null : {
      ...state,
      challenge_started_at: iso(now), challenge_deadline: iso(now + 36_000),
      // A finished viewer has no card clock (`own_card_deadline: null`).
      ...(state?.own_card_deadline
        ? { own_card_started_at: iso(now), own_card_deadline: iso(now + 6000) } : {}),
    };
  }
  withPointsScoring(env, {
    moduleNumber: round, matchLength: 10, modulesCompleted: round - 1,
    scores: { userA: round >= 5 ? 5 : 2, userB: round >= 5 ? 2 : 2 },
  });
  return env;
}
