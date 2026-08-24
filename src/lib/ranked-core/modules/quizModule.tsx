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

import { useMemo } from "react";
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

function QuizViewport({
  publicRound, selection, permissions, onSelect, reveal, feedback,
  surfaceVerdict, surfaceSettings,
}: ModuleViewportProps) {
  const question = useMemo(() => projectQuestion(publicRound), [publicRound]);
  // Optional rich-visual source; null → the polished text fallback.
  //
  // QUIZ1 Phase 11: `reveal` is now forwarded, and it is the shell's job to
  // supply null until the round has SETTLED (see `QuizRankedMatch`). Pre-reveal
  // this is exactly the surface it always was — `revealed: false` and no
  // correct option id — which is what keeps the spoiler contract intact while
  // finally letting the tablets resolve afterwards, the way a Meta Reflex card
  // already does.
  //
  // Memoised on the QUESTION rather than recomputed per render: the arena
  // rerenders once a second for the timer, and a fresh object here re-ran the
  // scenario classifier on every one of those ticks.
  const scenarioSource = useMemo(
    () => (publicRound.question ? scenarioSourceFromPublicQuestion(publicRound.question) : null),
    [publicRound.question]);
  if (!question) return null;
  return (
    <InteractiveScenarioSurface
      question={question}
      selectedOptionId={(selection as string | null) ?? null}
      permissions={permissions}
      onSelectOption={(o) => onSelect(o.id)}
      variant="competitive"
      scenarioSource={scenarioSource}
      reveal={reveal ?? null}
      // ARENA1 Step 5 — both absent for Ranked and the Tutorial, so the
      // surface receives `undefined`/null for each and renders exactly what it
      // always has. A retry-until-correct mode passes RG3's feedback model —
      // which is where its struck options, its verdict and its disclosure gate
      // all live — and asks for the explanation; nothing else differs.
      feedback={feedback ?? null}
      verdict={surfaceVerdict ?? null}
      settings={surfaceSettings}
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
