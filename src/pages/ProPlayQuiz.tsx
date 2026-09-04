import { useCallback, useEffect, useState } from "react";
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
  answerProPlayQuestion,
  startProPlayQuiz,
  type ProPlayAnswerResult,
  type ProPlayQuestion,
  type ProPlaySessionState,
} from "@/lib/pro-play/api";
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
 */
export default function ProPlayQuiz() {
  const [session, setSession] = useState<ProPlaySessionState | null>(null);
  const [question, setQuestion] = useState<ProPlayQuestion | null>(null);
  const [result, setResult] = useState<ProPlayAnswerResult | null>(null);
  const [pendingNext, setPendingNext] = useState<ProPlayQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setSelected(null);
    setPendingNext(null);
    try {
      const turn = await startProPlayQuiz();
      setSession(turn.session);
      setQuestion(turn.question);
    } catch (err) {
      setSession(null);
      setQuestion(null);
      setError(err instanceof Error ? err.message : "Pro Play is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void begin();
  }, [begin]);

  const onSelect = useCallback(
    async (choice: string) => {
      // A locked selection is final: ignore further clicks while the reveal
      // is showing or a request is in flight.
      if (!session || !question || result || busy) return;
      setSelected(choice);
      setBusy(true);
      try {
        const turn = await answerProPlayQuestion(session.session_id, choice);
        setResult(turn.result);
        setSession(turn.session);
        setPendingNext(turn.question);
      } catch (err) {
        setSelected(null);
        setError(err instanceof Error ? err.message : "Pro Play is unavailable right now.");
      } finally {
        setBusy(false);
      }
    },
    [session, question, result, busy],
  );

  const onNext = useCallback(() => {
    setResult(null);
    setSelected(null);
    setQuestion(pendingNext);
    setPendingNext(null);
  }, [pendingNext]);

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
            <Button className="mt-3" onClick={() => void begin()} disabled={busy}>
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
              onSelect={(label) => void onSelect(label)}
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
