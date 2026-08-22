/**
 * `/lol/history` — the standalone Quiz History page.
 *
 * MALT Phase A: the record itself now lives in `StudyHistoryLedger`, which
 * the Leaguecraft workspace on `/quiz` mounts too, so the two surfaces render
 * the same rows, the same scope line and the same Free-cap notice. This file
 * is the page SHELL — title, back control, the bank link, and the loader —
 * and nothing more.
 *
 * The route stays live and is NOT redirected. It is a direct-entry
 * destination (a bookmark, the profile stats block, a house ad), and its
 * retirement, if it happens at all, is a later phase.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, ArrowLeft, BookX, ChevronRight } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import StudyHistoryLedger from "@/components/quiz/workspace/StudyHistoryLedger";
import { quizApi, type QuizHistoryResponse } from "@/lib/quiz/api";
import { useAuth } from "@/hooks/useAuth";
import { ensureBackendAuthToken } from "@/lib/backend-auth";

const GUEST_SESSION_ERROR = "We couldn’t start a guest session. Please try again.";

export default function LolHistory() {
  const { loading: authLoading } = useAuth();
  const [history, setHistory] = useState<QuizHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Let AuthProvider finish restoring/creating the session first.
    if (authLoading) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Guest-first: the history endpoint is JWT-only, so guarantee a
        // Supabase session (anonymous if need be) has a token before calling.
        const token = await ensureBackendAuthToken();
        if (!token) {
          if (!cancelled) setError(GUEST_SESSION_ERROR);
          return;
        }
        const data = await quizApi.getHistory();
        if (!cancelled) {
          // A non-ok payload is a backend failure, never "no history yet".
          if (data.ok === false) {
            setError("Could not load quiz history.");
          } else {
            setHistory(data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "";
          // A 401 here means the guest token didn't take — not the user's fault.
          setError(/\b401\b/.test(message) ? GUEST_SESSION_ERROR : message || "Could not load quiz history.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authLoading, reloadKey]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {/* Per-user page: empty for crawlers/guests, so keep it out of the index. */}
      <SEOHead
        title="Quiz History — Mogzy LoL"
        description="Your recent League of Legends quiz results: scores, accuracy, and streak-building history."
        noindex
      />

      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to LoL hub">
          <Link to="/lol"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <History className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Quiz History</h1>
      </div>

      <Link
        to="/lol/missed-questions"
        className="mb-6 flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent/50"
      >
        <span className="flex items-center gap-3">
          <BookX className="h-5 w-5 text-primary" />
          <span>
            <span className="block font-medium">Missed Question Bank</span>
            <span className="block text-sm text-muted-foreground">
              Review every question you missed and practice your weak spots.
            </span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </Link>

      {/* The record. Same component, same states, same figures as the History
          pane of the Leaguecraft workspace at /quiz#history. */}
      <StudyHistoryLedger
        history={history}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
