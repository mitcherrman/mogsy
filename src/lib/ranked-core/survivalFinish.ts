/**
 * DC-SURV-UX — WHEN IS THE HUMAN'S SURVIVAL OVER?
 *
 * Two different facts, and the arena used to wait for the second:
 *
 *   1. the HUMAN's Survival is over (strike 3 landed);
 *   2. the parent segment is fully SETTLED (the bot finished its cards too).
 *
 * The player-facing experience answers to #1. This reads it off server truth
 * only — nothing here counts answers or strikes:
 *
 *   * `own_finished` with fewer cards played than the block holds is PRE-4's
 *     early stop, and the only thing that stops a Survival block early is the
 *     strike allowance running out;
 *   * `own_finished` with the ledger's `stage_ended` is the same fact after
 *     the ledger has folded the block in.
 *
 * `own_finished` ALONE is not the signal: every one-card Splash module sets it
 * the moment it is answered, right or wrong.
 *
 * DC-LANE-C — the server now publishes the answer directly:
 * `ruleset.own_stage_finished` (and `ruleset.live_strikes`, the strike count
 * including the unsettled module). When the payload carries it, it is the
 * whole answer; the inference above is kept only for payloads that predate it.
 */
import type { PublicRoundView, SegmentStateView } from "@/lib/ranked-public/contracts";

export const SURVIVAL_RULESET = "survival";

export function isSurvival(pub: PublicRoundView | null | undefined): boolean {
  return pub?.ruleset?.rulesetId === SURVIVAL_RULESET;
}

export function survivalHumanFinished(
  pub: PublicRoundView | null | undefined,
  state: SegmentStateView | null | undefined,
): boolean {
  if (!isSurvival(pub)) return false;
  const r = pub!.ruleset!;
  if (typeof r.ownStageFinished === "boolean") return r.ownStageFinished || r.stageEnded === true;
  if (!state?.ownFinished) return false;
  if (state.ownChallengesCompleted < state.challengeCount) return true;
  return r.stageEnded === true;
}

/** The status a host shows for Survival: progress and strikes, no denominator. */
export interface SurvivalStatus {
  answered: number | null;
  strikesUsed: number | null;
  maxStrikes: number | null;
}

export function survivalStatus(pub: PublicRoundView | null | undefined): SurvivalStatus | null {
  if (!isSurvival(pub)) return null;
  const r = pub!.ruleset!;
  return {
    answered: r.questionsSettled ?? null,
    // The live count when published (it already includes the settled one).
    strikesUsed: r.liveStrikes ?? r.strikes ?? null,
    maxStrikes: r.maxStrikes ?? null,
  };
}
