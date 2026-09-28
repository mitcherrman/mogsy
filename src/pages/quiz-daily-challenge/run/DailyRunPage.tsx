/**
 * DCMOD-E — THE DAILY CHALLENGE, as one parent run of sequential stages.
 *
 * A CONTROLLER and a router of states, exactly as the DC2 page was — it draws
 * no arena, no question, no timer and no answer grid. Gameplay is the
 * canonical match (`QuizRankedMatch` → `CanonicalArena`), mounted as a HOSTED
 * match (`MatchHost`) so the Daily owns what surrounds each stage:
 *
 *   Hub Play ─► Daily intro ─► stage tag ─► [canonical match] ─► stage result
 *         ─(Continue)─► next stage tag ─► … ─► Review ─► Review's result
 *         ─(Continue)─► the one final completion
 *
 * The child match is keyed on its id, so each stage is a clean mount of the
 * same arena; between stages the Daily's own beats hold the same shell, so
 * the page never drops to a blank frame.
 */
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArenaShell, arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { useAuth } from "@/hooks/useAuth";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import { httpDailyRunTransport, type DailyRunTransport } from "@/lib/daily-challenge/run/client";
import { DailyStageChrome } from "./DailyStageChrome";
import { DailyIntroBeat, StageIntroBeat } from "./DailyRunBeats";
import { DailyStageResult, type StageResultPlacement } from "./DailyStageResult";
import { DailyCompletion } from "./DailyCompletion";
import { useDailyRun } from "./useDailyRun";
import { hasDailyStartIntent } from "@/lib/daily-challenge/run/entry";

export const DAILY_EYEBROW = "Daily Challenge";


/** What the page needs from a stage's match. `QuizRankedMatch` in production. */
export interface StageMatchProps {
  matchId: string;
  viewerUserId: string;
  entry: "fresh" | "recovered";
  chrome: ReactNode;
  host: MatchHost;
}

function CanonicalStageMatch(props: StageMatchProps) {
  return <QuizRankedMatch {...props} />;
}

export function DailyRunPage({
  transport = httpDailyRunTransport,
  StageMatch = CanonicalStageMatch,
  viewerUserId: viewerOverride,
  stageResultPlacement,
}: {
  transport?: DailyRunTransport;
  StageMatch?: ComponentType<StageMatchProps>;
  /** Test seam; production reads the signed-in (or anonymous) session. */
  viewerUserId?: string;
  /**
   * DC-LANE-C — an optional unit between a stage's result and its Continue
   * (a future monetization placement). Unset in production today.
   */
  stageResultPlacement?: StageResultPlacement;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  // Read the Play intent ONCE, then drop it from history so Back/Reload never
  // re-sends a start the player did not press again.
  const [autoStart] = useState(() => hasDailyStartIntent(location.state));
  useEffect(() => {
    if (autoStart) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dc = useDailyRun(transport, autoStart);
  const { user } = useAuth();
  const viewerUserId = viewerOverride ?? user?.id ?? null;
  const { onChildSettled, onChildPhase, onChildPlayerFinished, onChildSurvivalStatus } = dc;

  const host = useMemo<MatchHost>(() => ({
    eyebrow: DAILY_EYEBROW,
    settlingMessage: "Stage complete…",
    onMatchSettled: (s) => onChildSettled(s.matchId),
    onPresentationPhase: onChildPhase,
    onPlayerFinished: onChildPlayerFinished,
    onSurvivalStatus: onChildSurvivalStatus,
  }), [onChildSettled, onChildPhase, onChildPlayerFinished, onChildSurvivalStatus]);

  const run = dc.run;
  const flow = dc.flow;
  // B7 — the stage's last server-reported strike count (see `strikesSeen`).
  const strikesFloor = flow?.stage ? dc.strikesSeen[flow.stage.id] ?? null : null;

  const shell = (children: ReactNode, header: ReactNode = null) => (
    <ArenaShell size="wide" header={header ?? (run
      ? <DailyStageChrome run={run} stage={null} /> : <DailyStageChromeless />)}>
      <div data-testid="daily-run" data-flow-phase={flow?.phase ?? dc.load}
        className="flex flex-1 flex-col justify-center">
        {children}
      </div>
    </ArenaShell>
  );

  if (dc.load === "loading") {
    return shell(
      <div data-testid="daily-run-loading" className="ranked-panel mx-auto flex items-center gap-2 p-6">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Opening today's challenge…</p>
      </div>);
  }

  if (dc.load === "unavailable") {
    return shell(
      <div data-testid="daily-run-unavailable" className="ranked-panel mx-auto max-w-lg space-y-3 p-6">
        <h2 className="text-lg font-semibold">Today's challenge isn't ready</h2>
        <p className="text-sm text-muted-foreground">{dc.error}</p>
        <Button asChild variant="outline"><Link to="/quiz">Back to Leaguecraft</Link></Button>
      </div>);
  }

  if (dc.load === "ready" || !run || !flow) {
    // No run today and no Play press behind this load (a bare URL): send the
    // player to the hub, where Play starts it. Nothing is created here.
    if (!dc.error && !dc.busy && !autoStart) return <Navigate to="/quiz" replace />;
    // A start in flight (the arrival's, or Try again's) is still loading.
    if (!dc.error) {
      return shell(
        <div data-testid="daily-run-loading" className="ranked-panel mx-auto flex items-center gap-2 p-6">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Opening today's challenge…</p>
        </div>);
    }
    // The start (or the read) failed: say so, and let the player try again.
    return shell(
      <div data-testid="daily-run-start-error" className="ranked-panel mx-auto max-w-lg space-y-3 p-6">
        <p role="alert" data-testid="daily-run-error" className="text-sm text-destructive">{dc.error}</p>
        <div className="flex gap-2">
          <Button type="button" data-testid="daily-run-start" onClick={dc.start}
            disabled={dc.busy} className="gap-1.5">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {dc.busy ? "Starting…" : "Try again"}
          </Button>
          <Button asChild variant="outline"><Link to="/quiz">Back to Leaguecraft</Link></Button>
        </div>
      </div>);
  }

  switch (flow.phase) {
    case "daily-intro":
      return shell(<DailyIntroBeat run={run} />);
    case "stage-intro":
      return shell(
        <StageIntroBeat run={run} stage={flow.stage!} error={dc.error} onRetry={dc.retry} busy={dc.busy} />,
        <DailyStageChrome run={run} stage={flow.stage} />);
    case "stage-settling":
    case "stage-result": {
      const beat = shell(
        <DailyStageResult run={run} stage={flow.stage!} error={dc.error} onRetry={dc.retry} busy={dc.busy}
          onProceed={flow.phase === "stage-result" ? dc.continueFromResult : undefined}
          placement={stageResultPlacement} />,
        <DailyStageChrome run={run} stage={flow.stage} survival={dc.survival} strikesFloor={strikesFloor} />);
      // DC-SURV-UX — the player is out but the child is still settling: keep
      // it connected (its reads let the server finish the match) and hidden.
      // It presents nothing — the arena itself shows only its placeholder —
      // and its ordinary handback is what the parent syncs on.
      if (!flow.settlingChildMatchId || !viewerUserId) return beat;
      return (
        <>
          {beat}
          <div hidden aria-hidden data-testid="daily-settling-child">
            <StageMatch
              key={flow.settlingChildMatchId}
              matchId={flow.settlingChildMatchId}
              viewerUserId={viewerUserId}
              entry={dc.childEntry}
              host={host}
              chrome={null} />
          </div>
        </>
      );
    }
    case "complete":
      return shell(<DailyCompletion run={run}
        saveRequired={(user as { is_anonymous?: boolean } | null)?.is_anonymous === true} />);
    case "stage-play": {
      if (!viewerUserId) {
        return shell(
          <div className="ranked-panel mx-auto flex items-center gap-2 p-6">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Entering the arena…</p>
          </div>);
      }
      return (
        <div data-testid="daily-run" data-flow-phase="stage-play" className="contents">
          <StageMatch
            key={flow.childMatchId!}
            matchId={flow.childMatchId!}
            viewerUserId={viewerUserId}
            entry={dc.childEntry}
            host={host}
            chrome={<DailyStageChrome run={run} stage={flow.stage}
              skewMs={dc.skewMs} childPhase={dc.childPhase} survival={dc.survival}
              strikesFloor={strikesFloor} />} />
        </div>
      );
    }
  }
}

function DailyStageChromeless() {
  return (
    <header className={arenaHeaderRowClass("wide")}>
      <h1 className="ranked-title text-lg font-bold leading-tight">Daily Challenge</h1>
      <Link to="/quiz" className="text-sm text-muted-foreground underline">Back to Quiz</Link>
    </header>
  );
}

export default DailyRunPage;
