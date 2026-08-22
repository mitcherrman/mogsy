/**
 * Public Ranked queue controller (F1.5). Owns the queue state machine, class
 * selection, single-flight polling with backoff, and refresh recovery. The
 * backend is authoritative for pairing and eligibility; this never pairs
 * locally, never invents a wait estimate, and never shows opponent identity.
 *
 * PLAY1 — THE PAIRING WINDOW
 * ──────────────────────────
 * A queue entry does not go straight from `waiting` to `matched`. The pairing
 * pass first CLAIMS both entries and only then writes the match rows
 * (`_pair_partition` in `ranked_public/queue.py`), so there is a window in
 * which the account is neither waiting nor matched. Two things can happen in
 * that window, and this controller used to mishandle both:
 *
 *   1. A status poll reads `claimed`. The old `applyStatus` funnelled every
 *      non-waiting/non-matched status into "back to selection", which stopped
 *      the poll loop — so a player whose poll happened to land inside the
 *      pairing window was dropped out of the queue view while the server was
 *      busy giving them a match.
 *   2. The player presses Cancel. `cancel_queue` refuses a claimed entry with
 *      `RANKED_CANNOT_CANCEL`. The old handler treated that as an ordinary
 *      action failure: it showed the backend's message and fell back to
 *      selection with polling stopped — stranding the player in the lobby
 *      while their match existed on the server.
 *
 * Both now resolve to the same, honest reading: PAIRING HAS STARTED AND
 * CANNOT BE UNDONE. The controller enters `pairing`, keeps polling, and asks
 * the account-bound active-match endpoint as well, because the match may be
 * written before the queue entry's own row catches up. It only gives up on the
 * pairing reading if BOTH sources say there is no match, and even then it
 * returns to `waiting` and resumes polling rather than dropping the player.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/ranked-public/client";
import { RankedApiError } from "@/lib/ranked-public/client";
import type { QueueStatusView } from "@/lib/ranked-public/contracts";

export type QueueState =
  | "recovering" | "selecting_class" | "joining" | "waiting" | "pairing" | "matched"
  | "cancelling" | "unavailable" | "fatal";

export type RankedClass = "tank" | "mage" | "marksman";

const POLL_MS = 2000;
const MAX_BACKOFF_MS = 8000;
/** The pairing window is short; poll it faster than the ordinary wait. */
const PAIRING_POLL_MS = 700;
const UNAVAILABLE_CODES = new Set([
  "FEATURE_DISABLED", "AUTH_REQUIRED", "ACCOUNT_REQUIRED",
  "RANKED_QUEUE_DISABLED", "RANKED_QUEUE_NOT_ELIGIBLE", "RANKED_QUESTION_POOL_UNAVAILABLE",
]);

/** The states in which a join request must NOT be sent. Anything other than
 *  idle selection already has a request in flight, an entry on the server, or
 *  a match — a second join from any of them is a duplicate. */
const JOIN_BLOCKED_STATES = new Set<QueueState>([
  "joining", "waiting", "pairing", "matched", "cancelling", "recovering",
  "unavailable", "fatal",
]);

// Player-facing copy per gate code. Unknown codes fall back to the backend
// message; account eligibility errors now describe only real account state,
// never rollout or tester enrollment.
const UNAVAILABLE_MESSAGES: Record<string, string> = {
  FEATURE_DISABLED:
    "Ranked isn't open yet. Check back soon — no action needed on your side.",
  RANKED_QUEUE_DISABLED:
    "Ranked matchmaking is paused right now. Check back soon.",
  RANKED_QUEUE_NOT_ELIGIBLE:
    "Ranked needs a full (non-guest) account. Sign in to play.",
  RANKED_QUESTION_POOL_UNAVAILABLE:
    "Ranked is temporarily unavailable while the question pool is being prepared. Try again later.",
  AUTH_REQUIRED: "Your session expired. Sign in again to play Ranked.",
  ACCOUNT_REQUIRED: "Ranked needs a full (non-guest) account. Sign in to play.",
};

/**
 * Player-facing copy for JOIN failures the player can act on themselves.
 * `RANKED_ROLE_REQUIRED` (R1) is reachable whenever the account's stored role
 * disappears between the page load and the join — the backend fails closed
 * there, and the player simply has to pick a role. Unknown codes keep falling
 * through to the backend's own message.
 */
const ACTION_MESSAGES: Record<string, string> = {
  RANKED_ROLE_REQUIRED: "Choose your role before joining the Ranked queue.",
  RANKED_ALREADY_QUEUED: "You're already in the queue.",
};

/** Shown while the controller re-reads the server during the pairing window. */
const PAIRING_NOTICE = "Pairing has already started — finding your match…";

export interface QueueController {
  state: QueueState;
  status: QueueStatusView | null;
  matchId: string | null;
  selectedClass: RankedClass;
  unavailableReason: string | null;
  error: string | null;
  setSelectedClass: (c: RankedClass) => void;
  join: () => void;
  /** R3 one-click join: pick a class and queue as it in a single action. */
  joinAs: (c: RankedClass) => void;
  /**
   * R1 role-path join: enter the queue sending NO class at all.
   *
   * The backend applies its own compatibility default for the legacy class
   * and reads the player's League role from the account's stored preference
   * inside the join transaction. The client therefore never picks a class on
   * the player's behalf and — critically — never derives one from the role.
   *
   * `matchWithBot` is the ADMIN TESTING request. It changes nothing about
   * this state machine: the backend answers `matched` with a match id
   * immediately instead of `waiting`, so the existing matched -> handoff beat
   * carries the player into the arena with no extra state, no polling, and no
   * bot-specific branch. Authorization is the SERVER's — a non-admin sending
   * it is refused, and this controller shows that refusal like any other join
   * error.
   */
  joinWithoutClass: (options?: { matchWithBot?: boolean }) => void;
  cancel: () => void;
  /**
   * PLAY1: whether Cancel is a legal action right now. False during the
   * pairing window, where the server has already committed the match and a
   * cancel can only be refused.
   */
  canCancel: boolean;
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

  /**
   * Apply a server status AND RETURN the state it resolved to.
   *
   * The return value is not a convenience. `setState` does not update
   * `stateRef` until React re-renders, so an `await`-adjacent reader — the
   * poll's own `finally`, which decides whether to schedule the next tick —
   * sees the PREVIOUS state and would reschedule (or stop) on stale
   * information. Callers use the returned value for that decision and fall
   * back to the ref only when there is nothing newer to go on.
   */
  const applyStatus = useCallback((s: QueueStatusView): QueueState => {
    setStatus(s);
    if (s.status === "matched" && s.matchId) {
      setMatchId(s.matchId);
      setState("matched");
      stateRef.current = "matched";
      clearTimer();
      return "matched";
    }
    // Already in a match: no later status may take that away.
    if (stateRef.current === "matched") return "matched";
    const next: QueueState =
      s.status === "waiting"
        ? "waiting"
        // The pairing window. NOT an exit from the queue — the server has this
        // entry and is committing a match for it. Stay in-flight and keep
        // polling; see THE PAIRING WINDOW at the top of this file.
        : s.status === "claimed"
          ? "pairing"
          // not_queued / cancelled / expired -> back to class selection.
          : "selecting_class";
    setState(next);
    stateRef.current = next;
    return next;
  }, []);

  const handleError = useCallback((e: unknown, phase: "poll" | "action") => {
    if (api.isAborted(e)) return;
    if (api.isRateLimited(e)) {
      // Transient throttle: keep waiting and back off; never fatal/unavailable.
      setError("Slowing down to respect the queue rate limit…");
      return;
    }
    if (e instanceof RankedApiError && e.code && UNAVAILABLE_CODES.has(e.code)) {
      setUnavailableReason(UNAVAILABLE_MESSAGES[e.code] ?? e.message);
      setState("unavailable");
      clearTimer();
      return;
    }
    if (e instanceof RankedApiError && (e.kind === "network" || e.kind === "invalid_response")) {
      setError(e.message);
      if (phase === "poll") {
        setState((prev) =>
          prev === "waiting" || prev === "pairing" ? prev : "recovering");
      }
      return;
    }
    if (e instanceof RankedApiError && e.code && ACTION_MESSAGES[e.code]) {
      setError(ACTION_MESSAGES[e.code]);
      if (phase === "action") setState("selecting_class");
      return;
    }
    setError(e instanceof Error ? e.message : "queue error");
    if (phase === "action") setState("selecting_class");
  }, []);

  const poll = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    // What THIS tick learned. Null after a failure, where the ref is the only
    // thing left to go on.
    let resolved: QueueState | null = null;
    try {
      const s = await api.getQueueStatus(controller.signal);
      failuresRef.current = 0;
      setError(null);
      resolved = applyStatus(s);
      // During the pairing window the queue row may still say `claimed` while
      // the match rows already exist. Ask the account-bound endpoint too, so
      // the handoff is not held up by whichever row settles last.
      if (resolved === "pairing") {
        const found = await api.getActiveMatch(controller.signal).catch(() => null);
        if (found) {
          setMatchId(found.matchId);
          setState("matched");
          stateRef.current = "matched";
          resolved = "matched";
          clearTimer();
        }
      }
    } catch (e) {
      failuresRef.current += 1;
      handleError(e, "poll");
    } finally {
      // Keep polling while the server still owes us an answer.
      const s = resolved ?? stateRef.current;
      if (s === "waiting" || s === "recovering" || s === "pairing") {
        const base = s === "pairing" ? PAIRING_POLL_MS : POLL_MS;
        const delay = Math.min(base * 2 ** failuresRef.current, MAX_BACKOFF_MS);
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

  /**
   * Enter the pairing window deliberately, from a signal that is NOT a status
   * read: a refused cancel, or a join rejected because a match already exists.
   *
   * Asks the account-bound active-match endpoint once — the match may already
   * be written — and otherwise resumes polling from `pairing`, which is what
   * keeps the player attached to the queue instead of being returned to the
   * menu with a live match on the server.
   */
  const enterPairing = useCallback(async (signal?: AbortSignal) => {
    setState("pairing");
    stateRef.current = "pairing";
    setError(PAIRING_NOTICE);
    const found = await api.getActiveMatch(signal).catch(() => null);
    if (found) {
      setMatchId(found.matchId);
      setState("matched");
      stateRef.current = "matched";
      setError(null);
      clearTimer();
      return true;
    }
    failuresRef.current = 0;
    clearTimer();
    timerRef.current = window.setTimeout(() => void poll(), PAIRING_POLL_MS);
    return false;
  }, [poll]);

  /**
   * R3: join as an EXPLICIT class in one call.
   *
   * The class travels as an argument rather than through `selectedClass` state
   * because the click that picks a class is the same click that joins — routing
   * it through a state update first would send whatever the previous render
   * closed over. `selectedClass` is still updated so the queued-as copy and any
   * later bot match reflect the pick.
   */
  const joinAs = useCallback((classId: RankedClass) => {
    // Duplicate-join guard. Read from the ref, not from the closed-over state:
    // two clicks in the same frame both see the pre-click render otherwise.
    if (JOIN_BLOCKED_STATES.has(stateRef.current)) return;
    stateRef.current = "joining";
    setSelectedClass(classId);
    setState("joining");
    setError(null);
    (async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const s = await api.joinQueue(classId, controller.signal);
        const resolved = applyStatus(s);
        if (resolved === "waiting" || resolved === "pairing") {
          failuresRef.current = 0;
          clearTimer();
          timerRef.current = window.setTimeout(() => void poll(), POLL_MS);
        }
      } catch (e) {
        if (e instanceof RankedApiError && e.code === "RANKED_ACTIVE_MATCH_EXISTS") {
          await enterPairing(controller.signal);
          return;
        }
        handleError(e, "action");
      }
    })();
  }, [applyStatus, enterPairing, handleError, poll]);

  const join = useCallback(() => joinAs(selectedClass), [joinAs, selectedClass]);

  const joinWithoutClass = useCallback((options?: { matchWithBot?: boolean }) => {
    if (JOIN_BLOCKED_STATES.has(stateRef.current)) return;
    stateRef.current = "joining";
    setState("joining");
    setError(null);
    (async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const s = await api.joinQueue(null, controller.signal, options);
        const resolved = applyStatus(s);
        if (resolved === "waiting" || resolved === "pairing") {
          failuresRef.current = 0;
          clearTimer();
          timerRef.current = window.setTimeout(() => void poll(), POLL_MS);
        }
      } catch (e) {
        if (e instanceof RankedApiError && e.code === "RANKED_ACTIVE_MATCH_EXISTS") {
          await enterPairing(controller.signal);
          return;
        }
        handleError(e, "action");
      }
    })();
  }, [applyStatus, enterPairing, handleError, poll]);

  const cancel = useCallback(() => {
    // Cancelling twice would race two DELETEs; the pairing window cannot be
    // cancelled at all and must not even ask.
    if (stateRef.current !== "waiting") return;
    stateRef.current = "cancelling";
    setState("cancelling");
    (async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const s = await api.cancelQueue(controller.signal);
        clearTimer();
        const resolved = applyStatus(s);
        // A cancel that races pairing can still come back `claimed`: the
        // server accepted the request and answered with the entry it actually
        // has. Resume the pairing window rather than returning to the menu.
        if (resolved === "pairing") {
          failuresRef.current = 0;
          timerRef.current = window.setTimeout(() => void poll(), PAIRING_POLL_MS);
        }
      } catch (e) {
        if (api.isAborted(e)) return;
        // THE CANCEL-VS-PAIRING RACE. The server refused because it had
        // already claimed this entry for a match. That is a successful
        // pairing, not a failed action — recover the match instead of
        // dropping the player back to the menu.
        if (e instanceof RankedApiError && e.code === "RANKED_CANNOT_CANCEL") {
          await enterPairing(controller.signal);
          return;
        }
        handleError(e, "action");
      }
    })();
  }, [applyStatus, enterPairing, handleError, poll]);

  return {
    state, status, matchId, selectedClass, unavailableReason, error,
    setSelectedClass, join, joinAs, joinWithoutClass, cancel,
    canCancel: state === "waiting",
  };
}
