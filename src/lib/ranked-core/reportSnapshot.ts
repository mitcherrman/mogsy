/**
 * FB1-4 — projecting an arena round into a reportable question snapshot.
 *
 * The arena is mode-neutral by construction, so it cannot know it is Ranked or
 * Daily Challenge. The MODE names itself in `view.report`; everything else
 * here is read off the public round the arena is already rendering, which is
 * what makes one wiring cover both modes.
 *
 * THE ANSWER RULE
 * ───────────────
 * `canonicalAnswer` is taken from `reveal.correctOptionId` and from nowhere
 * else. `SurfaceReveal` is backend-authoritative and post-settlement only —
 * the controller is forbidden from populating it before the round resolves —
 * so a report filed mid-question captures no answer, and a report filed on the
 * reveal beat captures the one the player is already looking at. There is no
 * path here that can surface an answer the player has not been shown.
 */

import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import type {
  ReportableQuestionSnapshot,
} from "@/lib/feedback/report-context";
import type { FeedbackCategory } from "@/lib/feedback/contract";

/** What a mode must say about itself for its rounds to be reportable. */
export interface ArenaReportIdentity {
  /** Human name shown to the owner, e.g. "Ranked", "Daily Challenge". */
  mode: string;
  /** Product area the report is filed under. */
  category: FeedbackCategory;
}

/**
 * Option ids in this contract are stringified backend indices
 * (`AnswerOptionView.id`), so a label lookup is an index into the public
 * question's own option list. Anything that does not resolve returns
 * undefined rather than a guess — a report that says nothing about the
 * selection is honest, one that says the wrong option is worse than useless.
 */
function optionLabel(
  options: readonly string[] | undefined,
  optionId: unknown,
): string | undefined {
  if (typeof optionId !== "string" && typeof optionId !== "number") return undefined;
  const index = Number(optionId);
  if (!Number.isInteger(index) || index < 0) return undefined;
  return options?.[index];
}

export function arenaReportSnapshot(args: {
  identity: ArenaReportIdentity;
  publicRound: PublicRoundView;
  selection: unknown;
  reveal: SurfaceReveal | null;
}): ReportableQuestionSnapshot | null {
  const { identity, publicRound, selection, reveal } = args;
  const question = publicRound.question;
  if (!question) return null;

  return {
    category: identity.category,
    mode: identity.mode,

    // No `questionKey`: the Ranked transport deliberately does not publish
    // one. Keys like `item_exact_stat:armor:highest` name the answer, and
    // `assertNoCorrectness` in the round reader exists to keep exactly that
    // kind of field off the wire. `runtimeQuestionId` plus `matchId` and
    // `roundNumber` is what lets the owner resolve the row server-side, which
    // is the trade QR1's durable-identity rule is making here.
    runtimeQuestionId: question.questionId,

    prompt: question.prompt,
    choices: question.options,
    selectedAnswer: optionLabel(question.options, selection),
    // Post-settlement only. See the module header.
    canonicalAnswer: reveal?.revealed
      ? optionLabel(question.options, reveal.correctOptionId)
      : undefined,

    questionType: question.topic?.category ?? question.category ?? undefined,
    difficulty: question.topic?.tier ?? undefined,
    moduleType: `${publicRound.segment.moduleId}.v${publicRound.segment.moduleVersion}`,

    matchId: publicRound.matchId,
    roundNumber: publicRound.activeRound?.roundNumber ?? null,
  };
}
