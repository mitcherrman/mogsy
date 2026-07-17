import { motion } from "framer-motion";
import { History, ChevronRight, Swords } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuizHistoryResponse, QuizHistoryEntry } from "@/lib/quiz/api";

/**
 * Compact recent-results card beside the Daily Challenge, under the Ranked
 * hero.
 *
 * DATA HONESTY: the only history contract today is general quiz-session
 * history (/api/quiz/history — mode/score/accuracy per session). There is no
 * ranked-match record (no opponent, no W/L, no HP), so this card is labeled
 * "Recent Quiz Results" — never "Ranked matches" — and links to the real
 * history page at /lol/history ("View full history"). If a true ranked-match
 * contract lands later, this card is the slot for it.
 */
export default function QuizRecentResultsCard({
  history,
  loading,
  error,
  onPlayRanked,
}: {
  history: QuizHistoryResponse | null;
  loading?: boolean;
  /** Auth-shaped errors (401/guest) render the sign-in state. */
  error?: string | null;
  onPlayRanked?: () => void;
}) {
  if (loading) {
    return <Skeleton className="h-full min-h-40 w-full rounded-xl" data-testid="history-skeleton" />;
  }

  const results = history?.results ?? [];
  const recent = results.slice(0, 3);
  const needsAuth = !!error && /401|sign.?in|session/i.test(error);
  const avgAccuracy = recent.length
    ? Math.round(recent.reduce((s, r) => s + Number(r.accuracy || 0), 0) / recent.length)
    : null;
  const bestAccuracy = recent.length
    ? Math.round(Math.max(...recent.map((r) => Number(r.accuracy || 0))))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className="h-full"
    >
      <Card
        data-testid="recent-results-card"
        className="h-full border-cyan-400/25 bg-gradient-to-br from-[#04101c]/90 to-card/60 backdrop-blur-sm"
      >
        <CardContent className="flex h-full flex-col p-4">
          <div className="flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-cyan-300/80" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
              Recent Quiz Results
            </span>
          </div>

          {needsAuth ? (
            <div className="flex flex-1 flex-col items-start justify-center gap-2 py-4">
              <p className="text-sm text-muted-foreground">
                Sign in to save and review your quiz history.
              </p>
              <Button asChild size="sm" variant="outline" className="border-cyan-400/30 text-cyan-200">
                <Link to="/auth">Sign in</Link>
              </Button>
            </div>
          ) : recent.length === 0 ? (
            <div
              className="flex flex-1 flex-col items-start justify-center gap-2 py-4"
              data-testid="history-empty"
            >
              <p className="text-sm font-semibold text-foreground">No quiz results yet</p>
              <p className="text-xs text-muted-foreground">
                Play your first quiz to begin your history.
              </p>
              {onPlayRanked && (
                <Button
                  size="sm"
                  onClick={onPlayRanked}
                  className="mt-1 bg-gradient-to-r from-cyan-500 to-sky-700 text-xs font-semibold"
                >
                  <Swords className="mr-1 h-3.5 w-3.5" />
                  Play Ranked
                </Button>
              )}
              {error && !needsAuth && (
                <p className="text-[10px] italic text-muted-foreground/70">{error}</p>
              )}
            </div>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                <SummaryCell label="Sessions" value={history?.total_count ?? results.length} />
                <SummaryCell label="Avg acc" value={avgAccuracy !== null ? `${avgAccuracy}%` : "—"} />
                <SummaryCell label="Best" value={bestAccuracy !== null ? `${bestAccuracy}%` : "—"} />
              </div>
              <div className="mt-2 flex flex-col gap-1.5" data-testid="history-rows">
                {recent.map((entry) => (
                  <HistoryRow key={entry.session_id} entry={entry} />
                ))}
              </div>
            </>
          )}

          <div className="mt-auto pt-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full border-cyan-400/30 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/10"
            >
              <Link to="/lol/history">
                View full history
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SummaryCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function modeLabel(entry: QuizHistoryEntry): string {
  if (entry.mode === "daily") return "Daily";
  return entry.category || "Quiz";
}

function HistoryRow({ entry }: { entry: QuizHistoryEntry }) {
  const acc = Math.round(Number(entry.accuracy || 0));
  // Analytics tinting only — good/mid/rough accuracy. Not W/L: these are
  // quiz sessions, not head-to-head matches.
  const tone =
    acc >= 70
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : acc >= 40
        ? "border-cyan-400/30 bg-cyan-400/5 text-cyan-200"
        : "border-rose-400/30 bg-rose-400/5 text-rose-300";
  return (
    <div
      data-testid="history-row"
      className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-xs"
    >
      <Badge variant="outline" className={`shrink-0 px-1.5 text-[10px] font-bold tabular-nums ${tone}`}>
        {acc}%
      </Badge>
      <span className="min-w-0 flex-1 truncate text-foreground/85">{modeLabel(entry)}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {entry.score}/{entry.total_questions}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground/70">
        {relativeTime(entry.completed_at || entry.started_at || entry.date)}
      </span>
    </div>
  );
}
