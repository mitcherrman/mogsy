import type { TransactionalLeaveCandidate, TransactionalLeaveCopy } from "@/lib/navigation/useTransactionalLeaveGuard";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import { currentStage } from "@/lib/daily-challenge/run/contracts";
import type { DailyFlowView } from "@/lib/daily-challenge/run/flow";

export const DAILY_RUN_PATH = "/quiz/daily-challenge";

const NORMAL_BODY = "Your completed stages are saved. You can resume before the Daily resets. This is your one run for today.";
const LIVE_BODY = "Your completed stages are saved, but this stage is still live. Leaving does not forfeit immediately. Return within about 45 seconds or the stage may end, and there is no second Daily run today.";
const RESULT_WARNING = "This stage result screen will not be shown again when you return.";

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
  if (flow.phase === "stage-result" || flow.phase === "complete") return false;
  if (flow.phase === "stage-settling") return Boolean(flow.settlingChildMatchId);
  return stage.status === "in_progress" || stage.status === "launching";
}

export function dailyLeaveCopy(run: DailyRun | null, flow: DailyFlowView | null): TransactionalLeaveCopy {
  const resultWarning = flow?.phase === "stage-result" ? ` ${RESULT_WARNING}` : "";
  return {
    title: "Exit Daily Challenge?",
    body: `${hasLiveDailyChild(run, flow) ? LIVE_BODY : NORMAL_BODY}${resultWarning}`,
    stayLabel: "Continue Daily",
    leaveLabel: "Exit Daily Challenge",
  };
}

export function shouldBlockDailyNavigation({ currentLocation, nextLocation }: TransactionalLeaveCandidate): boolean {
  return currentLocation.pathname === DAILY_RUN_PATH && nextLocation.pathname !== DAILY_RUN_PATH;
}
