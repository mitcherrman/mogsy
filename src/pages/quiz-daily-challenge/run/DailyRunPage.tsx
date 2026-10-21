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
 *
 * DV2-P2A — a plan v5+ day (`hasMainDaily`) is the same linear run, drawn as
 * its hierarchy:
 *
 *   Daily intro (Today's Challenge) ─► Standard ─► MAIN RESULT
 *         ─(Play More Challenges)─► Time Trial / Survival ─► Review stages
 *         ─► "All Done for Today"          or ─(Done for now)─► hub
 *
 * "Done for now" is a plain navigation (no server call); the run stays open.
 * Once the main Daily is complete, leaving is guarded only while an optional
 * child is live (`shouldGuardDailyLeave`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TransactionalLeaveDialog } from "@/components/navigation/TransactionalLeaveDialog";
import { ArenaShell, arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { useAuth } from "@/hooks/useAuth";
import { authHref } from "@/lib/auth/auth-destination";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import { httpDailyRunTransport, type DailyRunTransport } from "@/lib/daily-challenge/run/client";
import { DailyStageChrome } from "./DailyStageChrome";
import { DailyIntroBeat, OptionalEntryBeat, StageIntroBeat } from "./DailyRunBeats";
import { DailyStageResult, type StageResultPlacement } from "./DailyStageResult";
import { DailyMainResult } from "./DailyMainResult";
import { DailyCompletion } from "./DailyCompletion";
import { useDailyRun } from "./useDailyRun";
import { hasDailyContinueIntent, hasDailyStartIntent } from "@/lib/daily-challenge/run/entry";
import { MORE_CHALLENGES_ROUTE, moreChallengesState } from "@/lib/public-modes/launch";
import { dailyLeaveCopy, shouldBlockDailyNavigation, shouldGuardDailyLeave } from "./dailyLeaveContract";
import { hasMainDaily } from "@/lib/daily-challenge/run/contracts";
import { isDailyOpeningStage } from "@/lib/daily-challenge/run/flow";
import { useTransactionalLeaveGuard } from "@/lib/navigation/useTransactionalLeaveGuard";

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
  startOnMount = false,
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
  /** Parent-host entry seam; PLAY1 starts the canonical Daily without the Hub route state. */
  startOnMount?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  // Read the Play intent ONCE, then drop it from history so Back/Reload never
  // re-sends a start the player did not press again.
  const [routeStartIntent] = useState(() => hasDailyStartIntent(location.state));
  // PGM1 — a More Challenges card's Play for a bonus stage: go on into it.
  const [routeContinueIntent] = useState(() => hasDailyContinueIntent(location.state));
  const [autoStart] = useState(() => startOnMount || routeStartIntent);
  useEffect(() => {
    if (routeStartIntent || routeContinueIntent) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dc = useDailyRun(transport, autoStart);
  const { user } = useAuth();
  const viewerUserId = viewerOverride ?? user?.id ?? null;
  const { onChildSettled, onChildPhase, onChildPlayerFinished, onChildSurvivalStatus } = dc;
  // Daily three acts (V2): the hosted stage's server-published set plan.
  const threeActsPlan = dc.flow?.stage?.content?.plan ?? null;

  const host = useMemo<MatchHost>(() => ({
    eyebrow: DAILY_EYEBROW,
    settlingMessage: "Stage complete…",
    onMatchSettled: (s) => onChildSettled(s.matchId),
    onPresentationPhase: onChildPhase,
    onPlayerFinished: onChildPlayerFinished,
    onSurvivalStatus: onChildSurvivalStatus,
    threeActsPlan,
  }), [onChildSettled, onChildPhase, onChildPlayerFinished, onChildSurvivalStatus, threeActsPlan]);

  const run = dc.run;
  const flow = dc.flow;
  // PGM1 — the continue intent is spent on the FIRST optional-entry this mount
  // reaches, and only there: a live child still recovers as it always did, and
  // the server's stage order is never skipped (the card offered Play only for
  // the run's current stage).
  const continueSpent = useRef(!routeContinueIntent);
  const { enterOptional } = dc;
  useEffect(() => {
    if (continueSpent.current || !flow) return;
    if (flow.phase === "optional-entry") {
      continueSpent.current = true;
      enterOptional();
    } else if (flow.phase !== "daily-intro") {
      continueSpent.current = true;
    }
  }, [flow, enterOptional]);
  const guard = useTransactionalLeaveGuard({
    active: shouldGuardDailyLeave(run, flow, dc.optionalLaunchPending),
    kind: "daily_run",
    copy: dailyLeaveCopy(run, flow, dc.optionalLaunchPending),
    shouldBlock: shouldBlockDailyNavigation,
  });
  // DV2-P2A — "Done for now": leave for the hub. Presentation only; the run
  // stays open on the server and resumes from the hub.
  const doneForNow = () => navigate("/quiz");
  // MISC-W2C — a newly-earned-cards panel's way into REVIEW → OWNED, the same
  // destination Ranked's terminal frame uses. Plain navigation: the run stays
  // open on the server, and the leave guard decides whether to ask.
  const reviewDiscoveries = () => navigate("/quiz#review");
  // PGM1 — the public More Challenges catalog, where the bonus modes live.
  const toMoreChallenges = () => navigate(MORE_CHALLENGES_ROUTE, { state: moreChallengesState("daily") });
  // B7 — the stage's last server-reported strike count (see `strikesSeen`).
  const strikesFloor = flow?.stage ? dc.strikesSeen[flow.stage.id] ?? null : null;

  const guarded = (children: ReactNode) => (
    <>
      {children}
      <TransactionalLeaveDialog
        open={guard.confirmationOpen}
        title={guard.copy.title}
        body={guard.copy.body}
        stayLabel={guard.copy.stayLabel}
        leaveLabel={guard.copy.leaveLabel}
        onStay={guard.stay}
        onLeave={guard.leave} />
    </>
  );

  const shell = (children: ReactNode, header: ReactNode = null) => guarded(
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
    case "optional-entry":
      return shell(
        <OptionalEntryBeat run={run} stage={flow.stage!} onPlayOptional={dc.enterOptional} onDone={doneForNow} />);
    case "stage-intro":
      return shell(
        <StageIntroBeat run={run} stage={flow.stage!} error={dc.error} onRetry={dc.retry} busy={dc.busy} />,
        // DV2-P2C — the v5+ opening names no stage, so neither does its header.
        <DailyStageChrome run={run} stage={isDailyOpeningStage(run, flow.stage!) ? null : flow.stage} />);
    case "stage-settling":
    case "stage-result": {
      const onProceed = flow.phase === "stage-result" ? dc.continueFromResult : undefined;
      const main = hasMainDaily(run) && flow.stage!.kind === "standard";
      const beat = shell(
        main ? (
          <DailyMainResult run={run} stage={flow.stage!} error={dc.error} onRetry={dc.retry} busy={dc.busy}
            onProceed={onProceed} onDone={doneForNow} placement={stageResultPlacement}
            onMoreChallenges={flow.phase === "stage-result" ? toMoreChallenges : undefined}
            onReviewDiscoveries={reviewDiscoveries}
            guestSaveEligible={user?.is_anonymous === true}
            onSaveScore={() => navigate(authHref("/quiz/daily-challenge", { mode: "signup" }))} />
        ) : (
          <DailyStageResult run={run} stage={flow.stage!} error={dc.error} onRetry={dc.retry} busy={dc.busy}
            onProceed={onProceed} onDone={hasMainDaily(run) ? doneForNow : undefined}
            onMoreChallenges={hasMainDaily(run) && flow.phase === "stage-result" ? toMoreChallenges : undefined}
            placement={stageResultPlacement} onReviewDiscoveries={reviewDiscoveries} />
        ),
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
      return guarded(
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
