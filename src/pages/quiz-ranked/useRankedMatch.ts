/**
 * Public Ranked live-match controller (F1.5). Owns the match id, single-flight
 * public/private polling with backoff+abort, skew-anchored timer input,
 * resolved-round capture, the select→review→confirm-atomic submission flow,
 * the Level 2 gate, a separate presence heartbeat, and recovery/terminal
 * states. The backend is authoritative for every combat value; this computes
 * none. Modeled on the staff session + DSA recovery patterns but JWT-only —
 * no participant token or admin key.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
import { readSegmentSettlement } from "@/lib/ranked-public/contracts";
import { snapshotSkewMs } from "./rankedViews";

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
 */
export const DAMAGE_LOG_LIMIT = 8;

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

export const REVEAL_HOLD_MS = 1500;
/** Longer when the settlement contains a level-up: there is strictly more to read. */
export const REVEAL_HOLD_LEVEL_UP_MS = 2600;

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
  | "recovering" | "active" | "reviewing" | "locked" | "progression"
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
  chooseLevelTwo: (abilityId: string) => void;
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
}

export function useRankedMatch(matchId: string | null, viewerUserId: string): MatchController {
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
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
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
  const iOweChoice = (publicRound?.progressionPendingPlayers ?? []).includes(viewerUserId);
  const matchOver = publicRound?.matchOver || result !== null;

  const phase: MatchPhase = (() => {
    if (error) return "fatal";
    if (!publicRound) return "recovering";
    if (matchOver) return "match_over";
    if (iOweChoice) return "progression";
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
  const beginRevealHold = useCallback((leveledUp: boolean) => {
    if (revealTimerRef.current !== undefined) window.clearTimeout(revealTimerRef.current);
    setRevealHold(true);
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = undefined;
      setRevealHold(false);
    }, leveledUp ? REVEAL_HOLD_LEVEL_UP_MS : REVEAL_HOLD_MS);
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
    opts: { hold?: boolean } = {},
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
      beginRevealHold(leveledUp);
    }
  }, [matchId, beginRevealHold]);

  /**
   * Seed the recent-round ledger from rounds this client never watched
   * resolve — a refresh, or a reconnect into a match already in progress.
   *
   * Read-only and best effort. It fetches at most `DAMAGE_LOG_LIMIT` already
   * SETTLED rounds (the backend refuses to build a resolved projection for a
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
      setSkewMs(snapshotSkewMs(pub.serverTime, Date.now()));
      const active = pub.activeRound?.roundNumber ?? null;
      const previous = activeRoundRef.current;
      if (previous !== null && active !== null && active !== previous) {
        // Ids come from THIS snapshot, so the mapping always matches the match
        // the settlement belongs to.
        await captureResolved(previous, controller.signal,
          idMappingFromRound(pub, viewerUserId));
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

      if (pub.matchOver) {
        stoppedRef.current = true;
        try {
          setResult(await api.getMatchResult(matchId, controller.signal));
        } catch { /* result read races match completion; retry next mount */ }
        const lastRound = pub.completedRounds;
        // No hold on the final round: MatchOverFrame owns that moment and there
        // is no "next question" to withhold.
        if (lastRound > 0) {
          await captureResolved(lastRound, controller.signal,
            idMappingFromRound(pub, viewerUserId), { hold: false });
        }
        return;
      }
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
      if (!stoppedRef.current) {
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

  const poke = useCallback(() => {
    if (!stoppedRef.current) {
      clearTimer();
      timerRef.current = window.setTimeout(() => void pollRef.current?.(), 0);
    }
  }, []);

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
    setRoundNumber(null);
    // Everything below describes ONE match. The refs above were already reset
    // here; the settlement state was not, so switching `matchId` inside a
    // mounted controller carried the previous match's ledger, reveal and
    // transcript into the new arena until its first round settled.
    setDamageLog([]);
    setLastResolved(null);
    setLastSegmentSettlement(null);
    setLastSegmentRoundNumber(null);
    (async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const resume = await api.resumeMatch(matchId, controller.signal);
        setPublicRound(resume.public);
        setPrivatePlayer(resume.private);
        setResult(resume.result);
        setSkewMs(snapshotSkewMs(resume.serverTime, Date.now()));
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
        // Background, and deliberately NOT awaited: the poll loop below must
        // start on time whether or not the ledger can be recovered.
        void backfillDamageLog(resume.public, controller.signal);
      } catch (e) {
        if (api.isContractError(e)) { failContract("resume", e); return; }
        if (api.isFatal(e)) { setError((e as RankedApiError).message); return; }
      }
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
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // A finished match has no next question to withhold, so any hold in flight is
  // released immediately and MatchOverFrame takes over.
  useEffect(() => {
    if (!matchOver) return;
    if (revealTimerRef.current !== undefined) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = undefined;
    }
    setRevealHold(false);
  }, [matchOver]);

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
    setSubmitting(true); setActionError(null);
    (async () => {
      try {
        await api.submitRound(matchId, rn, answerIndex);
        poke();  // the next snapshot is what actually flips the UI to locked
      } catch (e) {
        // Release the grid so the player can answer again.
        setSelectedOptionId(null);
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
  }, [matchId, publicRound, poke]);

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

  const runSegmentAction = useCallback(
    (action: (segment: number) => Promise<unknown>) => {
      if (!matchId || submitting || segmentNumber === null) return;
      setSubmitting(true);
      setActionError(null);
      (async () => {
        try {
          await action(segmentNumber);
        } catch (e) {
          // A stale phase/index means the server already moved on — re-poll
          // rather than surfacing a transient race as an error.
          const stale = e instanceof RankedApiError && (
            e.code === "RANKED_STALE_ROUND" ||
            e.code === "RANKED_WRONG_SEGMENT_PHASE" ||
            e.code === "RANKED_WRONG_CHALLENGE_INDEX" ||
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
        api.submitSegmentChallenge(matchId!, segment, challengeIndex, choice));
    }, [runSegmentAction, matchId]);

  const chooseLevelTwo = useCallback((abilityId: string) => {
    if (!matchId || submitting) return;
    setSubmitting(true); setActionError(null);
    (async () => {
      try {
        await api.chooseLevelTwo(matchId, abilityId);
        setSubmitting(false);
        poke();
      } catch (e) {
        setSubmitting(false);
        setActionError(e instanceof Error ? e.message : "choice failed");
        poke();
      }
    })();
  }, [matchId, submitting, poke]);

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

  return {
    phase, publicRound, roundNumber, privatePlayer, lastResolved, damageLog, result,
    presence: publicRound?.presence ?? null, skewMs, viewerUserId, opponentUserId,
    selectedOptionId, selectedAbilityId, submitting, abilityBusy, actionError,
    error, contractError, retry, roundLive, answer, selectAbility, chooseLevelTwo,
    forfeit,
    segmentState, lastSegmentSettlement, lastSegmentRoundNumber,
    submitSegmentChallenge, revealHold,
  };
}
