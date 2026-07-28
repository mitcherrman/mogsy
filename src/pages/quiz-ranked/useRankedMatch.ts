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
  /** Authoritative state of an active multi-challenge segment, or null. */
  segmentState: SegmentStateView | null;
  /** Transcript of the last resolved multi-challenge segment, or null. */
  lastSegmentSettlement: SegmentSettlementView | null;
  submitSegmentChallenge: (challengeIndex: number, itemId: string) => void;
  /** True while the round is open for an ability change. */
  roundLive: boolean;
}

export function useRankedMatch(matchId: string | null, viewerUserId: string): MatchController {
  const [publicRound, setPublicRound] = useState<PublicRoundView | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [privatePlayer, setPrivatePlayer] = useState<PrivatePlayerView | null>(null);
  const [lastResolved, setLastResolved] = useState<ResolvedRoundView | null>(null);
  const [lastSegmentSettlement, setLastSegmentSettlement] =
    useState<SegmentSettlementView | null>(null);
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

  const abortRef = useRef<AbortController | null>(null);
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
  const idMapping = useCallback(() => {
    const opp = opponentUserId ?? "";
    return { p1PlayerId: viewerUserId, p2PlayerId: opp };
  }, [opponentUserId, viewerUserId]);

  const captureResolved = useCallback(async (round: number, signal: AbortSignal) => {
    if (resolvedRef.current === round) return;
    try {
      const env = await api.getResolvedRound(matchId!, round, signal);
      const settlement = adaptBackendSettlement(env.payload as unknown as ResolvedProjection, idMapping());
      resolvedRef.current = round;
      setLastResolved(settlement);
      // A quiz round yields null here, which correctly clears a previous
      // segment transcript so it cannot linger over the next round.
      setLastSegmentSettlement(readSegmentSettlement(env.payload));
    } catch (e) {
      if (!api.isAborted(e)) { /* resolved not ready yet; ignore */ }
    }
  }, [matchId, idMapping]);

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
        await captureResolved(previous, controller.signal);
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
        if (lastRound > 0) await captureResolved(lastRound, controller.signal);
        return;
      }
      if (active !== null) {
        try {
          setPrivatePlayer(await api.getPrivatePlayer(matchId, controller.signal));
        } catch (e) {
          if (api.isFatal(e)) { setError((e as RankedApiError).message); stoppedRef.current = true; return; }
        }
      }
    } catch (e) {
      if (api.isAborted(e)) return;
      if (api.isFatal(e)) { setError((e as RankedApiError).message); stoppedRef.current = true; return; }
      failuresRef.current += 1;
      setError(null);
      setActionError(null);
    } finally {
      inFlightRef.current = false;
      if (!stoppedRef.current) {
        clearTimer();
        if (rerunRef.current) { rerunRef.current = false; timerRef.current = window.setTimeout(() => void poll(), 0); }
        else timerRef.current = window.setTimeout(
          () => void poll(), Math.min(POLL_MS * 2 ** failuresRef.current, MAX_BACKOFF_MS));
      }
    }
  }, [matchId, captureResolved]);

  const poke = useCallback(() => {
    if (!stoppedRef.current) { clearTimer(); timerRef.current = window.setTimeout(() => void poll(), 0); }
  }, [poll]);

  // Resume + poll on mount; heartbeat on a separate cadence.
  useEffect(() => {
    if (!matchId) return;
    stoppedRef.current = false;
    activeRoundRef.current = null;
    resolvedRef.current = null;
    setRoundNumber(null);
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
          try {
            setLastResolved(adaptBackendSettlement(raw as ResolvedProjection, idMapping()));
          } catch { /* ignore */ }
          // Recovered separately so a transcript survives a refresh even if
          // the arena settlement adapter rejects an older payload shape.
          try {
            setLastSegmentSettlement(readSegmentSettlement(raw));
          } catch { /* a malformed reveal simply shows no transcript */ }
        }
      } catch (e) {
        if (api.isFatal(e)) { setError((e as RankedApiError).message); return; }
      }
      void poll();
    })();
    hbRef.current = window.setInterval(() => {
      void api.sendPresence(matchId).catch(() => { /* one miss is not a disconnect */ });
    }, HEARTBEAT_MS);
    return () => {
      stoppedRef.current = true;
      clearTimer();
      if (hbRef.current !== undefined) window.clearInterval(hbRef.current);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

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
  const submitSegmentChallenge = useCallback((challengeIndex: number, itemId: string) => {
    runSegmentAction((segment) =>
      api.submitSegmentChallenge(matchId!, segment, challengeIndex, itemId));
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

  return {
    phase, publicRound, roundNumber, privatePlayer, lastResolved, result,
    presence: publicRound?.presence ?? null, skewMs, viewerUserId, opponentUserId,
    selectedOptionId, selectedAbilityId, submitting, abilityBusy, actionError,
    error, roundLive, answer, selectAbility, chooseLevelTwo,
    segmentState, lastSegmentSettlement, submitSegmentChallenge,
  };
}
