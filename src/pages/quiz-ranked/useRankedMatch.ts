/**
 * Public Ranked live-match controller (F1.5). Owns the match id, single-flight
 * public/private polling with backoff+abort, skew-anchored timer input,
 * resolved-round capture, the select→review→confirm-atomic submission flow,
 * a separate presence heartbeat, and recovery/terminal
 * states. The backend is authoritative for every combat value; this computes
 * none. Modeled on the staff session + DSA recovery patterns but JWT-only —
 * no participant token or admin key.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REVEAL_HOLD_EVIDENCE_MS, REVEAL_HOLD_LEVEL_UP_MS, REVEAL_HOLD_MS, anchoredRevealHoldMs,
  swapMediaWaitMs,
  MATCH_OUTRO_MS, PRESENTATION_HEADROOM_MS, REVEAL_ABSORB_CAP_MS,
  specialTransitionBudgetMs,
} from "@/lib/ranked-core/pacing";
import { projectSpecialTransition } from "@/lib/ranked-core/flow/rankedFlow";
import { META_REFLEX_MODULE_ID } from "@/lib/ranked-core/modules/metaReflexModule";
import { MODULE_TITLE_MS } from "@/lib/ranked-core/centralStage";
import { adaptBackendSettlement } from "@/lib/ranked-core/backend/adaptBackendSettlement";

// The backend resolved payload is validated at runtime by the settlement
// adapter; alias its input type for the cast from the parsed envelope.
type ResolvedProjection = Parameters<typeof adaptBackendSettlement>[0];
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import * as api from "@/lib/ranked-public/client";
import { RankedApiError } from "@/lib/ranked-public/client";
import type {
  MatchResultView, PresenceView, PrivatePlayerView, PublicRoundView,
  SegmentSettlementView, SegmentStateView,
} from "@/lib/ranked-public/contracts";
import {
  META_REFLEX_MIXED_VERSION, readSegmentSettlement,
} from "@/lib/ranked-public/contracts";
import { conciseEvidence } from "@/lib/question-feedback/evidence";
import { snapshotSkewMs } from "./rankedViews";
import { reconciledSkewMs } from "@/lib/ranked-core/timerMath";
import { msUntilServerInstant } from "@/lib/ranked-core/flow/useServerInstantWake";
import { useSfx } from "@/lib/audio/useSfx";

const POLL_MS = 1500;
const MAX_BACKOFF_MS = 8000;
export const HEARTBEAT_MS = 10000;

/**
 * Reveal beat (RA1 Phase 1.4). THE single source of the hold duration — no
 * scattered timeouts.
 *
 * This is a PRESENTATION hold and nothing else. The backend has already
 * resolved round N and already opened round N+1 by the time this starts; the
 * hold only delays when the client lets the player interact with N+1, so the
 * damage/HP/XP/level-up that just landed has a moment to be read. It never
 * delays a request, never gates progression, and never changes what the server
 * is told or when.
 */
/**
 * How many settlements the duelist columns' recent-round ledger keeps.
 *
 * Raised from five when the columns stopped showing a one-line chip strip and
 * started showing a ledger ROW per settled round: five rows left most of the
 * stretched column empty, which is the dead space the ledger exists to fill.
 * Eight is still "recent" — bounded so the column keeps its own height and the
 * ledger never needs to scroll — not a combat log.
 *
 * RM1 PASS 1 — RAISED TO TWELVE, AND WHY IT IS NOT "UNBOUNDED HISTORY"
 * ───────────────────────────────────────────────────────────────────
 * A points Ranked match is a TEN-module format (`scoring.matchLength`), and at
 * eight the buffer silently dropped the first two modules of every completed
 * one. That was invisible while the buffer only fed a "recent rounds" strip;
 * it is not invisible for the module-history bubbles, whose whole claim is that
 * the row IS the match — and it is the one thing that blocks the end screen
 * from putting the viewer's ten modules over the opponent's ten.
 *
 * Twelve, not `Infinity`: an HP match still ends on health rather than on a
 * round count and may run indefinitely, so the buffer stays BOUNDED and this
 * stays a fixed-size window. Twelve is the ten-module format plus two rounds of
 * headroom, which is the smallest bound that holds a complete points match.
 *
 * The VISIBLE ledger is unchanged. `RoundLedger` now caps its own rows at
 * `LEDGER_VISIBLE_ROWS` (8 — exactly what this constant used to supply), so
 * raising the buffer preserves every column's current height and row count and
 * changes only what is RETAINED. See `CombatantPanel`.
 */
export const DAMAGE_LOG_LIMIT = 12;

/**
 * Merge settlements into the bounded ledger buffer: deduplicated on round
 * number, sorted ascending, trimmed to the most recent `DAMAGE_LOG_LIMIT`.
 *
 * `existing` wins a collision. The two sources are the live capture and the
 * resume backfill, which describe the same settled rows, so this only decides
 * which copy is kept — but keeping the live one means a backfill that lands
 * late can never overwrite a round the player just watched resolve.
 */
function mergeSettlements(
  existing: ResolvedRoundView[], incoming: ResolvedRoundView[],
): ResolvedRoundView[] {
  const byRound = new Map<number, ResolvedRoundView>();
  for (const s of [...existing, ...incoming]) {
    if (!byRound.has(s.roundNumber)) byRound.set(s.roundNumber, s);
  }
  return [...byRound.values()]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .slice(-DAMAGE_LOG_LIMIT);
}

/**
 * The result beat, DECLARED IN THE SHARED LAYER (ARENA1 Phase 2).
 *
 * The three numbers are unchanged and so is every use of them below; they
 * simply stopped being Ranked's private constants once a second mode paced
 * itself by the same beat. Re-exported here because this module is where every
 * existing caller (and every existing test) names them, and a boundary guard
 * forbids the Daily from importing anything out of `pages/quiz-ranked` — so the
 * shared layer is the only place both modes can legitimately read them from.
 */
export {
  REVEAL_HOLD_MS, REVEAL_HOLD_LEVEL_UP_MS, REVEAL_HOLD_EVIDENCE_MS,
} from "@/lib/ranked-core/pacing";

/**
 * Explicit p1/p2 mapping derived from the SNAPSHOT being adapted, not from
 * render state. The settlement adapter fails closed on a missing/duplicate id,
 * so deriving this from a closure that may predate the first snapshot is what
 * silently dropped reveals before. Returns null when the opponent is not in the
 * payload yet, which is a real "not ready", not an error.
 */
function idMappingFromRound(
  pub: PublicRoundView, viewerUserId: string,
): { p1PlayerId: string; p2PlayerId: string } | null {
  const opponent = pub.players.find((p) => p.playerId !== viewerUserId)?.playerId ?? null;
  if (!opponent || !viewerUserId) return null;
  return { p1PlayerId: viewerUserId, p2PlayerId: opponent };
}

export type MatchPhase =
  | "recovering" | "active" | "reviewing" | "locked"
  /**
   * RFX1 2B3 — the deliberate match-complete beat. Authoritatively over, but
   * still PRESENTING: the final question and its result are on screen, input
   * is closed, and the end screen has not mounted yet. Reached only by a
   * client that watched the match complete; a refresh or a reconnect into a
   * finished match goes straight to `match_over`.
   */
  | "match_outro"
  | "match_over" | "recovering_error" | "fatal";

export interface MatchController {
  phase: MatchPhase;
  publicRound: PublicRoundView | null;
  /**
   * Sticky round number for the arena header. Holds the last observed active
   * round so the header never blanks to "Round —" during the brief transition
   * window where the backend reports `activeRound === null` between rounds.
   * null only before the very first round is seen (→ show a "preparing" state).
   */
  roundNumber: number | null;
  privatePlayer: PrivatePlayerView | null;
  lastResolved: ResolvedRoundView | null;
  /**
   * The last few settlements, oldest first, for the duelist columns'
   * recent-round ledger. A BOUNDED buffer (see `DAMAGE_LOG_LIMIT`): the arena
   * shows recent history, not a combat log, and an unbounded list would grow
   * for the whole match to feed a fixed number of rows.
   *
   * Deduplicated on `roundNumber`, so a re-poll of the same resolved round can
   * never double-count a hit. Every value inside is the same authoritative
   * settlement `lastResolved` carries — nothing is recomputed.
   *
   * SURVIVES A REFRESH. Resume seeds this from the rounds the match has
   * already settled (see the backfill in the mount effect); before that it
   * only ever filled from rounds the client watched resolve, so a reload left
   * a mid-match player looking at an empty ledger.
   */
  damageLog: ResolvedRoundView[];
  result: MatchResultView | null;
  presence: PresenceView | null;
  skewMs: number;
  viewerUserId: string;
  opponentUserId: string | null;
  /** The option the viewer has answered with (or has in flight). */
  selectedOptionId: string | null;
  /**
   * RFX1 — the option the viewer answered round `roundNumber` with, kept
   * through that round's reveal.
   *
   * `selectedOptionId` is the CURRENT round's echo and is dropped the moment a
   * snapshot opens the next round — which is the same snapshot that settles
   * this one, so the reveal used to render with the player's own pick already
   * gone. This survives the round boundary and is simply superseded by the
   * next answer; the view shows it only while the surface still presents the
   * round it belongs to. It is a record of what was SENT, never a verdict:
   * correctness always comes from the settlement.
   */
  answeredSelection: { roundNumber: number; optionId: string } | null;
  /** The server's current ability draft, echoed locally between polls. */
  selectedAbilityId: string | null;
  submitting: boolean;
  /** True only while an ability draft write is in flight. */
  abilityBusy: boolean;
  actionError: string | null;
  error: string | null;
  /**
   * R3: one click. Submits the answer immediately and irrevocably; there is no
   * separate confirm step and no local "locked" state before the server says so.
   */
  answer: (optionId: string, answerIndex: number) => void;
  /** Arm/change/clear the round's ability. Never blocks or gates the answer. */
  selectAbility: (id: string | null) => void;
  /**
   * RG1 — concede the match, deliberately.
   *
   * The ONE intent signal Ranked has. A route change, a closed tab, a reload
   * and a dead network are indistinguishable at the server, so none of them
   * ends a match; they are an absence, and an absence gets the reconnect
   * window. This is how a player says the thing the transport cannot.
   *
   * The BACKEND owns the settlement — same terminal path a timed-out forfeit
   * takes — so this only sends the command and pokes the loop, which then
   * reads the terminal result through the ordinary snapshot. The confirmation
   * belongs to the surface offering the control, not here.
   */
  forfeit: () => void;
  /** Authoritative state of an active multi-challenge segment, or null. */
  segmentState: SegmentStateView | null;
  /** Transcript of the last resolved multi-challenge segment, or null. */
  lastSegmentSettlement: SegmentSettlementView | null;
  /**
   * The round `lastSegmentSettlement` settled on, or null.
   *
   * The transcript itself carries no round number, and the arena needs one for
   * two things: to label the block's result beat with the round it describes,
   * and — the load-bearing use — as the EVENT ID that re-triggers the beat's
   * entrance. Keying that on the live round number instead would replay the
   * animation every time an ordinary round advanced underneath it.
   */
  lastSegmentRoundNumber: number | null;
  submitSegmentChallenge: (challengeIndex: number, choice: api.SegmentChoice) => void;
  /**
   * A payload this client could not READ, as a human-readable reason.
   *
   * Distinct from `error` (a fatal backend/auth outcome) because the cause is
   * different and so is the remedy: the match is intact server-side and the
   * client is the thing that is out of date. The loop STOPS when this is set —
   * a contract mismatch is deterministic, so retrying it forever is exactly the
   * silent stall this replaces.
   */
  contractError: string | null;
  /** Restart the polling loop after a contract error (an explicit retry). */
  retry: () => void;
  /** True while the round is open for an ability change. */
  roundLive: boolean;
  /**
   * Presentation-only hold: true while the just-resolved round is being
   * introduced. The view keeps showing the previous question and withholds
   * interactivity from the next one. Carries no authority — the server has
   * already moved on.
   */
  revealHold: boolean;
  /**
   * RFX1 2B3 — the match-complete presentation's identity, or null.
   *
   * Non-null for exactly the outro BEAT — not for the whole `match_outro`
   * phase, which also covers the moment between observing the completion and
   * holding the material it presents. DETERMINISTIC (`<matchId>:outro`)
   * so a rerender or a poll keys onto the same event rather than restarting
   * one. It is set only when this mount observed the LIVE transition into
   * completion — the same discipline `revealHold` uses — so a refresh or a
   * reconnect onto a completed match never plays it.
   */
  matchOutroId: string | null;
}

/**
 * RB3 — options a SESSION PRESET may set. Absent for every ordinary match.
 */
export interface RankedMatchOptions {
  /**
   * Hold the snapshot poll loop.
   *
   * WHY THIS PAUSES THE MATCH, and is not merely a rendering trick. Ranked
   * advances LAZILY: `ranked_public.service._advance` opens the next round
   * only when a participant's own request drives it, and the background sweep
   * is off by default. So while nobody polls, no round is opened, no question
   * clock is started, and the bot does not act — the match genuinely waits.
   *
   * The presence heartbeat keeps running on its own timer, so a held match is
   * not an absent player and cannot be forfeited for one. That separation
   * already existed; `service.heartbeat` deliberately does not call `_advance`.
   *
   * This is what lets the guided playtest put a page between two segments
   * without spending the player's answer time on it.
   */
  paused?: boolean;
  /**
   * RB3.2 — is this match being ENTERED, or RECOVERED?
   *
   * `"fresh"` is a caller that already holds a match id the server has just
   * handed it: the bot join that answered `matched`, or the pairing beat that
   * did. There is nothing to recover for such a match — no settled round, no
   * result, no transcript — so the recovery round trip is skipped and the
   * ordinary snapshot, which is what actually paints the arena, is the first
   * and only request.
   *
   * The DEFAULT is `"recovered"`, which is the behaviour every caller had
   * before this option existed: resume first, then poll.
   *
   * It is an OPTIMISM, never an authority. The very first snapshot re-decides:
   * a match that turns out to have settled rounds (a restored history entry, a
   * back-navigation into a match that has moved on) recovers its transcript
   * immediately, from the server's own count rather than from the caller's
   * claim. See `entryRef` below.
   */
  entry?: "fresh" | "recovered";
  /**
   * RFX1 2B1 — prepare a round's CRITICAL media before the surface swaps to
   * it. Called with the already-open next round when the nominal reveal hold
   * expires; the hold then stays up until the returned promise settles or the
   * server's budget runs out (`started_at − SWAP_MEDIA_MIN_LEAD_MS`),
   * whichever is first. It can shorten nothing and it can never move the
   * answerable instant, which is the server's `started_at` regardless.
   * Absent → the hold ends on its nominal timer, exactly as before.
   */
  prepareRound?: (round: PublicRoundView) => Promise<unknown>;
}

export function useRankedMatch(matchId: string | null, viewerUserId: string,
                               options: RankedMatchOptions = {}): MatchController {
  const { play: playSfx } = useSfx();
  const paused = options.paused === true;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Read ONCE per mount. A re-render must not turn a match that has already
  // been recovered back into a fresh one, and must not re-arm the recovery of
  // one that has already had it.
  const freshEntryRef = useRef(options.entry === "fresh");
  /** Has the recovery round trip run for THIS match yet? */
  const recoveredRef = useRef(false);
  const [publicRound, setPublicRound] = useState<PublicRoundView | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [privatePlayer, setPrivatePlayer] = useState<PrivatePlayerView | null>(null);
  const [lastResolved, setLastResolved] = useState<ResolvedRoundView | null>(null);
  const [damageLog, setDamageLog] = useState<ResolvedRoundView[]>([]);
  const [lastSegmentSettlement, setLastSegmentSettlement] =
    useState<SegmentSettlementView | null>(null);
  const [lastSegmentRoundNumber, setLastSegmentRoundNumber] =
    useState<number | null>(null);
  const [result, setResult] = useState<MatchResultView | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  /** The reconciled skew this match is holding; null until the first read. */
  const skewSeenRef = useRef<number | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [answeredSelection, setAnsweredSelection] =
    useState<{ roundNumber: number; optionId: string } | null>(null);
  // Local ECHO of the server's ability draft, so a click feels immediate. The
  // authoritative value always wins on the next snapshot (see the sync effect
  // below) and a failed write reverts to it, so this can never drift into a
  // second authority.
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null);
  const [abilityBusy, setAbilityBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [revealHold, setRevealHold] = useState(false);
  /**
   * RFX1 2B3 — THE MATCH-COMPLETE PRESENTATION.
   *
   * `null` = not playing. Claimed the moment a live completion is observed
   * (`ready: false`), armed once the final settlement and the result row are
   * in hand (`ready: true`), and spent when its beat has run (`done: true`).
   * It is STATE (the render must react to it) but its trigger is a ref, so a
   * re-poll cannot start a second one.
   */
  const [outro, setOutro] =
    useState<{ id: string; ready: boolean; done: boolean } | null>(null);
  /**
   * Has this mount ever seen the match OPEN? The whole of the replay
   * protection. A refresh or a reconnect onto a finished match reads
   * `match_over` on its FIRST snapshot, so this is still false and no outro
   * is owed — the end screen is the stable state that match is in, and
   * presenting a completion the player did not witness would be a lie.
   */
  const sawMatchLiveRef = useRef(false);
  /** Started once, ever. A poll, a rerender and a retry cannot replay it. */
  const outroStartedRef = useRef(false);
  // RFX1 2B1: the swap gate reads the LATEST round and preparer at the moment
  // the nominal hold expires, not the ones captured when it began.
  const latestRoundRef = useRef<PublicRoundView | null>(null);
  latestRoundRef.current = publicRound;
  const prepareRoundRef = useRef(options.prepareRound);
  prepareRoundRef.current = options.prepareRound;
  /** Bumped per hold, so a superseded hold's media wait cannot end a newer one. */
  const holdTokenRef = useRef(0);

  const abortRef = useRef<AbortController | null>(null);
  const revealTimerRef = useRef<number | undefined>(undefined);
  /**
   * Always-current `poll`. The polling loop re-arms itself from inside its own
   * body, so calling the captured `poll` directly pinned the whole loop to the
   * closure created on the very first render — see the comment on `poll`.
   */
  const pollRef = useRef<(() => Promise<void>) | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const hbRef = useRef<number | undefined>(undefined);
  const activeRoundRef = useRef<number | null>(null);
  const resolvedRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const failuresRef = useRef(0);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const serverAbilityRef = useRef<string | null>(null);
  // Synchronous double-activation guards. State alone is not enough: two clicks
  // dispatched in the same React batch both read the pre-update `submitting`,
  // so a stale-closure check would let the second one through.
  const answeringRef = useRef(false);
  const abilityRef = useRef(false);

  const opponentUserId =
    publicRound?.players.find((p) => p.playerId !== viewerUserId)?.playerId ?? null;
  const ownPublic = publicRound?.players.find((p) => p.playerId === viewerUserId) ?? null;
  const hasSubmitted =
    (privatePlayer?.ownerPlayerId === viewerUserId && privatePlayer?.players.find(
      (p) => p.playerId === viewerUserId)?.hasSubmitted) || ownPublic?.hasSubmitted || false;
  const matchOver = publicRound?.matchOver || result !== null;

  const phase: MatchPhase = (() => {
    if (error) return "fatal";
    if (!publicRound) return "recovering";
    if (matchOver) return outro && !outro.done ? "match_outro" : "match_over";
    // `hasSubmitted` is the SERVER's view of the viewer's submission. R3 never
    // shows "locked" from local state alone — a click in flight stays in the
    // active phase with its controls disabled until the backend confirms.
    if (hasSubmitted) return "locked";
    return "active";
  })();

  /**
   * The round is still open for an ability change exactly while the engine
   * says the viewer's selection window is open. That covers the whole waiting
   * stretch after the viewer has answered, and closes the instant the round
   * resolves — no client-side timer or inference involved.
   */
  const roundLive = phase === "active" || phase === "locked";

  const clearTimer = () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };

  /**
   * Stop on a payload this client cannot read, loudly.
   *
   * The previous behaviour folded this into the transient-failure path: the
   * error was cleared, the poll backed off, and the next poll failed the same
   * way forever — which is exactly how the first Meta Reflex block presented as
   * a frozen screen with nothing in the console. The message is the reader's
   * own field-path complaint (`cards[0].left.entity_id must be a string`); it
   * names the CONTRACT, never a value, so nothing private reaches the UI. The
   * full error is logged for diagnosis and stays out of the rendered text.
   */
  const failContract = useCallback((where: string, e: unknown) => {
    console.error(`[ranked] ${where}: payload failed the frontend contract`, e);
    stoppedRef.current = true;
    clearTimer();
    setContractError(e instanceof Error ? e.message : "payload failed validation");
  }, []);
  /**
   * Start the presentation hold for a settlement that just landed. Pure
   * presentation: it reads `leveledUp` off the authoritative settlement only to
   * decide how LONG to hold, and holds nothing back from the server.
   */
  const beginRevealHold = useCallback((leveledUp: boolean, hasEvidence = false,
                                       msUntilNextAnswerable: number | null = null,
                                       /**
                                        * RFX1 2B3 — the next round's MEDIUM
                                        * beat: how much room it needs after
                                        * this hold, and the licence for this
                                        * hold to absorb the poll's slack so
                                        * the beat does not have to.
                                        */
                                       special: { tailMs: number } | null = null) => {
    if (revealTimerRef.current !== undefined) window.clearTimeout(revealTimerRef.current);
    setRevealHold(true);
    // The LONGEST applicable allowance, not a chain of branches: a round that
    // both levelled the player up and carried evidence has both things to
    // read, and taking a max is the only combination that never shortens a
    // beat by adding a reason to lengthen it.
    const nominal = Math.max(
      REVEAL_HOLD_MS,
      leveledUp ? REVEAL_HOLD_LEVEL_UP_MS : 0,
      hasEvidence ? REVEAL_HOLD_EVIDENCE_MS : 0,
    );
    // RFX1 — end no later than the server's `started_at − title`, so a late
    // discovery shortens the reveal instead of the next module's intro.
    const hold = anchoredRevealHoldMs(
      nominal, msUntilNextAnswerable,
      // The tail a medium beat needs is its own, not the module title's.
      special ? special.tailMs : MODULE_TITLE_MS,
      special ? REVEAL_ABSORB_CAP_MS : undefined);
    const token = ++holdTokenRef.current;
    const heldAt = Date.now();
    const release = () => {
      if (holdTokenRef.current !== token) return;
      if (revealTimerRef.current !== undefined) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = undefined;
      setRevealHold(false);
    };
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = undefined;
      // RFX1 2B1 — the bounded swap gate. The next round's media has been
      // loading since this hold began (the arena prepares `upcomingRound`);
      // if its critical images are still in flight, keep presenting round N
      // a little longer, but only inside the server's own presentation
      // budget. Input never waits on this: it opens at `started_at`.
      const next = latestRoundRef.current;
      const prepare = prepareRoundRef.current;
      const budget = special ? 0 : swapMediaWaitMs(
        msUntilNextAnswerable === null ? null : msUntilNextAnswerable - (Date.now() - heldAt));
      if (!prepare || !next || budget <= 0) { release(); return; }
      revealTimerRef.current = window.setTimeout(release, budget);
      prepare(next).then(release, release);
    }, hold);
  }, []);

  /**
   * Fetch + adapt one resolved round.
   *
   * `ids` is passed IN, derived from the snapshot that triggered this capture,
   * so the adapter can never be handed a mapping from a render that predates
   * the opponent being known.
   *
   * The two failure modes are handled separately on purpose. A failed FETCH is
   * an ordinary "not ready yet" and is retried by the next poll. A failed
   * ADAPT is a data/programming defect: swallowing it as "not ready" is exactly
   * what made reveals disappear silently, so it is logged, the round is marked
   * consumed (no infinite refetch), and the segment transcript is still
   * recovered from the same payload.
   */
  const captureResolved = useCallback(async (
    round: number,
    signal: AbortSignal,
    ids: { p1PlayerId: string; p2PlayerId: string } | null,
    opts: {
      hold?: boolean; nextStartedAt?: string | null; skewMs?: number;
      /** RFX1 2B3 — the medium beat the NEXT round is owed, if any. */
      special?: { tailMs: number } | null;
    } = {},
  ) => {
    if (resolvedRef.current === round) return;
    if (!ids) return;  // opponent not in the snapshot yet — a real not-ready

    let env: Awaited<ReturnType<typeof api.getResolvedRound>>;
    try {
      env = await api.getResolvedRound(matchId!, round, signal);
    } catch (e) {
      if (!api.isAborted(e)) { /* resolved not ready yet; the next poll retries */ }
      return;
    }
    if (signal.aborted) return;

    let settlement: ResolvedRoundView | null = null;
    try {
      settlement = adaptBackendSettlement(env.payload as unknown as ResolvedProjection, ids);
    } catch (e) {
      console.error(`[ranked] round ${round} settlement failed to adapt`, e);
    }

    resolvedRef.current = round;
    if (settlement) {
      setLastResolved(settlement);
      // Merge-and-trim, keyed on the round number. `resolvedRef` already
      // guards the common re-entry, but a remount re-reads a round it has
      // seen, and the resume backfill writes the same buffer from the other
      // end; merging on the round number makes it idempotent regardless of
      // which source lands first.
      setDamageLog((log) => mergeSettlements(log, [settlement!]));
    }
    // A quiz round yields null here, which correctly clears a previous
    // segment transcript so it cannot linger over the next round.
    //
    // Handled exactly like the settlement adapter above: this is TERMINAL
    // display data, so a transcript this client cannot read must cost the
    // player a transcript, never the live match. Unwrapped, it threw inside the
    // poll and was swallowed as a transient failure.
    let segment: SegmentSettlementView | null = null;
    try {
      segment = readSegmentSettlement(env.payload);
    } catch (e) {
      console.error(`[ranked] round ${round} segment transcript failed to parse`, e);
    }
    setLastSegmentSettlement(segment);
    setLastSegmentRoundNumber(segment ? round : null);

    if (opts.hold !== false && (settlement || segment)) {
      const leveledUp = settlement !== null
        && (settlement.players.p1.leveledUp || settlement.players.p2.leveledUp);
      // Asked of the SAME selector the surface will render through, so the
      // beat is lengthened exactly when a line will actually appear — never
      // for a round whose frozen material produced nothing showable.
      const hasEvidence = settlement !== null
        && conciseEvidence(settlement.questionExplanation) !== null;
      const nextStart = opts.nextStartedAt ? Date.parse(opts.nextStartedAt) : NaN;
      beginRevealHold(leveledUp, hasEvidence, Number.isNaN(nextStart)
        ? null : nextStart - Date.now() - (opts.skewMs ?? 0), opts.special ?? null);
    }
  }, [matchId, beginRevealHold]);

  /**
   * Seed the recent-round ledger from rounds this client never watched
   * resolve — a refresh, or a reconnect into a match already in progress.
   *
   * Read-only and best effort. It fetches at most `DAMAGE_LOG_LIMIT` already
   * SETTLED rounds — the SAME bound the buffer keeps, so a resume recovers a
   * complete ten-module history rather than the tail of one (RM1 Pass 1 raised
   * both together by raising the one constant they share) (the backend refuses to build a resolved projection for a
   * round that has not settled, so nothing here can see a live answer), never
   * touches `lastResolved` or `resolvedRef`, and never starts a reveal hold —
   * this is history the player has already lived through, not a reveal.
   *
   * A round that fails to fetch or adapt is skipped: an incomplete ledger is a
   * fair outcome for a best-effort read, and a hard failure here must not cost
   * anyone the match they are reconnecting to.
   */
  const backfillDamageLog = useCallback(async (
    pub: PublicRoundView, signal: AbortSignal,
  ) => {
    const ids = idMappingFromRound(pub, viewerUserId);
    if (!ids || !matchId) return;
    const last = pub.completedRounds;
    if (last <= 0) return;
    const first = Math.max(1, last - DAMAGE_LOG_LIMIT + 1);
    const rounds: number[] = [];
    for (let r = first; r <= last; r += 1) rounds.push(r);
    const fetched = await Promise.all(rounds.map(async (r) => {
      try {
        const env = await api.getResolvedRound(matchId, r, signal);
        return adaptBackendSettlement(
          env.payload as unknown as ResolvedProjection, ids);
      } catch {
        return null;  // not settled, unreadable, or aborted — simply no row
      }
    }));
    if (signal.aborted) return;
    const recovered = fetched.filter((v): v is ResolvedRoundView => v !== null);
    if (recovered.length === 0) return;
    setDamageLog((log) => mergeSettlements(log, recovered));
  }, [matchId, viewerUserId]);

  const poll = useCallback(async () => {
    if (!matchId || stoppedRef.current) return;
    if (inFlightRef.current) { rerunRef.current = true; return; }
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const pub = await api.getPublicRound(matchId, controller.signal);
      // RFX1 2B3 — reconciled, not adopted verbatim. See
      // `timerMath.reconciledSkewMs`: the raw per-poll reading carries this
      // response's travel time, and letting it through moved the countdown's
      // second boundaries on every poll.
      const pubSkewMs = reconciledSkewMs(
        skewSeenRef.current, snapshotSkewMs(pub.serverTime, Date.now()));
      skewSeenRef.current = pubSkewMs;
      setSkewMs(pubSkewMs);
      const active = pub.activeRound?.roundNumber ?? null;
      const previous = activeRoundRef.current;
      if (previous !== null && active !== null && active !== previous) {
        // Ids come from THIS snapshot, so the mapping always matches the match
        // the settlement belongs to.
        /**
         * RFX1 2B3 — is the round we are moving INTO a special one? Decided
         * from the snapshot that just arrived, which already carries it, so
         * the hold can make room for the beat rather than the beat having to
         * fit in whatever the hold left.
         */
        const nextSpecial = projectSpecialTransition({
          presented: pub,
          metaReflexModuleId: META_REFLEX_MODULE_ID,
          metaReflexMinVersion: META_REFLEX_MIXED_VERSION,
        });
        await captureResolved(previous, controller.signal,
          idMappingFromRound(pub, viewerUserId),
          {
            nextStartedAt: pub.activeRound?.startedAt ?? null, skewMs: pubSkewMs,
            /**
             * THE TAIL INCLUDES THE HEADROOM, and that is the whole point of
             * having one. An absorbing hold expands to fill everything except
             * the tail, so a tail of exactly `visible + margin` hands the
             * beat precisely its floor and nothing more — and a beat with no
             * slack is one that jitter cancels outright.
             */
            special: nextSpecial
              ? { tailMs: specialTransitionBudgetMs(nextSpecial.visibleMs)
                    + PRESENTATION_HEADROOM_MS } : null,
          });
        // A new round: drop the previous round's local echoes. The ability ref
        // is reset too, so the next snapshot's value is adopted even when the
        // new round's draft happens to equal the old one.
        setSelectedOptionId(null); setSelectedAbilityId(null);
        serverAbilityRef.current = null;
      }
      if (active !== null) {
        activeRoundRef.current = active;
        setRoundNumber(active); // sticky: never blanks during the between-rounds gap
      } else if (pub.segment.segmentNumber !== null && pub.segment.phase !== null) {
        // A phased segment in its ability window has no engine round yet, by
        // design — the challenge clock must not run during it. The segment
        // number is still the right thing to show in the header.
        setRoundNumber(pub.segment.segmentNumber);
      }
      setPublicRound(pub);
      setError(null);
      failuresRef.current = 0;

      // RB3.2 — THE SERVER RE-DECIDES WHETHER THIS WAS A FRESH ENTRY.
      //
      // `entry: "fresh"` is the caller's optimism, and this is where it is
      // checked against the only authority there is: the match's own settled
      // round count. A match that has already played rounds is one being
      // returned to — a back-navigation into a live duel, a restored history
      // entry — so its transcript, reveal and ledger are recovered now, at the
      // cost of one round trip that a genuinely fresh match never pays.
      // `recover` is idempotent per match, so this can never double-recover.
      if (!recoveredRef.current && pub.completedRounds > 0) {
        void recoverRef.current?.();
      }

      if (pub.matchOver) {
        stoppedRef.current = true;
        /**
         * RFX1 2B3 — DID THIS CLIENT WATCH THE MATCH END?
         *
         * Decided off a ref this mount only ever sets on an OPEN snapshot.
         * True for the player who was playing; false for a refresh, a
         * reconnect, a history open or any other arrival onto an already
         * finished match.
         */
        const liveCompletion = sawMatchLiveRef.current && !outroStartedRef.current;
        /**
         * AND CLAIMED IN THE SAME BATCH AS THE SNAPSHOT — before anything is
         * awaited. `setPublicRound(pub)` above has already made `matchOver`
         * true, and the result row and the final settlement are each a
         * network round trip away. A browser run with production-shaped
         * latency caught exactly that: the end screen appeared for ~320 ms,
         * then the arena came BACK for the reveal and the outro. Stating the
         * presentation in the same render that states the completion is what
         * removes that flash; `ready` below is what keeps the beat itself
         * waiting for the material it is about to present.
         */
        if (liveCompletion) {
          outroStartedRef.current = true;
          setOutro({ id: `${matchId}:outro`, ready: false, done: false });
        }
        try {
          setResult(await api.getMatchResult(matchId, controller.signal));
        } catch { /* result read races match completion; retry next mount */ }
        const lastRound = pub.completedRounds;
        /**
         * THE FINAL ROUND NOW GETS ITS RESULT BEAT.
         *
         * It used to be captured with `hold: false`, on the reasoning that
         * `MatchOverFrame` owned the moment — but that frame replaced the
         * arena in the SAME render, so the last answer of the duel was the
         * one answer whose verdict the player never saw land.
         *
         * ...AND ONLY WHEN THE FINAL ROUND IS ACTUALLY UNSEEN. `resolvedRef`
         * is the last round whose settlement this mount has CAPTURED — the
         * same ref that stops a re-poll double-capturing one.
         *
         *  * played out: N resolved and the match ended in the SAME
         *    transaction, so `completedRounds === N` and nothing has captured
         *    it. Its reveal has never played, and it is owed one.
         *  * forfeited: the last completed round settled earlier and this
         *    client already watched its reveal. Replaying it would be a
         *    regression, so it is captured exactly as before, with no hold.
         */
        const finalRoundUnseen = lastRound > 0 && resolvedRef.current !== lastRound;
        if (lastRound > 0) {
          await captureResolved(lastRound, controller.signal,
            idMappingFromRound(pub, viewerUserId),
            { hold: liveCompletion && finalRoundUnseen });
        }
        // Everything the ending has to present is now in hand (or failed to
        // arrive, which is also an answer). The beat may run.
        if (liveCompletion) setOutro((o) => (o ? { ...o, ready: true } : o));
        return;
      }
      // Open, and observed open. Recorded AFTER the completion branch so the
      // very snapshot that ends the match can never set it.
      sawMatchLiveRef.current = true;
      if (active !== null) {
        try {
          setPrivatePlayer(await api.getPrivatePlayer(matchId, controller.signal));
        } catch (e) {
          if (api.isContractError(e)) { failContract("private player", e); return; }
          if (api.isFatal(e)) { setError((e as RankedApiError).message); stoppedRef.current = true; return; }
        }
      }
    } catch (e) {
      if (api.isAborted(e)) return;
      if (api.isContractError(e)) { failContract("public round", e); return; }
      if (api.isFatal(e)) { setError((e as RankedApiError).message); stoppedRef.current = true; return; }
      failuresRef.current += 1;
      setError(null);
      setActionError(null);
    } finally {
      inFlightRef.current = false;
      // HELD: do not re-arm. The loop is restarted by the resume effect below,
      // which pokes once the hold lifts. Nothing is cancelled mid-flight —
      // this request finishes and its snapshot is applied, so the arena keeps
      // showing the state the player paused ON.
      if (!stoppedRef.current && !pausedRef.current) {
        clearTimer();
        // Re-arm through `pollRef`, never through the captured `poll`. Calling
        // `poll` here pinned every subsequent iteration to the closure that
        // scheduled the first one, so the loop kept running with whatever state
        // existed at mount.
        const runNext = () => void pollRef.current?.();
        if (rerunRef.current) { rerunRef.current = false; timerRef.current = window.setTimeout(runNext, 0); }
        else timerRef.current = window.setTimeout(
          runNext, Math.min(POLL_MS * 2 ** failuresRef.current, MAX_BACKOFF_MS));
      }
    }
  }, [matchId, captureResolved, viewerUserId]);

  // Keep `pollRef` on the latest `poll`. Declared BEFORE the mount effect so it
  // is populated by the time that effect kicks the loop off.
  useEffect(() => { pollRef.current = poll; });

  /**
   * THE RECOVERY ROUND TRIP — `POST /resume`.
   *
   * Rebuilds what a snapshot alone cannot: the last settlement, its reveal,
   * the segment transcript, the finished result and the damage ledger. That is
   * a real need for a player returning to a match already in progress, and no
   * need at all for one entering a match created a moment ago.
   *
   * Runs at most ONCE per match. `recoveredRef` is what stops a fresh entry
   * whose first snapshot turns out to be mid-match from recovering twice.
   */
  const recover = useCallback(async () => {
    if (!matchId || recoveredRef.current) return;
    recoveredRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resume = await api.resumeMatch(matchId, controller.signal);
      setPublicRound(resume.public);
      setPrivatePlayer(resume.private);
      setResult(resume.result);
      {
        const resumeSkew = reconciledSkewMs(
          skewSeenRef.current, snapshotSkewMs(resume.serverTime, Date.now()));
        skewSeenRef.current = resumeSkew;
        setSkewMs(resumeSkew);
      }
      activeRoundRef.current = resume.public.activeRound?.roundNumber ?? null;
      if (activeRoundRef.current !== null) setRoundNumber(activeRoundRef.current);
      if (resume.latestResolved) {
        const raw = (resume.latestResolved as { payload: unknown }).payload;
        // Ids from the RESUMED snapshot. This previously used a mapping built
        // during the mount render, when `publicRound` was still null and the
        // opponent id was therefore "" — which the adapter rejects, so the
        // reveal was dropped on every single refresh.
        const ids = idMappingFromRound(resume.public, viewerUserId);
        try {
          if (ids) setLastResolved(adaptBackendSettlement(raw as ResolvedProjection, ids));
        } catch (e) {
          console.error("[ranked] resumed settlement failed to adapt", e);
        }
        // Recovered separately so a transcript survives a refresh even if
        // the arena settlement adapter rejects an older payload shape. The
        // round it settled on comes from the SAME envelope, so the two can
        // never describe different rounds.
        try {
          const segment = readSegmentSettlement(raw);
          setLastSegmentSettlement(segment);
          setLastSegmentRoundNumber(
            segment ? (resume.latestResolved as { round_number?: number })
              .round_number ?? null : null);
        } catch { /* a malformed reveal simply shows no transcript */ }
        // Resume replays a reveal the player has usually already seen, and it
        // must not hold interactivity hostage on reconnect.
      }
      // Background, and deliberately NOT awaited: the poll loop must start on
      // time whether or not the ledger can be recovered.
      void backfillDamageLog(resume.public, controller.signal);
    } catch (e) {
      if (api.isContractError(e)) { failContract("resume", e); return; }
      if (api.isFatal(e)) { setError((e as RankedApiError).message); return; }
    }
  }, [matchId, viewerUserId, backfillDamageLog, failContract]);

  // Held in a ref for the same reason `poll` is: the mount effect and the poll
  // loop both reach it, and neither may be pinned to the closure that existed
  // when the match was first mounted.
  const recoverRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => { recoverRef.current = recover; });

  const poke = useCallback(() => {
    if (!stoppedRef.current && !pausedRef.current) {
      clearTimer();
      timerRef.current = window.setTimeout(() => void pollRef.current?.(), 0);
    }
  }, []);

  /**
   * Stop the pending re-arm the moment a hold begins, and kick the loop again
   * the moment it lifts.
   *
   * The clear matters: without it a poll already scheduled for ~1.5s away
   * would fire once inside the hold and open the next round — which is exactly
   * the answer time an interstitial exists not to spend.
   */
  useEffect(() => {
    if (paused) { clearTimer(); return; }
    if (stoppedRef.current || !matchId) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => void pollRef.current?.(), 0);
  }, [paused, matchId]);

  /**
   * Restart the loop after a contract error. Explicit and player-initiated:
   * the error is only cleared because someone asked for another attempt, which
   * is the difference between a retry and the swallow-and-retry this replaces.
   */
  const retry = useCallback(() => {
    setContractError(null);
    failuresRef.current = 0;
    stoppedRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => void pollRef.current?.(), 0);
  }, []);

  // Resume + poll on mount; heartbeat on a separate cadence.
  useEffect(() => {
    if (!matchId) return;
    stoppedRef.current = false;
    activeRoundRef.current = null;
    resolvedRef.current = null;
    // Per MATCH: a different match is a different set of readings.
    skewSeenRef.current = null;
    // Per MATCH, not per mount: switching `matchId` inside a mounted
    // controller must be able to recover the new match too.
    recoveredRef.current = false;
    setRoundNumber(null);
    // Everything below describes ONE match. The refs above were already reset
    // here; the settlement state was not, so switching `matchId` inside a
    // mounted controller carried the previous match's ledger, reveal and
    // transcript into the new arena until its first round settled.
    setDamageLog([]);
    setLastResolved(null);
    setLastSegmentSettlement(null);
    setLastSegmentRoundNumber(null);
    setAnsweredSelection(null);
    (async () => {
      // RB3.2 — RECOVERY IS EXCEPTIONAL, and a fresh entry is not it.
      //
      // A match id the server has just handed this client — the bot join that
      // answered `matched`, or the pairing beat that did — describes a match
      // with no settled round, no result and no transcript. `POST /resume`
      // exists to rebuild exactly those three things, so running it here asks
      // the server to reconstruct nothing, on the one request path the player
      // is actually waiting behind. The snapshot below is what paints the
      // arena; on a fresh entry it is now the ONLY request that has to.
      if (!freshEntryRef.current) await recoverRef.current?.();
      void pollRef.current?.();
    })();
    hbRef.current = window.setInterval(() => {
      void api.sendPresence(matchId).catch(() => { /* one miss is not a disconnect */ });
    }, HEARTBEAT_MS);
    return () => {
      stoppedRef.current = true;
      clearTimer();
      if (hbRef.current !== undefined) window.clearInterval(hbRef.current);
      if (revealTimerRef.current !== undefined) window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = undefined;
      holdTokenRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  /**
   * A finished match has no NEXT question to withhold, so any hold in flight
   * is released immediately and `MatchOverFrame` takes over.
   *
   * RFX1 2B3 — EXCEPT WHILE THE MATCH-COMPLETE PRESENTATION OWNS IT.
   *
   * This effect was the other half of the abrupt ending. It runs on the first
   * render that sees `matchOver`, which lands AFTER the completion poll has
   * armed the final round's reveal — so the one hold the player most needed
   * was the one guaranteed to be cancelled, whatever `captureResolved` had
   * just been told. While an outro is owed, the hold is the final round's
   * result beat and this stands aside; once the beat is done, the release is
   * exactly what it always was.
   */
  useEffect(() => {
    if (!matchOver) return;
    if (outro && !outro.done) return;
    if (revealTimerRef.current !== undefined) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = undefined;
    }
    holdTokenRef.current += 1;
    setRevealHold(false);
  }, [matchOver, outro]);

  // The server's ability draft is the authority; adopt it whenever it moves.
  // Compared against a ref rather than used directly so a local echo survives
  // the polls between the click and the server acknowledging it.
  const serverAbilityId = privatePlayer?.ownSelection.selectedAbilityId ?? null;
  useEffect(() => {
    if (serverAbilityRef.current !== serverAbilityId) {
      serverAbilityRef.current = serverAbilityId;
      setSelectedAbilityId(serverAbilityId);
    }
  }, [serverAbilityId]);

  /**
   * R3 one-click answer. The click IS the submission: it goes straight to the
   * authoritative route with no confirm step and no local lock. `submitting`
   * disables every option while the request is in flight, which is what makes
   * a double-click safe on top of the backend's own idempotency.
   */
  const answer = useCallback((optionId: string, answerIndex: number) => {
    if (!matchId || answeringRef.current) return;
    const rn = publicRound?.activeRound?.roundNumber;
    if (rn === undefined) return;
    answeringRef.current = true;
    setSelectedOptionId(optionId);  // shows WHICH option is in flight, not a lock
    setAnsweredSelection({ roundNumber: rn, optionId });
    setSubmitting(true); setActionError(null);
    (async () => {
      try {
        await api.submitRound(matchId, rn, answerIndex);
        playSfx("ranked.answer.lock", {
          eventId: `ranked:${matchId}:round:${rn}:lock`,
        });
        poke();  // the next snapshot is what actually flips the UI to locked
      } catch (e) {
        // Release the grid so the player can answer again.
        setSelectedOptionId(null);
        setAnsweredSelection((cur) => (cur?.roundNumber === rn ? null : cur));
        if (!(e instanceof RankedApiError && e.code === "RANKED_STALE_ROUND")) {
          setActionError(e instanceof Error ? e.message : "submit failed");
        } else {
          poke();
        }
      } finally {
        answeringRef.current = false;
        setSubmitting(false);
      }
    })();
  }, [matchId, publicRound, poke, playSfx]);

  /**
   * Arm, change, or clear the round's ability. Independent of the answer in
   * both directions: it neither requires nor blocks one, and it stays callable
   * while waiting for the opponent. `null` clears back to No Ability.
   */
  const selectAbility = useCallback((id: string | null) => {
    if (!matchId || abilityRef.current) return;
    const rn = publicRound?.activeRound?.roundNumber;
    if (rn === undefined || rn === null) return;
    abilityRef.current = true;
    setSelectedAbilityId(id);  // optimistic echo, reverted below on failure
    setAbilityBusy(true); setActionError(null);
    (async () => {
      try {
        await api.setRoundAbility(matchId, rn, id);
      } catch (e) {
        // The round closed or moved on under us — the frozen server value is
        // the truth, so adopt it rather than reporting a race as an error.
        const stale = e instanceof RankedApiError && (
          e.code === "RANKED_STALE_ROUND" || e.code === "RANKED_ROUND_CLOSED");
        setSelectedAbilityId(serverAbilityRef.current);
        if (!stale) {
          setActionError(e instanceof Error ? e.message : "ability change failed");
        }
      } finally {
        abilityRef.current = false;
        setAbilityBusy(false);
        poke();
      }
    })();
  }, [matchId, publicRound, poke]);

  // --------------------------------------------- multi-challenge segments
  //
  // Each of these is a server round trip followed by an immediate re-poll.
  // Nothing here advances an index, decides correctness, or measures timing;
  // the next authoritative snapshot is the only thing that moves the segment
  // forward, which is what makes a refresh mid-segment land correctly.

  const segmentState = publicRound?.segmentState ?? null;
  const segmentNumber = segmentState?.segmentNumber ?? null;

  /**
   * JOURNEY-UI3 — POLL AT THE JOURNEY'S SERVER INSTANTS.
   *
   * A Journey child is not in the payload until the server opens it, and a
   * transition is not published until its beat starts. On the ordinary 1.5 s
   * cadence the client learned both up to 1.5 s late — measured in a real
   * Daily: the next child appeared 0.5–1.0 s after the server opened it (the
   * pooled clock already running on an empty "opening…" placeholder), and a
   * 2.5 s purchase beat was visible for 1.25 s. So, for a Journey only:
   *
   *   * one poll AT `own_card_started_at` (the server's open instant), and
   *   * one poll when a new reveal's frozen window (`reveal_window_ms`) ends —
   *     the instant the server publishes the transition, if there is one.
   *
   * Poll SCHEDULING only: nothing is opened, paused or decided here; the
   * snapshot those polls return is the only thing that moves the Journey.
   */
  const journeyOpensAt = segmentState?.journey ? segmentState.ownCardStartedAt : null;
  useEffect(() => {
    if (!journeyOpensAt) return;
    const delay = msUntilServerInstant(journeyOpensAt, skewMs, Date.now());
    if (delay <= 0) return;
    const id = window.setTimeout(poke, delay + 60);
    return () => window.clearTimeout(id);
  }, [journeyOpensAt, skewMs, poke]);
  const journeyRevealing = segmentState?.journey ? segmentState.ownRevealingCardIndex : null;
  const journeyRevealMs = segmentState?.journey ? segmentState.revealWindowMs : null;
  useEffect(() => {
    if (journeyRevealing === null || !journeyRevealMs) return;
    // First observed right after the submit that settled it: its window ends
    // one frozen reveal later (a late first sighting only makes this poll early).
    const id = window.setTimeout(poke, journeyRevealMs + 80);
    return () => window.clearTimeout(id);
  }, [journeyRevealing, journeyRevealMs, poke]);

  const runSegmentAction = useCallback(
    (action: (segment: number) => Promise<unknown>, onAccepted?: (segment: number) => void) => {
      if (!matchId || submitting || segmentNumber === null) return;
      setSubmitting(true);
      setActionError(null);
      (async () => {
        try {
          await action(segmentNumber);
          onAccepted?.(segmentNumber);
        } catch (e) {
          // A stale phase/index means the server already moved on — re-poll
          // rather than surfacing a transient race as an error.
          //
          // POINT1 — `RANKED_CARD_NOT_OPEN` is the SAME class of race and was
          // the one member of it missing from this list, which is why it alone
          // painted a red line under a live Meta Reflex block. The per-card
          // reveal window leaves card N+1 as the active index while card N's
          // answer is still being shown, so a click landing in the gap between
          // the client seeing the next card and the server's frozen schedule
          // opening it is refused with a 409 — a normal-flow timing outcome
          // the next poll resolves on its own, not a failure to report.
          const stale = e instanceof RankedApiError && (
            e.code === "RANKED_STALE_ROUND" ||
            e.code === "RANKED_WRONG_SEGMENT_PHASE" ||
            e.code === "RANKED_WRONG_CHALLENGE_INDEX" ||
            e.code === "RANKED_CARD_NOT_OPEN" ||
            e.code === "RANKED_SEGMENT_COMPLETE");
          if (!stale) {
            setActionError(e instanceof Error ? e.message : "action failed");
          }
        } finally {
          setSubmitting(false);
          poke();
        }
      })();
    }, [matchId, submitting, segmentNumber, poke]);

  // R3: no segment ability actions. Item Cost Duel has no ability interaction,
  // so the only segment command a module can issue is a challenge submission.
  // The CHOICE is opaque here: which token a card contract answers with is the
  // module's business, and this controller only relays it.
  const submitSegmentChallenge = useCallback(
    (challengeIndex: number, choice: api.SegmentChoice) => {
      runSegmentAction((segment) =>
        api.submitSegmentChallenge(matchId!, segment, challengeIndex, choice),
      (segment) => {
        if (segmentState?.moduleId !== "item_cost_duel"
            || segmentState.moduleVersion < META_REFLEX_MIXED_VERSION) return;
        playSfx("ranked.meta.action", {
          eventId: `ranked:${matchId}:segment:${segment}:card:${challengeIndex}:action`,
        });
      });
    }, [runSegmentAction, matchId, segmentState, playSfx]);

  const forfeit = useCallback(() => {
    if (!matchId || submitting) return;
    setSubmitting(true); setActionError(null);
    (async () => {
      try {
        await api.forfeitMatch(matchId);
        setSubmitting(false);
        // No local terminal state is invented: the poll reads the settlement
        // the server wrote, so the match-over frame a forfeit produces is the
        // same one every other terminal produces.
        poke();
      } catch (e) {
        setSubmitting(false);
        setActionError(e instanceof Error ? e.message : "could not forfeit");
        poke();
      }
    })();
  }, [matchId, submitting, poke]);

  /**
   * RFX1 2B3 — THE OUTRO'S BEAT, and its place in the sequence.
   *
   * It starts only once the ending's material is in hand (`ready`) AND the
   * final round's ordinary result feedback has ENDED (`revealHold` false), so
   * the lifecycle reads: final question → its normal verdict beat → the
   * match-complete beat → the end screen. The effect is
   * keyed on the outro's deterministic id, so a poll, a rerender or a parent
   * state change cannot restart the timer or play the beat twice.
   */
  useEffect(() => {
    if (!outro || !outro.ready || outro.done || revealHold) return;
    const id = window.setTimeout(
      () => setOutro((o) => (o && !o.done ? { ...o, done: true } : o)), MATCH_OUTRO_MS);
    return () => window.clearTimeout(id);
  }, [outro, revealHold]);

  return {
    phase, publicRound, roundNumber, privatePlayer, lastResolved, damageLog, result,
    presence: publicRound?.presence ?? null, skewMs, viewerUserId, opponentUserId,
    selectedOptionId, answeredSelection, selectedAbilityId, submitting, abilityBusy, actionError,
    error, contractError, retry, roundLive, answer, selectAbility,
    forfeit,
    segmentState, lastSegmentSettlement, lastSegmentRoundNumber,
    submitSegmentChallenge, revealHold,
    // READY, not merely claimed. The phase holds the end screen off from the
    // instant the completion is observed; the PRESENTATION only begins once
    // there is something to present, so the beat cannot announce the end of
    // the match before the final verdict it follows has even arrived.
    matchOutroId: outro && outro.ready && !outro.done ? outro.id : null,
  };
}
