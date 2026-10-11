/**
 * PPQ2-D — the one call PPQ2-INT makes to get the reveal for a question.
 *
 *   const reveal = buildProPlayReveal({ options, reveal: projection.reveal });
 *   const slots = proPlayAnswerSlots({
 *     options, context, revealed: reveal !== null, revealSlots: reveal?.revealSlots,
 *   });
 *   const footer = reveal
 *     ? <ProPlayRevealFooter model={reveal.model}
 *         valuesOnTablets={revealValuesOnTablets(reveal, slots)} action={nextButton} />
 *     : null;
 *
 * `reveal` is null until the server has graded; then `revealSlots` holds one
 * node per option in server order (PPQ2-C's positional interface), or one
 * `null` per option when the server sent no usable evidence, which leaves the
 * identity facts standing.
 */
import type { ReactNode } from "react";

import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import { tabletLayout } from "../proPlayArenaModel";
import { ProPlayRevealValue } from "./ProPlayRevealValue";
import {
  buildProPlayRevealModel,
  type ProPlayRevealInput,
  type ProPlayRevealModel,
} from "./proPlayRevealModel";

export interface ProPlayReveal {
  model: ProPlayRevealModel;
  /** PPQ2-C `revealSlots`: positional, `options.length` long, server order. */
  revealSlots: ReadonlyArray<ReactNode | null>;
}

export function buildProPlayReveal({ options, reveal }: {
  options: ReadonlyArray<AnswerOptionView>;
  /** PPQ2-B `projection.reveal` — null until graded. */
  reveal: ProPlayRevealInput | null | undefined;
}): ProPlayReveal | null {
  const model = buildProPlayRevealModel(options, reveal);
  if (!model) return null;
  const layout = tabletLayout(options.length);
  const revealSlots = model.evidenceState === "absent"
    ? model.candidates.map(() => null)
    : model.candidates.map((candidate) => (
      <ProPlayRevealValue key={`${candidate.optionId}:${candidate.label}`} candidate={candidate} layout={layout} />
    ));
  return { model, revealSlots };
}

/**
 * Whether the tablets are showing the values: PPQ2-C drew rich content (so
 * the slots mounted) and there was evidence to put in them.
 */
export function revealValuesOnTablets(
  reveal: ProPlayReveal,
  slots: { optionContent: ReadonlyArray<ReactNode> | null },
): boolean {
  return slots.optionContent !== null && reveal.model.evidenceState !== "absent";
}
