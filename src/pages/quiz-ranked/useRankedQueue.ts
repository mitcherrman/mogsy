/**
 * Public Ranked queue controller (F1.5). Owns the queue state machine, class
 * selection, single-flight polling with backoff, and refresh recovery. The
 * backend is authoritative for pairing and eligibility; this never pairs
 * locally, never invents a wait estimate, and never shows opponent identity.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/ranked-public/client";
import { RankedApiError } from "@/lib/ranked-public/client";
import type { QueueStatusView } from "@/lib/ranked-public/contracts";

export type QueueState =
  | "recovering" | "selecting_class" | "joining" | "waiting" | "matched"
  | "cancelling" | "unavailable" | "fatal";

export type RankedClass = "tank" | "mage" | "marksman";

const POLL_MS = 2000;
const MAX_BACKOFF_MS = 8000;
const UNAVAILABLE_CODES = new Set([
  "FEATURE_DISABLED", "AUTH_REQUIRED", "ACCOUNT_REQUIRED",
  "RANKED_QUEUE_DISABLED", "RANKED_QUEUE_NOT_ELIGIBLE", "RANKED_QUESTION_POOL_UNAVAILABLE",
]);

export interface QueueController {
  state: QueueState;
  status: QueueStatusView | null;
  matchId: string | null;
  selectedClass: RankedClass;
  unavailableReason: string | null;
  error: string | null;
  setSelectedClass: (c: RankedClass) => void;
  join: () => void;
  cancel: () => void;
}

export function useRankedQueue(): QueueController {
  const [state, setState] = useState<QueueState>("recovering");
  const [status, setStatus] = useState<QueueStatusView | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<RankedClass>("tank");
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const stateRef = useRef<QueueState>("recovering");
  const failuresRef = useRef(0);
  stateRef.current = state;

  const clearTimer = () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  };

  const applyStatus = useCallback((s: QueueStatusView) => {
    setStatus(s);
    if (s.status === "matched" && s.matchId) {
      setMatchId(s.matchId);
      setState("matched");
      clearTimer();
    } else if (s.status === "waiting") {
      setState("waiting");
    } else {
      // not_queued / cancelled / expired -> back to class selection.
      setState((prev) => (prev === "matched" ? prev : "selecting_class"));
    }
  }, []);

  const handleError = useCallback((e: unknown, phase: "poll" | "action") => {
    if (api.isAborted(e)) return;
    if (api.isRateLimited(e)) {
      // Transient throttle: keep waiting and back off; never fatal/unavailable.
      setError("Slowing down to respect the queue rate limit…");
      return;
    }
    if (e instanceof RankedApiError && e.code && UNAVAILABLE_CODES.has(e.code)) {
      setUnavailableReason(e.message);
      setState("unavailable");
      clearTimer();
      return;
    }
    if (e instanceof RankedApiError && (e.kind === "network" || e.kind === "invalid_response")) {
      setError(e.message);
      if (phase === "poll") setState((prev) => (prev === "waiting" ? "waiting" : "recovering"));
      return;
    }
    setError(e instanceof Error ? e.message : "queue error");
    if (phase === "action") setState("selecting_class");
  }, []);

  const poll = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const s = await api.getQueueStatus(controller.signal);
      failuresRef.current = 0;
      setError(null);
      applyStatus(s);
    } catch (e) {
      failuresRef.current += 1;
      handleError(e, "poll");
    } finally {
      // Keep polling only while waiting/recovering.
      if (stateRef.current === "waiting" || stateRef.current === "recovering") {
        const delay = Math.min(POLL_MS * 2 ** failuresRef.current, MAX_BACKOFF_MS);
        clearTimer();
        timerRef.current = window.setTimeout(() => void poll(), delay);
      }
    }
  }, [applyStatus, handleError]);

  // Restore an existing queue entry / assigned match on mount (refresh-safe).
  useEffect(() => {
    void poll();
    return () => {
      clearTimer();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback(() => {
    setState("joining");
    setError(null);
    (async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const s = await api.joinQueue(selectedClass, controller.signal);
        applyStatus(s);
        if (s.status === "waiting") {
          failuresRef.current = 0;
          clearTimer();
          timerRef.current = window.setTimeout(() => void poll(), POLL_MS);
        }
      } catch (e) {
        handleError(e, "action");
      }
    })();
  }, [selectedClass, applyStatus, handleError, poll]);

  const cancel = useCallback(() => {
    setState("cancelling");
    (async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const s = await api.cancelQueue(controller.signal);
        clearTimer();
        applyStatus(s);
        if (s.status !== "matched") setState("selecting_class");
      } catch (e) {
        handleError(e, "action");
      }
    })();
  }, [applyStatus, handleError]);

  return {
    state, status, matchId, selectedClass, unavailableReason, error,
    setSelectedClass, join, cancel,
  };
}
