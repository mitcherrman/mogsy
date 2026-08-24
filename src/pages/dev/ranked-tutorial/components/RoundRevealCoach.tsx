import { LevelUpPanel } from "@/components/ranked-arena/LevelUpPanel";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  abilityName, resolvedRoundViewFromResult, revealedAnswersByPlayerId,
  TUTORIAL_NAMES_BY_ID,
} from "../adapters";
import { TUTORIAL_ROUNDS } from "../fixtures";
import type { RoundState, TutorialTrack } from "../types";

/**
 * WHAT JUST HAPPENED, SPELLED OUT — the tutorial's teaching artifact for a
 * settled round, rendered in the arena's guidance slot.
 *
 * The arena has ALREADY resolved the round in the production way by the time
 * this appears: the answer tablets have turned over, each duelist's rail
 * carries its verdict and its damage figure, and the header strip holds the
 * round's result plate. None of that is repeated here and none of it is
 * reimplemented here.
 *
 * What this adds is the two things a Ranked player has learnt to read and a
 * first-time player has not: WHICH option each side actually chose — the
 * evidence for the "both answers reveal together" lesson, which no production
 * surface shows because a Ranked duellist already knows it — and the
 * sentence-long explanation the lesson was written around. Both come from the
 * canonical `RevealPanel`, at its own props; this file composes, it does not
 * draw.
 */
export function RoundRevealCoach({ round, track }: {
  round: RoundState;
  track: TutorialTrack;
}) {
  const result = round.result;
  if (round.phase !== "revealed" || !result) return null;
  const settlement = resolvedRoundViewFromResult(
    result, TUTORIAL_ROUNDS[result.roundId], track);
  const notices: string[] = [];
  if (result.effectSummary) notices.push(result.effectSummary);
  notices.push(result.resultCopy);

  return (
    <RevealPanel
      settlement={settlement}
      viewerSlot="p1"
      namesByPlayerId={TUTORIAL_NAMES_BY_ID}
      answersByPlayerId={revealedAnswersByPlayerId(round)}
      notices={notices}
    >
      {result.levelThreeAutoUnlockedAbilityId && (
        <LevelUpPanel
          event={{
            kind: "level3-unlock",
            ability: {
              id: result.levelThreeAutoUnlockedAbilityId,
              name: abilityName(result.levelThreeAutoUnlockedAbilityId),
              description: "Your final normal ability unlocked automatically.",
            },
          }}
          permissions={NO_INTERACTIONS}
        />
      )}
    </RevealPanel>
  );
}
