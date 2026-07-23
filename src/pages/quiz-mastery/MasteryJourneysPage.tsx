/**
 * Public Mastery catalog — the discovery surface for published Mastery
 * journeys (J4 launch).
 *
 * Lists exactly what the backend's fail-closed catalog returns
 * (GET /api/mastery/sets: the default set first, then explicitly promoted
 * sets in fixed order). No set metadata, ordering, answers, or formulas are
 * decided client-side. Each card links to the shared parameterized player
 * route, which delegates to MasteryPlayerLive.
 *
 * Authenticated (ProtectedRoute): Mastery sessions require a verified
 * identity, so discovery sits behind the same gate the player uses.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSets, type MasterySetSummary } from "@/features/mastery/live";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function MasteryJourneysPage() {
  const [sets, setSets] = useState<MasterySetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setSets(null);
    setError(null);
    (async () => {
      try {
        const loaded = await listSets(ctrl.signal);
        if (!ctrl.signal.aborted) setSets(loaded);
      } catch (e: unknown) {
        if (!ctrl.signal.aborted) {
          setError(e instanceof Error ? e.message : "Could not load the mastery catalog");
        }
      }
    })();
    return () => ctrl.abort();
  }, [reloadKey]);

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
        <div className="grid gap-3" data-testid="mastery-catalog-list">
          {sets.map((s) => (
            <Link
              key={s.masterySetId}
              to={`/quiz/mastery/${s.masterySetId}`}
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              data-testid={`mastery-catalog-card-${s.masterySetId}`}
            >
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <CardDescription>{s.displaySummary}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {s.totalSteps} questions · replayable · state shown every step
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
