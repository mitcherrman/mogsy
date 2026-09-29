import type { QueueState } from "@/pages/quiz-ranked/useRankedQueue";

export type RankedQueueLeaveMode = "cancellable" | "committed" | null;

/**
 * The queue owns router departures only while the server is known to own the
 * matchmaking transaction. `matched` deliberately belongs to neither mode:
 * the authoritative match handoff cancels any stale queue departure and the
 * Ranked match route's own NAV1 guard becomes the sole owner.
 */
export function rankedQueueLeaveMode(state: QueueState): RankedQueueLeaveMode {
  if (state === "waiting" || state === "cancelling") return "cancellable";
  if (state === "pairing") return "committed";
  return null;
}

export const RANKED_QUEUE_WAITING_COPY = {
  title: "Leave Ranked queue?",
  body: "Leaving will cancel matchmaking.",
  stayLabel: "Stay in Queue",
  leaveLabel: "Cancel Queue & Leave",
} as const;

export const RANKED_QUEUE_COMMITTED_COPY = {
  title: "Leave while your Ranked match is starting?",
  body:
    "Matchmaking is already committed. Leaving this screen will not cancel or forfeit the match, and you can reconnect while it remains active.",
  stayLabel: "Stay",
  leaveLabel: "Leave",
} as const;
