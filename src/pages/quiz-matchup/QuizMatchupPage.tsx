import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Swords } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import QuizAnswerOptions from "@/components/quiz/QuizAnswerOptions";
import QuizAnswerFeedback from "@/components/quiz/QuizAnswerFeedback";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import {
  answerMatchupQuestion,
  MATCHUP_STUDY_ROUTE,
  MatchupStudyError,
  startMatchupStudy,
  type MatchupAnswerResult,
  type MatchupQuestion,
  type MatchupSessionState,
} from "@/lib/quiz/matchupApi";

/**
 * Matchup Study — a short contextual Leaguecraft session about two champions.
 *
 * THE CONTEXT IS THE URL, NOT REACT STATE. `?a=olaf&b=ksante` is read on every
 * mount, so a copied link opens the same study, a refresh rebuilds it, and
 * Back leaves it without stranding anything. The session id deliberately does
 * NOT go in the URL: a session is transient play state on the server, and a
 * shared link that resumed a stranger's half-finished session would be a
 * worse thing than a link that starts a fresh one.
 *
 * IT LOOKS LIKE LEAGUECRAFT, BECAUSE IT IS. The answer grid, the locked
 * selection and the correct/incorrect reveal are the production quiz's own
 * components. What Step 12 adds is one line of context above them — the two
 * champions, their icons, and what kind of study this actually is. There is
 * no bespoke dashboard here; a different content source should still produce
 * an excellent NORMAL question.
 *
 * THE TIER LINE IS NOT DECORATION. The server reports whether the session
 * reached true pair questions or is a two-champion study, and this page says
 * which. A session that could only draw one champion at a time must not be
 * described as a matchup, and the only way to guarantee that is to print what
 * the server actually did rather than what the link asked for.
 */
export default function QuizMatchupPage() {
  const [params] = useSearchParams();
  const slugA = (params.get("a") || "").trim();
  const slugB = (params.get("b") || "").trim();

  const [session, setSession] = useState<MatchupSessionState | null>(null);
  const [question, setQuestion] = useState<MatchupQuestion | null>(null);
  const [result, setResult] = useState<MatchupAnswerResult | null>(null);
  const [pendingNext, setPendingNext] = useState<MatchupQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(async () => {
    setResult(null);
    setSelected(null);
    setPendingNext(null);
    setError(null);
    if (!slugA || !slugB) {
      // Refused here rather than by the server, because a link with one
      // champion is a broken link, not a failed request.
      setSession(null);
      setQuestion(null);
      setError("A matchup study needs two champions.");
      return;
    }
    setBusy(true);
    try {
      const turn = await startMatchupStudy(slugA, slugB);
      setSession(turn.session);
      setQuestion(turn.question);
    } catch (err) {
      setSession(null);
      setQuestion(null);
      setError(
        err instanceof MatchupStudyError
          ? err.message
          : "Matchup study is unavailable right now.",
      );
    } finally {
      setBusy(false);
    }
  }, [slugA, slugB]);

  useEffect(() => {
    void begin();
  }, [begin]);

  const onSelect = useCallback(
    async (choice: string) => {
      if (!session || !question || result || busy) return;
      setSelected(choice);
      setBusy(true);
      try {
        const turn = await answerMatchupQuestion(session.session_id, choice);
        setResult(turn.result);
        setSession(turn.session);
        setPendingNext(turn.question);
      } catch (err) {
        setSelected(null);
        setError(
          err instanceof MatchupStudyError
            ? err.message
            : "Matchup study is unavailable right now.",
        );
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
  const pairLabel = session
    ? `${session.champion_a} vs ${session.champion_b}`
    : "Matchup Study";
  const tierLabel =
    session?.tier === "pair_comparison"
      ? "Matchup Study"
      : "Two-Champion Study";

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={session ? `${pairLabel} Study | Mogzy` : "Matchup Study | Mogzy"}
        description="A short contextual Leaguecraft study on two champions."
        path={MATCHUP_STUDY_ROUTE}
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          to="/quiz"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Leaguecraft
        </Link>

        <header className="mb-6" data-testid="matchup-study-header">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {session ? (
                <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                  <ChampionIcon path={session.champion_a_icon} />
                  <Swords className="h-3.5 w-3.5 text-muted-foreground" />
                  <ChampionIcon path={session.champion_b_icon} />
                </span>
              ) : null}
              <div className="min-w-0">
                <h1
                  className="truncate text-xl font-bold tracking-tight sm:text-2xl"
                  data-testid="matchup-study-pair"
                >
                  {pairLabel}
                </h1>
                {session ? (
                  <p
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                    data-testid="matchup-study-tier"
                  >
                    {tierLabel}
                  </p>
                ) : null}
              </div>
            </div>
            {question && !finished ? (
              <span data-testid="matchup-study-progress" className="text-sm text-muted-foreground">
                {question.number} / {question.total}
              </span>
            ) : null}
          </div>
        </header>

        {error ? (
          <div
            data-testid="matchup-study-error"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <p>{error}</p>
            <Button variant="outline" className="mt-3" asChild>
              <Link to="/quiz">Go to Leaguecraft</Link>
            </Button>
          </div>
        ) : finished ? (
          <div data-testid="matchup-study-summary" className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">Study complete</h2>
            <p className="mt-2 text-3xl font-bold">
              {session?.score} / {session?.total}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => void begin()} disabled={busy}>
                Study again
              </Button>
              <Button variant="outline" asChild>
                <Link to="/quiz">Back to Leaguecraft</Link>
              </Button>
            </div>
          </div>
        ) : question ? (
          <div className="rounded-lg border border-border bg-card p-5" data-testid="matchup-study-card">
            <h2 className="text-lg font-semibold leading-snug" data-testid="matchup-study-question">
              {question.question_text}
            </h2>

            <div className="mt-5">
              <QuizAnswerOptions
                choices={question.choices}
                selectedAnswer={selected}
                answerResult={result ? { correct_answer: result.correct_answer } : null}
                onSelect={(label) => void onSelect(label)}
              />
            </div>

            {result ? (
              <div className="mt-5">
                <QuizAnswerFeedback
                  result={{
                    is_correct: result.is_correct,
                    correct_answer: result.correct_answer,
                    explanation: result.explanation,
                  }}
                />
                <Button className="mt-4" onClick={onNext} disabled={busy}>
                  {session?.complete ? "See results" : "Next"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading matchup study…</p>
        )}
      </div>
    </div>
  );
}

/** A champion's icon, or nothing. The server resolves the path through the
 *  asset authority; a champion whose directory does not resolve arrives here
 *  as null and simply renders no icon. */
function ChampionIcon({ path }: { path: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = resolveQuizAssetUrl(path);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 rounded-md border border-border object-cover"
      onError={() => setFailed(true)}
    />
  );
}
