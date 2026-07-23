/**
 * Public parameterized Mastery player — plays only PUBLIC-CATALOG sets.
 *
 * The set id comes from the URL. Before the shared player (MasteryPlayerLive)
 * is mounted — and therefore before any session request can be issued — the
 * page confirms the id is a member of the backend's public catalog via the
 * same `listSets()` client the catalog page uses. The backend catalog is the
 * only membership authority: no set ids or publication metadata live here.
 *
 * Fail-closed by construction:
 *  - malformed id  -> rejected locally, no catalog or session request;
 *  - loading       -> player not mounted;
 *  - catalog error -> player not mounted (retry offered);
 *  - id not in the catalog (unpublished prototype or unknown) -> blocked
 *    with a route back to /quiz/mastery.
 *
 * Explicit prototypes remain playable ONLY through their retained
 * /dev/mastery/* wrapper routes, which are intentionally unchanged.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listSets, MasteryPlayerLive } from "@/features/mastery/live";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const SET_ID_SHAPE = /^mset_[0-9a-f]{64}$/;

type Membership = "loading" | "member" | "not_public" | "error";

export default function MasteryJourneyPlayerPage() {
  const { masterySetId } = useParams<{ masterySetId: string }>();
  const wellFormed = !!masterySetId && SET_ID_SHAPE.test(masterySetId);

  const [membership, setMembership] = useState<Membership>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!wellFormed) return;
    const ctrl = new AbortController();
    setMembership("loading");
    (async () => {
      try {
        const catalog = await listSets(ctrl.signal);
        if (ctrl.signal.aborted) return;
        setMembership(catalog.some((s) => s.masterySetId === masterySetId)
          ? "member" : "not_public");
      } catch {
        if (!ctrl.signal.aborted) setMembership("error");
      }
    })();
    return () => ctrl.abort();
  }, [wellFormed, masterySetId, reloadKey]);

  if (!wellFormed) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm"
           data-testid="mastery-player-bad-id">
        <p className="mb-3">That mastery journey link is not valid.</p>
        <Link to="/quiz/mastery" className="text-primary underline-offset-4 hover:underline">
          Browse mastery journeys
        </Link>
      </div>
    );
  }

  if (membership === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10"
           data-testid="mastery-player-membership-loading">
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (membership === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm"
           data-testid="mastery-player-membership-error">
        <p className="mb-3">Could not confirm this mastery journey is available.</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
          <Link to="/quiz/mastery" className="text-primary underline-offset-4 hover:underline">
            Browse mastery journeys
          </Link>
        </div>
      </div>
    );
  }

  if (membership === "not_public") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm"
           data-testid="mastery-player-not-public">
        <p className="mb-3">This mastery journey is not publicly available.</p>
        <Link to="/quiz/mastery" className="text-primary underline-offset-4 hover:underline">
          Browse mastery journeys
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh]">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        <Link
          to="/quiz/mastery"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          data-testid="mastery-player-back-link"
        >
          ← All mastery journeys
        </Link>
      </div>
      <MasteryPlayerLive masterySetId={masterySetId} />
    </div>
  );
}
