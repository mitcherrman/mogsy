/**
 * RB3 — `/quiz/playtest`, the guided playtest's entry.
 *
 * A SEPARATE ROUTE on purpose, and it is the answer to "do not permanently
 * hijack every Ranked click":
 *
 *   /quiz            unchanged. Match with Bot starts an ORDINARY bot match.
 *   /quiz/ranked     unchanged. The canonical live-match host.
 *   /quiz/playtest   this. The only door to the guided sequence.
 *
 * Nothing in canonical Ranked knows this exists, so the playtest is removed
 * after the playtest by deleting this route and its host — no unpicking, and
 * no risk to the Ranked entry that every other player uses.
 *
 * The gate here is VISIBILITY. The server re-decides authorization on the join
 * (`_authorize_preset`), so a non-playtester who types the URL is refused by
 * the backend even if this page had let them press Begin.
 */
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRankedPlaytestAccess } from "@/hooks/useRankedPlaytestAccess";
import { PlaytestMatchHost } from "@/components/playtest/PlaytestMatchHost";
import { RankedRouteHeader } from "./RankedRouteHeader";

export default function QuizPlaytestPage() {
  const { user } = useAuth();
  const { loading, canPlayGuidedPlaytest } = useRankedPlaytestAccess();

  if (!user?.id) return <Navigate to="/quiz" replace />;
  if (loading) {
    return (
      <p data-testid="playtest-loading" className="p-6 text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  // Not a playtester: back to the ordinary lobby with no explanation, because
  // there is nothing here for them and a refusal notice would advertise a
  // session they cannot join.
  if (!canPlayGuidedPlaytest) return <Navigate to="/quiz" replace />;

  return (
    <PlaytestMatchHost
      viewerUserId={user.id}
      chrome={<RankedRouteHeader size="wide" />}
    />
  );
}
