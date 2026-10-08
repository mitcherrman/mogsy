import type { TransactionalLeaveCandidate, TransactionalLeaveCopy } from "@/lib/navigation/useTransactionalLeaveGuard";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import { currentStage, hasMainDaily, isMainDailyComplete } from "@/lib/daily-challenge/run/contracts";
import type { DailyFlowView } from "@/lib/daily-challenge/run/flow";
import { stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";

export const DAILY_RUN_PATH = "/quiz/daily-challenge";

const NORMAL_BODY = "Your completed stages are saved. You can resume before the Daily resets. This is your one run for today.";
const LIVE_BODY = "Your completed stages are saved, but this stage is still live. Leaving does not forfeit immediately. Return within about 45 seconds or the stage may end, and there is no second Daily run today.";
const RESULT_WARNING = "This stage result screen will not be shown again when you return.";

// DV2-P2A — a v5 day before its MAIN Daily (Standard) is complete. Nothing is
// "completed" yet, so the legacy "completed stages are saved" is not said.
const MAIN_NORMAL_BODY = "Today's Challenge isn't finished yet. You can resume before the Daily resets. This is your one run for today.";
const MAIN_LIVE_BODY = "Today's Challenge is still live. Leaving does not forfeit immediately. Return within about 45 seconds or it may end, and there is no second Daily run today.";

export function isActiveDailyRun(run: DailyRun | null): boolean {
  return run?.status === "active";
}

/**
 * A child is live while the server still names a canonical child and the
 * parent has not observed its terminal handback. This deliberately includes
 * a child hidden during Survival settlement and a child created behind its
 * stage-intro tag. A terminal child awaiting parent sync uses the normal copy.
 */
export function hasLiveDailyChild(run: DailyRun | null, flow: DailyFlowView | null): boolean {
  if (!isActiveDailyRun(run) || !flow) return false;
  const stage = currentStage(run!);
  if (!stage?.childMatchId) return false;
  if (flow.phase === "stage-result" || flow.phase === "complete" || flow.phase === "optional-entry") return false;
  if (flow.phase === "stage-settling") return Boolean(flow.settlingChildMatchId);
  return stage.status === "in_progress" || stage.status === "launching";
}

/**
 * DV2-P2A — whether leaving the Daily page needs the player's confirmation.
 *
 *   * v1–v4, and a v5 day before its MAIN Daily is complete: while the parent
 *     is active (unchanged — the Daily itself is unfinished).
 *   * a v5 day whose MAIN Daily is complete: only while an optional child is
 *     actually live. Today's Challenge is saved, and More Challenges / Review
 *     resume later, so stepping away between them is not an exit from an
 *     unfinished Daily. A live child still has the ~45-second consequence.
 */
export function shouldGuardDailyLeave(run: DailyRun | null, flow: DailyFlowView | null): boolean {
  if (!isActiveDailyRun(run)) return false;
  if (isMainDailyComplete(run!)) return hasLiveDailyChild(run, flow);
  return true;
}

export function dailyLeaveCopy(run: DailyRun | null, flow: DailyFlowView | null): TransactionalLeaveCopy {
  const resultWarning = flow?.phase === "stage-result" ? ` ${RESULT_WARNING}` : "";
  const live = hasLiveDailyChild(run, flow);
  if (run && isMainDailyComplete(run)) {
    // Only reachable with a live optional child (`shouldGuardDailyLeave`).
    const stage = currentStage(run);
    const label = stage ? stageIdentity(stage).label : "This activity";
    return {
      title: `Leave ${label}?`,
      body: `Today's Daily is complete and saved. ${label} is still live: leaving does not forfeit immediately, but return within about 45 seconds or it may end.`,
      stayLabel: "Keep playing",
      leaveLabel: "Leave",
    };
  }
  const main = run !== null && hasMainDaily(run);
  return {
    title: "Exit Daily Challenge?",
    body: `${live ? (main ? MAIN_LIVE_BODY : LIVE_BODY) : (main ? MAIN_NORMAL_BODY : NORMAL_BODY)}${resultWarning}`,
    stayLabel: "Continue Daily",
    leaveLabel: "Exit Daily Challenge",
  };
}

export function shouldBlockDailyNavigation({ currentLocation, nextLocation }: TransactionalLeaveCandidate): boolean {
  return currentLocation.pathname === DAILY_RUN_PATH && nextLocation.pathname !== DAILY_RUN_PATH;
}
