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
  /**
   * RFX1 2B3 — the next round has a MEDIUM beat, so this hold may run past
   * its nominal length to soak up the poll's slack, to this cap. See
   * `REVEAL_ABSORB_CAP_MS`. Absent for every ordinary round, which is
   * unchanged.
   */
  absorbUpToMs?: number,
): number {
  if (msUntilNextAnswerable === null || Number.isNaN(msUntilNextAnswerable)) return nominalMs;
  const ceiling = absorbUpToMs === undefined
    ? nominalMs : Math.max(nominalMs, absorbUpToMs);
  return Math.max(REVEAL_HOLD_MIN_MS, Math.min(ceiling, msUntilNextAnswerable - titleMs));
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
 * WHAT THE ENTRY IS FOR
 * ─────────────────────
 * In 2B2 the intro was a loading cover that happened to be visible: it was up
 * from the arena's first paint and came down at `started_at − 700 ms`, so its
 * length was "whatever the server's lead-in had left after the client
 * arrived". A fast machine got a long card, a slow one got a flash, and
 * neither was a decision anybody made.
 *
 * The entry is now a PRESENTATION with a deliberate, repeatable rhythm:
 *
 *     match found
 *       → the Ranked intro, AT LEAST `ENTRY_INTRO_MIN_MS`, measured from the
 *         instant the card is actually first VISIBLE on this device
 *       → the arena and Round 1, visible and LOCKED, for
 *         `ENTRY_MIN_LEAD_MS`
 *       → `started_at`: input live, with the whole configured answer window
 *         still ahead of it.
 *
 * TWO NUMBERS, AND ONLY TWO
 * ─────────────────────────
 * There is no ceiling on the intro. Whatever presentation budget the server's
 * lead-in has spare goes to the CARD, because the reveal is pinned to
 * `started_at` and the locked preview is therefore always about 700 ms. An
 * earlier draft capped the intro instead, and a fast queue entry spent the
 * surplus staring at a prepared question it could not answer for two seconds.
 * A longer card is presentation; a longer inert preview is a stall.
 *
 *     arenaRevealAt      = started_at − ENTRY_MIN_LEAD_MS
 *     introVisibleUntil  = arenaRevealAt
 *     subject to:  introVisibleUntil − firstVisibleAt >= ENTRY_INTRO_MIN_MS
 *
 * WHO KEEPS THE FLOOR
 * ───────────────────
 * The SERVER, and it is the only thing that can. `started_at` is written once
 * inside the match-creation transaction and nothing on the client may move
 * it, so the floor is a property of `entry_lead_ms` in
 * `ranked_public/pacing.py`: each creation source's lead is that path's own
 * worst-reasonable spend BEFORE the card can paint, plus this floor, plus the
 * preview. This module only ever CLIPS — a lead that is short or already
 * spent (a reload into a running round, a staff match created with a zero
 * lead) ends the card early or never shows it, because the one thing the
 * entry presentation may never do is cost the player answer time.
 *
 * `firstVisibleAt` is the client's ACTUAL first paint of the card, not a
 * modelled estimate of it. It is what the floor is measured from, what the
 * tests assert on, and what the card publishes as `data-intro-ms`, so the
 * contract is checked against what the player saw rather than against an
 * assumption about how fast their device is.
 */
export const ENTRY_INTRO_MIN_MS = 2000;

/**
 * The instant the entry intro must be off screen, in local epoch ms — the
 * arena reveal, and nothing else.
 *
 * `startedAtMs` is Round 1's authoritative start, already skew-corrected into
 * LOCAL time by the caller. Null when there is no start to anchor to: the
 * match is still resolving, which is itself an intro state and is decided by
 * `entryIntroHolding`.
 */
export function entryIntroExitMs(startedAtMs: number | null): number | null {
  if (startedAtMs === null || Number.isNaN(startedAtMs)) return null;
  return startedAtMs - ENTRY_MIN_LEAD_MS;
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
export function entryIntroHolding(startedAtMs: number | null, nowMs: number): boolean {
  if (startedAtMs === null) return true;
  if (Number.isNaN(startedAtMs)) return false;
  const exit = entryIntroExitMs(startedAtMs);
  return exit !== null && nowMs < exit;
}

/**
 * How much VISIBLE intro this entry actually gets, from the card's real first
 * paint. The contract's own measurement: tests assert on it and the card
 * publishes it. Nothing in the product decides on it — it is the outcome, not
 * an input.
 */
export function entryIntroDurationMs(
  startedAtMs: number | null, firstVisibleMs: number,
): number {
  const exit = entryIntroExitMs(startedAtMs);
  return exit === null ? 0 : Math.max(0, exit - firstVisibleMs);
}

/**
 * RFX1 2B3 — THE RANKED PRESENTATION HIERARCHY.
 *
 * Ranked has three classes of presentation, and they are declared here rather
 * than living as scattered timers because the only question that matters
 * between them is "which one is playing, and for how long".
 *
 *   MAJOR   the fresh-match Ranked Duel intro, and the match-complete outro.
 *           Whole-screen beats at the edges of a match. They own their own
 *           windows (`ENTRY_INTRO_MIN_MS`, `MATCH_OUTRO_MS`).
 *   MEDIUM  the Meta Reflex entry warning and the Final Round warning. A beat
 *           that says THIS ROUND IS DIFFERENT, played in the window between a
 *           settled round and the next one.
 *   MINOR   the ordinary module transition (`MODULE_TITLE_MS`), which every
 *           other round gets.
 *
 * THE MEDIUM BEATS REPLACE THE MINOR ONE. They do not follow it. A round that
 * announces itself does not also need its module name in the header first —
 * that is two intros back to back for one question, and it is the single
 * biggest risk in adding these at all. `module_transition_ms` on the backend
 * substitutes the special term for `MODULE_TITLE_MS`, and the arena passes
 * `moduleTitleWindowMs = 0` for the same round, so the substitution is made in
 * both places from the same fact.
 *
 * This is a small Ranked-specific config, deliberately: no generic animation
 * framework, no registry, no per-beat lifecycle. Two constants and a rule.
 */
export type RankedPresentationClass = "major" | "medium" | "minor";

/** The two MEDIUM beats. Null everywhere else — most rounds are ordinary. */
export type SpecialTransitionKind = "final-round" | "meta-reflex-entry";

/**
 * How long each medium beat is GUARANTEED TO BE VISIBLE.
 *
 * Visible, not budgeted: the cutoff margin is added on top when the server's
 * lead is derived (`specialTransitionBudgetMs`), so these numbers are the
 * promise to the player rather than an allowance the margin then eats into.
 * That is the opposite of `MODULE_TITLE_MS`, which is a budget capped down to
 * `started_at − MODULE_TITLE_END_MARGIN_MS` and therefore plays for less than
 * its nominal value — a distinction worth keeping straight when tuning these.
 */
export const SPECIAL_TRANSITION_VISIBLE_MS: Record<SpecialTransitionKind, number> = {
  // Sized to fit INSIDE the budget an ordinary round already owns: the beat it
  // replaces is 1400 ms, so at 1300 + 150 the final round's lead-in grows by
  // 50 ms and cannot meaningfully move anything. The owner asked for
  // 1200-1500 and for the lower end where it fits cleanly; this is the value
  // that fits cleanliest.
  "final-round": 1300,
  // A mode shift, and the one beat that genuinely needs more room than the
  // budget already holds: the player has to recognise that the rules just
  // changed before card 1's clock starts. The old sting was 720 ms and played
  // OVER a card whose deadline was already running.
  "meta-reflex-entry": 1800,
};

/** Which class a beat belongs to. Stated so the hierarchy is checkable. */
export const RANKED_PRESENTATION_CLASS: Record<
  "entry-intro" | "match-outro" | SpecialTransitionKind | "module-title",
  RankedPresentationClass
> = {
  "entry-intro": "major",
  "match-outro": "major",
  "final-round": "medium",
  "meta-reflex-entry": "medium",
  "module-title": "minor",
};

/**
 * WHEN BOTH MEDIUM BEATS APPLY TO ONE ROUND — the final round IS a Meta
 * Reflex block.
 *
 * FINAL ROUND WINS the message: it is the higher-stakes thing to say, and a
 * player who has reached module 10 of 10 already knows they are in a match
 * whose modules differ. Two large warnings back to back for one question is
 * exactly what this phase must not produce.
 *
 * But it takes the LONGER duration. The mode shift is still happening, the
 * player still has to re-orient before card 1, and shortening that to make
 * room for a different word would trade the thing the beat is for. One phase,
 * one placeholder, the higher-stakes semantic, the more generous clock.
 */
export function resolveSpecialTransition(args: {
  finalRound: boolean; metaReflexEntry: boolean;
}): { kind: SpecialTransitionKind; visibleMs: number } | null {
  const { finalRound, metaReflexEntry } = args;
  if (!finalRound && !metaReflexEntry) return null;
  const kind: SpecialTransitionKind = finalRound ? "final-round" : "meta-reflex-entry";
  const visibleMs = Math.max(
    finalRound ? SPECIAL_TRANSITION_VISIBLE_MS["final-round"] : 0,
    metaReflexEntry ? SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"] : 0,
  );
  return { kind, visibleMs };
}

/**
 * The lead-in a medium beat needs from the server: its visible promise plus
 * the same cutoff margin every intro face respects, so the beat is off screen
 * before the round becomes answerable rather than at the instant it does.
 *
 * Takes the RESOLVED duration rather than the kind, because a round that is
 * both a final round and a Meta Reflex block carries the `final-round` kind
 * on the Meta Reflex clock — and sizing its window from the kind would hand
 * it the shorter of the two and cancel the beat outright.
 *
 * Mirrors `special_transition_ms` in `ranked_public/pacing.py`. A test pins
 * the two together.
 */
export function specialTransitionBudgetMs(visibleMs: number): number {
  return visibleMs + MODULE_TITLE_END_MARGIN_MS;
}

/**
 * RFX1 2B3 — HOW LATE THE CLIENT CAN LEARN THAT A ROUND RESOLVED.
 *
 * `useRankedMatch` polls every `POLL_MS`, and the server resolves a round on
 * whichever participant's request happens to drive it — so this client can be
 * a full interval behind. The ordinary module title simply shortens when that
 * happens (`anchoredRevealHoldMs` trades the reveal for the title, and the
 * title trades itself for the boundary). A MEDIUM BEAT CANNOT: it is either
 * played in full or not at all, so the server's budget has to carry this
 * term or a slow poll would silently cancel it.
 *
 * IT IS THE POLL INTERVAL PLUS A ROUND TRIP, not the interval alone. A
 * browser run caught that directly: the reveal began 1798 ms after the server
 * resolved on a throttled phone, not the 1500 ms `POLL_MS` alone predicts,
 * and the 298 ms difference was enough to cancel the beat.
 *
 * Mirrors `RESOLVE_DISCOVERY_MS` in `ranked_public/pacing.py`, which is where
 * it is actually spent.
 */
export const RESOLVE_POLL_MS = 1500;
/** One snapshot round trip. Phase 1 measured 110-250 ms against production. */
export const RESOLVE_RTT_MS = 400;
export const RESOLVE_DISCOVERY_MS = RESOLVE_POLL_MS + RESOLVE_RTT_MS;

/**
 * RFX1 2B3 — HEADROOM, so the floor is met with margin rather than exactly.
 *
 * Without it the server's budget equals the worst case precisely, and on the
 * latest possible discovery the beat's window came out at exactly its
 * configured length. Any scheduling jitter then dropped it below the floor
 * and CANCELLED THE BEAT ENTIRELY, because a medium beat is all-or-nothing —
 * a silent failure under load, and browser runs reproduced it: the same build
 * played the beat on one run and skipped it on the next.
 *
 * The term it has to cover is the gap between the reveal hold's timer firing
 * and the render that evaluates the window, which on a 4x-throttled phone was
 * measured at up to ~190 ms, plus ordinary scheduling noise. 600 ms is
 * roughly three times that, and the cost of being generous here is a slightly
 * longer result beat — not a millisecond of answer time.
 *
 * Mirrors `PRESENTATION_HEADROOM_MS` in `ranked_public/pacing.py`, which is
 * where it is actually spent.
 */
export const PRESENTATION_HEADROOM_MS = 600;

/**
 * How long the beat actually plays, given the server-anchored time left until
 * `started_at` at the moment it begins.
 *
 * IT ABSORBS THE SURPLUS, exactly as the fresh-match intro does. The client
 * learns that a round resolved on its own poll, up to one `POLL_MS` after the
 * server did, so the time left when the beat starts varies by that much. The
 * alternative — a fixed duration — would leave up to a poll interval of dead
 * air between the warning ending and the round starting, which is the thing
 * the ordinary module transition already gets wrong. So the beat runs to
 * `started_at − MODULE_TITLE_END_MARGIN_MS`, and the configured value is its
 * FLOOR rather than its length.
 *
 * 0 means DO NOT PLAY IT AT ALL, and that is also the replay rule: a
 * reconnect, a refresh or a very late discovery lands on a round whose
 * lead-in is already spent, reads 0 here, and shows nothing. The player is
 * not warned about a round they are already in.
 *
 * It is ALL OR NOTHING — never a shortened version. A 300 ms flash of FINAL
 * ROUND is worse than no warning, for the same reason `MODULE_TITLE_MIN_MS`
 * exists.
 */
export function specialTransitionWindowMs(
  msUntilAnswerable: number | null, visibleMs: number,
): number {
  if (msUntilAnswerable === null || Number.isNaN(msUntilAnswerable)) return 0;
  const room = msUntilAnswerable - MODULE_TITLE_END_MARGIN_MS;
  return room >= visibleMs ? room : 0;
}

/**
 * RFX1 2B3 — WHICH BEAT ABSORBS THE POLL'S SLACK.
 *
 * The client can be anywhere in its poll interval when the server resolves, so
 * between a round settling and its successor starting there is up to
 * `RESOLVE_POLL_MS` of slack that some beat has to take. Handing all of it to
 * the WARNING made a FINAL ROUND card sit for nearly three seconds on a lucky
 * poll, which is twice what it was designed for.
 *
 * So the RESULT BEAT absorbs first, up to the longer hold the product already
 * uses for a settlement with more to read, and the warning takes only what is
 * left. The player looks at their own result for longer; the announcement
 * stays close to its intended length. Same shape as the entry contract, where
 * the intro absorbs and the locked preview stays at 700 ms.
 */
export const REVEAL_ABSORB_CAP_MS = REVEAL_HOLD_LEVEL_UP_MS;

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
