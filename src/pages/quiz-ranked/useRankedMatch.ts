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
} from "@/lib/ranked-public/contracts";
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
}

export function useRankedMatch(matchId: string | null, viewerUserId: string): MatchController {
  const [publicRound, setPublicRound] = useState<PublicRoundView | null>(null);
  const [privatePlayer, setPrivatePlayer] = useState<PrivatePlayerView | null>(null);
  const [lastResolved, setLastResolved] = useState<ResolvedRoundView | null>(null);
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
      if (active !== null) activeRoundRef.current = active;
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
        if (resume.latestResolved) {
          try {
            setLastResolved(adaptBackendSettlement(
              (resume.latestResolved as { payload: unknown }).payload as ResolvedProjection, idMapping()));
          } catch { /* ignore */ }
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
    phase, publicRound, privatePlayer, lastResolved, result,
    presence: publicRound?.presence ?? null, skewMs, viewerUserId, opponentUserId,
    selectedOptionId, selectedAbilityId, submitting, actionError, error,
    selectOption, selectAbility, review, edit, confirm, chooseLevelTwo,
  };
}
