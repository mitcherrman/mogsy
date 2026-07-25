import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAborted,
  isFatal,
  statCheckOnlineApi,
  StatCheckApiError,
  type StatCheckOnlineApi,
} from "@/lib/stat-check-online/client";
import type { MatchResultView, OnlineSeat } from "@/lib/stat-check-online/contracts";
import type { ItemId } from "../items";
import type { EquippedItem, MatchState, RoundResolution, SlotAssignments } from "../statCheckEngine";
import { synthesizeMatchState, toRoundResolution } from "./onlineMatchModel";

const POLL_MS = 1_500;
const MAX_BACKOFF_MS = 8_000;

export type ResolutionEvent = { key: number; resolution: RoundResolution };

export type OnlineMatchController = {
  status: "connecting" | "playing" | "complete" | "error";
  /** Latest authoritative base state (selecting / item-choice / match-over). */
  live: MatchState | null;
  /** Monotonic counter bumped whenever `live` is a fresh authoritative snapshot. */
  liveKey: number;
  /** Newest resolution for the page to merge + reveal (monotonic key). */
  resolutionEvent: ResolutionEvent | null;
  yourSeat: OnlineSeat | null;
  youChosen: boolean;
  youLocked: boolean;
  opponentChosen: boolean;
  opponentLocked: boolean;
  result: MatchResultView | null;
  errorCode: string | null;
  submitLock: (assignments: SlotAssignments, equipped: EquippedItem | null) => Promise<boolean>;
  submitItemChoice: (itemId: ItemId) => Promise<boolean>;
};

/**
 * Authoritative-match session hook (polling + resume, mirroring
 * useRankedMatch discipline). The page renders a locally presented
 * MatchState; this hook supplies authoritative snapshots at presentation
 * boundaries plus per-round resolution events that drive the EXISTING
 * reveal choreography. No rules run client-side in online mode.
 */
export function useStatCheckMatch(
  matchId: string | null,
  api: StatCheckOnlineApi = statCheckOnlineApi,
): OnlineMatchController {
  const [state, setState] = useState<Omit<OnlineMatchController, "submitLock" | "submitItemChoice">>({
    status: "connecting",
    live: null,
    liveKey: 0,
    resolutionEvent: null,
    yourSeat: null,
    youChosen: false,
    youLocked: false,
    opponentChosen: false,
    opponentLocked: false,
    result: null,
    errorCode: null,
  });
  const historyRef = useRef<RoundResolution[]>([]);
  const seenResolvedRef = useRef(0);
  const seatRef = useRef<OnlineSeat | null>(null);
  const inFlightRef = useRef(false);
  const disposedRef = useRef(false);
  const failuresRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const localLockRef = useRef<number | null>(null); // round we locked locally
  const localChoiceRef = useRef<number | null>(null); // choice index we chose locally

  const fail = useCallback((error: unknown) => {
    if (isAborted(error)) return;
    const code = error instanceof StatCheckApiError ? error.code : null;
    setState((current) => ({ ...current, status: "error", errorCode: code }));
  }, []);

  const schedule = useCallback((delay: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void poll(), delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poll = useCallback(async () => {
    if (disposedRef.current || !matchId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const publicView = await api.getMatchPublic(matchId);
      const privateView = await api.getMatchPrivate(matchId);
      const seat = privateView.yourSeat;
      seatRef.current = seat;

      // Backfill any resolutions we have not yet seen, oldest first.
      let newestResolution: RoundResolution | null = null;
      const latest = publicView.latestResolvedRound ?? 0;
      while (seenResolvedRef.current < latest) {
        const next = seenResolvedRef.current + 1;
        const resolved = await api.getResolvedRound(matchId, next);
        const mapped = toRoundResolution(resolved, seat);
        historyRef.current = [...historyRef.current, mapped];
        seenResolvedRef.current = next;
        newestResolution = mapped;
      }

      const live = synthesizeMatchState(publicView, privateView, historyRef.current);
      const other = seat === "p1" ? "p2" : "p1";
      const isComplete = publicView.status === "complete";
      let result: MatchResultView | null = null;
      if (isComplete) {
        try {
          result = await api.getMatchResult(matchId);
        } catch {
          result = null;
        }
      }

      failuresRef.current = 0;
      if (disposedRef.current) return;
      setState((current) => ({
        status: isComplete ? "complete" : "playing",
        live,
        liveKey: current.liveKey + 1,
        resolutionEvent: newestResolution
          ? { key: (current.resolutionEvent?.key ?? 0) + 1, resolution: newestResolution }
          : current.resolutionEvent,
        yourSeat: seat,
        youChosen:
          publicView.seats[seat].chosen ||
          (live.phase === "item-choice" && localChoiceRef.current === publicView.itemChoicesCompleted),
        youLocked:
          publicView.seats[seat].locked ||
          (live.phase === "selecting" && localLockRef.current === publicView.round),
        opponentChosen: publicView.seats[other].chosen,
        opponentLocked: publicView.seats[other].locked,
        result,
        errorCode: null,
      }));
      if (!isComplete) schedule(POLL_MS);
    } catch (error) {
      if (disposedRef.current || isAborted(error)) return;
      if (isFatal(error)) {
        fail(error);
        return;
      }
      failuresRef.current += 1;
      schedule(Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failuresRef.current));
    } finally {
      inFlightRef.current = false;
    }
  }, [api, fail, matchId, schedule]);

  useEffect(() => {
    disposedRef.current = false;
    historyRef.current = [];
    seenResolvedRef.current = 0;
    localLockRef.current = null;
    localChoiceRef.current = null;
    if (!matchId) return;
    (async () => {
      try {
        // Resume seeds the resolved-round cursor so reloading mid-match
        // replays no reveals the player already watched (the latest resolved
        // round is still exposed to the page through `live.roundHistory`).
        const resume = await api.resumeMatch(matchId);
        seenResolvedRef.current = resume.publicView.latestResolvedRound ?? 0;
        if (resume.latestResolved) {
          historyRef.current = [toRoundResolution(resume.latestResolved, resume.privateView.yourSeat)];
        }
        await poll();
      } catch (error) {
        fail(error);
      }
    })();
    return () => {
      disposedRef.current = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const submitLock = useCallback(
    async (assignments: SlotAssignments, equipped: EquippedItem | null): Promise<boolean> => {
      if (!matchId) return false;
      const roundNumber = state.live?.round ?? 0;
      const body: Record<string, string> = {};
      for (const [categoryId, cardId] of Object.entries(assignments)) {
        if (cardId) body[categoryId] = cardId;
      }
      try {
        await api.submitLock(
          matchId,
          roundNumber,
          body,
          equipped ? { category_id: equipped.categoryId, item_id: equipped.itemId } : null,
        );
        localLockRef.current = roundNumber;
        setState((current) => ({ ...current, youLocked: true }));
        void poll();
        return true;
      } catch (error) {
        if (isFatal(error)) fail(error);
        return false;
      }
    },
    [api, fail, matchId, poll, state.live?.round],
  );

  const submitItemChoice = useCallback(
    async (itemId: ItemId): Promise<boolean> => {
      if (!matchId) return false;
      try {
        await api.submitItemChoice(matchId, itemId);
        localChoiceRef.current = state.live?.itemChoicesCompleted ?? 0;
        setState((current) => ({ ...current, youChosen: true }));
        void poll();
        return true;
      } catch (error) {
        if (isFatal(error)) fail(error);
        return false;
      }
    },
    [api, fail, matchId, poll, state.live?.itemChoicesCompleted],
  );

  return { ...state, submitLock, submitItemChoice };
}
