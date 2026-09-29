import type { TransactionalLeaveCandidate } from "@/lib/navigation/useTransactionalLeaveGuard";

export type PracticePhase = "sets" | "loading-questions" | "active" | "result" | "error";

/** Only phases containing an unrecoverable, unfinished local Practice run. */
export function isUnfinishedPracticePhase(phase: PracticePhase): boolean {
  return phase === "loading-questions" || phase === "active";
}

/**
 * Practice owns no URL state while its runner is mounted. Any real router
 * transition therefore abandons the local run, including /quiz hash/search
 * changes. An identical location is not a departure.
 */
export function shouldBlockPracticeDeparture({
  currentLocation,
  nextLocation,
}: TransactionalLeaveCandidate): boolean {
  return currentLocation.pathname !== nextLocation.pathname ||
    currentLocation.search !== nextLocation.search ||
    currentLocation.hash !== nextLocation.hash;
}

export const PRACTICE_LEAVE_COPY = {
  title: "Leave practice?",
  body: "This practice run can’t be resumed if you leave.",
  stayLabel: "Stay in Practice",
  leaveLabel: "Leave Practice",
} as const;
