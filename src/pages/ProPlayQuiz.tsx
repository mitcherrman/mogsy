import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import QuizAnswerOptions from "@/components/quiz/QuizAnswerOptions";
import QuizAnswerFeedback from "@/components/quiz/QuizAnswerFeedback";
import ProPlayEvidence from "@/components/pro-play/ProPlayEvidence";
import ProPlayQuestionCard from "@/components/pro-play/ProPlayQuestionCard";
import { asEvidence, asQuestionContext } from "@/lib/pro-play/contract";
import {
  startProPlayQuiz,
  type ProPlayAnswerResult,
  type ProPlayQuestion,
  type ProPlaySessionState,
  type ProPlayTurn,
} from "@/lib/pro-play/api";
import {
  resyncProPlaySession,
  submitProPlayAnswer,
  type ProPlayAnswerRequest,
} from "@/lib/pro-play/answerFlow";
import { usePublishReportableQuestion } from "@/lib/feedback/reportable-question";
import { PRO_PLAY_QUIZ_ROUTE, PRO_PLAY_ROUTE } from "./ProPlayHub";

/**
 * Pro Play Quiz — ten questions generated on demand from Pro Play Authority.
 *
 * The server owns the session: it picks the family mix, guarantees no repeated
 * question inside one session, freezes each question when it is served, and
 * grades against that frozen copy. This page therefore holds no question bank,
 * no answer key and no scoring logic — it renders whatever turn the server
 * returns and posts the selection back.
 *
 * UI primitives are the production quiz's own (QuizAnswerOptions,
 * QuizAnswerFeedback), so the answer grid, locked selection and correct/
 * incorrect reveal behave exactly as they do in Leaguecraft.
 *
 * Every answer names the question it is for (PPQ0A), so a lost response is
 * recovered by resending the identical request (the server replays the grade
 * it already recorded instead of grading the next question), and a typed
 * conflict resynchronizes from the server's own view of the session. See
 * lib/pro-play/answerFlow.ts.
 */
const UNAVAILABLE = "Pro Play is unavailable right now.";

/** What "Try again" on the error panel does. */
type Recovery =
  /** Resend the identical answer request. */
  | { kind: "answer"; request: ProPlayAnswerRequest }
  /** Re-read the session's current question. */
  | { kind: "resync"; sessionId: string }
  /** Start a fresh session (the default, and the only option once expired). */
  | null;

export default function ProPlayQuiz() {
  const [session, setSession] = useState<ProPlaySessionState | null>(null);
  const [question, setQuestion] = useState<ProPlayQuestion | null>(null);
  const [result, setResult] = useState<ProPlayAnswerResult | null>(null);
  const [pendingNext, setPendingNext] = useState<ProPlayQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<Recovery>(null);
  /* Synchronous in-flight guard. `busy` is state, so two clicks delivered
     before React re-renders would both see it false; the ref closes that gap
     so only one selection is ever submitted per question. */
  const inFlight = useRef(false);
  /* Bumped by every restart: a response for a session the page has moved on
     from is dropped rather than painted over the new one. */
  const epoch = useRef(0);

  /* FB1-4. `question_id` here is an OPAQUE digest, not the stable
     question_key — that key is prefixed with the internal family id and never
     leaves the server (lib/pro-play/api.ts). So it is published as a runtime
     id, and the session id is what ties a report back to the frozen copy the
     server graded against. The correct answer rides along only once `result`
     exists, which is the reveal the player is already looking at. */
  usePublishReportableQuestion(
    question
      ? {
        category: "Leaguecraft",
        mode: "Pro Play Quiz",
        runtimeQuestionId: question.question_id,
        prompt: question.question_text,
        choices: question.choices,
        selectedAnswer: selected,
        canonicalAnswer: result?.correct_answer ?? null,
        questionType: question.topic,
        sessionId: session?.session_id ?? null,
        roundNumber: question.number,
      }
      : null,
  );

  const begin = useCallback(async () => {
    const mine = ++epoch.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setRecovery(null);
    setResult(null);
    setSelected(null);
    setPendingNext(null);
    try {
      const turn = await startProPlayQuiz();
      if (mine !== epoch.current) return;
      setSession(turn.session);
      setQuestion(turn.question);
    } catch (err) {
      if (mine !== epoch.current) return;
      setSession(null);
      setQuestion(null);
      setError(err instanceof Error ? err.message : UNAVAILABLE);
    } finally {
      if (mine === epoch.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, []);

  /** Adopt the server's own view of the session: its current (unanswered)
   *  question, or its final summary. No local turn state survives it. */
  const adopt = useCallback((turn: ProPlayTurn) => {
    setSession(turn.session);
    setQuestion(turn.question);
    setResult(null);
    setSelected(null);
    setPendingNext(null);
  }, []);

  const resync = useCallback(
    async (sessionId: string) => {
      const mine = epoch.current;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setRecovery(null);
      try {
        const outcome = await resyncProPlaySession(sessionId);
        if (mine !== epoch.current) return;
        if (outcome.kind === "resynced") {
          adopt(outcome.turn);
        } else {
          setError(outcome.error.message);
          setRecovery(outcome.kind === "expired" ? null : { kind: "resync", sessionId });
        }
      } finally {
        if (mine === epoch.current) {
          inFlight.current = false;
          setBusy(false);
        }
      }
    },
    [adopt],
  );

  const submit = useCallback(
    async (request: ProPlayAnswerRequest) => {
      const mine = epoch.current;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setRecovery(null);
      // The selection stays locked through every resend: the request is
      // idempotent, so the choice the player made is the one that is graded.
      setSelected(request.selectedAnswer);
      try {
        const outcome = await submitProPlayAnswer(request);
        if (mine !== epoch.current) return;
        switch (outcome.kind) {
          case "answered":
            setResult(outcome.turn.result);
            setSession(outcome.turn.session);
            setPendingNext(outcome.turn.question);
            break;
          case "resynced":
            adopt(outcome.turn);
            break;
          case "expired":
            // Only a restart helps; "Try again" starts a new quiz.
            setError(outcome.error.message);
            break;
          case "failed":
            setError(outcome.error.message);
            if (outcome.retryable) setRecovery({ kind: "answer", request });
            else setSelected(null);
            break;
        }
      } finally {
        if (mine === epoch.current) {
          inFlight.current = false;
          setBusy(false);
        }
      }
    },
    [adopt],
  );

  useEffect(() => {
    void begin();
  }, [begin]);

  const onSelect = useCallback(
    (choice: string) => {
      // A locked selection is final: ignore further clicks while the reveal
      // is showing or a request is in flight.
      if (!session || !question || result || busy || inFlight.current) return;
      void submit({
        sessionId: session.session_id,
        questionId: question.question_id,
        selectedAnswer: choice,
      });
    },
    [session, question, result, busy, submit],
  );

  const onNext = useCallback(() => {
    if (inFlight.current) return;
    if (!pendingNext && session && !session.complete) {
      // An answered turn that is not the last always carries the next
      // question; if one ever arrives without it, ask the server for its
      // current question rather than sitting on an empty card.
      void resync(session.session_id);
      return;
    }
    setResult(null);
    setSelected(null);
    setQuestion(pendingNext);
    setPendingNext(null);
  }, [pendingNext, session, resync]);

  const onTryAgain = useCallback(() => {
    if (inFlight.current) return;
    if (recovery?.kind === "answer") void submit(recovery.request);
    else if (recovery?.kind === "resync") void resync(recovery.sessionId);
    else void begin();
  }, [recovery, submit, resync, begin]);

  const finished = !!session?.complete && !result;
  // Narrowed at the render boundary, once, so nothing downstream re-parses an
  // `unknown` blob. Both are null on a backend that predates the presentation
  // contract, which is exactly the fallback path below.
  const context = asQuestionContext(question?.context);
  const evidence = result ? asEvidence(result.evidence) : null;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Pro Play Quiz | Mogzy"
        description="Ten questions on champions, players and teams from professional League of Legends."
        path={PRO_PLAY_QUIZ_ROUTE}
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          to={PRO_PLAY_ROUTE}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Pro Play
        </Link>

        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/10"
              aria-hidden="true"
            >
              <Trophy className="h-4 w-4 text-[#c9a84c]" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Pro Play Quiz</h1>
          </div>
          {question && !finished ? (
            <span data-pro-play-progress className="text-sm text-muted-foreground">
              {question.number} / {question.total}
            </span>
          ) : null}
        </header>

        {error ? (
          <div
            data-pro-play-error
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <p>{error}</p>
            <Button className="mt-3" onClick={onTryAgain} disabled={busy}>
              Try again
            </Button>
          </div>
        ) : finished ? (
          <div data-pro-play-summary className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Quiz complete</h2>
            <p className="mt-2 text-3xl font-bold">
              {session?.score} / {session?.total}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => void begin()} disabled={busy}>
                Play again
              </Button>
              <Button variant="outline" asChild>
                <Link to={PRO_PLAY_ROUTE}>Back to Pro Play</Link>
              </Button>
            </div>
          </div>
        ) : question ? (
          <ProPlayQuestionCard
            topic={question.topic}
            questionText={question.question_text}
            context={context}
          >
            <QuizAnswerOptions
              choices={question.choices}
              selectedAnswer={selected}
              answerResult={result ? { correct_answer: result.correct_answer } : null}
              onSelect={(label) => onSelect(label)}
            />

            {result ? (
              <div className="mt-5">
                <QuizAnswerFeedback
                  result={{
                    is_correct: result.is_correct,
                    correct_answer: result.correct_answer,
                    explanation: result.explanation,
                  }}
                />
                {/* Reveal-only, and gated on `result` twice over: the blob
                    itself only exists on an answered turn, and this branch
                    only runs once one has been graded. */}
                {evidence ? <ProPlayEvidence evidence={evidence} className="mt-4" /> : null}
                <Button className="mt-4" onClick={onNext} disabled={busy}>
                  {session?.complete ? "See results" : "Next"}
                </Button>
              </div>
            ) : null}
          </ProPlayQuestionCard>
        ) : (
          <p className="text-sm text-muted-foreground">Loading Pro Play questions…</p>
        )}
      </div>
    </div>
  );
}
