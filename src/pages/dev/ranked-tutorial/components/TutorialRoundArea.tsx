import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { LevelUpPanel } from "@/components/ranked-arena/LevelUpPanel";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { SubmissionReview } from "@/components/ranked-arena/SubmissionReview";
import { AbilityTray } from "@/components/ranked-arena/AbilityTray";
import {
  AbilityView,
  InteractionPermissions,
  NO_INTERACTIONS,
} from "@/lib/ranked-core/viewTypes";
import {
  abilityName,
  questionViewFromRound,
  resolvedRoundViewFromResult,
  revealedAnswersByPlayerId,
  submissionViewFromRound,
  TUTORIAL_NAMES_BY_ID,
} from "../adapters";
import { RoundState, TutorialEvent } from "../types";

/**
 * Composes the CANONICAL arena interaction components for one tutorial
 * round: question + answer grid + ability tray + submission review, and the
 * canonical reveal once the round resolves. Tutorial-owned only in wiring:
 * every rendered game surface is the shared Ranked presentation.
 */
export function TutorialRoundArea({
  round,
  abilities,
  showAbilityTray,
  permissions,
  coachNote,
  dispatch,
}: {
  round: RoundState;
  abilities: AbilityView[];
  /** False before the Fortify lesson: only the explicit no-ability option shows. */
  showAbilityTray: boolean;
  permissions: InteractionPermissions;
  /** Director-supplied review note (coach nudges, deliberate-demo copy). */
  coachNote: string | null;
  dispatch: (event: TutorialEvent) => void;
}) {
  const question = questionViewFromRound(round);
  const submission = submissionViewFromRound(round);
  const revealed = round.phase === "revealed" && round.result;
  const answerLabel =
    submission.selectedOptionId === null
      ? null
      : question.options.find((o) => o.id === submission.selectedOptionId)?.label ?? null;

  if (revealed) {
    const result = round.result!;
    const settlement = resolvedRoundViewFromResult(result);
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

  return (
    <div className="space-y-4">
      <InteractiveScenarioSurface
        question={question}
        selectedOptionId={submission.selectedOptionId}
        permissions={permissions}
        onSelectOption={(option) =>
          dispatch({ type: "SELECT_ANSWER", answerIndex: option.index })
        }
        variant="tutorial"
      />
      <AbilityTray
        abilities={showAbilityTray ? abilities : []}
        selectedAbilityId={submission.selectedAbilityId}
        permissions={permissions}
        onSelectAbility={(abilityId) => dispatch({ type: "SELECT_ABILITY", abilityId })}
      />
      <SubmissionReview
        submission={submission}
        answerLabel={answerLabel}
        abilityName={submission.selectedAbilityId ? abilityName(submission.selectedAbilityId) : null}
        permissions={permissions}
        onReview={() => dispatch({ type: "LOCK_SUBMISSION" })}
        onEdit={() => dispatch({ type: "EDIT_SUBMISSION" })}
        onConfirm={() => dispatch({ type: "CONFIRM_LOCK" })}
        statusMessage={coachNote ? { tone: "info", text: coachNote } : null}
        confirmLabel="Confirm — lock it in"
      />
    </div>
  );
}
