/**
 * PPQ2-B — the Pro Play Arena controller.
 *
 * Owns transport and timing for one run and nothing else: start, answer
 * (through PPQ0C's question-bound `submitProPlayAnswer`), resync, advance.
 * What each response does to the view is `proPlayArenaReducer`'s; what the
 * Arena draws is `projectProPlayArena`'s.
 *
 * TWO GUARDS, BOTH SYNCHRONOUS
 * ────────────────────────────
 *  - The reducer state is mirrored in a ref and every gate reads the ref, so
 *    two clicks delivered before React re-renders cannot both pass: the first
 *    `answerSent` flips `busy` in the ref before the second is examined.
 *  - An EPOCH is bumped by every restart and by unmount. A continuation that
 *    resumes in an older epoch dispatches nothing, so a response for a session
 *    the page has left (or a page that has unmounted) never paints.
 *
 * The transport is injectable for tests; production uses the real API.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  answerProPlayQuestion,
  getProPlaySession,
  ProPlayApiError,
  startProPlayQuiz,
} from "../api";
import {
  resyncProPlaySession,
  submitProPlayAnswer,
  type ProPlayAnswerRequest,
} from "../answerFlow";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import {
  advanceNeedsResync,
  canResendAnswer,
  canSubmitAnswer,
  INITIAL_PRO_PLAY_ARENA_STATE,
  proPlayArenaReducer,
  type ProPlayArenaAction,
} from "./state";
import { projectProPlayArena } from "./projectProPlayArena";
import type { ProPlayArenaProjection, ProPlayArenaState } from "./types";

export interface ProPlayArenaTransport {
  start: typeof startProPlayQuiz;
  getSession: typeof getProPlaySession;
  answer: typeof answerProPlayQuestion;
}

export interface ProPlayArenaControllerOptions {
  transport?: Partial<ProPlayArenaTransport>;
  /** Start a session on mount. Default true. */
  autoStart?: boolean;
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

export interface ProPlayArenaController {
  state: ProPlayArenaState;
  projection: ProPlayArenaProjection;
  /** Answer the question on the stage with this option (by id or view). */
  selectOption: (option: AnswerOptionView | string) => void;
  /** Leave the reveal: mount the delivered next question, or the summary. */
  next: () => void;
  /** Whatever the error panel's Try again means right now. */
  tryAgain: () => void;
  /** Abandon this run and start a new session. */
  restart: () => void;
}

const UNAVAILABLE = "Pro Play is unavailable right now.";

const toApiError = (err: unknown) =>
  err instanceof ProPlayApiError
    ? err
    : new ProPlayApiError("PP_ERROR", err instanceof Error && err.message ? err.message : UNAVAILABLE);

export function useProPlayArenaController(
  options: ProPlayArenaControllerOptions = {},
): ProPlayArenaController {
  const { autoStart = true } = options;
  const transport: ProPlayArenaTransport = {
    start: options.transport?.start ?? startProPlayQuiz,
    getSession: options.transport?.getSession ?? getProPlaySession,
    answer: options.transport?.answer ?? answerProPlayQuestion,
  };
  // Latest options without re-creating every callback on each render.
  const opts = useRef({ transport, retryDelaysMs: options.retryDelaysMs, sleep: options.sleep });
  opts.current = { transport, retryDelaysMs: options.retryDelaysMs, sleep: options.sleep };

  const [state, setState] = useState<ProPlayArenaState>(INITIAL_PRO_PLAY_ARENA_STATE);
  const stateRef = useRef<ProPlayArenaState>(INITIAL_PRO_PLAY_ARENA_STATE);
  const epoch = useRef(0);

  const dispatch = useCallback((action: ProPlayArenaAction) => {
    const nextState = proPlayArenaReducer(stateRef.current, action);
    if (nextState === stateRef.current) return false;
    stateRef.current = nextState;
    setState(nextState);
    return true;
  }, []);

  const restart = useCallback(async () => {
    const mine = ++epoch.current;
    dispatch({ type: "startSent" });
    try {
      const turn = await opts.current.transport.start();
      if (mine !== epoch.current) return;
      dispatch({ type: "started", turn });
    } catch (err) {
      if (mine !== epoch.current) return;
      dispatch({ type: "startFailed", error: toApiError(err) });
    }
  }, [dispatch]);

  const resync = useCallback(
    async (sessionId: string) => {
      const mine = epoch.current;
      if (!dispatch({ type: "resyncSent", sessionId })) return;
      const outcome = await resyncProPlaySession(sessionId, opts.current.transport.getSession);
      if (mine !== epoch.current) return;
      dispatch({ type: "resyncSettled", sessionId, outcome });
    },
    [dispatch],
  );

  const submit = useCallback(
    async (request: ProPlayAnswerRequest) => {
      const mine = epoch.current;
      // The gate: refused (and nothing is sent) unless this is the one
      // permitted submission, or the identical resend of a retryable one.
      if (!dispatch({ type: "answerSent", request })) return;
      let outcome;
      try {
        outcome = await submitProPlayAnswer(request, {
          answer: opts.current.transport.answer,
          getSession: opts.current.transport.getSession,
          retryDelaysMs: opts.current.retryDelaysMs,
          sleep: opts.current.sleep,
        });
      } catch (err) {
        outcome = { kind: "failed" as const, error: toApiError(err), retryable: true };
      }
      if (mine !== epoch.current) return;
      dispatch({ type: "answerSettled", request, outcome });
    },
    [dispatch],
  );

  const selectOption = useCallback(
    (option: AnswerOptionView | string) => {
      const s = stateRef.current;
      const q = s.question;
      if (!q || !s.session) return;
      const index = Number(typeof option === "string" ? option : option.id);
      if (!Number.isInteger(index) || index < 0 || index >= q.choices.length) return;
      const request: ProPlayAnswerRequest = {
        sessionId: s.session.session_id,
        questionId: q.question_id,
        selectedAnswer: q.choices[index],
      };
      if (!canSubmitAnswer(s, request)) return;
      void submit(request);
    },
    [submit],
  );

  const next = useCallback(() => {
    const s = stateRef.current;
    if (s.busy !== null) return;
    if (advanceNeedsResync(s) && s.session) {
      void resync(s.session.session_id);
      return;
    }
    dispatch({ type: "advance" });
  }, [dispatch, resync]);

  const tryAgain = useCallback(() => {
    const s = stateRef.current;
    if (s.busy !== null) return;
    const recovery = s.recovery;
    if (recovery?.kind === "answer" && canResendAnswer(s, recovery.request)) {
      void submit(recovery.request);
    } else if (recovery?.kind === "resync") {
      void resync(recovery.sessionId);
    } else {
      void restart();
    }
  }, [submit, resync, restart]);

  useEffect(() => {
    if (autoStart) void restart();
    return () => {
      // Unmount: every continuation still in flight is now stale.
      epoch.current += 1;
    };
    // Mount-only: a run starts once per controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projection = useMemo(() => projectProPlayArena(state), [state]);
  // A start already in flight is the restart being asked for; a second would
  // orphan a server session.
  const restartVoid = useCallback(() => {
    if (stateRef.current.busy === "starting") return;
    void restart();
  }, [restart]);

  return { state, projection, selectOption, next, tryAgain, restart: restartVoid };
}
