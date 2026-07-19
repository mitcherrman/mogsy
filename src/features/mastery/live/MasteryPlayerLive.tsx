/**
 * Live Mastery player container (Claude G1).
 *
 * Drives the six-question flow against the backend Mastery API. It reuses the G5
 * presentational views (`MasteryQuestionView`, `MasteryRevealView`) but the
 * fixture harness (`MasteryPlayerPrototype`) is preserved for tests. This
 * container NEVER computes correctness or a canonical value locally, NEVER
 * imports a fixture, and NEVER creates a transition or snapshot — the server owns
 * progression; the client only renders server-provided state and submits answers.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { MasteryPlayerQuestion, MasteryPlayerReveal } from "../contracts";
import { MasteryQuestionView } from "../player/MasteryQuestionView";
import { MasteryRevealView } from "../player/MasteryRevealView";
import {
  advance,
  getCurrent,
  isAborted,
  isConflict,
  listSets,
  startSession,
  submitAnswer,
  MasteryApiError,
  type MasterySessionSummary,
} from "./api";

type Answer = number | boolean | string;
type Phase = "loading" | "question" | "submitting" | "reveal" | "completed" | "error";

interface State {
  phase: Phase;
  sessionId: string | null;
  question: MasteryPlayerQuestion | null;
  reveal: MasteryPlayerReveal | null;
  submittedAnswer: Answer | null;
  summary: MasterySessionSummary | null;
  error: string | null;
  conflict: boolean;
}

const INITIAL: State = {
  phase: "loading", sessionId: null, question: null, reveal: null,
  submittedAnswer: null, summary: null, error: null, conflict: false,
};

export function MasteryPlayerLive({ masterySetId }: { masterySetId?: string }) {
  const [s, setS] = useState<State>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const fail = useCallback((e: unknown) => {
    if (isAborted(e)) return;
    setS((prev) => ({ ...prev, phase: "error",
      error: e instanceof MasteryApiError ? e.message : "unexpected error" }));
  }, []);

  const boot = useCallback(async (signal: AbortSignal) => {
    setS(INITIAL);
    try {
      const setId = masterySetId ?? (await listSets(signal))[0]?.masterySetId;
      if (!setId) { setS((p) => ({ ...p, phase: "error", error: "no published mastery set" })); return; }
      const view = await startSession(setId, signal);
      const phase: Phase = view.summary ? "completed" : view.reveal ? "reveal" : "question";
      // Fail closed: a non-completed session MUST carry a question. Never render a
      // blank player by entering a question/reveal phase with a null question.
      if (phase !== "completed" && !view.question) {
        setS((p) => ({ ...p, phase: "error",
          error: "session response did not include a question projection" }));
        return;
      }
      setS((p) => ({
        ...p,
        sessionId: view.session.sessionId,
        question: view.question,
        reveal: view.reveal,
        submittedAnswer: view.reveal ? (view.reveal.playerAnswer as Answer) : null,
        summary: view.summary,
        phase,
      }));
    } catch (e) { fail(e); }
  }, [masterySetId, fail]);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    boot(ctrl.signal);
    return () => ctrl.abort();
  }, [boot]);

  const onSubmit = useCallback(async (answer: Answer) => {
    if (!s.sessionId || !s.question) return;
    const seq = s.question.sequenceIndex;
    setS((p) => ({ ...p, phase: "submitting", submittedAnswer: answer, conflict: false }));
    try {
      const reveal = await submitAnswer(s.sessionId, seq, answer);
      setS((p) => ({ ...p, phase: "reveal", reveal }));
    } catch (e) {
      if (isConflict(e) && s.sessionId) {
        // A conflicting/second submission: resync from the server (recoverable).
        try {
          const view = await getCurrent(s.sessionId);
          setS((p) => ({
            ...p, phase: view.reveal ? "reveal" : "question",
            question: view.question ?? p.question, reveal: view.reveal,
            submittedAnswer: view.reveal ? (view.reveal.playerAnswer as Answer) : p.submittedAnswer,
            conflict: true,
          }));
          return;
        } catch (e2) { fail(e2); return; }
      }
      fail(e);
    }
  }, [s.sessionId, s.question, fail]);

  const onNext = useCallback(async () => {
    if (!s.sessionId || !s.reveal) return;
    const seq = s.reveal.sequenceIndex;
    setS((p) => ({ ...p, phase: "loading" }));
    try {
      const view = await advance(s.sessionId, seq);
      if (view.summary || view.session.completed) {
        setS((p) => ({ ...p, phase: "completed", summary: view.summary, reveal: null }));
      } else if (!view.question) {
        // Fail closed (same invariant boot() enforces): a non-completed advance MUST
        // carry a question. Never re-enter a blank question phase with a null question.
        setS((p) => ({ ...p, phase: "error",
          error: "advance response did not include a question projection" }));
      } else {
        setS((p) => ({ ...p, phase: "question", question: view.question, reveal: null, submittedAnswer: null }));
      }
    } catch (e) { fail(e); }
  }, [s.sessionId, s.reveal, fail]);

  if (s.phase === "loading") {
    return <div data-testid="mastery-player-loading" className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (s.phase === "error") {
    return (
      <div data-testid="mastery-player-error" className="space-y-3 p-6 text-sm">
        <p className="text-destructive">Could not load the mastery set: {s.error}</p>
        <button type="button" className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
                onClick={() => { const c = new AbortController(); abortRef.current = c; boot(c.signal); }}>
          Retry
        </button>
      </div>
    );
  }
  if (s.phase === "completed") {
    return (
      <div data-testid="mastery-player-completion" className="mx-auto w-full max-w-2xl space-y-3 p-6 text-center">
        <h2 className="text-lg font-semibold">Mastery set complete</h2>
        {s.summary && (
          <p className="text-sm text-muted-foreground">
            You answered {s.summary.correctCount} of {s.summary.totalSteps} correctly.
          </p>
        )}
        <button type="button" className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
                onClick={() => { const c = new AbortController(); abortRef.current = c; boot(c.signal); }}>
          Start again
        </button>
      </div>
    );
  }

  return (
    <div data-testid="mastery-player-live" className="mx-auto w-full max-w-2xl space-y-4 p-4">
      {s.conflict && (
        <div data-testid="mastery-player-conflict" role="status" className="rounded-md bg-muted px-3 py-2 text-xs">
          This step was already answered — showing the recorded result.
        </div>
      )}
      {(s.phase === "question" || s.phase === "submitting") && s.question && (
        <MasteryQuestionView
          key={s.question.sequenceIndex}
          question={s.question}
          total={s.question.totalSteps}
          submitting={s.phase === "submitting"}
          onSubmit={onSubmit}
        />
      )}
      {s.phase === "reveal" && s.question && s.reveal && (
        <MasteryRevealView
          key={`reveal-${s.reveal.sequenceIndex}`}
          question={s.question}
          reveal={s.reveal}
          submittedAnswer={s.submittedAnswer as never}
          isFinal={s.reveal.completionState.isFinalStep}
          onNext={onNext}
        />
      )}
    </div>
  );
}
