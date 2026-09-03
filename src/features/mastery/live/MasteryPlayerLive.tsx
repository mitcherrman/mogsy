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
import { MasteryAssetsProvider } from "./MasteryAssetsProvider";
import { MasteryQuestionDispatch, MasteryRevealDispatch } from "../interactions/registry";
import { toQuestionReveal } from "../interactions/toQuestionReveal";
import { useRevealAutoAdvance } from "../interactions/revealState";
import { humanizeFamily } from "../player/playerFormat";
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
  type MasterySessionView,
} from "./api";

type Answer = number | boolean | string;
type Phase = "loading" | "question" | "submitting" | "reveal" | "completed" | "error";

interface StepResult { family: string; correct: boolean; }

interface State {
  phase: Phase;
  sessionId: string | null;
  question: MasteryPlayerQuestion | null;
  reveal: MasteryPlayerReveal | null;
  submittedAnswer: Answer | null;
  summary: MasterySessionSummary | null;
  error: string | null;
  conflict: boolean;
  // Per-step outcomes accumulated from revealed steps (keyed by sequence index),
  // used only for the completion review. Never used to compute correctness.
  results: Record<number, StepResult>;
}

const INITIAL: State = {
  phase: "loading", sessionId: null, question: null, reveal: null,
  submittedAnswer: null, summary: null, error: null, conflict: false, results: {},
};

/**
 * Which interaction kinds run the MODERN per-question reveal.
 *
 * `legacy_combat` is excluded deliberately: it has combat before/after state to
 * show and keeps its existing separate reveal screen with its manual Next
 * button, pending its own audit. Everything else — atomic recall, comparison,
 * and any future modern kind added to the dispatcher — reveals in place and
 * advances itself.
 */
function isModernInteraction(question: MasteryPlayerQuestion | null): boolean {
  return question !== null && question.interactionKind !== "legacy_combat";
}

/** Record a revealed step's backend-authoritative outcome for the review. */
function withResult(results: Record<number, StepResult>, reveal: MasteryPlayerReveal | null) {
  if (!reveal) return results;
  return { ...results, [reveal.sequenceIndex]: {
    family: reveal.questionFamily, correct: reveal.authoritativeCorrectness } };
}

export function MasteryPlayerLive({
  masterySetId,
  startSessionFn = startSession,
}: {
  masterySetId?: string;
  /** Override for how a session gets created. Defaults to the normal
   * authenticated `startSession`; the dev-only generated-playtest launcher
   * passes `startGeneratedPlaytestSession` instead. Everything downstream
   * (current/answer/advance, rendering) is unchanged either way. */
  startSessionFn?: (masterySetId: string, signal?: AbortSignal) => Promise<MasterySessionView>;
}) {
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
      const view = await startSessionFn(setId, signal);
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
        results: withResult(p.results, view.reveal),
        phase,
      }));
    } catch (e) { fail(e); }
  }, [masterySetId, startSessionFn, fail]);

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
      setS((p) => ({ ...p, phase: "reveal", reveal, results: withResult(p.results, reveal) }));
    } catch (e) {
      if (isConflict(e) && s.sessionId) {
        // A conflicting/second submission: resync from the server (recoverable).
        try {
          const view = await getCurrent(s.sessionId);
          setS((p) => ({
            ...p, phase: view.reveal ? "reveal" : "question",
            question: view.question ?? p.question, reveal: view.reveal,
            submittedAnswer: view.reveal ? (view.reveal.playerAnswer as Answer) : p.submittedAnswer,
            results: withResult(p.results, view.reveal),
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

  // AUTO-ADVANCE. One timer per reveal, armed on the reveal's own sequence
  // index. A `null` key disarms it, which is how every non-reveal phase and
  // every legacy-combat reveal (which keeps its Next button) is spelled — so
  // a duplicate poll, a re-render or a resync can never schedule a second
  // advance, and a timer armed for an older question is dropped rather than
  // advancing a newer one.
  //
  // A RELOAD landing directly in the persisted reveal phase is the same case:
  // `boot()` restores `phase: "reveal"` from the server, the key becomes that
  // step's index, and the timer arms on mount. The answer is never resubmitted
  // — only `advance` is called, which is the same idempotent action the manual
  // Next button called.
  const modernReveal = s.phase === "reveal" && isModernInteraction(s.question)
    ? s.reveal : null;
  useRevealAutoAdvance(
    modernReveal ? modernReveal.sequenceIndex : null,
    onNext,
  );

  const restart = () => { const c = new AbortController(); abortRef.current = c; boot(c.signal); };

  let body: JSX.Element;
  if (s.phase === "loading") {
    body = <div data-testid="mastery-player-loading" className="p-6 text-sm text-muted-foreground">Loading…</div>;
  } else if (s.phase === "error") {
    body = (
      <div data-testid="mastery-player-error" className="space-y-3 p-6 text-sm">
        <p className="text-destructive">Could not load the mastery set: {s.error}</p>
        <button type="button" className="rounded-md bg-primary px-3 py-1 text-primary-foreground" onClick={restart}>
          Retry
        </button>
      </div>
    );
  } else if (s.phase === "completed") {
    body = <CompletionPanel summary={s.summary} results={s.results} onRestart={restart} />;
  } else {
    body = (
      <div data-testid="mastery-player-live" className="mx-auto w-full max-w-2xl space-y-4 p-4">
        {s.conflict && (
          <div data-testid="mastery-player-conflict" role="status" className="rounded-md bg-muted px-3 py-2 text-xs">
            This step was already answered — showing the recorded result.
          </div>
        )}
        {(s.phase === "question" || s.phase === "submitting"
          || (s.phase === "reveal" && modernReveal)) && s.question && (
          <MasteryQuestionDispatch
            key={s.question.sequenceIndex}
            question={s.question}
            total={s.question.totalSteps}
            submitting={s.phase === "submitting"}
            onSubmit={onSubmit}
            // The question stays mounted through its own reveal — same
            // component, same layout, now locked and coloured. There is no
            // separate reveal screen and no Next button on this path.
            reveal={modernReveal && s.question
              ? toQuestionReveal(s.question, modernReveal, s.submittedAnswer)
              : null}
          />
        )}
        {s.phase === "reveal" && s.question && s.reveal && !modernReveal && (
          <MasteryRevealDispatch
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

  return <MasteryAssetsProvider>{body}</MasteryAssetsProvider>;
}

/** Completion screen: score, percentage, and a plain-language concept review
 * derived from the session's revealed steps (no fabricated metrics). */
function CompletionPanel({
  summary, results, onRestart,
}: {
  summary: MasterySessionSummary | null;
  results: Record<number, StepResult>;
  onRestart: () => void;
}) {
  const rows = Object.values(results);
  const total = summary?.totalSteps ?? rows.length;
  const correct = summary?.correctCount ?? rows.filter((r) => r.correct).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  // De-duplicate concepts, strongest = every attempt correct; review = any miss.
  const byFamily = new Map<string, boolean>();
  for (const r of rows) {
    byFamily.set(r.family, (byFamily.get(r.family) ?? true) && r.correct);
  }
  const strongest = [...byFamily.entries()].filter(([, ok]) => ok).map(([f]) => humanizeFamily(f));
  const review = [...byFamily.entries()].filter(([, ok]) => !ok).map(([f]) => humanizeFamily(f));

  return (
    <div data-testid="mastery-player-completion" className="mx-auto w-full max-w-2xl space-y-5 p-6">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">Mastery set complete</h2>
        <p data-testid="mastery-completion-score" className="text-3xl font-bold tabular-nums">
          {correct} / {total}
        </p>
        <p className="text-sm text-muted-foreground">{pct}% correct</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {strongest.length > 0 && (
          <div className="space-y-1 rounded-lg border border-emerald-600/30 bg-emerald-500/10 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Strongest</h3>
            <ul className="space-y-0.5 text-sm">
              {strongest.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        )}
        {review.length > 0 && (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Review</h3>
            <ul className="space-y-0.5 text-sm">
              {review.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          data-testid="mastery-try-again"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={onRestart}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
