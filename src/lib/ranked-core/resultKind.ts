/**
 * THE VIEWER'S VERDICT FOR ONE SETTLED ROUND (ARENA1 Step 5).
 *
 * One line of arithmetic over an authoritative settlement, and it has two
 * consumers that must never disagree: the header's result beat and the round
 * timeline's outcome mark. It was declared in
 * `components/ranked-arena/RoundResultBeat` and imported by
 * `pages/quiz-ranked/roundTimeline` — which is why the timeline projection
 * could not be promoted into `lib/` without dragging a component import with
 * it, and why it lives here now.
 *
 * `RoundResultBeat` re-exports it, so every historical import site resolves
 * unchanged. The FUNCTION did not change: it is the same three lines.
 */
import type { ResolvedCombatantView, ResultKind } from "./viewTypes";

export type { ResultKind };

export function resultKind(
  viewer: ResolvedCombatantView, opponent: ResolvedCombatantView,
): ResultKind {
  if (viewer.outcome === "timed_out") return "timed-out";
  if (viewer.outcome === "incorrect") return "incorrect";
  return opponent.outcome === "correct" ? "both-correct" : "correct";
}
