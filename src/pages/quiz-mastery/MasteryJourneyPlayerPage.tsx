/**
 * Public parameterized Mastery player — plays any set the backend resolves.
 *
 * The set id comes from the URL; there is exactly one player implementation
 * (MasteryPlayerLive) and no per-set wrapper here. The backend registry is the
 * only authority on which ids resolve: an unknown or unpublished id fails
 * closed server-side (404), which MasteryPlayerLive surfaces as its error
 * state. A malformed id (not `mset_…`) short-circuits to the same message
 * without issuing a request.
 *
 * The existing per-set /dev/mastery/* wrapper routes remain untouched.
 */
import { Link, useParams } from "react-router-dom";
import { MasteryPlayerLive } from "@/features/mastery/live";

const SET_ID_SHAPE = /^mset_[0-9a-f]{64}$/;

export default function MasteryJourneyPlayerPage() {
  const { masterySetId } = useParams<{ masterySetId: string }>();

  if (!masterySetId || !SET_ID_SHAPE.test(masterySetId)) {
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
