import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookX, Lock, Check, X as XIcon, Dumbbell } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { quizApi, type MissedQuestionsResponse, type MissedQuestion } from "@/lib/quiz/api";
import { useAuth } from "@/hooks/useAuth";
import { ensureBackendAuthToken } from "@/lib/backend-auth";

const GUEST_SESSION_ERROR = "We couldn’t start a guest session. Please try again.";
const PAGE_SIZE = 25;

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MissedQuestionCard({ q }: { q: MissedQuestion }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {q.category && <Badge variant="secondary">{q.category}</Badge>}
          {q.difficulty != null && <Badge variant="outline">Difficulty {q.difficulty}</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">Missed {formatDate(q.missed_at)}</span>
        </div>
        <p className="font-medium">{q.question_text || "Question no longer available."}</p>
        <div className="space-y-1.5 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <XIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Your answer: {q.selected_answer || "—"}</span>
          </p>
          {q.correct_answer && (
            <p className="flex items-start gap-2 text-emerald-500">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Correct answer: {q.correct_answer}</span>
            </p>
          )}
        </div>
        {q.explanation && (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{q.explanation}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function LolMissedQuestions() {
  const { loading: authLoading } = useAuth();
  const [data, setData] = useState<MissedQuestionsResponse | null>(null);
  const [items, setItems] = useState<MissedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await ensureBackendAuthToken();
        if (!token) {
          if (!cancelled) setError(GUEST_SESSION_ERROR);
          return;
        }
        const res = await quizApi.getMissedQuestions({ limit: PAGE_SIZE, offset: 0 });
        if (!cancelled) {
          setData(res);
          setItems(res.results);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "";
          setError(/\b401\b/.test(message) ? GUEST_SESSION_ERROR : message || "Could not load missed questions.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authLoading, reloadKey]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await quizApi.getMissedQuestions({ limit: PAGE_SIZE, offset: items.length });
      setData(res);
      setItems((prev) => [...prev, ...res.results]);
    } catch {
      toast.error("Could not load more questions.");
    } finally {
      setLoadingMore(false);
    }
  };

  const totalCount = data?.total_count ?? 0;
  const hasMore = !data?.locked && items.length < totalCount;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <SEOHead
        title="Missed Question Bank — Mogsy LoL"
        description="Review every League of Legends quiz question you missed and practice your weak spots."
      />

      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to quiz history">
          <Link to="/lol/history"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <BookX className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Missed Question Bank</h1>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data?.locked && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <Lock className="h-8 w-8 text-primary" />
            <p className="max-w-md text-sm">
              {data.upsell_message ||
                "Upgrade to Mogsy Pro to review every question you missed and practice your weak spots."}
            </p>
            <Button asChild>
              <Link to="/lol/pro">Upgrade to Mogsy Pro</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Free players can review missed questions on each quiz’s results screen.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && !data.locked && (
        <>
          {items.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">No missed questions — flawless so far!</p>
                <Button asChild className="mt-4">
                  <Link to="/quiz">Play a quiz</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {totalCount} missed question{totalCount === 1 ? "" : "s"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info("Practice mode is coming soon.")}
                >
                  <Dumbbell className="mr-1.5 h-4 w-4" />
                  Practice missed questions
                </Button>
              </div>
              {items.map((q) => (
                <MissedQuestionCard key={q.attempt_id} q={q} />
              ))}
              {hasMore && (
                <div className="pt-2 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
