import type { MatchPhase } from "./useRankedMatch";

export const RANKED_LEAVE_COPY = {
  title: "Leave this Ranked match?",
  body: "Leaving will not forfeit immediately. The match keeps running. You can reconnect for about 45 seconds, but it may advance or end while you are away.",
  stayLabel: "Stay in Match",
  leaveLabel: "Leave Match",
} as const;

export function isStandaloneRankedLeaveProtected({
  matchId,
  hosted,
  phase,
}: {
  matchId: string | null;
  hosted: boolean;
  phase: MatchPhase | null;
}): boolean {
  if (!matchId || hosted) return false;
  return phase !== "match_outro" && phase !== "match_over";
}

export function leavesStandaloneRankedOwner(pathname: string): boolean {
  return pathname.replace(/\/$/, "") !== "/quiz/ranked";
}
