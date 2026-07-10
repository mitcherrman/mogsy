import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, ArrowLeft, Lock, Clock, Target } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { quizApi, type QuizHistoryResponse } from "@/lib/quiz/api";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

function formatDate(iso?: string): string {
  if (!iso) return "";
  // Backend timestamps are UTC without a zone suffix.
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDuration(seconds?: number | null): string | null {
  if (seconds == null || seconds < 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function modeLabel(mode?: string): string {
  if (mode === "daily") return "Daily Challenge";
  return "Quiz";
}

export default function LolHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<QuizHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Guest-first: make sure an anonymous session exists so the JWT-only
        // history endpoint can identify the guest.
        if (!user) {
          await supabase.auth.signInAnonymously();
        }
        const data = await quizApi.getHistory();
        if (!cancelled) setHistory(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load quiz history.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  const results = history?.results ?? [];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <SEOHead
        title="Quiz History — Mogsy LoL"
        description="Your recent League of Legends quiz results: scores, accuracy, and streak-building history."
      />

      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to LoL hub">
          <Link to="/lol"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <History className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Quiz History</h1>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && results.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No completed quizzes yet.</p>
            <Button asChild className="mt-4">
              <Link to="/quiz">Play a quiz</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r) => {
            const duration = formatDuration(r.duration_seconds);
            return (
              <Card key={r.session_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{modeLabel(r.mode)}</span>
                      {r.category && <Badge variant="secondary">{r.category}</Badge>}
                      {r.difficulty && <Badge variant="outline">{r.difficulty}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDate(r.date)}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Target className="h-4 w-4 text-primary" />
                      {r.score}/{r.total_questions}
                    </span>
                    <span className="text-muted-foreground">{r.accuracy}%</span>
                    {duration && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {duration}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {history?.limited && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm">
                    {history.upsell_message ||
                      "Free accounts save your last 10 results. Upgrade to Mogsy Pro to unlock your full quiz history."}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link to="/lol/pro">Unlock Full History</Link>
                </Button>
              </CardContent>
            </Card>
          )}

        </div>
      )}
    </div>
  );
}
