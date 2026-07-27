// ---------------------------------------------------------------------------
// `quiz.v1` renderer — today's Ranked question, expressed as a one-challenge
// segment.
//
// This is a WRAPPER, not a redesign. The element tree below is exactly the
// tree `QuizRankedMatch` rendered inline before the module seam existed: the
// same `InteractiveScenarioSurface`, the same props, in the same order. The
// produced DOM is therefore identical and Phase A has no visual difference.
//
// The projection helpers are likewise the existing ones, re-exported through
// the module so the seam owns them without changing them.
// ---------------------------------------------------------------------------

import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export const QUIZ_MODULE_ID = "quiz";
export const QUIZ_MODULE_VERSION = 1;

function projectQuestion(pub: PublicRoundView): QuestionView | null {
  return pub.question ? questionViewFromPublicQuestion(pub.question) : null;
}

function QuizViewport({ publicRound, selection, permissions, onSelect }: ModuleViewportProps) {
  const question = projectQuestion(publicRound);
  // Optional rich-visual source; null → the polished text fallback. No reveal
  // is passed, so the surface stays spoiler-safe exactly as before.
  const scenarioSource = publicRound.question
    ? scenarioSourceFromPublicQuestion(publicRound.question)
    : null;
  if (!question) return null;
  return (
    <InteractiveScenarioSurface
      question={question}
      selectedOptionId={(selection as string | null) ?? null}
      permissions={permissions}
      onSelectOption={(o) => onSelect(o.id)}
      variant="competitive"
      scenarioSource={scenarioSource}
    />
  );
}

export const quizModule: ModuleRenderer = {
  moduleId: QUIZ_MODULE_ID,
  moduleVersion: QUIZ_MODULE_VERSION,
  // The shell owns the quiz select→review→confirm flow, exactly as before.
  ownsSubmission: false,
  Viewport: QuizViewport,
  projectQuestion,
  summaryLabel: (pub, selection) => {
    const question = projectQuestion(pub);
    if (!question) return null;
    return question.options.find((o) => o.id === selection)?.label ?? null;
  },
};
