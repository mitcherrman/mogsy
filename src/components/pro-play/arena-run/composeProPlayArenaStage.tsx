/**
 * PPQ2-INT — the ONE place Pro Play's data meets its presentation.
 *
 * PPQ2-B's controller produces typed data (`state` + `projection`); PPQ2-C's
 * pieces draw it. This function binds the two into the Arena's own view model
 * and adds nothing of its own:
 *
 *  - the SURFACE is `composeProPlayArenaView`'s, unchanged, plus the optional
 *    `regions` seam (anchor plate in the media region, identity content INSIDE
 *    the canonical tablets, the column strategy and the VS seam). Selection,
 *    gating, tablet states and the reveal stay the canonical grid's;
 *  - the FLANKS are the dossier (left) and the session panel (right), both
 *    desktop-only by the arena's own rule;
 *  - the HEADER title is `Question n / N`; below `lg`, where the session panel
 *    is hidden, it also carries the server score (`titleDetail`);
 *  - the REVEAL is PPQ2-D's, built only from the server-graded
 *    `projection.reveal`: positional values go into PPQ2-C's `revealSlots`
 *    (inside the canonical tablets), and `ProPlayRevealFooter` takes the HUD
 *    row, carrying the caller's action (Next / See results / Try again);
 *  - before a grade the HUD row is a RESERVE of the footer's ordinary height
 *    from `lg` (where the stage height is definite), holding the action slot,
 *    so the stage never changes height at the reveal. The HUD row is as tall
 *    as its content; a footer that appeared only on reveal would take its
 *    height out of the stage at that moment.
 *
 * It decides nothing the server has not: every number is `session.*`, every
 * verdict a received grade, and the reveal is only ever the projection's.
 * Report publishing is NOT here: the Arena publishes from `view.report` +
 * `surface.reportRef`, and nothing in this directory may publish a second time.
 */
import type { ReactNode } from "react";

import { asQuestionContext } from "@/lib/pro-play/contract";
import {
  composeProPlayArenaView,
  type ProPlayArenaProjection,
  type ProPlayArenaState,
  type ProPlayArenaViewModel,
} from "@/lib/pro-play/arena";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import {
  ProPlayAnchorPlate,
  ProPlayQuestionDossier,
  ProPlaySessionPanel,
  proPlayAnswerSlots,
  type ProPlayOutcome,
} from "@/components/pro-play/arena";
import {
  buildProPlayReveal,
  ProPlayRevealFooter,
  revealValuesOnTablets,
} from "@/components/pro-play/arena/reveal";

/**
 * The reveal footer's ordinary height from `lg` (one line of scope +
 * explanation beside a 36px control, `py-1`, 1px borders), and the box the
 * HUD row holds before the grade. Taller fallbacks (no tablet values, a long
 * explanation) may exceed it; the stage then yields, which only they pay.
 */
export const REVEAL_FOOTER_MIN_H = "lg:min-h-[3.25rem]";

export interface ProPlayArenaStageInput {
  state: ProPlayArenaState;
  projection: ProPlayArenaProjection;
  onSelectOption: (option: AnswerOptionView) => void;
  /**
   * The HUD row's control: Next / See results while a reveal shows, Try again
   * over an errored question, or an invisible placeholder of the same size.
   */
  action: ReactNode;
}

/** Received verdicts only, keyed by question number (never inferred). */
export function receivedOutcomes(state: ProPlayArenaState): Map<number, ProPlayOutcome> {
  const map = new Map<number, ProPlayOutcome>();
  for (const [n, v] of Object.entries(state.outcomes)) map.set(Number(n), v);
  return map;
}

/** The Arena view for the question on the stage, or null when there is none. */
export function composeProPlayArenaStage({
  state,
  projection,
  onSelectOption,
  action,
}: ProPlayArenaStageInput): ProPlayArenaViewModel | null {
  const question = state.question;
  const session = state.session;
  if (!question || !session || !projection.surface) return null;

  const context = asQuestionContext(question.context);
  const options = projection.surface.question.options;
  // Null until the server graded the question on the stage.
  const reveal = buildProPlayReveal({ options, reveal: projection.reveal });
  const slots = proPlayAnswerSlots({
    options,
    context,
    revealed: reveal !== null,
    revealSlots: reveal?.revealSlots,
  });
  const hudAction = reveal ? (
    <ProPlayRevealFooter model={reveal.model} valuesOnTablets={revealValuesOnTablets(reveal, slots)}
      action={action} className={REVEAL_FOOTER_MIN_H} />
  ) : (
    <div data-pro-play-hud-reserve className={`flex w-full items-center justify-end ${REVEAL_FOOTER_MIN_H}`}>
      {action}
    </div>
  );
  const outcomes = receivedOutcomes(state);

  const view = composeProPlayArenaView(projection, {
    left: { kind: "panel", node: <ProPlayQuestionDossier context={context} topic={question.topic} /> },
    right: {
      kind: "panel",
      node: (
        <ProPlaySessionPanel number={question.number} total={session.total} score={session.score}
          answered={session.answered} outcomes={outcomes} complete={session.complete} />
      ),
    },
    hudAction: null,
    onSelectOption,
  });
  if (!view) return null;

  return {
    ...view,
    header: {
      ...view.header,
      title: `Question ${question.number} / ${session.total}`,
      titleDetail: session.answered > 0 ? `${session.score} correct` : null,
    },
    surface: {
      ...view.surface,
      regions: {
        media: <ProPlayAnchorPlate context={context} fallbackTitle={question.topic} />,
        optionContent: slots.optionContent,
        answerColumns: slots.columns,
        pairDivider: slots.pairDivider,
      },
    },
    // composeProPlayArenaView only carries a control while a reveal shows; the
    // row is held on every frame instead (see the header note).
    hudAction,
  };
}
