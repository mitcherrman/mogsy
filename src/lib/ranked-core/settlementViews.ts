// ---------------------------------------------------------------------------
// THE SETTLED-ROUND PROJECTIONS (ARENA1 Step 5).
//
// Five pure functions from an authoritative settlement to the display data the
// arena's rails, mascots and answer tablets read. Nothing here computes a
// combat value, decides a correctness, or knows a mode: every field is read
// straight off the settlement the backend produced.
//
// WHY THEY MOVED
// ──────────────
// They were declared in `pages/quiz-ranked/rankedViews.ts` — Ranked's page —
// and Step 4 had the Tutorial import them FROM THERE. Nothing failed: they are
// mode-neutral, so a second mode calling them is correct in substance. What it
// is not is honest about the layering, and a THIRD mode (the Daily) doing the
// same would have made Ranked's page directory a de-facto shared library that
// no guard describes and no reader expects.
//
// So the functions live with the contracts they produce, and `rankedViews`
// re-exports every one of them: this is a MOVE, not a rewrite, and no call
// site anywhere had to change for it.
// ---------------------------------------------------------------------------

import type { SurfaceReveal } from "@/lib/question-surface/contract";
import { conciseEvidence } from "@/lib/question-feedback/evidence";
import type {
  MascotReaction, QuestionView, ResolvedCombatantView, ResolvedRoundView,
  RoundHistoryEntry,
} from "./viewTypes";

/**
 * The last few settled rounds for one player, oldest first.
 *
 * ONE ROW PER SETTLED ROUND, including rounds in which nobody lost health.
 * The predecessor of this projection deliberately dropped those, because it
 * fed a strip of damage chips under the HP bar and a wall of "0" explains
 * nothing about an HP bar. This is a ledger of ROUNDS, and two things changed
 * with it:
 *
 *  * the news in a no-damage round is the OUTCOME ("both correct"), which the
 *    chip strip could not show and this can; and
 *  * the two columns are read across as a pair. If one side omitted round 4
 *    and the other did not, the two ledgers would describe different rows at
 *    the same height — which is precisely the mirroring the arena is for.
 *
 * A player absent from a settlement is skipped, not defaulted.
 */
export function projectRoundHistory(
  log: ResolvedRoundView[], playerId: string,
): RoundHistoryEntry[] {
  const out: RoundHistoryEntry[] = [];
  for (const settlement of log) {
    const player = Object.values(settlement.players)
      .find((p) => p.playerId === playerId);
    if (!player) continue;
    out.push({
      roundNumber: settlement.roundNumber,
      outcome: player.outcome,
      dealt: player.finalDamageDealt,
      taken: player.finalDamageReceived,
      absorbed: player.shieldAbsorbed,
      hpBefore: player.hpBefore,
      hpAfter: player.hpAfter,
      timeExpired: settlement.endReason === "deadline_expired",
    });
  }
  return out;
}

/**
 * The outcome each player reached in the settlement currently being revealed,
 * keyed by player id — or an empty map when no reveal is in progress.
 *
 * Gated on `revealHold` so the duelist columns resolve DURING the reveal beat
 * and return to their neutral Thinking/Locked state for the next question,
 * rather than carrying a stale verdict into it.
 */
export function projectRevealOutcomes(
  settlement: ResolvedRoundView | null, revealing: boolean,
): Record<string, ResolvedCombatantView["outcome"]> {
  if (!settlement || !revealing) return {};
  const out: Record<string, ResolvedCombatantView["outcome"]> = {};
  for (const player of Object.values(settlement.players)) {
    out[player.playerId] = player.outcome;
  }
  return out;
}

/** Damage each player DEALT in the settlement being revealed, by player id. */
export function projectRevealDamage(
  settlement: ResolvedRoundView | null, revealing: boolean,
): Record<string, number> {
  if (!settlement || !revealing) return {};
  const out: Record<string, number> = {};
  for (const player of Object.values(settlement.players)) {
    out[player.playerId] = player.finalDamageDealt;
  }
  return out;
}

/**
 * The reveal handed to a normal question's answer tablets, or null.
 *
 * THE DISCLOSURE GATE, and the reason it is a pure function rather than three
 * conditions inline in a component: each of the three closes a different way a
 * live question could be answered for the player, and they must be readable
 * and testable together.
 *
 *  1. a settlement exists AND carries a `correctOptionIndex`. The backend
 *     builds a resolved projection only from a settled row, and reports null
 *     for a segment round and for a pre-Phase-11 backend.
 *  2. the settlement's round is the round the SURFACE is showing. During the
 *     reveal beat the surface deliberately lags the live round; without this,
 *     the round that just settled would resolve the tablets of the round that
 *     just opened — which is the actual leak this shape prevents.
 *  3. the index resolves to an option of THAT question's projection, so the
 *     index→id lookup cannot cross a round boundary either.
 */
export function projectSurfaceReveal(
  settlement: ResolvedRoundView | null,
  surfaceRoundNumber: number | null,
  question: QuestionView | null,
  /**
   * RG3 — the viewer's own settled side, so the reveal can state the VERDICT
   * as well as the answer. Optional: omitting it reproduces the pre-RG3 shape
   * exactly, which is what every existing caller and test relies on.
   */
  viewer?: ResolvedCombatantView | null,
): SurfaceReveal | null {
  if (!settlement || settlement.correctOptionIndex === null) return null;
  if (surfaceRoundNumber === null) return null;
  if (settlement.roundNumber !== surfaceRoundNumber) return null;
  const correct = question?.options.find(
    (o) => o.index === settlement.correctOptionIndex);
  if (!correct) return null;
  return {
    revealed: true,
    correctOptionId: correct.id,
    isCorrect: viewer ? viewer.outcome === "correct" : null,
    // Rides the SAME three gates as the correct option above. There is no
    // separate condition under which evidence may appear, which is what stops
    // the two from ever disagreeing about whether this round is disclosed.
    evidence: conciseEvidence(settlement.questionExplanation),
  };
}

/**
 * The mascot reaction for each player in the settlement being revealed.
 *
 * Read straight off the authoritative settlement — the SAME row the HP bar,
 * the damage trail and the verdict already read. Nothing is timed, sampled or
 * invented here, and there is no simulated or test-only trigger anywhere: if
 * the backend did not settle a round, no mascot moves.
 *
 * Gated on `revealing` (the reveal hold) so the two mascots react on the same
 * beat the verdicts resolve, and go quiet again for the next question rather
 * than carrying a stale reaction into it.
 *
 * ONE ACTION PER MASCOT, and `hit` wins. A round can leave a player both
 * dealing and receiving damage; the mascot has one body and can only do one
 * thing, so taking damage — the fact that actually moved this player's HP bar
 * — is the one that reads. In the ordinary round only one side is damaged, so
 * the attacker lunges and the defender recoils as two halves of one event.
 *
 * A player who neither dealt nor received damage gets no reaction at all; a
 * round where nobody was hurt should not animate.
 */
export function projectMascotReactions(
  settlement: ResolvedRoundView | null, revealing: boolean,
): Record<string, MascotReaction> {
  if (!settlement || !revealing) return {};
  const out: Record<string, MascotReaction> = {};
  for (const player of Object.values(settlement.players)) {
    const took = player.finalDamageReceived > 0 || player.shieldAbsorbed > 0;
    const dealt = player.finalDamageDealt > 0;
    if (!took && !dealt) continue;
    out[player.playerId] = {
      action: took ? "hit" : "attack",
      actionId: settlement.roundNumber,
    };
  }
  return out;
}
