/** Owner-only filming of a canonical Daily run.
 * The route belongs beside /quiz/daily-challenge in Layout, never nested
 * under AdminShell. ArenaShell owns ALL viewport geometry and chrome.
 */
import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DailyRunPage } from "@/pages/quiz-daily-challenge/run/DailyRunPage";
import { httpDailyRunTransport, type DailyRunTransport } from "@/lib/daily-challenge/run/client";

const isRunId = (id: string | undefined): id is string =>
  !!id && /^dr_[a-f0-9]{24}$/.test(id);

export default function CreatorReplayRunPage({
  legacyRedirect = false,
}: {
  /** Preserve existing /admin/creator-replay/:runId links without admin shell geometry. */
  legacyRedirect?: boolean;
}) {
  const { runId } = useParams<{ runId: string }>();
  const transport = useMemo<DailyRunTransport>(() => ({
    ...httpDailyRunTransport,
    // Never request or start the owner's OFFICIAL /today run.
    readToday: () => httpDailyRunTransport.readRun(runId || ""),
    startToday: () => httpDailyRunTransport.readRun(runId || ""),
  }), [runId]);

  if (!isRunId(runId)) {
    return <main className="p-6" role="alert">
      Invalid filming run. <Link to="/admin/creator-replay">Back to Creator Replay</Link>
    </main>;
  }
  if (legacyRedirect) {
    return <Navigate to={`/quiz/daily-challenge/creator/${runId}`} replace />;
  }
  // No wrapper and no extra header. The shared Ranked ArenaShell sizes itself
  // against the exact same viewport, HUD and mobile breakpoints as official Daily.
  // The public More Challenges catalog plays the OFFICIAL run's bonus stages,
  // so a take continues into its OWN Survival / Time Trial / Review in place.
  return <DailyRunPage transport={transport} moreChallengesCatalog={false} />;
}
