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
  selectedOptionId: string | null;
  selectedAbilityId: string | null;
  submitting: boolean;
  actionError: string | null;
  error: string | null;
  selectOption: (id: string) => void;
  selectAbility: (id: string | null) => void;
  review: () => void;
  edit: () => void;
  confirm: (answerIndex: number) => void;
  chooseLevelTwo: (abilityId: string) => void;
  /** Authoritative state of an active multi-challenge segment, or null. */
  segmentState: SegmentStateView | null;
  /** Transcript of the last resolved multi-challenge segment, or null. */
  lastSegmentSettlement: SegmentSettlementView | null;
  draftSegmentAbility: (abilityId: string | null) => void;
  confirmSegmentAbility: () => void;
  submitSegmentChallenge: (challengeIndex: number, itemId: string) => void;
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
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
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
    if (hasSubmitted) return "locked";
    if (reviewing) return "reviewing";
    return "active";
  })();

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
        // A new round: clear the previous round's local selection.
        setSelectedOptionId(null); setSelectedAbilityId(null); setReviewing(false);
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

  const selectOption = useCallback((id: string) => { setSelectedOptionId(id); setReviewing(false); }, []);
  const selectAbility = useCallback((id: string | null) => { setSelectedAbilityId(id); setReviewing(false); }, []);
  const review = useCallback(() => { if (selectedOptionId !== null) setReviewing(true); }, [selectedOptionId]);
  const edit = useCallback(() => setReviewing(false), []);

  const confirm = useCallback((answerIndex: number) => {
    if (!matchId || submitting) return;
    const rn = publicRound?.activeRound?.roundNumber;
    if (rn === undefined) return;
    setSubmitting(true); setActionError(null);
    (async () => {
      try {
        await api.submitRound(matchId, rn, answerIndex, selectedAbilityId);
        setSubmitting(false);
        poke();
      } catch (e) {
        setSubmitting(false);
        if (e instanceof RankedApiError && e.code === "RANKED_STALE_ROUND") { poke(); return; }
        // Preserve selections for retry.
        setActionError(e instanceof Error ? e.message : "submit failed");
      }
    })();
  }, [matchId, submitting, publicRound, selectedAbilityId, poke]);

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

  const draftSegmentAbility = useCallback((abilityId: string | null) => {
    runSegmentAction((segment) => api.draftSegmentAbility(matchId!, segment, abilityId));
  }, [runSegmentAction, matchId]);

  const confirmSegmentAbility = useCallback(() => {
    // The confirmed value is whatever the SERVER currently holds as the draft.
    const drafted = segmentState?.ownAbility.selectedAbilityId ?? null;
    runSegmentAction((segment) =>
      api.confirmSegmentAbility(matchId!, segment, drafted));
  }, [runSegmentAction, matchId, segmentState]);

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
    selectedOptionId, selectedAbilityId, submitting, actionError, error,
    selectOption, selectAbility, review, edit, confirm, chooseLevelTwo,
    segmentState, lastSegmentSettlement, draftSegmentAbility,
    confirmSegmentAbility, submitSegmentChallenge,
  };
}
