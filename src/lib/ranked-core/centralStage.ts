// ---------------------------------------------------------------------------
// RM1 Pass 2B — WHAT THE HEADER'S CENTRE IS SHOWING.
//
// The arena's header has ONE focal display and it passes through three faces:
// the clock, the viewer's result, and the name of the module about to start.
// This module is the whole of the decision; the component only draws it.
//
// It is a PROJECTION and owns no clock. Two of the three faces are decided
// entirely by state the mode already publishes:
//
//   * `result` exists exactly while the settlement beat is running, which is
//     `revealHold` — the mode's own window, already sized (and already
//     lengthened for a level-up or a piece of evidence). Nothing here times it.
//   * `timer` is the mode's live clock, unchanged.
//
// The third face — the next module's name — is the one beat that genuinely has
// no existing window, and the component adds exactly one short timeout for it.
// See `MODULE_TITLE_MS`.
// ---------------------------------------------------------------------------

import { categoryLabel, type CategoryKey } from "@/lib/quiz/publicCategory";
import { isMetaReflexSegment } from "./roundTimeline";
import {
  MASTERY_SLICE_MODULE_ID, type PublicRoundView,
} from "@/lib/ranked-public/contracts";
import type { PointsFeedbackView } from "./pointsFeedback";
import type { ResolvedCombatantView } from "./viewTypes";

/**
 * How long the next module's name holds the centre before its clock replaces
 * it.
 *
 * SHORT, and deliberately shorter than the result beat it follows: the result
 * is news the player has to read, the module name is an orientation they
 * mostly already have from the rail below. It is also strictly decoration over
 * a clock that is ALREADY RUNNING — the backend starts the round's deadline
 * when it opens the round, not when this client finishes an animation — so
 * every millisecond here is a millisecond of the player's own answering time.
 * That is the entire argument for the number being this small.
 */
export const MODULE_TITLE_MS = 900;

/** One face of the header's focal display. */
export type CentralStageView =
  | { kind: "timer" }
  | { kind: "result"; verdict: string; points: string }
  | { kind: "module"; title: string };

/**
 * The viewer's result, in the two lines the centre shows, or null.
 *
 * `CORRECT` / `+2 POINTS`. Both lines come from the settlement: the verdict is
 * the backend's own outcome for this player and the figure is
 * `basePoints` off `module_points`. NOTHING is computed — in particular the
 * speed bonus is NOT added into the figure, for the same reason the history
 * bubble does not add it: `+3` would erase which half the player earned, and
 * knowledge-first-speed-second is the sentence this display exists to carry.
 *
 * `feedback` is the REVEAL-GATED projection (`projectRevealFeedback`), so this
 * is null outside the beat by construction and cannot decay into a stale
 * result the way an ungated one would.
 */
export function centralResult(
  feedback: PointsFeedbackView | null | undefined,
  outcome: ResolvedCombatantView["outcome"] | null | undefined,
): { verdict: string; points: string } | null {
  if (!feedback) return null;
  // The slice's own count IS its verdict ("4 / 5"); a block has no single
  // correct/incorrect and `baseLabel` already carries the right word for both
  // shapes. `outcome` is accepted so a caller cannot pass one and mean the
  // other, and is used only when the award is silent about the word.
  const verdict = feedback.baseLabel || VERDICT_WORD[outcome ?? "incorrect"];
  const points = `+${feedback.basePoints} ${
    feedback.basePoints === 1 ? "POINT" : "POINTS"}`;
  return { verdict, points };
}

/**
 * THE ARENA HAS ONE WORD FOR EACH OUTCOME, and this is not the place to add a
 * second.
 *
 * These are `pointsFeedback`'s own labels, which the duelist rails and the
 * header's persistent plate already print. The RM1 brief writes the timeout
 * face as "TIME EXPIRED"; the arena has said "TIMED OUT" since the verdict row
 * was written, and a display saying one while the column beside it says the
 * other is the drift this file exists downstream of. So the existing word
 * stands, and changing it is a one-line change HERE AND IN `pointsFeedback`
 * together — never in one of them.
 */
const VERDICT_WORD: Record<ResolvedCombatantView["outcome"], string> = {
  correct: "CORRECT",
  incorrect: "INCORRECT",
  timed_out: "TIMED OUT",
};

/**
 * WHAT THIS MODULE IS CALLED, for the centre's third face.
 *
 * The precedence is lifted verbatim from `rankedResultsModel.moduleSubject`,
 * which is Ranked's existing answer to the same question on the end screen —
 * deliberately, because two naming systems for one module is exactly the
 * parallel authority this must not become. A block is "Meta Reflex", a slice
 * is "Mastery", and everything else is its published CATEGORY through
 * `categoryLabel`, the app's one category vocabulary.
 *
 * A subject and never the entity a question happens to name: "Champion
 * Abilities", not "Ahri". And null when the round has published no topic —
 * the header simply skips the face rather than printing "Question", because a
 * generic word in a slot reserved for a name is worse than no slot at all.
 *
 * It describes the round in play. There is NO way to name the next one before
 * it opens: the backend publishes nothing about an ungenerated question (see
 * `roundTimeline.ts`, which is why every future node on the rail is neutral),
 * so this face necessarily runs at the moment the new round ARRIVES rather
 * than during the gap before it.
 */
export function liveModuleTitle(round: PublicRoundView | null): string | null {
  if (!round) return null;
  const segment = round.segment ?? null;
  // The SAME test the timeline's node dispatch uses, and not a looser one: an
  // `item_cost_duel` segment below the mixed version is not a Meta Reflex
  // block, and naming one by module id alone would mislabel every match frozen
  // before v4.
  if (isMetaReflexSegment(segment?.moduleId, segment?.moduleVersion)) return "Meta Reflex";
  if (segment?.moduleId === MASTERY_SLICE_MODULE_ID) return "Mastery";
  const category = round.question?.topic?.category ?? null;
  return category ? categoryLabel(category as CategoryKey) : null;
}

/**
 * ONE CARD of a Meta Reflex block, in the same two lines.
 *
 * A card's award is not published per card — the block settles once, and
 * `slice_points` pays `correct_count` at that settlement — so the figure here
 * is the module's own rule (one correct card is worth one base point) and not
 * a number the backend stated about this card. That is exactly what
 * `CardResultBeat` has always shown in this slot; RM1 only moved where it is
 * drawn, and the reconciliation that stops it being counted twice lives in the
 * payout projection, not here.
 */
export function centralCardResult(
  beat: { outcome: "correct" | "incorrect" | "timeout" | "unanswered" } | null,
): { verdict: string; points: string } | null {
  if (!beat) return null;
  const correct = beat.outcome === "correct";
  return {
    verdict: correct ? "CORRECT"
      : beat.outcome === "timeout" ? VERDICT_WORD.timed_out : "INCORRECT",
    points: correct ? "+1 POINT" : "+0 POINTS",
  };
}
