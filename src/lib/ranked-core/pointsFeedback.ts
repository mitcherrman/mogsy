// ---------------------------------------------------------------------------
// RP1 Step 4 — WHY THE SCORE MOVED, in the player's words.
//
// One pure projection from the backend's own award to the two lines the arena
// shows. It is not a scoring layer and contains no rule: every number below is
// copied from `module_points`, which the backend built from the module's own
// reveal and reconciled against what the engine banked before publishing it.
//
// THE PRODUCT SENTENCE THIS EXISTS TO TEACH
// ─────────────────────────────────────────
// Knowledge first, speed second. So the award is never shown as one merged
// figure: the base line says what KNOWING earned, and the bonus line — quieter,
// and absent far more often than not — says what being QUICK added.
//
//   CORRECT +2        5 / 5 +5
//   FIRST +1          FINISHED FIRST +1
//
// WHAT IS DELIBERATELY NOT HERE
// ─────────────────────────────
// A perfect bonus. RP1 has exactly one bonus and it requires perfection AND
// finishing first together, which is why the ONLY thing consulted for the
// second line is `speed_bonus_points > 0` — the backend's own answer, already
// zero on an imperfect block. Reading `perfect` here (it is right there on the
// segment reveal) would let this file render a reward the game does not have,
// and reading "was I faster" would be a second, disagreeing copy of a rule the
// server already applied.
// ---------------------------------------------------------------------------

import type { ModulePointsAward } from "./backend/adaptBackendSettlement";
import type { SegmentSettlementView } from "@/lib/ranked-public/contracts";
import type {
  MascotReaction, ResolvedCombatantView, ResolvedRoundView,
} from "./viewTypes";

/** What one settled module awarded ONE player, ready to render. */
export interface PointsFeedbackView {
  /**
   * The loud line: what correctness earned. `CORRECT` / `INCORRECT` /
   * `TIMED OUT` for a single question, `4 / 5` for a multi-question slice —
   * the count IS the verdict there, and a slice has no single outcome.
   */
  baseLabel: string;
  basePoints: number;
  /**
   * The quiet line, or null — which is the common case. Present if and only
   * if the BACKEND awarded a speed bonus.
   */
  speed: { label: string; points: number } | null;
  /** The module's total, as the engine banked it. */
  pointsAwarded: number;
  /** The running score after this module settled. */
  scoreAfter: number;
}

const OUTCOME_LABEL: Record<ResolvedCombatantView["outcome"], string> = {
  correct: "CORRECT",
  incorrect: "INCORRECT",
  timed_out: "TIMED OUT",
};

/**
 * One player's feedback for one settled module.
 *
 * `slice` is the module's own card count and this player's correct count, for
 * a multi-challenge block; absent for an ordinary question. It changes the
 * base LINE and the bonus's WORDING and nothing else — the numbers are the
 * award's either way.
 */
export function projectPointsFeedback(
  award: ModulePointsAward,
  { outcome, slice }: {
    outcome: ResolvedCombatantView["outcome"];
    slice?: { correct: number; challengeCount: number } | null;
  },
): PointsFeedbackView {
  const isSlice = !!slice && slice.challengeCount > 1;
  return {
    baseLabel: isSlice
      ? `${slice!.correct} / ${slice!.challengeCount}`
      : OUTCOME_LABEL[outcome],
    basePoints: award.basePoints,
    // The ONE condition. Not perfection, not a timing comparison, not an
    // outcome — the server's own bonus figure, which is already 0 for every
    // case that did not earn one.
    speed: award.speedBonusPoints > 0
      ? {
        label: isSlice ? "FINISHED FIRST" : "FIRST",
        points: award.speedBonusPoints,
      }
      : null,
    pointsAwarded: award.pointsAwarded,
    scoreAfter: award.scoreAfter,
  };
}

/**
 * Every player's feedback for the settlement currently being revealed, keyed
 * by player id — or an empty map outside the reveal beat and on every hp
 * settlement.
 *
 * The same reveal gate the verdicts and the rails already use, so the whole
 * beat resolves together and nothing carries a stale award into the next
 * module. `segment` is the block transcript for the SAME round, when the
 * module that settled was a multi-challenge one; a mismatched round is
 * ignored rather than borrowed from, because a slice's counts describe the
 * block they came from and no other.
 */
export function projectRevealFeedback(
  settlement: ResolvedRoundView | null,
  revealing: boolean,
  segment?: { settlement: SegmentSettlementView; roundNumber: number | null } | null,
): Record<string, PointsFeedbackView> {
  if (!settlement || !revealing || !settlement.modulePoints) return {};
  const reveal = segment && segment.roundNumber === settlement.roundNumber
    ? segment.settlement.reveal : null;
  const out: Record<string, PointsFeedbackView> = {};
  for (const player of Object.values(settlement.players)) {
    const award = settlement.modulePoints[player.playerId];
    if (!award) continue;
    const side = reveal?.players[player.playerId];
    out[player.playerId] = projectPointsFeedback(award, {
      outcome: player.outcome,
      slice: side
        ? { correct: side.correct, challengeCount: reveal!.challengeCount }
        : null,
    });
  }
  return out;
}

/** `+2` / `+0` — the one place an award is turned into a string. */
export function awardText(points: number): string {
  return `+${points}`;
}

/**
 * The mascots' reaction to a settled points module, keyed by player id.
 *
 * ONE RULE: a mascot celebrates ITS OWN player's award, and does nothing
 * otherwise. There is no attacker and no victim in a points match — both
 * players answer the same module and both can score on it — so nothing here
 * can make one duelist's success visible as the other's injury, which is
 * exactly what the damage-shaped projection did when a v2 award travelled
 * through the engine's damage channel.
 *
 * A module that awarded this player nothing produces NO reaction rather than a
 * sad one: a mode that animates on every outcome has no way left to say that
 * something good happened.
 *
 * The bonus is deliberately not a bigger hop. One award, one motion — a second
 * intensity would be a new motion vocabulary in `RoleMascot`, and the speed
 * premium is already stated in words and in a number two inches away.
 *
 * Gated by construction: `feedback` is empty outside the reveal beat.
 */
export function projectPointsMascotReactions(
  feedback: Record<string, PointsFeedbackView>,
  settlement: ResolvedRoundView | null,
): Record<string, MascotReaction> {
  if (!settlement) return {};
  const out: Record<string, MascotReaction> = {};
  for (const [playerId, view] of Object.entries(feedback)) {
    if (view.pointsAwarded <= 0) continue;
    out[playerId] = { action: "cheer", actionId: settlement.roundNumber };
  }
  return out;
}
