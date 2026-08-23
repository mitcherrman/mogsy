/**
 * The Daily Challenge run controller (DC1 Phase 5).
 *
 * Holds ONE authoritative object — the run projection the server last sent —
 * and a little presentation state that is explicitly not authority: the beat
 * currently playing, whether a request is in flight, and the transient error
 * line. Every gameplay fact (which card is current, which options are gone,
 * whether the score is locked, whether a window is open, what the score is) is
 * read off the projection and never mirrored, because a mirror is a second
 * answer that can be wrong.
 *
 * ACTIVATION ORDER IS THE LOAD-BEARING PART
 * ─────────────────────────────────────────
 * A Meta Reflex window is six seconds of the player's life, and it starts when
 * the SERVER says so. So nothing here activates on mount, on refresh, on
 * resume, or as a side effect of arriving at a card: `activate()` is called
 * only from a deliberate press, and the timed surface is not rendered until
 * the response carrying the deadline is in hand. The sequence is: render the
 * ready card → player presses → POST activate → receive the authoritative
 * deadline → render the timed card. A speculative activate before the UI is
 * ready would spend real seconds on a spinner.
 *
 * RECOVERY IS A REFETCH, NEVER A REPAIR
 * ─────────────────────────────────────
 * Three backend refusals are ordinary consequences of a stale client rather
 * than faults: the card moved on (`CARD_NOT_CURRENT`), the option was already
 * struck out (`OPTION_ELIMINATED`), or the window was never opened
 * (`META_REFLEX_NOT_ACTIVATED`). Each is answered by re-reading the run and
 * showing what is actually true — never by an error dialog, and never by the
 * client deciding what the state should have been.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DcApiError,
  activateCard,
  fetchRun,
  fetchToday,
  isDcAborted,
  startRun,
  submitAnswer,
} from "@/lib/daily-challenge/client";
import type { DcCard, DcRun, DcToday } from "@/lib/daily-challenge/contracts";
import { currentCard } from "@/lib/daily-challenge/contracts";
import {
  DcBeat,
  cardPhase,
  clockSkewMs,
  projectBeat,
  timeoutBeat,
} from "./dailyChallengeViews";

export type DcRunStage =
  | "loading"      // reading today / the run
  | "ready"        // today is known, no run started yet
  | "playing"
  | "complete"
  | "unavailable"; // no Daily exists, or the service refused

export interface DailyChallengeRunState {
  stage: DcRunStage;
  today: DcToday | null;
  run: DcRun | null;
  card: DcCard | null;
  beat: DcBeat | null;
  busy: boolean;
  /** A human sentence, never a backend code. Null when nothing is wrong. */
  error: string | null;
  /** Server clock minus device clock, from the last projection. */
  skewMs: number;
  /** Largest window remaining observed for the live deadline, for the meter. */
  timerMaxMs: number | null;
  /**
   * The card the STAGE is showing, which lags the run by one beat.
   *
   * The backend advances `current_sequence` in the same transaction that
   * resolves a card, so by the time an answer lands the run already describes
   * the NEXT card. Rendering that immediately would flash the reveal — or skip
   * it entirely — and the explanation is the thing the mode exists to deliver.
   * So a resolved card is held here until the player presses on.
   */
  holdSequence: number | null;
  start: () => void;
  activate: () => void;
  answer: (optionIndex: number) => void;
  refresh: () => void;
  continueToNext: () => void;
  dismissBeat: () => void;
}

/** A sentence for the player. Backend codes never reach the surface. */
function messageFor(error: unknown): string {
  if (error instanceof DcApiError) {
    switch (error.code) {
      case "NO_DAILY_AVAILABLE":
      case "DAILY_UNAVAILABLE":
        return "Today's challenge isn't ready yet. Try again in a moment.";
      case "SESSION_REQUIRED":
        return "We couldn't start a session. Check your connection and try again.";
      case "RATE_LIMITED":
        return "That was a lot at once — give it a second.";
      case "INVALID_OPTION":
        return "That answer didn't go through. Try again.";
      default:
        break;
    }
    if (error.kind === "network") return "Lost the connection. Your progress is saved.";
    if (error.kind === "invalid_response") {
      return "This page is out of date. Refresh to update.";
    }
  }
  return "Something went wrong. Your progress is saved.";
}

/** Refusals that mean "you are looking at stale state", not "you did wrong". */
const REFETCH_CODES = new Set([
  "CARD_NOT_CURRENT", "OPTION_ELIMINATED", "META_REFLEX_NOT_ACTIVATED",
  "ALREADY_RESOLVED", "RUN_COMPLETE",
]);

export function useDailyChallengeRun(): DailyChallengeRunState {
  const [today, setToday] = useState<DcToday | null>(null);
  const [run, setRun] = useState<DcRun | null>(null);
  const [stage, setStage] = useState<DcRunStage>("loading");
  const [beat, setBeat] = useState<DcBeat | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [timerMaxMs, setTimerMaxMs] = useState<number | null>(null);
  const [holdSequence, setHoldSequence] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Which timeouts have already had their beat shown, so a lapsed window
  // announces itself ONCE rather than on every subsequent poll or answer.
  const announcedTimeouts = useRef<Set<number>>(new Set());
  const runIdRef = useRef<string | null>(null);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  /**
   * Adopt a projection as the new truth.
   *
   * Also the ONE place the timeout beat can fire, because a timeout arrives as
   * card STATE rather than as an answer event — the backend writes no attempt
   * row for a window nobody answered in, so there is nothing to react to
   * except the fact that the card came back locked.
   */
  const adopt = useCallback((next: DcRun) => {
    if (!mountedRef.current) return;
    setRun(next);
    runIdRef.current = next.runId;
    setSkewMs(clockSkewMs(next.serverNow, Date.now()));
    setStage(next.status === "completed" ? "complete" : "playing");

    const card = currentCard(next);
    if (card?.timer) {
      const remaining = Math.max(0, Date.parse(card.timer.endsAt) - Date.parse(card.timer.serverNow));
      setTimerMaxMs((previous) => (previous === null ? remaining : Math.max(previous, remaining)));
    } else {
      setTimerMaxMs(null);
    }

    if (card) {
      const lapsed = timeoutBeat(card);
      if (lapsed && !announcedTimeouts.current.has(card.sequence)) {
        announcedTimeouts.current.add(card.sequence);
        setBeat(lapsed);
      }
    }
  }, []);

  const withRequest = useCallback(
    async <T,>(work: (signal: AbortSignal) => Promise<T>,
               onOk: (value: T) => void): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setError(null);
      try {
        const value = await work(controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;
        onOk(value);
      } catch (e) {
        if (isDcAborted(e) || !mountedRef.current) return;
        const code = e instanceof DcApiError ? e.code : null;
        if (code && REFETCH_CODES.has(code) && runIdRef.current) {
          // Stale client, not a fault. Re-read and show what is true; the
          // player sees the corrected board rather than an error.
          try {
            const fresh = await fetchRun(runIdRef.current);
            if (mountedRef.current) adopt(fresh);
            return;
          } catch {
            // fall through to the ordinary message
          }
        }
        if (code === "RUN_NOT_FOUND") {
          setStage("ready");
          setRun(null);
          runIdRef.current = null;
          return;
        }
        setError(messageFor(e));
      } finally {
        if (mountedRef.current && abortRef.current === controller) setBusy(false);
      }
    }, [adopt]);

  // ── entry ────────────────────────────────────────────────────────────────
  //
  // ONE read on mount. `GET /today` reports whether this caller already has a
  // run, so the entry decision — start, resume, or show a finished day — is
  // made from the server rather than from anything remembered locally. A run
  // that exists is FETCHED, never re-created: `POST /runs` would return the
  // same run, but asking for a read with a write is how a "resume" becomes a
  // race with itself in a second tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchToday();
        if (cancelled || !mountedRef.current) return;
        setToday(snapshot);
        if (!snapshot.run) {
          setStage("ready");
          return;
        }
        runIdRef.current = snapshot.run.runId;
        const existing = await fetchRun(snapshot.run.runId);
        if (cancelled || !mountedRef.current) return;
        adopt(existing);
      } catch (e) {
        if (cancelled || !mountedRef.current || isDcAborted(e)) return;
        const code = e instanceof DcApiError ? e.code : null;
        setStage(code === "NO_DAILY_AVAILABLE" || code === "DAILY_UNAVAILABLE"
          ? "unavailable" : "ready");
        setError(messageFor(e));
      }
    })();
    return () => { cancelled = true; };
  }, [adopt]);

  const start = useCallback(() => {
    void withRequest((signal) => startRun(signal), adopt);
  }, [withRequest, adopt]);

  const refresh = useCallback(() => {
    const runId = runIdRef.current;
    if (!runId) return;
    void withRequest((signal) => fetchRun(runId, signal), adopt);
  }, [withRequest, adopt]);

  /**
   * Open the current card's scored window. Deliberate press only.
   *
   * Guarded on the card actually being a ready reflex card, so a double press,
   * a stray keystroke, or a re-render cannot re-send it — and even if one did,
   * the backend's activation is idempotent and never moves a deadline forward,
   * so the worst case is a wasted request rather than lost time.
   */
  const activate = useCallback(() => {
    const runId = runIdRef.current;
    const card = run ? currentCard(run) : null;
    if (!runId || !card || cardPhase(card) !== "reflex_ready") return;
    // A NEW window: forget the previous card's observed maximum so the meter
    // does not inherit a stale duration.
    setTimerMaxMs(null);
    void withRequest((signal) => activateCard(runId, card.sequence, signal), adopt);
  }, [run, withRequest, adopt]);

  const answer = useCallback((optionIndex: number) => {
    const runId = runIdRef.current;
    const card = run ? currentCard(run) : null;
    if (!runId || !card) return;
    const phase = cardPhase(card);
    if (phase !== "open" && phase !== "reflex_timed" && phase !== "learning") return;
    if (card.eliminated.includes(optionIndex)) return;

    void withRequest(
      (signal) => submitAnswer(runId, card.sequence, optionIndex, signal),
      (ack) => {
        // The beat is projected from the card the answer was ABOUT, not from
        // the run's new current card — by the time this lands the run may have
        // advanced, and the beat belongs to the card the player just played.
        setBeat(projectBeat(ack.event, card));
        // Hold the surface on the card that just resolved, so its reveal and
        // explanation are actually read. Not held on a miss: the player is
        // still on that card and the options must stay live.
        if (ack.event.resolved) setHoldSequence(card.sequence);
        adopt(ack.run);
      });
  }, [run, withRequest, adopt]);

  const continueToNext = useCallback(() => {
    setHoldSequence(null);
    setBeat(null);
  }, []);

  const dismissBeat = useCallback(() => setBeat(null), []);

  const card = useMemo(() => (run ? currentCard(run) : null), [run]);

  // Release the hold if the held card is no longer in the projection at all —
  // a refresh across a version change, say. The surface must never point at a
  // card the run does not have.
  useEffect(() => {
    if (holdSequence === null || !run) return;
    if (!run.cards.some((c) => c.sequence === holdSequence)) setHoldSequence(null);
  }, [holdSequence, run]);

  return {
    stage, today, run, card, beat, busy, error, skewMs, timerMaxMs, holdSequence,
    start, activate, answer, refresh, continueToNext, dismissBeat,
  };
}
