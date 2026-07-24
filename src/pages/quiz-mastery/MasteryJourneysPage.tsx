/**
 * Public Mastery catalog — learner dashboard for published journeys (J4).
 *
 * Lists exactly what the backend catalog returns (GET /api/mastery/sets), and
 * enriches each card with the caller's own backend-aggregated progress
 * (GET /api/mastery/progress): Start / Resume / Replay state, current step,
 * latest/best score, attempts, and last-played time. No progress, score, or
 * recommendation is computed from answers client-side — everything shown is
 * backend-recorded state; the recommendation is pure catalog-order logic over
 * backend-returned completion states.
 *
 * Fail-closed by construction: if the catalog request fails nothing renders
 * but the error state; if only the progress request fails, journeys stay
 * playable with a neutral "Open journey" action and a visible notice — no
 * fabricated progress.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getProgress,
  listSets,
  type MasterySetProgress,
  type MasterySetSummary,
} from "@/features/mastery/live";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

type CardState = {
  label: string;
  badge: string | null;
  detail: string | null;
  stepDone: number | null;
};

function cardState(p: MasterySetProgress | undefined): CardState {
  if (!p) return { label: "Open journey", badge: null, detail: null, stepDone: null };
  if (p.state === "in_progress" && p.activeSession) {
    return {
      label: "Resume journey",
      badge: "In progress",
      detail: [`Step ${p.activeSession.currentSequenceIndex + 1} of ${p.activeSession.totalSteps}`,
               formatWhen(p.activeSession.lastPlayedAt)].filter(Boolean).join(" · "),
      stepDone: p.activeSession.currentSequenceIndex,
    };
  }
  if (p.state === "completed") {
    const bits = [];
    if (p.latestScore) bits.push(`Latest ${p.latestScore.correct}/${p.latestScore.total}`);
    if (p.bestScore && p.completedCount > 1) bits.push(`Best ${p.bestScore.correct}/${p.bestScore.total}`);
    if (p.attempts > 1) bits.push(`${p.attempts} attempts`);
    const when = formatWhen(p.latestCompletedAt);
    if (when) bits.push(when);
    return { label: "Replay journey", badge: "Completed", detail: bits.join(" · ") || null, stepDone: null };
  }
  return { label: "Start journey", badge: null, detail: null, stepDone: null };
}

/** First catalog-ordered journey that is not completed; if all are completed,
 * the lowest best-score journey (only when every set has a real score). */
function recommend(sets: MasterySetSummary[], progress: Map<string, MasterySetProgress>):
    { set: MasterySetSummary; reason: string } | "all_complete" | null {
  for (const s of sets) {
    const p = progress.get(s.masterySetId);
    if (!p || p.state !== "completed") {
      return { set: s, reason: p?.state === "in_progress" ? "Pick up where you left off" : "Up next" };
    }
  }
  if (sets.length === 0) return null;
  const scored = sets.map((s) => ({ s, best: progress.get(s.masterySetId)?.bestScore ?? null }));
  if (scored.every((x) => x.best !== null)) {
    const weakest = scored.reduce((a, b) => (b.best!.percent < a.best!.percent ? b : a));
    if (weakest.best!.percent < 100) {
      return { set: weakest.s, reason: "Sharpen your weakest journey" };
    }
  }
  return "all_complete";
}

export default function MasteryJourneysPage() {
  const [sets, setSets] = useState<MasterySetSummary[] | null>(null);
  const [progress, setProgress] = useState<Map<string, MasterySetProgress> | null>(null);
  const [progressFailed, setProgressFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setSets(null);
    setProgress(null);
    setProgressFailed(false);
    setError(null);
    (async () => {
      try {
        const loaded = await listSets(ctrl.signal);
        if (ctrl.signal.aborted) return;
        setSets(loaded);
      } catch (e: unknown) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : "Could not load the mastery catalog");
        }
        return;
      }
      try {
        const prog = await getProgress(ctrl.signal);
        if (ctrl.signal.aborted) return;
        setProgress(new Map(prog.map((p) => [p.masterySetId, p])));
      } catch {
        // Progress is an enrichment: journeys stay playable without it, but
        // we say so instead of showing invented "not started" states.
        if (!ctrl.signal.aborted) setProgressFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, [reloadKey]);

  const rec = sets && progress ? recommend(sets, progress) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-lg font-semibold uppercase tracking-[0.18em] text-primary/80">
          Mastery Journeys
        </h1>
        <p className="text-sm text-muted-foreground">
          Step-by-step champion progressions with fully visible state — every
          answer is derivable from what you see on screen.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 p-4 text-sm"
             data-testid="mastery-catalog-error">
          <p className="mb-2">Could not load the mastery catalog: {error}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
        </div>
      ) : sets === null ? (
        <div className="grid gap-3" data-testid="mastery-catalog-loading">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : sets.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="mastery-catalog-empty">
          No mastery journeys are published yet. Check back soon.
        </p>
      ) : (
        <>
          {progressFailed && (
            <p className="mb-3 text-xs text-muted-foreground"
               data-testid="mastery-progress-unavailable">
              Your progress could not be loaded right now — journeys are still playable.
            </p>
          )}
          {rec && rec !== "all_complete" && (
            <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
                 data-testid="mastery-recommended">
              <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-primary/80">
                {rec.reason}
              </span>
              <Link to={`/quiz/mastery/${rec.set.masterySetId}`}
                    className="font-medium text-primary underline-offset-4 hover:underline">
                {rec.set.title}
              </Link>
            </div>
          )}
          {rec === "all_complete" && (
            <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
                 data-testid="mastery-all-complete">
              All journeys completed — well played. New journeys will appear here.
            </div>
          )}
          <div className="grid gap-3" data-testid="mastery-catalog-list">
            {sets.map((s) => {
              const p = progress?.get(s.masterySetId);
              const st = cardState(progressFailed ? undefined : p);
              return (
                <Link
                  key={s.masterySetId}
                  to={`/quiz/mastery/${s.masterySetId}`}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                  data-testid={`mastery-catalog-card-${s.masterySetId}`}
                >
                  <Card className="transition-colors hover:border-primary/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        {st.badge && (
                          <Badge variant={st.badge === "Completed" ? "secondary" : "default"}
                                 data-testid="mastery-card-badge">
                            {st.badge}
                          </Badge>
                        )}
                      </div>
                      <CardDescription>{s.displaySummary}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">
                      {st.stepDone !== null && (
                        <Progress
                          value={(100 * st.stepDone) / s.totalSteps}
                          className="mb-2 h-1.5"
                          data-testid="mastery-card-progress"
                        />
                      )}
                      {st.detail && (
                        <p className="mb-1" data-testid="mastery-card-detail">{st.detail}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span>{s.totalSteps} questions · replayable · state shown every step</span>
                        <span className="font-medium text-primary" data-testid="mastery-card-action">
                          {st.label} →
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
